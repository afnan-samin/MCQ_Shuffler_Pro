// ============================================================
// Multi-DOCX merge — একাধিক প্রসেস-করা .docx এক ফাইলে জোড়া + zip বান্ডেল
// ============================================================
// মূল নীতি: DOMParser ছাড়াই string-level এডিট (বিশাল ফাইলেও OOM হয় না)।
// base ফাইলের <w:body>-এর ভিতরে প্রতিটা extra-এর body-INNER আগে
// PAGE_BREAK_P বসিয়ে জোড়া হয়; base-এর body-level sectPr (পেজ-সেটআপ)
// অক্ষত থাকে, extra-দের sectPr বাদ যায়। pPr-লেভেল মিড-ডক sectPr
// (সেকশন-ব্রেক) কখনো স্ট্রিপ হয় না। zip রি-বিল্ড হয় color-serial-এর
// downloadColorSerialDocx-এর হুবহু JSZip কপি-প্যাটার্নে (নন-ডিরেক্টরি
// এন্ট্রি byte-হুবহু কপি; JSZip নিজে ফোল্ডার-এন্ট্রি বানায় বলে সরাসরি
// কপি-নির্মাণ)।
//
// রিল-ইন্টিগ্রেশন (Word-corruption ফিক্স — IMPLEMENTED): মার্জ হলে output-এর
// রিলেশনশিপ (word/_rels/document.xml.rels) ও পার্ট-ফাইল আসে শুধু base-এর zip
// থেকে — কিন্তু extra-এর body-তে থাকা ছবি (r:embed), হাইপারলিংক (r:id) ইত্যাদি
// extra-এর নিজের রিল-আইডি ব্যবহার করে। দুই ফাইলের রিল-আইডি-সেট মিল না হলে
// আউটপুটে এমন রিল-রেফারেন্স থেকে যেত যার অস্তিত্বই নেই — Word-এ
// "Word found unreadable content" রিপেয়ার-ডায়ালগ (লাইভ-সাইট বাগ-রিপোর্ট)।
// buildMergedDocxBlob-এর প্রতি-extra পাইপলাইন (সব string-level, DOMParser নেই):
//   ① extra-এর body-INNER (body-level sectPr বাদের পরের content) থেকে
//      REL_ATTR_RE দিয়ে ব্যবহৃত রিল-আইডি সংগ্রহ
//   ② প্রতিটা আইডির জন্য extra-এর নিজের word/_rels/document.xml.rels থেকে
//      (Type, Target, TargetMode) পড়ে:
//        - base-এ একই Type+Target+কনটেন্ট (internal হলে টার্গেট-বাইট তুলনা)
//          সমতুল্য রিল থাকলে → body-তে সেই existing Id-তে রি-রাইট (ডিডাপ)
//        - নাহলে নতুন ইউনিক Id (rIdM<n>, base-এর আইডি-সেটের সাথে সংঘর্ষমুক্ত)
//          base rels-এ যোগ + internal টার্গেট-পার্ট (ছবি/customXml/diagram)
//          extra-এর zip থেকে ইউনিক নামে (stem_m<n>) base zip-এ কপি, rel Target
//          নতুন পার্ট-পথে; External হাইপারলিংক হলে পার্ট কপি হয় না, Target হুবহু
//   ③ [Content_Types].xml-এ প্রতিটা নতুন পার্ট-এক্সটেনশনের Default (বা Override
//      কভারেজ যাচাই) নিশ্চিত — known-mime ম্যাপ, না পেলে octet-stream
//   ④ body-INNER রি-রাইট করা স্ট্রিং দিয়েই জোড়া হয় — base-এর নিজের body
//      বাইটে কোনো হাত যায় না; extra-দের pPr-লেভেল sectPr (মিড-ডক সেকশন-ব্রেক,
//      headerReference r:id-সহ) অক্ষত থাকে, body-level sectPr আগের মতই বাদ
//   ⑤ xmlns-ডিক্লেয়ারেশন-ইউনিয়ন: extra-এর body এমন প্রিফিক্স (r:, wp:, a:, pic:,
//      w14:, mc:, v:, o:, wps:…) ব্যবহার করলে যা base-এর <w:document> root-এ
//      ডিক্লেয়ার্ড নয় — URI আগে extra-এর নিজের root থেকে, না পেলে স্ট্যান্ডার্ড
//      প্রিফিক্স-ম্যাপ থেকে নিয়ে base root-এ যোগ হয় (আনডিক্লেয়ার্ড প্রিফিক্স =
//      malformed XML = Word রিপেয়ার); mc:Choice Requires টাইপ প্রিফিক্স-লিস্টও স্ক্যান হয়
//   ⑥ সোর্সেই ভাঙা রেফারেন্স (extra-এর rels-এ আইডি/পার্ট নেই) — হাত দেওয়া হয় না
// ============================================================

import JSZip from "jszip";

import { DOCX_MIME, repackDocx } from "./repack-docx";

export { DOCX_MIME };

/** পেজ-ব্রেক প্যারা (body-এর ভিতরে ঢোকে, নেমস্পেস root-এ ডিক্লেয়ার্ড থাকে বলে নিরাপদ) */
export const PAGE_BREAK_P = '<w:p><w:r><w:br w:type="page"/></w:r></w:p>';

const BODY_OPEN = "<w:body>";
const BODY_CLOSE = "</w:body>";
const SECTPR_OPEN = "<w:sectPr";
const SECTPR_CLOSE = "</w:sectPr>";

const RELS_PATH = "word/_rels/document.xml.rels";
const CT_PATH = "[Content_Types].xml";

/** body-XML-এ যেসব অ্যাট্রিবিউট রিলেশনশিপ-আইডি বহন করে (r:embed=ছবি, r:id=হাইপারলিংক/ফুটনোট,
 * r:link=লিংকড-ছবি, r:pict=লিংকড-VML, r:dm/lo/qs/cs=SmartArt, o:relid=পুরনো VML) */
const REL_ATTR_RE = /\b(r:(?:embed|link|id|pict|dm|lo|qs|cs)|o:relid)="([^"]+)"/g;

// ---------- ২) body-inner এক্সট্র্যাকশন ----------

/** <w:body>...</w:body>-এর ভিতরের অংশ বের করে (প্রথম occurrence; docx-এ ঠিক একটাই body থাকে) */
export function extractBodyInner(xml: string): string {
  const open = xml.indexOf(BODY_OPEN);
  const close = xml.indexOf(BODY_CLOSE);
  if (open < 0 || close < open) {
    throw new Error("document.xml-এ <w:body> পাওয়া যায়নি — ফাইলটি সঠিক .docx না মনে হচ্ছে");
  }
  return xml.slice(open + BODY_OPEN.length, close);
}

// ---------- ৩) শেষের (body-level) sectPr আলাদা করা ----------

/**
 * body-INNER থেকে শেষের (body-level) sectPr আলাদা করে।
 * সাবধান: প্যারার pPr-লেভেল <w:sectPr> (মিড-ডক সেকশন-ব্রেক) স্ট্রিপ করা যাবে না।
 * body-level sectPr হলো w:body-এর শেষ ডিরেক্ট চাইল্ড — অর্থাৎ তার পরে
 * শুধু হোয়াইটস্পেস থাকে। তাই শেষ <w:sectPr স্প্যানের পরের অংশ
 * whitespace-only না হলে সেটা body-level নয় — কিছুই কাটা হয় না (defensive)।
 */
export function splitTrailingSectPr(inner: string): { content: string; sectPr: string | null } {
  const idx = inner.lastIndexOf(SECTPR_OPEN);
  if (idx < 0) return { content: inner, sectPr: null };

  // self-closing (<w:sectPr/>) নাকি জোড়া (<w:sectPr>…</w:sectPr>)?
  const selfClose = /^<w:sectPr[^>]*\/>/.exec(inner.slice(idx));
  let end: number;
  if (selfClose) {
    end = idx + selfClose[0].length;
  } else {
    const closeAt = inner.indexOf(SECTPR_CLOSE, idx);
    if (closeAt < 0) return { content: inner, sectPr: null }; // ভাঙা XML — কিছুই ধরি না
    end = closeAt + SECTPR_CLOSE.length;
  }

  // স্প্যানের পরে শুধু হোয়াইটস্পেস থাকলেই কেবল body-level sectPr
  const rest = inner.slice(end);
  if (!/^\s*$/.test(rest)) return { content: inner, sectPr: null };

  return { content: inner.slice(0, idx), sectPr: inner.slice(idx, end) };
}

// ---------- ৪) মার্জড document.xml ----------

/**
 * core মার্জ: base-এর body-এর ভিতরে, base-এর body-level sectPr-এর ঠিক আগে,
 * প্রতিটা pre-extracted extra INNER-এর আগে PAGE_BREAK_P বসিয়ে জোড়া।
 * extra-দের body-level sectPr কলার আগেই বাদ দিয়েছে ধরে নেওয়া হয়; pPr-লেভেল
 * মিড-ডক sectPr সবার অক্ষত। রিকনস্ট্রাকশন base-এর ORIGINAL offsets-এই হয় —
 * বাইরের prologue/epilogue byte-হুবহু প্রিজার্ভ।
 */
function mergeDocumentXmlCore(baseXml: string, extraInners: string[]): string {
  if (!extraInners.length) throw new Error("items খালি — অন্তত একটা extra ফাইলের body-XML দিন");
  if (!baseXml) throw new Error("base XML খালি");

  const bodyOpen = baseXml.indexOf(BODY_OPEN);
  const bodyClose = baseXml.indexOf(BODY_CLOSE);
  if (bodyOpen < 0 || bodyClose < bodyOpen) {
    throw new Error("base XML-এ <w:body> পাওয়া যায়নি — ফাইলটি সঠিক .docx না মনে হচ্ছে");
  }
  const bodyContentStart = bodyOpen + BODY_OPEN.length;

  const baseInner = baseXml.slice(bodyContentStart, bodyClose);
  const { content, sectPr } = splitTrailingSectPr(baseInner);

  const parts: string[] = [content];
  for (const inner of extraInners) {
    // খালি inner বৈধ (খালি-body extra) — শুধু পেজ-ব্রেকই থাকবে, পুরনো আচরণ
    parts.push(PAGE_BREAK_P + inner); // extra-র body-level sectPr কলার-লেভেলেই বাদ
  }
  const mergedInner = parts.join("");

  return baseXml.slice(0, bodyContentStart) + mergedInner + (sectPr ?? "") + baseXml.slice(bodyClose);
}

/** <w:document …> root-ট্যাগ হুবহু বের করে (না পেলে null) */
function rootTagOf(xml: string): string | null {
  const at = xml.indexOf("<w:document");
  if (at < 0) return null;
  const gt = xml.indexOf(">", at);
  return gt < 0 ? null : xml.slice(at, gt + 1);
}

/** regex-এর lastIndex-শেয়ারিং এড়াতে লোকাল ক্লোনে exec-লুপ */
function eachMatch(re: RegExp, s: string, fn: (m: RegExpExecArray) => void): void {
  const rx = new RegExp(re.source, re.flags);
  let m: RegExpExecArray | null;
  while ((m = rx.exec(s))) {
    fn(m);
    if (m.index === rx.lastIndex) rx.lastIndex++; // zero-length ম্যাচ গার্ড
  }
}

/**
 * xmlns-ইউনিয়ন (মার্জড আউটপুটে চালানো হয়): extra-দের body-INNER-এ ব্যবহৃত
 * প্রিফিক্স (এলিমেন্ট/অ্যাট্রিবিউট + mc:Choice Requires-স্টাইল প্রিফিক্স-লিস্ট) যা
 * base root-এ ডিক্লেয়ার্ড নয় — base root-এ xmlns যোগ করে। URI-র উৎস: আগে
 * extra-এর নিজের root-ডিক্লেয়ারেশন (exact), না পেলে স্ট্যান্ডার্ড প্রিফিক্স-ম্যাপ;
 * কোনোটাতেই না পেলে স্কিপ (URI আঁধারে বানানো যায় না)। root-এ যোগ করা
 * ডিক্লেয়ারেশন body-এর লোকাল ডিক্লেয়ারেশনকে shadow করতে পারে না (scope-অর্ডার),
 * তাই extra body-তে লোকাল xmlns থাকলেও নিরাপদ।
 */
export const STD_NS: Record<string, string> = {
  mc: "http://schemas.openxmlformats.org/markup-compatibility/2006",
  r: "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
  m: "http://schemas.openxmlformats.org/officeDocument/2006/math",
  v: "urn:schemas-microsoft-com:vml",
  o: "urn:schemas-microsoft-com:office:office",
  w10: "urn:schemas-microsoft-com:office:word",
  w: "http://schemas.openxmlformats.org/wordprocessingml/2006/main",
  w14: "http://schemas.microsoft.com/office/word/2010/wordml",
  w15: "http://schemas.microsoft.com/office/word/2012/wordml",
  w16: "http://schemas.microsoft.com/office/word/2018/wordml",
  w16se: "http://schemas.microsoft.com/office/word/2015/wordml/symex",
  w16cid: "http://schemas.microsoft.com/office/word/2016/wordml/cid",
  w16du: "http://schemas.microsoft.com/office/word/2023/wordml/word16du",
  wpg: "http://schemas.microsoft.com/office/word/2010/wordprocessingGroup",
  wpi: "http://schemas.microsoft.com/office/word/2010/wordprocessingInk",
  wne: "http://schemas.microsoft.com/office/word/2006/wordml",
  wps: "http://schemas.microsoft.com/office/word/2010/wordprocessingShape",
  wpc: "http://schemas.microsoft.com/office/word/2010/wordprocessingCanvas",
  wp14: "http://schemas.microsoft.com/office/word/2010/wordprocessingDrawing",
  wp: "http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing",
  a: "http://schemas.openxmlformats.org/drawingml/2006/main",
  pic: "http://schemas.openxmlformats.org/drawingml/2006/picture",
  sl: "http://schemas.openxmlformats.org/schemaLibrary/2006/main",
  cx: "http://schemas.microsoft.com/office/drawing/2014/chartex",
  cxw: "http://schemas.microsoft.com/office/drawing/2014/chartex/word",
};

const NS_DECL_RE = /xmlns:([\w.-]+)="([^"]*)"/g;
const PREFIX_USE_RE = /\b([A-Za-z_][\w.-]*):/g;
const PREFIX_LIST_RE = /\b(?:mc:)?(?:Requires|Ignore|ProcessContent)="([^"]*)"/g;

function injectMissingNamespaces(mergedXml: string, extraInners: string[], extraXmls: string[]): string {
  const rootTag = rootTagOf(mergedXml);
  if (!rootTag) return mergedXml;

  const declared = new Set<string>();
  eachMatch(NS_DECL_RE, rootTag, (m) => declared.add(m[1]));

  // extra-দের root-ডিক্লেয়ারেশন — আসল URI-র প্রথম সোর্স
  const uriByPrefix = new Map<string, string>();
  for (const ex of extraXmls) {
    const t = rootTagOf(ex);
    if (!t) continue;
    eachMatch(NS_DECL_RE, t, (m) => {
      if (m[2] && !uriByPrefix.has(m[1])) uriByPrefix.set(m[1], m[2]);
    });
  }

  // extra body-তে ব্যবহৃত প্রিফিক্স (xml/xmlns বাদ)
  const used = new Set<string>();
  for (const inner of extraInners) {
    eachMatch(PREFIX_USE_RE, inner, (m) => {
      if (m[1] !== "xml" && m[1] !== "xmlns") used.add(m[1]);
    });
    eachMatch(PREFIX_LIST_RE, inner, (m) => {
      for (const p of m[1].split(/\s+/)) if (p) used.add(p);
    });
  }

  const add: string[] = [];
  for (const p of used) {
    if (declared.has(p)) continue;
    const uri = uriByPrefix.get(p) ?? STD_NS[p];
    if (uri) add.push(` xmlns:${p}="${uri}"`);
  }
  if (!add.length) return mergedXml;

  const at = mergedXml.indexOf(rootTag);
  const newTag = rootTag.slice(0, -1) + add.join("") + ">";
  return mergedXml.slice(0, at) + newTag + mergedXml.slice(at + rootTag.length);
}

/**
 * base + পূর্ণ extra XML-গুলো → মার্জড document.xml (রিল-আইডি রি-রাইট ছাড়া —
 * সেটা buildMergedDocxBlob-এর দায়িত্ব; এখানে শুধু body-জোড়া + xmlns-ইউনিয়ন)।
 */
export function buildMergedDocumentXml(baseXml: string, extraInnerXmls: string[]): string {
  if (!extraInnerXmls.length) throw new Error("items খালি — অন্তত একটা extra ফাইলের body-XML দিন");
  if (!baseXml) throw new Error("base XML খালি");

  const inners: string[] = [];
  for (const extra of extraInnerXmls) {
    if (!extra) throw new Error("extra XML খালি");
    const extraInner = extractBodyInner(extra);
    const sp = splitTrailingSectPr(extraInner);
    inners.push(sp.content); // extra-র body-level sectPr ইচ্ছাকৃত বাদ
  }
  return injectMissingNamespaces(mergeDocumentXmlCore(baseXml, inners), inners, extraInnerXmls);
}

// ---------- ৫) যেকোনো docx blob-এর word/document.xml বদলানো ----------

/**
 * যেকোনো .docx blob-এর word/document.xml বদলে নতুন XML দিয়ে নতুন blob —
 * বাকি সব এন্ট্রি (styles/headers/media/settings) byte-হুবহু কপি।
 * (repack-docx.ts-এর শেয়ার্ড কোর — color-serial/docx-exporter-ও এটাই ব্যবহার করে)
 */
export async function replaceDocumentXml(file: Blob, newXml: string): Promise<Blob> {
  return repackDocx(file, { "word/document.xml": newXml });
}

// ---------- ৬) একাধিক docx → এক মার্জড docx (রিল-ইন্টিগ্রেশনসহ) ----------

const RELS_TAG_NS = "http://schemas.openxmlformats.org/package/2006/relationships";
const CT_TAG_NS = "http://schemas.openxmlformats.org/package/2006/content-types";

/** নতুন পার্ট-এক্সটেনশনের known content-type ([Content_Types].xml Default-এর জন্য) */
const PART_CT: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  jfif: "image/jpeg",
  gif: "image/gif",
  bmp: "image/bmp",
  tif: "image/tiff",
  tiff: "image/tiff",
  emf: "image/x-emf",
  wmf: "image/x-wmf",
  vml: "application/vnd.openxmlformats-officedocument.vmlDrawing",
  bin: "application/vnd.openxmlformats-officedocument.oleObject",
  xml: "application/xml",
  rels: "application/vnd.openxmlformats-package.relationships+xml",
  docx: DOCX_MIME,
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  wma: "audio/x-ms-wma",
  mp4: "video/mp4",
  avi: "video/x-msvideo",
  mov: "video/quicktime",
  wmv: "video/x-ms-wmv",
  mht: "message/rfc822",
};

/** word/_rels/document.xml.rels-এর এক Relationship-এন্ট্রি (Target raw attr-মানই — entity অক্ষত) */
interface RelInfo {
  id: string;
  type: string;
  target: string;
  external: boolean;
}

function parseRelsXml(relsXml: string): RelInfo[] {
  const out: RelInfo[] = [];
  if (!relsXml) return out;
  eachMatch(/<Relationship\b([^>]*)>/g, relsXml, (m) => {
    const a = m[1];
    const id = /\bId="([^"]*)"/.exec(a)?.[1];
    if (!id) return;
    const target = /\bTarget="([^"]*)"/.exec(a)?.[1] ?? "";
    const mode = /\bTargetMode="([^"]*)"/.exec(a)?.[1] ?? "";
    out.push({
      id,
      type: /\bType="([^"]*)"/.exec(a)?.[1] ?? "",
      target,
      external: mode === "External" || /^[A-Za-z][\dA-Za-z+.\-]*:/.test(target),
    });
  });
  return out;
}

/** rel Target (word/-রেলেটিভ বা /-absolute) → zip-পার্ট-পথ; বোঝা যায় না হলে null */
function resolvePartPath(target: string): string | null {
  if (!target) return null;
  if (target.startsWith("/")) return target.slice(1) || null;
  const segs: string[] = [];
  for (const seg of ("word/" + target).split("/")) {
    if (!seg || seg === ".") continue;
    if (seg === "..") segs.pop();
    else segs.push(seg);
  }
  return segs.join("/") || null;
}

/** merged zip-পার্ট-পথ → rel Target (rels-এর base-dir word/ থেকে রেলেটিভ) */
function targetFromPartPath(partPath: string): string {
  return partPath.startsWith("word/") ? partPath.slice(5) : "../" + partPath;
}

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/** body-XML-এ ব্যবহৃত ইউনিক রিল-আইডি (order-preserving) */
function scanRelIds(xml: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  eachMatch(REL_ATTR_RE, xml, (m) => {
    if (m[2] && !seen.has(m[2])) {
      seen.add(m[2]);
      out.push(m[2]);
    }
  });
  return out;
}

/** idMap (পুরনো→নতুন rel Id) দিয়ে body-XML-এর রিল-অ্যাট্রিবিউট ভ্যালু রি-রাইট */
function rewriteRelAttrs(xml: string, idMap: Map<string, string>): string {
  if (!idMap.size) return xml;
  return xml.replace(REL_ATTR_RE, (full, attr: string, val: string) =>
    idMap.has(val) ? `${attr}="${idMap.get(val)}"` : full,
  );
}

/** xml-এর close-ট্যাগের ঠিক আগে inject (close না থাকলে শেষে জোড়া) */
function appendBeforeClose(xml: string, close: string, inject: string): string {
  const i = xml.lastIndexOf(close);
  return i >= 0 ? xml.slice(0, i) + inject + xml.slice(i) : xml + inject;
}

/** ভাঙা %-সিকোয়েন্সে decodeURIComponent URIError করে — সেক্ষেত্রে raw-ই */
function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

/** [Content_Types].xml-এ পার্টের Default/Override কভারেজ নিশ্চিত */
function ensureCtCover(ct: string, partPath: string): string {
  const dot = partPath.lastIndexOf(".");
  const ext = dot >= 0 ? partPath.slice(dot + 1).toLowerCase() : "";
  if (!ext) return ct;
  if (ct.includes(`Extension="${ext}"`) || ct.includes(`PartName="/${partPath}"`)) return ct;
  const mime = PART_CT[ext] ?? "application/octet-stream";
  return appendBeforeClose(ct, "</Types>", `<Default Extension="${ext}" ContentType="${mime}"/>`);
}

/**
 * একাধিক প্রসেস-করা docx → এক মার্জড docx blob (Word-corruption ফিক্সসহ)।
 * items[0] = base container — তার styles/headers/media/rels-ই আউটপুটে চলে;
 * বাকিগুলো থেকে body-INNER রিল-রি-রাইট করে জোড়া + তাদের রিল-টার্গেট পার্ট
 * (ছবি ইত্যাদি) ইউনিক নামে কপি + rels/[Content_Types] আপডেট + xmlns-ইউনিয়ন।
 * বিস্তারিত ফাইল-হেডারের রিল-ইন্টিগ্রেশন কমেন্টে।
 */
export async function buildMergedDocxBlob(items: Array<{ xml: string; file: Blob }>): Promise<Blob> {
  if (items.length < 2) throw new Error("items খালি — মার্জে অন্তত ২টা docx লাগবে (base + extra)");
  const baseZip = await JSZip.loadAsync(items[0].file);

  const baseRelsXml = (await baseZip.file(RELS_PATH)?.async("string")) ?? null;
  const baseCtXml = (await baseZip.file(CT_PATH)?.async("string")) ?? null;
  const rels = parseRelsXml(baseRelsXml ?? "");
  const relIds = new Set(rels.map((r) => r.id));
  const baseParts = new Set<string>();
  baseZip.forEach((path, entry) => {
    if (!entry.dir) baseParts.add(path);
  });

  const addedRelTags: string[] = [];
  const newParts: Array<{ path: string; data: Uint8Array }> = [];
  const copiedTarget = new Map<string, string>(); // "<extraIdx>:<sourcePart>" → merged পার্ট-পথ (এক সোর্স একবারই কপি)
  const takenNames = new Set<string>(); // এই মার্জে নতুন দেওয়া পার্ট-নাম
  let relSeq = 0;
  let nameSeq = 0;

  /** base rels-এ নতুন ইউনিক Id যোগ (rIdM<n>; base-এর আইডির সাথে সংঘর্ষমুক্ত) —
   * rels-এও push হয় যেন পরের extra-গুলোর ডিডাপ-খোঁজায় ধরা পড়ে */
  const addRel = (type: string, targetRaw: string, external: boolean): string => {
    let id = `rIdM${++relSeq}`;
    while (relIds.has(id)) id = `rIdM${++relSeq}`;
    relIds.add(id);
    const info: RelInfo = { id, type, target: targetRaw, external };
    rels.push(info);
    addedRelTags.push(
      `<Relationship Id="${id}" Type="${type}" Target="${targetRaw}"${external ? ' TargetMode="External"' : ""}/>`,
    );
    return id;
  };

  /** internal রিল: base-এ Type+Target+কনটেন্ট সমতুল্য থাকলে সেই Id, নাহলে পার্ট-কপি + নতুন rel */
  const mapInternalRel = async (extraIdx: number, er: RelInfo, extraZip: JSZip): Promise<string> => {
    const resolved = resolvePartPath(er.target);
    const srcEntry = resolved ? (extraZip.file(resolved) ?? extraZip.file(safeDecode(resolved))) : null;
    if (!resolved || !srcEntry) return er.id; // সোর্সেই টার্গেট-পার্ট নেই — হাত দিই না
    const srcBytes = await srcEntry.async("uint8array");
    for (const r of rels) {
      if (r.external || r.type !== er.type) continue;
      if (resolvePartPath(r.target) !== resolved) continue;
      const baseEntry = baseZip.file(resolved);
      // টার্গেট-পথ মিললেও কনটেন্ট ভিন্ন হতে পারে — বাইট-তুলনা ছাড়া রিম্যাপ করলে
      // extra-র ছবির জায়গায় base-এর ছবি বসে যেত (সাইলেন্ট কনটেন্ট-লস)
      if (baseEntry && bytesEqual(await baseEntry.async("uint8array"), srcBytes)) return r.id;
      break;
    }
    const key = `${extraIdx}:${resolved}`;
    let newPath = copiedTarget.get(key);
    if (!newPath) {
      // ইউনিক পার্ট-নাম: stem_m<n>.ext (base-এর সব এন্ট্রি + আগের কপির সাথে সংঘর্ষমুক্ত)
      const slash = resolved.lastIndexOf("/");
      const dir = slash >= 0 ? resolved.slice(0, slash + 1) : "";
      const fname = resolved.slice(slash + 1);
      const dot = fname.lastIndexOf(".");
      const stem = dot > 0 ? fname.slice(0, dot) : fname;
      const ext = dot > 0 ? fname.slice(dot) : "";
      newPath = `${dir}${stem}_m${++nameSeq}${ext}`;
      while (baseParts.has(newPath) || takenNames.has(newPath)) newPath = `${dir}${stem}_m${++nameSeq}${ext}`;
      takenNames.add(newPath);
      copiedTarget.set(key, newPath);
      newParts.push({ path: newPath, data: srcBytes });
    }
    return addRel(er.type, targetFromPartPath(newPath), false);
  };

  /** external রিল (হাইপারলিংক URL): Type+Target মিললে সেই Id, নাহলে নতুন rel (পার্ট-কপি নেই) */
  const mapExternalRel = (er: RelInfo): string => {
    const hit = rels.find((r) => r.external && r.type === er.type && r.target === er.target);
    return hit ? hit.id : addRel(er.type, er.target, true);
  };

  // ---- প্রতিটা extra: body-INNER + রিল-রিম্যাপ-রি-রাইট ----
  const extraInners: string[] = [];
  for (let i = 1; i < items.length; i++) {
    if (!items[i].xml) throw new Error("extra XML খালি");
    const extraZip = await JSZip.loadAsync(items[i].file);
    const extraRels = parseRelsXml((await extraZip.file(RELS_PATH)?.async("string")) ?? "");
    const relById = new Map(extraRels.map((r) => [r.id, r]));
    const inner = extractBodyInner(items[i].xml);
    const { content } = splitTrailingSectPr(inner); // body-level sectPr আগের নিয়মেই বাদ (headerReference-ও এটার সাথেই যায়)
    if (!content) {
      extraInners.push("");
      continue;
    }

    const idMap = new Map<string, string>();
    for (const rid of scanRelIds(content)) {
      const er = relById.get(rid);
      if (!er) continue; // সোর্সেই ড্যাংলিং আইডি — যেমন আছে তেমন থাক
      idMap.set(rid, er.external ? mapExternalRel(er) : await mapInternalRel(i, er, extraZip));
    }
    extraInners.push(rewriteRelAttrs(content, idMap));
  }

  // ---- মার্জড document.xml + xmlns-ইউনিয়ন ----
  const mergedXml = injectMissingNamespaces(
    mergeDocumentXmlCore(items[0].xml, extraInners),
    extraInners,
    items.slice(1).map((it) => it.xml),
  );

  // ---- rels / [Content_Types] আউটপুট (কিছু যোগ না হলে base-এরটাই byte-হুবহু) ----
  let relsOut: string | null = null;
  if (addedRelTags.length) {
    relsOut = baseRelsXml
      ? appendBeforeClose(baseRelsXml, "</Relationships>", addedRelTags.join(""))
      : `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="${RELS_TAG_NS}">${addedRelTags.join("")}</Relationships>`;
  }
  let ctOut: string | null = null;
  if (newParts.length || (relsOut && !baseRelsXml)) {
    ctOut = baseCtXml ?? `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="${CT_TAG_NS}"></Types>`;
    for (const p of newParts) ctOut = ensureCtCover(ctOut, p.path);
    if (!baseRelsXml) ctOut = ensureCtCover(ctOut, RELS_PATH); // rels ফাইল নতুন হলে সেটার কভারেজও
  }

  // ---- zip রি-বিল্ড: base-এর সব এন্ট্রি byte-হুবহু + বদলে যাওয়া ৩টা + নতুন পার্ট ----
  const parts: Record<string, string> = { "word/document.xml": mergedXml };
  if (relsOut) parts[RELS_PATH] = relsOut;
  if (ctOut) parts[CT_PATH] = ctOut;
  return repackDocx(baseZip, parts, newParts);
}

// ---------- ৭) একাধিক blob → এক .zip ----------

/**
 * একাধিক blob → এক .zip blob। একই নাম একাধিকবার এলে extension-এর আগে
 * " (2)", " (3)" বসে (যেমন "set.docx", "set (2).docx") — zip-এ নাম-সংঘর্ষ যেন না হয়।
 */
export async function buildZipBlob(files: Array<{ name: string; blob: Blob }>): Promise<Blob> {
  if (!files.length) throw new Error("ফাইল তালিকা খালি");
  const zip = new JSZip();
  const used = new Set<string>();
  for (const f of files) {
    let name = f.name;
    if (used.has(name)) {
      const dot = name.lastIndexOf(".");
      const stem = dot > 0 ? name.slice(0, dot) : name; // ".docx"-টাইপ ডটফাইল হলে পুরোটাই stem
      const ext = dot > 0 ? name.slice(dot) : "";
      let n = 2;
      while (used.has(`${stem} (${n})${ext}`)) n++; // "a (2).docx" নিজেই থাকলে পরের নম্বর
      name = `${stem} (${n})${ext}`;
    }
    used.add(name);
    zip.file(name, f.blob);
  }
  return zip.generateAsync({ type: "blob", mimeType: "application/zip", compression: "DEFLATE" });
}

// ---------- ৮) সিরিয়াল-প্ল্যানে অফসেট ----------

/**
 * সিরিয়াল-প্ল্যানের প্রতিটা নতুন সিরিয়ালে offset যোগ করে (গ্লোবাল কন্টিনিউয়াস
 * সিরিয়ালের জন্য: পরের ফাইলের সিরিয়াল আগের ফাইলের শেষ সিরিয়ালের পর থেকে)।
 * সবসময় নতুন Map রিটার্ন করে — আসল plan কখনো mutate হয় না (offset 0 হলেও)।
 */
export function offsetSerialPlan(plan: Map<number, number>, offset: number): Map<number, number> {
  const out = new Map<number, number>();
  for (const [blockIndex, serial] of plan) out.set(blockIndex, serial + offset);
  return out;
}
