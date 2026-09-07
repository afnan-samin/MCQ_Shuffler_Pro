// ============================================================
// Font Remap Engine (Task 41 — রি-ইমপ্লিমেন্ট, পিওর-লাইব্রেরি)
//
// OOXML `word/document.xml` (ঐচ্ছিকভাবে `word/styles.xml`)-এর
// প্রতিটি <w:r>-এর টেক্সট তিন শ্রেণিতে ক্লাসিফাই করে সঠিক ফন্ট বসায়:
//   ① "bijoy"           — Bijoy/ANSI লিগ্যাসি এনকোডিং (SutonnyMJ "ASCII-art":
//                         † ‡ Ö Õ Ë ¨ © « » … " " ' ' ইত্যাদি ANSI-রেঞ্জ মার্কার)
//   ② "unicode-bengali" — আসল বাংলা ব্লক U+0980–U+09FF (+ দন্ডি U+0964–U+0965)
//   ③ "latin"           — বাকি সব (English/সংখ্যা/চিহ্ন)
//
// ডিজাইন-সিদ্ধান্ত:
// • DOM/jsdom নির্ভরতা নেই — সম্পূর্ণ string/regex-লেভেল এডিটিং, তাই
//   ব্রাউজার ও bun টেস্ট — দুই জায়গায় একই ফল (client-only অ্যাপ)।
// • <w:r> OOXML-এ নেস্ট করে না (hyperlink/textbox-এর ভেতরেরটাও ফ্ল্যাট),
//   তাই non-greedy `<w:r ...>…</w:r>` স্ক্যান নিরাপদ; self-closing <w:r/>
//   ও w:t-হীন রান (w:tab/w:br/w:drawing/w:fldChar) অস্পৃশ্য থাকে।
// • rPr না থাকলে রানের FIRST child হিসেবে `<w:rPr><w:rFonts …/></w:rPr>`
//   বসে (OOXML CT_RPr স্কিমা-অর্ডার: rStyle → rFonts → b/i/…) —
//   rStyle থাকলে rFonts তার ঠিক পরে ঢোকানো হয়।
// • বিদ্যমান rFonts-এর w:ascii/hAnsi/cs/eastAsia (+ *Theme ভ্যারিয়েন্ট) বদলে
//   ক্যানোনিকেল ৪ অ্যাট্রিবিউট বসে; বাকি অ্যাট্রিবিউট (w:hint) অর্ডারসহ রক্ষা।
// • xml:space="preserve", নেমস্পেস, w:t কনটেন্ট — কিছুই স্পর্শ হয় না।
// • Idempotent: একবার চালালে ক্যানোনিকেল আকারে পৌঁছায়, দ্বিতীয়বারে
//   বাইট-অভিন্ন থাকে (apply twice == once)।
// • ক্লাসিফিকেশন শুধু রান-লোকাল মার্কার-ভিত্তিক — খাঁটি-ASCII Bijoy শব্দ
//   ("wefxK"-জাতীয়, কোনো মার্কার নেই) ডিফল্টে "latin" ধরা হয়; কলার চাইলে
//   options.dominant="bijoy" দিয়ে ডকুমেন্ট-প্রাধান্য হিন্ট দিতে পারে
//   (encoding.ts-এর dominant-কনটেক্সট লজিকের সাথে সামঞ্জস্যপূর্ণ)।
// • styles.xml-এ শুধু পরিচিত লিগ্যাসি ফন্ট-নাম (Sutonny*/Bijoy*/Shibly*)
//   bijoyFont দিয়ে বদলানো হয় — থিম-অ্যাট্রিবিউট/অন্য ফন্ট অস্পৃশ্য (simple)।
// ============================================================

import { isCommonEnglishWord } from "./encoding";

// ---------- পাবলিক টাইপ ----------

/** রান-টেক্সটের স্ক্রিপ্ট শ্রেণি */
export type RunScriptClass = "bijoy" | "unicode-bengali" | "latin";

/** ডকুমেন্ট-প্রাধান্য হিন্ট (classifyRunText-এর ঐচ্ছিক দ্বিতীয় প্যারামিটার) */
export type RemapDominant = RunScriptClass | null;

export interface FontRemapSettings {
  /** ল্যাটিন/English রানের ফন্ট */
  englishFont: string; // default "Times New Roman"
  /** Bijoy/ANSI এনকোডেড রানের ফন্ট */
  bijoyFont: string; // default "SutonnyMJ"
  /** ইউনিকোড বাংলা রানের ফন্ট */
  unicodeFont: string; // default "Noto Serif Bengali"
  /** false হলে সব ফাংশন ইনপুট অপরিবর্তিত ফেরত দেয় */
  enabled: boolean;
}

/** GOAL-সিগনেচারের নাম-সামঞ্জস্যের জন্য অ্যালিয়াস */
export type FontSettings = FontRemapSettings;

export const DEFAULT_FONT_REMAP_SETTINGS: FontRemapSettings = {
  englishFont: "Times New Roman",
  bijoyFont: "SutonnyMJ",
  unicodeFont: "Noto Serif Bengali",
  enabled: true,
};

/** UI-ড্রপডাউনের জন্য ফন্ট-তালিকা */
export const FONT_CHOICES = {
  english: ["Times New Roman", "Arial", "Calibri", "Georgia", "Cambria"],
  bijoy: ["SutonnyMJ", "SutonnyMJLT", "SutonnyIt", "SutonnyOMJ", "Shibly"],
  unicode: ["Noto Serif Bengali", "Noto Sans Bengali", "SolaimanLipi", "Kalpurush", "Bangla"],
} as const;

// ---------- ক্লাসিফিকেশন সিগন্যাল ----------
// encoding.ts-এর BIJOY_STRONG/WEAK-এর সাথে সামঞ্জস্যপূর্ণ, Task 41-স্পেকের
// অতিরিক্ত মার্কার (ø Ë ¨ © ˆ ˜ ⁄) সহ প্রসারিত।

/** ইউনিকোড বাংলা ব্লক + দন্ডি (বাংলা-নির্দিষ্ট যতিচিহ্ন) */
const BN_RE = /[\u0980-\u09FF\u0964-\u0965]/;

/**
 * Bijoy/ANSI STRONG মার্কার — English/Unicode টেক্সটে প্রায় কখনো আসে না,
 * SutonnyMJ টাইপ করা বাংলায় খুব কমন।
 * Latin-1 Supplement-এর অক্ষর-রেঞ্জ (À–Ö, Ø–ö, ø–ÿ) + µ ¶ « » ¼½¾ ¨ © +
 * ` (U+0060 — SutonnyMJ যুক্তবর্ণ/হসন্ত-মার্কার, যেমন "evsjv`k") +
 * † ‡ ‗ … Œ œ কার্লি-কোট।
 * (ট্রেড-অফ: é-জাতীয় French অক্ষরও ধরা পড়ে — এই অ্যাপের ডোমেইনে
 * বাংলা-পরীক্ষার ডকুমেন্টে তা নগণ্য; encoding.ts-এও একই সিদ্ধান্ত।)
 */
const BIJOY_STRONG_RE =
  /[\u0060\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u00FF\u00A8\u00A9\u00B5\u00B6\u00AB\u00BB\u00BC-\u00BE\u0152\u0153\u2017\u2018\u2019\u201C\u201D\u2020\u2021\u2026]/;

/**
 * WEAK মার্কার — গণিত/সিম্বলেও দেখা যায় (× ÷ ± ™), তাই ASCII অক্ষরসহ
 * থাকলেই কেবল Bijoy ধরা হয়।
 */
const BIJOY_WEAK_RE = /[\u00A1\u00A4\u00A6\u00A7\u00AC-\u00AF\u00B0\u00B1\u00BF\u00D7\u00F7\u02C6\u02DC\u2122\u2030\u2044]/;

/** কোড-পয়েন্ট ধরে ধরে ম্যাচ গোনা (global-flag lastIndex ঝুঁকিমুক্ত) */
function countChars(text: string, re: RegExp): number {
  let n = 0;
  for (const ch of text) if (re.test(ch)) n++;
  return n;
}

/**
 * রান-টেক্সট ক্লাসিফাই করে।
 * • দুই-ই থাকলে (বিরল): বাংলা ক্যারেক্টার প্রাধান্য পেলেই unicode-bengali,
 *   নাহলে (টাইসহ) bijoy।
 * • `dominant` হিন্ট = ডকুমেন্টের প্রধান শ্রেণি: "bijoy" দিলে মার্কারহীন
 *   খাঁটি-ASCII অক্ষরযুক্ত রানও bijoy ধরা হয় (সংখ্যা/চিহ্ন থেকে যায় latin)।
 */
export function classifyRunText(text: string, dominant: RemapDominant = null): RunScriptClass {
  if (!text) return "latin";
  const strong = countChars(text, BIJOY_STRONG_RE);
  const weak = countChars(text, BIJOY_WEAK_RE);
  const bn = countChars(text, BN_RE);
  const hasBn = bn > 0;
  const hasBijoy = strong > 0 || (weak > 0 && /[A-Za-z]/.test(text));
  if (hasBn && hasBijoy) return bn > strong + weak ? "unicode-bengali" : "bijoy";
  if (hasBn) return "unicode-bengali";
  if (hasBijoy) return "bijoy";
  if (dominant === "bijoy" && /[A-Za-z]/.test(text)) {
    // কমন-English শব্দের রান Bijoy-প্রধান ডকেও English ফন্টেই থাকুক
    const words = text.split(/\s+/).filter((w) => /[A-Za-z]/.test(w));
    if (words.length > 0 && words.every(isCommonEnglishWord)) return "latin";
    return "bijoy";
  }
  return "latin";
}

// ---------- XML হেল্পার ----------

function escapeXmlAttr(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** w:t-কনটেন্টের এন্টিটি ডিকোড (এক পাস, আন-অ্যাম্প-শেষে) — repack-docx-ও ব্যবহার করে */
export function decodeXmlEntities(s: string): string {
  return s
    .replace(/&#x([0-9A-Fa-f]+);/g, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

/**
 * ওপেন-ট্যাগ-অ্যাট্রিবিউট প্যাটার্ন: স্পেস দিয়ে শুরু হওয়া অ্যাট্রিবিউট-তালিকা,
 * কোটেড ভ্যালুর ভেতরে `>` থাকলেও ধরে (খুব-বিরল কিন্তু নিরাপদ)।
 * `<w:rPr`/`<w:rFonts`-জাতীয় নাম এই প্যাটার্নে ম্যাচ করে না — নামের পরে
 * স্পেস/`>`/`/>` ছাড়া কিছু গ্রহণ করা হয় না।
 */
const ATTRS_PART = String.raw`(?:(?:\s(?:[^>"']|"[^"]*"|'[^']*')*))?`;

/** <w:r> স্ক্যান: self-closing (`/>`) বা ওপেন…ক্লোজ (রান নেস্ট করে না) */
const RUN_RE = new RegExp(`<w:r${ATTRS_PART}(/>)|<w:r${ATTRS_PART}>([\\s\\S]*?)</w:r>`, "g");

/** রানের ভেতরে <w:t> স্ক্যান (w:tab/w:instrText ইত্যাদি ম্যাচ করে না) */
const WT_RE = new RegExp(`<w:t${ATTRS_PART}(/>|>([\\s\\S]*?)</w:t>)`, "g");

/** রান-লেভেল <w:rPr> (paragraph-মার্ক <w:pPr><w:rPr> আলাদা স্ট্রাকচার, এখানে আসে না) */
const RPR_RE = new RegExp(`<w:rPr${ATTRS_PART}/>|<w:rPr${ATTRS_PART}>[\\s\\S]*?</w:rPr>`);

const RFIND_RE = new RegExp(`<w:rFonts${ATTRS_PART}/>|<w:rFonts${ATTRS_PART}>[\\s\\S]*?</w:rFonts>`);

const RSTYLE_RE = new RegExp(`<w:rStyle${ATTRS_PART}/>`);

/** অ্যাট্রিবিউট স্ক্যানার (রিবিল্ডের সময় নাম="ভ্যালু" জোড়া বের করতে) */
const ATTR_SCAN_RE = /([A-Za-z0-9:._-]+)="([^"]*)"/g;

/** ফন্ট-নির্ধারণী অ্যাট্রিবিউট — এগুলোই রিম্যাপ হয় (থিম-ভ্যারিয়েন্টসহ, case-insensitive) */
const FONT_ATTR_NAME_RE = /^(?:w:ascii|w:hAnsi|w:cs|w:eastAsia)(?:theme)?$/i;

function canonicalRFontsAttrs(font: string): string {
  const f = escapeXmlAttr(font);
  return ` w:ascii="${f}" w:hAnsi="${f}" w:eastAsia="${f}" w:cs="${f}"`;
}

/** নতুন rFonts ট্যাগ (ক্যানোনিকেল অ্যাট্রিবিউট-অর্ডার — idempotency-র ভিত্তি) */
function buildRFontsTag(font: string): string {
  return `<w:rFonts${canonicalRFontsAttrs(font)}/>`;
}

/**
 * বিদ্যমান rFonts ট্যাগ রিম্যাপ: ফন্ট-অ্যাট্রিবিউট/থিম-অ্যাট্রিবিউট বাদ দিয়ে
 * বাকিগুলো (w:hint ইত্যাদি) অর্ডারসহ রেখে শেষে ক্যানোনিকেল ৪টি বসায়।
 * একই ইনপুটে সবসময় একই আউটপুট → দ্বিতীয় পাসে বাইট-অভিন্ন।
 */
function remapRFontsTag(tag: string, font: string): string {
  const keep: string[] = [];
  for (const am of tag.matchAll(ATTR_SCAN_RE)) {
    if (!FONT_ATTR_NAME_RE.test(am[1])) keep.push(` ${am[1]}="${am[2]}"`);
  }
  return `<w:rFonts${keep.join("")}${canonicalRFontsAttrs(font)}/>`;
}

/**
 * রানের ভেতরের অংশে rPr/rFonts বসানো:
 * • rPr আছে + rFonts আছে → rFonts ট্যাগ প্রতিস্থাপন
 * • rPr আছে + rFonts নেই → rStyle-এর পরে (না থাকলে শুরুতে) ঢোকানো
 * • rPr নেই → `<w:rPr><w:rFonts …/></w:rPr>` রানের প্রথম child হিসেবে
 */
function remapRunInner(inner: string, font: string): string {
  const rfontsTag = buildRFontsTag(font);
  const rprM = RPR_RE.exec(inner);
  if (!rprM) {
    return `<w:rPr>${rfontsTag}</w:rPr>` + inner;
  }
  const start = rprM.index;
  const tag = rprM[0];
  if (tag.endsWith("/>")) {
    return inner.slice(0, start) + `<w:rPr>${rfontsTag}</w:rPr>` + inner.slice(start + tag.length);
  }
  const openEnd = tag.indexOf(">") + 1;
  const rprInner = tag.slice(openEnd, tag.length - "</w:rPr>".length);
  let newRprInner: string;
  const rfM = RFIND_RE.exec(rprInner);
  if (rfM) {
    newRprInner =
      rprInner.slice(0, rfM.index) +
      remapRFontsTag(rfM[0], font) +
      rprInner.slice(rfM.index + rfM[0].length);
  } else {
    const stM = RSTYLE_RE.exec(rprInner);
    const at = stM ? stM.index + stM[0].length : 0;
    newRprInner = rprInner.slice(0, at) + rfontsTag + rprInner.slice(at);
  }
  const newTag = tag.slice(0, openEnd) + newRprInner + "</w:rPr>";
  return inner.slice(0, start) + newTag + inner.slice(start + tag.length);
}

function fontForClass(cls: RunScriptClass, settings: FontRemapSettings): string {
  if (cls === "bijoy") return settings.bijoyFont;
  if (cls === "unicode-bengali") return settings.unicodeFont;
  return settings.englishFont;
}

export interface FontRemapOptions {
  /** ডকুমেন্ট-প্রাধান্য হিন্ট — classifyRunText-এ পাস হয় */
  dominant?: RemapDominant;
}

/**
 * রানের নিজস্ব rPr>rFonts-এর w:ascii/w:hAnsi ফন্ট (থাকলে) — মার্কারহীন
 * খাঁটি-ASCII Bijoy রান শনাক্তে ground-truth (আপলোড করা Bijoy ফাইলে
 * প্রায় সব বাংলা রানই Sutonny…/Bijoy…/Shibly… জাতীয় ফন্ট বহন করে)।
 */
function runAsciiFontOf(runInner: string): string | null {
  const rprM = RPR_RE.exec(runInner);
  if (!rprM || rprM[0].endsWith("/>")) return null;
  const rfM = RFIND_RE.exec(rprM[0]);
  if (!rfM) return null;
  const am = rfM[0].match(/(?:\sw:ascii|\sw:hAnsi)="([^"]*)"/);
  return am ? am[1] : null;
}

/**
 * word/document.xml-এর প্রতিটি টেক্সটধারী <w:r>-এর ফন্ট রিম্যাপ করে।
 * w:t-হীন রান (w:tab/w:br/w:drawing/w:fldChar) ও self-closing <w:r/> অস্পৃশ্য।
 * Idempotent + XML-corruption-free (নেমস্পেস/xml:space/কনটেন্ট রক্ষা)।
 */
export function applyFontRemapXml(
  xml: string,
  settings: FontRemapSettings,
  options?: FontRemapOptions
): string {
  if (!settings?.enabled || !xml) return xml;
  const dominant = options?.dominant ?? null;
  return xml.replace(RUN_RE, (m: string, selfClose: string | undefined, inner: string | undefined) => {
    if (selfClose !== undefined) return m; // self-closing run — টেক্সট নেই
    const runInner = inner ?? "";
    let text = "";
    let hasT = false;
    for (const tm of runInner.matchAll(WT_RE)) {
      hasT = true;
      text += decodeXmlEntities(tm[2] ?? "");
    }
    if (!hasT) return m; // w:t নেই — w:tab/w:br/ফিল্ড-কোড রান অস্পৃশ্য
    let cls = classifyRunText(text, dominant);
    if (cls === "latin") {
      // রানের নিজস্ব ফন্ট লিগ্যাসি Bijoy হলে সেটাই ground-truth — মার্কারহীন
      // খাঁটি-ASCII বাংলা রান ("Avgvi"-জাতীয়) English ফন্টে চলে যায় না
      const runFont = runAsciiFontOf(runInner);
      if (runFont && LEGACY_BIJOY_FONT_VALUE_RE.test(runFont)) cls = "bijoy";
    }
    const font = fontForClass(cls, settings);
    const openEnd = m.length - runInner.length - "</w:r>".length;
    return m.slice(0, openEnd) + remapRunInner(runInner, font) + "</w:r>";
  });
}

// ---------- styles.xml ----------

/**
 * লিগ্যাসি Bijoy ফন্ট-নাম প্রিফিক্স (Sutonny… / Bijoy… / Shibly… ভ্যারিয়েন্ট) —
 * styles.xml-এ ভ্যালু-ম্যাচে এটুকুই যথেষ্ট (ডকুমেন্টেড সিদ্ধান্ত:
 * স্টাইল-লেভেলে স্যাম্পল-টেক্সট নির্ণয় অনির্ভরযোগ্য, তাই ক্লাসিফাই নয় —
 * শুধু পরিচিত লিগ্যাসি নাম bijoyFont দিয়ে বদলানো হয়)।
 */
export const LEGACY_BIJOY_FONT_VALUE_RE = /^(?:sutonny|bijoy|shibly)/i;

const STYLE_FONTVAL_RE = /((?:w:ascii|w:hAnsi|w:cs|w:eastAsia)=")([^"]*)(")/g;

/**
 * word/styles.xml রিম্যাপ: w:ascii/w:hAnsi/w:cs/w:eastAsia অ্যাট্রিবিউটের
 * ভ্যালু লিগ্যাসি Bijoy ফন্ট হলে bijoyFont দিয়ে বদলায়।
 * থিম-অ্যাট্রিবিউট (w:asciiTheme ইত্যাদি), w:name, অন্য ফন্ট — অস্পৃশ্য।
 */
export function applyFontRemapStylesXml(stylesXml: string, settings: FontRemapSettings): string {
  if (!settings?.enabled || !stylesXml) return stylesXml;
  return stylesXml.replace(
    STYLE_FONTVAL_RE,
    (m: string, pre: string, val: string, post: string) =>
      LEGACY_BIJOY_FONT_VALUE_RE.test(val)
        ? `${pre}${escapeXmlAttr(settings.bijoyFont)}${post}`
        : m
  );
}

// ---------- কম্বাইন্ড হেল্পার ----------

export interface FontRemapTargets {
  documentXml: string;
  stylesXml?: string;
}

/**
 * document.xml (+ ঐচ্ছিক stylesXml) একসাথে রিম্যাপ করে —
 * docx-জিপ রিমেকারের জন্য সুবিধাজনক এন্ট্রি-পয়েন্ট।
 */
export function applyFontRemap(
  targets: FontRemapTargets,
  settings: FontRemapSettings,
  options?: FontRemapOptions
): FontRemapTargets {
  const out: FontRemapTargets = {
    documentXml: applyFontRemapXml(targets.documentXml, settings, options),
  };
  if (targets.stylesXml != null) {
    out.stylesXml = applyFontRemapStylesXml(targets.stylesXml, settings);
  }
  return out;
}
