// ============================================================
// Repack DOCX — zip কপি + পার্ট-রিপ্লেস-এর এক কোর (সব ইঞ্জিন শেয়ার করে)
// ============================================================
// মূল নীতি: সোর্স docx-এর সব নন-ডিরেক্টরি এন্ট্রি byte-হুবহু কপি হয়; শুধু
// যে পার্টগুলো বদলানো হয় সেগুলো নতুন কনটেন্টে যায়। JSZip নিজে ফোল্ডার-এন্ট্রি
// বানায় বলে সরাসরি কপি-নির্মাণ (color-serial থেকে শুরু হওয়া প্রমাণিত প্যাটার্ন)।
// ============================================================

import JSZip from "jszip";

import { analyzeText } from "./encoding";
import {
  applyFontRemap,
  decodeXmlEntities,
  LEGACY_BIJOY_FONT_VALUE_RE,
  type FontSettings,
  type RemapDominant,
} from "./font-remap";
import type { ZipProgress } from "./docx-xml";

export const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

/** সোর্স docx-এ থাকলে রিম্যাপ হওয়া স্টাইল-পার্ট */
export const STYLES_XML_PATH = "word/styles.xml";

// ---------- ডকুমেন্ট-dominant নির্ণয় (font-remap-এর dominant-হিন্ট) ----------

const RUN_SCAN_RE = /<w:r(?:\s[^>]*)?>([\s\S]*?)<\/w:r>/g;
const WT_TEXT_RE = /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g;
const RPR_TAG_RE = /<w:rPr(?:\s[^>]*)?>[\s\S]*?<\/w:rPr>/;
const RUN_FONT_ATTR_RE = /(?:\sw:ascii|\sw:hAnsi)="([^"]*)"/;
const BN_CHAR_RE = /[\u0980-\u09FF]/;
const ALPHA_BN_CHAR_RE = /[A-Za-z\u0980-\u09FF]/;

/**
 * document.xml থেকে ডকুমেন্টের প্রধান লিপি নির্ণয় — রিম্যাপের dominant-হিন্ট।
 * ① ফন্ট-ট্রুথ: অর্ধেকের বেশি আলফা-টেক্সট লিগ্যাসি Bijoy ফন্টের (Sutonny…/Bijoy…/
 *    Shibly… জাতীয়) রানে থাকলে ডকুমেন্ট Bijoy — মার্কারহীন খাঁটি-ASCII বাংলাও
 *    বিজয় ফন্ট পায় (আগে এরাই Times New Roman-এ চলে যেত — মূল বাগ)।
 * ② না হলে analyzeText (শব্দ-ধরে ক্লাসিফায়ার): bijoy/unicode → হিন্ট;
 *    english/null → হিন্ট নেই (টেক্সট-মার্কার-ভিত্তিক আচরণ)।
 */
function remapDominantOf(xml: string): RemapDominant {
  let bijoyFontLen = 0;
  let bnLen = 0;
  let otherLen = 0;
  for (const m of xml.matchAll(RUN_SCAN_RE)) {
    const inner = m[1] ?? "";
    let text = "";
    for (const t of inner.matchAll(WT_TEXT_RE)) text += decodeXmlEntities(t[1] ?? "");
    if (!ALPHA_BN_CHAR_RE.test(text)) continue;
    if (BN_CHAR_RE.test(text)) {
      bnLen += text.length; // ইউনিকোড-বাংলা অক্ষর টেক্সট-ট্রুথ — ফন্ট যা-ই হোক
      continue;
    }
    const rprM = inner.match(RPR_TAG_RE);
    const fontM = rprM ? rprM[0].match(RUN_FONT_ATTR_RE) : null;
    if (fontM && LEGACY_BIJOY_FONT_VALUE_RE.test(fontM[1])) bijoyFontLen += text.length;
    else otherLen += text.length;
  }
  const alphaTotal = bijoyFontLen + bnLen + otherLen;
  if (alphaTotal > 0 && bijoyFontLen * 2 >= alphaTotal) return "bijoy";
  const plain = Array.from(xml.matchAll(WT_TEXT_RE), (t) => decodeXmlEntities(t[1] ?? "")).join("\n");
  const d = analyzeText(plain).dominant;
  if (d === "bijoy") return "bijoy";
  if (d === "unicode") return "unicode-bengali";
  return null;
}

/**
 * docx (বা লোড-করা JSZip)-এর নির্দিষ্ট পার্ট বদলে নতুন blob —
 * বাকি সব নন-ডিরেক্টরি এন্ট্রি (styles/headers/media/settings) byte-হুবহু কপি।
 * `parts` = বদলে যাওয়া পার্ট (path → নতুন string/bytes); `extra` = নতুন যোগ হওয়া পার্ট
 * (মার্জে ব্যবহৃত — রিল-টার্গেট ছবি ইত্যাদি); আউটপুট-অর্ডার: parts → অন্যরা → extra।
 */
export async function repackDocx(
  source: Blob | JSZip,
  parts: Record<string, string | Uint8Array>,
  extra: Array<{ path: string; data: Uint8Array }> = [],
  mimeType: string = DOCX_MIME,
  onProgress?: ZipProgress,
): Promise<Blob> {
  const src = source instanceof JSZip ? source : await JSZip.loadAsync(source);
  const replaced = new Set(Object.keys(parts));
  const others: Array<{ path: string; data: Promise<Uint8Array> }> = [];
  src.forEach((path, entry) => {
    if (!entry.dir && !replaced.has(path)) others.push({ path, data: entry.async("uint8array") });
  });
  const enc = new TextEncoder();
  const zip = new JSZip();
  for (const path of Object.keys(parts)) {
    const data = parts[path];
    zip.file(path, typeof data === "string" ? enc.encode(data) : data);
  }
  for (const o of others) zip.file(o.path, await o.data);
  for (const p of extra) zip.file(p.path, p.data);
  return zip.generateAsync(
    { type: "blob", mimeType, compression: "DEFLATE" },
    onProgress ? (meta) => onProgress((meta?.percent ?? 0) / 100) : undefined,
  );
}

/**
 * repackDocx + ঐচ্ছিক font-remap — সব docx-আউটপুট পাইপলাইনের এক প্রবেশদ্বার।
 * documentXml (ইতিমধ্যে সব অন্য XML-মিউটেশন শেষ হওয়ার পরের স্ট্রিং)
 * রিম্যাপ হয়; সোর্স zip-এ word/styles.xml থাকলে সেটাও রিম্যাপ হয়
 * (applyFontRemapStylesXml — শুধু লিগ্যাসি Bijoy ফন্ট-ভ্যালু), না থাকলে স্পর্শ হয় না।
 * fontSettings না দিলে/enabled=false হলে হুবহু repackDocx — বাইট-অভিন্ন আচরণ।
 * `extraParts` = অতিরিক্ত বদলে-যাওয়া পার্ট (rels/[Content_Types] ইত্যাদি),
 * `extra` = নতুন পার্ট (মার্জের রিল-টার্গেট ছবি ইত্যাদি)।
 */
export async function repackDocxRemapped(
  source: Blob | JSZip,
  documentXml: string,
  fontSettings?: FontSettings,
  extraParts: Record<string, string | Uint8Array> = {},
  extra: Array<{ path: string; data: Uint8Array }> = [],
  mimeType: string = DOCX_MIME,
  onProgress?: ZipProgress,
): Promise<Blob> {
  if (!fontSettings?.enabled) {
    return repackDocx(source, { "word/document.xml": documentXml, ...extraParts }, extra, mimeType, onProgress);
  }
  const src = source instanceof JSZip ? source : await JSZip.loadAsync(source);
  const stylesXml = (await src.file(STYLES_XML_PATH)?.async("string")) ?? null;
  const remapped = applyFontRemap(
    { documentXml, stylesXml: stylesXml ?? undefined },
    fontSettings,
    { dominant: remapDominantOf(documentXml) },
  );
  const parts: Record<string, string | Uint8Array> = {
    "word/document.xml": remapped.documentXml,
    ...extraParts,
  };
  if (remapped.stylesXml != null && remapped.stylesXml !== stylesXml) {
    parts[STYLES_XML_PATH] = remapped.stylesXml;
  }
  return repackDocx(src, parts, extra, mimeType, onProgress);
}
