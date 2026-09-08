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

import { isCommonEnglishWord, tokenizeWithContext, type Enc, type Tok } from "./encoding";

// ---------- পাবলিক টাইপ ----------

/** রান-টেক্সটের স্ক্রিপ্ট শ্রেণি */
export type RunScriptClass = "bijoy" | "unicode-bengali" | "latin";

/** ডকুমেন্ট-প্রাধান্য হিন্ট (classifyRunText-এর ঐচ্ছিক দ্বিতীয় প্যারামিটার) */
export type RemapDominant = RunScriptClass | null;

export interface FontRemapSettings {
  /** ল্যাটিন/English রানের ফন্ট — "Default" হলে এই শ্রেণি অস্পৃশ্য (অরিজিনাল ফন্ট) */
  englishFont: string; // default "Times New Roman"
  /** Bijoy/ANSI এনকোডেড রানের ফন্ট — "Default" হলে অস্পৃশ্য */
  bijoyFont: string; // default "SutonnyMJ"
  /** ইউনিকোড বাংলা রানের ফন্ট — "Default" হলে অস্পৃশ্য */
  unicodeFont: string; // default "Noto Serif Bengali"
  /** false হলে সব ফাংশন ইনপুট অপরিবর্তিত ফেরত দেয় */
  enabled: boolean;
}

/** GOAL-সিগনেচারের নাম-সামঞ্জস্যের জন্য অ্যালিয়াস */
export type FontSettings = FontRemapSettings;

/**
 * "Default" স্লট-মান — ওই শ্রেণির রান সম্পূর্ণ অস্পৃশ্য থাকে (আপলোড করা ফাইলের
 * ফন্টই থাকে)। যেমন: english=Times New Roman + bijoy=Default → শুধু English
 * অক্ষর TNR-এ যায়, Bijoy লেখা হাত দেয়া হয় না।
 */
export const FONT_DEFAULT = "Default";

export const DEFAULT_FONT_REMAP_SETTINGS: FontRemapSettings = {
  englishFont: "Times New Roman",
  bijoyFont: "SutonnyMJ",
  unicodeFont: "Noto Serif Bengali",
  /** ডিফল্ট OFF — ডাউনলোড আপলোড করা ফাইলের ফন্টই রাখে; বদলাতে চাইলে
   * FontSettingsCard ("Fonts in the output file") থেকে চালু করতে হয় */
  enabled: false,
};

/** UI-ড্রপডাউনের জন্য ফন্ট-তালিকা — প্রতিটার শুরুতে "Default" (অরিজিনাল রাখে) */
export const FONT_CHOICES = {
  english: [FONT_DEFAULT, "Times New Roman", "Arial", "Calibri", "Georgia", "Cambria"],
  bijoy: [FONT_DEFAULT, "SutonnyMJ", "SutonnyMJLT", "SutonnyIt", "SutonnyOMJ", "Shibly"],
  unicode: [FONT_DEFAULT, "Noto Serif Bengali", "Noto Sans Bengali", "SolaimanLipi", "Kalpurush", "Bangla"],
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
    // শব্দ-ভোট: English-কমন শব্দ সংখ্যায় বেশি/সমান হলে রান English ফন্টেই থাকুক —
    // নাহলে খাঁটি-ASCII Bijoy রান ("Avgvi"-জাতীয়) বিজয় ফন্ট পায়
    let en = 0;
    let bj = 0;
    for (const w of text.split(/\s+/)) {
      if (!/[A-Za-z]/.test(w)) continue;
      if (isCommonEnglishWord(w)) en++;
      else bj++;
    }
    return bj > en ? "bijoy" : "latin";
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

/**
 * ক্লাসের টার্গেট ফন্ট — স্লট "Default" হলে null (রান অস্পৃশ্য = অরিজিনাল ফন্টই থাকে)।
 */
function fontForClass(cls: RunScriptClass, settings: FontRemapSettings): string | null {
  const v =
    cls === "bijoy"
      ? settings.bijoyFont
      : cls === "unicode-bengali"
        ? settings.unicodeFont
        : settings.englishFont;
  return v === FONT_DEFAULT ? null : v;
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

// ---------- মিশ্র-রান সেগমেন্টেশন (স্ক্রিপ্ট-বাউন্ডারিতে রান ভাঙা) ----------

/** XML-টেক্সট এস্কেপ — সেগমেন্ট-রিরাইটে w:t-কনটেন্ট নিরাপদ রাখতে */
function escXmlText(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * রান-টেক্সটকে স্ক্রিপ্ট-সেগমেন্টে ভাগ — encoding.ts-এর শব্দ-ধরে টোকেনাইজার
 * (কনটেক্সট-ইনহেরিটেন্সসহ)। Bijoy ডকে "K."/"wb‡Pi" → bijoy, "(Board 2019)" →
 * english — প্রতিটা অক্ষর নিজের ক্লাস পায়; neutral (স্পেস/সংখ্যা) পাশের
 * সেগমেন্টেই জমা হয়।
 */
function scriptSegments(
  text: string,
  dominant: RemapDominant
): Array<{ cls: RunScriptClass; text: string }> {
  const encDominant: Enc | null =
    dominant === "bijoy" ? "bijoy" : dominant === "unicode-bengali" ? "unicode" : null;
  const toks = tokenizeWithContext(text, encDominant);
  const segs: Tok[] = [];
  for (const t of toks) {
    if (!t.text) continue;
    const last = segs[segs.length - 1];
    if (!last) {
      segs.push({ ...t });
      continue;
    }
    if (last.enc === t.enc) last.text += t.text;
    else if (t.enc === "neutral") last.text += t.text;
    else if (last.enc === "neutral") {
      last.text += t.text;
      last.enc = t.enc;
    } else segs.push({ ...t });
  }
  return segs.map((s) => ({
    cls: (s.enc === "bijoy" ? "bijoy" : s.enc === "unicode" ? "unicode-bengali" : "latin") as RunScriptClass,
    text: s.text,
  }));
}

/** রানের inner-এ প্রথম w:t-তে লেখা বসানো, বাকি w:t বাদ (ট্যাব-জাতীয় শূন্য-প্রস্থ চাইল্ড রক্ষা) */
function setRunInnerText(runInner: string, text: string): string {
  let first = true;
  return runInner.replace(WT_RE, (tm: string) => {
    if (!first) return "";
    first = false;
    if (tm.endsWith("/>")) {
      return tm.slice(0, tm.length - 2) + ">" + escXmlText(text) + "</w:t>";
    }
    const openEnd = tm.indexOf(">") + 1;
    return tm.slice(0, openEnd) + escXmlText(text) + "</w:t>";
  });
}

/** সেগমেন্ট-গ্রুপের জন্য নতুন রান — অরিজিনাল rPr ক্লোন + লেখা; font থাকলে rFonts বসায় */
function buildSegRun(rprXml: string | null, font: string | null, text: string): string {
  const inner = (rprXml ?? "") + `<w:t xml:space="preserve">${escXmlText(text)}</w:t>`;
  return `<w:r>${font ? remapRunInner(inner, font) : inner}</w:r>`;
}

/**
 * word/document.xml-এর প্রতিটি টেক্সটধারী <w:r>-এর ফন্ট রিম্যাপ করে।
 * w:t-হীন রান (w:tab/w:br/w:drawing/w:fldChar) ও self-closing <w:r/> অস্পৃশ্য।
 * স্লট "Default" হলে ওই শ্রেণির রান অস্পৃশ্য (অরিজিনাল ফন্টই থাকে)।
 * মিশ্র রান (বাংলা+English এক রানে) স্ক্রিপ্ট-বাউন্ডারিতে ভেঙে প্রতি অংশ
 * নিজের ফন্ট পায় — প্রতি অক্ষর সঠিক ফন্টে।
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
    const openEnd = m.length - runInner.length - "</w:r>".length;

    // ---- ফন্ট ground-truth: রানের নিজস্ব ফন্টই পুরো-রান শ্রেণি ঘোষণা করে ----
    const runFont = runAsciiFontOf(runInner);
    if (runFont && LEGACY_BIJOY_FONT_VALUE_RE.test(runFont)) {
      // লিগ্যাসি-Bijoy ফন্ট — মার্কারহীন খাঁটি-ASCII বাংলা ("Avgvi"-জাতীয়) বিজয়;
      // ইউনিকোড-বাংলা অক্ষর (BN ব্লক) নিজের ক্লাসেই (unambiguous)
      let cls: RunScriptClass = classifyRunText(text, dominant);
      if (cls === "latin") cls = "bijoy";
      const font = fontForClass(cls, settings);
      if (font == null) return m; // Default — রান অস্পৃশ্য
      return m.slice(0, openEnd) + remapRunInner(runInner, font) + "</w:r>";
    }
    let cls = classifyRunText(text, dominant);
    if (runFont && KNOWN_LATIN_FONT_VALUE_RE.test(runFont) && cls === "bijoy") {
      // পরিচিত English-ফন্ট ground-truth — Bijoy-প্রধান ডকেও English রান
      // ইংরেজি ফন্টেই থাকে (ভুল করে SutonnyMJ পেয়ে ভাঙে না)
      const font = fontForClass("latin", settings);
      if (font == null) return m;
      return m.slice(0, openEnd) + remapRunInner(runInner, font) + "</w:r>";
    }

    // ---- সেগমেন্টেশন: শুধুই যখন একই রানে ইউনিকোড-বাংলা C English মিশে থাকে।
    // Bijoy-(Sutonny) ASCII রান উপরে রানের নিজের ফন্ট ground-truth-এ পুরো-রানই
    // যায় ("Avgvi"-জাতীয় খাঁটি-ASCII বিজয়) — ওদের ভাঙলে ভুল হতো।
    let font: string | null = null;
    let didSeg = false;
    if (BN_RE.test(text) && /[A-Za-z]/.test(text)) {
      const sg = scriptSegments(text, dominant);
      const gr: Array<{ font: string | null; text: string }> = [];
      for (const s of sg) {
        const f = fontForClass(s.cls, settings);
        const last = gr[gr.length - 1];
        if (last && last.font === f) last.text += s.text;
        else gr.push({ font: f, text: s.text });
      }
      if (gr.length > 1) {
        // মিশ্র — রান ভেঙে প্রতি অংশ নিজের ফন্টে
        const rprM = RPR_RE.exec(runInner);
        const rprXml = rprM && !rprM[0].endsWith("/>") ? rprM[0] : null;
        let out = m.slice(0, openEnd);
        gr.forEach((g, gi) => {
          if (gi === 0) {
            let head = setRunInnerText(runInner, g.text);
            if (g.font) head = remapRunInner(head, g.font);
            out += head + "</w:r>";
          } else {
            out += buildSegRun(rprXml, g.font, g.text);
          }
        });
        return out; // head+tail সবগুলো রানই complete — অতিরিক্ত </w:r> নেই
      }
      didSeg = true;
      font = gr[0]?.font ?? null;
    }
    if (!didSeg) font = fontForClass(cls, settings);
    if (font == null) return m; // Default — রান অস্পৃশ্য
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

/**
 * পরিচিত ল্যাটিন/English ফন্ট — রানের নিজস্ব ফন্ট এগুলোর কোনো-একটা হলে
 * রানটা English ground-truth (Bijoy-প্রধান ডকেও English রান English-ই থাকে —
 * ভুল করে SutonnyMJ পেয়ে বাংলা-গিববেরিশ হয় না)।
 */
export const KNOWN_LATIN_FONT_VALUE_RE =
  /^(?:times( new roman)?|arial( narrow| black)?|calibri|cambria|candara|corbel|constantia|consolas|comic sans ms|georgia|garamond|verdana|tahoma|segoe ui|trebuchet ms|helvetica|courier( new)?|lucida (sans|console|bright)|book (antiqua|man old style)|century (schoolbook|gothic)|franklin gothic|gill sans( mt)?|palatino linotype|rockwell|impact)$/i;

const STYLE_FONTVAL_RE = /((?:w:ascii|w:hAnsi|w:cs|w:eastAsia)=")([^"]*)(")/g;

/**
 * word/styles.xml রিম্যাপ: w:ascii/w:hAnsi/w:cs/w:eastAsia অ্যাট্রিবিউটের
 * ভ্যালু লিগ্যাসি Bijoy ফন্ট হলে bijoyFont দিয়ে বদলায়।
 * থিম-অ্যাট্রিবিউট (w:asciiTheme ইত্যাদি), w:name, অন্য ফন্ট — অস্পৃশ্য।
 */
export function applyFontRemapStylesXml(stylesXml: string, settings: FontRemapSettings): string {
  if (!settings?.enabled || !stylesXml) return stylesXml;
  if (settings.bijoyFont === FONT_DEFAULT) return stylesXml; // Default — styles অস্পৃশ্য
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
