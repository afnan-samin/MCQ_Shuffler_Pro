// ============================================================
// Color-Serial Engine — রঙ-ভিত্তিক স্ট্রাকচার্ড ফাইলের সিরিয়াল
// ============================================================
// ইউজার Word-এর Home → Paragraph → Shading দিয়ে হেডারের পেছনে রঙ
// দেয় (প্রতিবার ভিন্ন রঙও হতে পারে)। এই ইঞ্জিন:
//   ১) কোন কোন প্যারায় কোন রঙ আছে ডিটেক্ট করে (palette A1–J7 + কাস্টম)
//   ২) রঙের ক্রম দেখে বুঝে নেয় কে কার ভিতরে আছে (স্ট্যাক/নেস্টিং)
//   ৩) ইউজার যে রঙ সিলেক্ট করবে, প্রতিটা ওই-রঙ-সেকশনের প্রশ্ন
//      ১ থেকে নম্বর পাবে; অভিভাবক-রঙের সীমানা পেরোবে না
//   ৪) শুধু সিরিয়ালের ডিজিট+সেপারেটর বদলায় (docx→docx surgical) —
//      math, ছবি, ফন্ট, ট্যাব, হেডার সব হুবহু অক্ষত
//
// ⚡ পারফরম্যান্স/নিরাপত্তা: পুরো পাইপলাইন এখন STRING-লেভেল (DOMParser/
//    XMLSerializer নেই)। বিশাল ফাইলেও (১৬MB+ document.xml) মেমোরি ফুলে
//    OOM/corrupt-ডাউনলোড হয় না — এডিট হয় মূল XML-এর ওপর ক্ষুদ্র splice-এ,
//    বাকি বাইট হুবহু অরিজিনাল।
// ============================================================

import {
  detectSerialPrefix,
  isQuestionStart,
  looksOptionLed,
  serialMatchSpans,
  numberToDigits,
  type DigitEnc,
} from "./docx-xml";
import { repackDocxRemapped } from "./repack-docx";
import type { FontSettings } from "./font-remap";

// ---------- রঙের প্যালেট (ইউজারের "color shading palatte.docx" থেকে) ----------
// Word-এর Paragraph → Shading গ্রিড: কলাম A–J, রো ১–৭ → ৭০টা রঙ
// কোড যেমন "B1" = কলাম B, রো ১

export const PALETTE_COLS = "ABCDEFGHIJ";

export const PALETTE_ROWS: string[][] = [
  // রো ১ — মূল রঙ
  ["FFFFFF", "000000", "EEECE1", "1F497D", "4F81BD", "C0504D", "9BBB59", "8064A2", "4BACC6", "F79646"],
  // রো ২ — সবচেয়ে হালকা
  ["F2F2F2", "7F7F7F", "DDD9C3", "C6D9F1", "DBE5F1", "F2DBDB", "EAF1DD", "E5DFEC", "DAEEF3", "FDE9D9"],
  // রো ৩
  ["D9D9D9", "595959", "C4BC96", "8DB3E2", "B8CCE4", "E5B8B7", "D6E3BC", "CCC0D9", "B6DDE8", "FBD4B4"],
  // রো ৪
  ["BFBFBF", "404040", "948A54", "548DD4", "95B3D7", "D99594", "C2D69B", "B2A1C7", "92CDDC", "FABF8F"],
  // রো ৫ — গাঢ়
  ["A6A6A6", "262626", "4A442A", "17365D", "365F91", "943634", "76923C", "5F497A", "31849B", "E36C0A"],
  // রো ৬ — আরো গাঢ়
  ["808080", "0D0D0D", "1D1B11", "0F243E", "244061", "632423", "4F6228", "403152", "215868", "984806"],
  // রো ৭ — স্ট্যান্ডার্ড রঙ
  ["C00000", "FF0000", "FFC000", "FFFF00", "92D050", "00B050", "00B0F0", "0070C0", "002060", "7030A0"],
];

/** রঙের নাম (বাংলা হেল্পার) — চিপে পাশে দেখানোর জন্য */
export const PALETTE_NAMES: Record<number, string> = {
  0: "সাদা", 1: "কালো", 2: "হালকা বেইজ", 3: "গাঢ় নীল", 4: "নীল", 5: "লালচে", 6: "সবুজাভ", 7: "বেগুনি", 8: "আকাশি", 9: "কমলা",
};

const HEX_TO_CODE = new Map<string, string>();
for (let r = 0; r < PALETTE_ROWS.length; r++) {
  for (let c = 0; c < PALETTE_ROWS[r].length; c++) {
    HEX_TO_CODE.set(PALETTE_ROWS[r][c], `${PALETTE_COLS[c]}${r + 1}`);
  }
}

/** hex → প্যালেট কোড ("B1") — প্যালেটে না থাকলে null। সাদা (A1) বাদই। */
export function paletteCodeOf(hex: string): string | null {
  return HEX_TO_CODE.get(hex.toUpperCase()) ?? null;
}

export function paletteHexOf(code: string): string | null {
  if (!/^[A-J][1-7]$/.test(code)) return null;
  const col = PALETTE_COLS.indexOf(code[0]);
  return PALETTE_ROWS[Number(code[1]) - 1][col] ?? null;
}

// ---------- ছোট স্ট্রিং হেল্পার (DOM ছাড়া XML পড়া) ----------

function attrStr(tag: string, name: string): string {
  let m = new RegExp(`\\b${name}="([^"]*)"`).exec(tag);
  if (m) return m[1];
  m = new RegExp(`\\b${name}='([^']*)'`).exec(tag);
  return m ? m[1] : "";
}

function decodeXmlEntities(s: string): string {
  if (!s.includes("&")) return s;
  return s.replace(/&(#[xX][0-9A-Fa-f]+|#[0-9]+|amp|lt|gt|quot|apos);/g, (_, e: string) => {
    if (e === "amp") return "&";
    if (e === "lt") return "<";
    if (e === "gt") return ">";
    if (e === "quot") return '"';
    if (e === "apos") return "'";
    if (e[0] === "#") {
      const code = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      if (!isNaN(code) && code > 0 && code <= 0x10ffff) return String.fromCodePoint(code);
    }
    return _;
  });
}

/** প্যারা-সাবস্ট্রিংয়ের ভিতরের প্লেইন টেক্সট: w:t + m:t (ক্রমে), <w:tab/> = \t */
const PARA_TEXT_RE = /<w:t(?=[\s>])[^>]*>([^<]*)<\/w:t>|<m:t(?=[\s>])[^>]*>([^<]*)<\/m:t>|<w:tab\/>/g;

function paraTextOf(sub: string): string {
  let out = "";
  PARA_TEXT_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = PARA_TEXT_RE.exec(sub))) {
    if (m[0] === "<w:tab/>") out += "\t";
    else out += decodeXmlEntities(m[1] ?? m[2] ?? "");
  }
  return out;
}

/**
 * প্যারা-সাবস্ট্রিং থেকে paragraph-shading কী:
 * pPr-এর সরাসরি w:shd থেকে (pPr-এর ভিতরের rPr-এর shd নয় — সেটা প্যারা-মার্কের)
 *  - fill hex থাকলে সেটা — সাদা/auto হলে null
 *  - themeFill থাকলে "theme:accent1:E6" স্টাইলের কী
 */
function paraShadingKeyOf(sub: string): string | null {
  const pPrOpen = /<w:pPr(?=[\s/>])/.exec(sub);
  if (!pPrOpen) return null;
  const openEnd = sub.indexOf(">", pPrOpen.index);
  if (openEnd < 0) return null;
  if (sub[openEnd - 1] === "/") return null; // <w:pPr/> — খালি, শেডিং নেই
  const closeAt = sub.indexOf("</w:pPr>", openEnd);
  if (closeAt < 0) return null;
  let block = sub.slice(openEnd + 1, closeAt);
  // প্যারা-মার্কের rPr-এর shd বাদ (DOM-ভার্সনেও pPr-এর সরাসরি সন্তান দেখা হতো)
  block = block.replace(/<w:rPr(?=[\s/>])[\s\S]*?<\/w:rPr>/g, "");
  const shd = /<w:shd(?=[\s/>])[^>]*>/.exec(block);
  if (!shd) return null;
  const tag = shd[0];
  const fill = attrStr(tag, "w:fill").toUpperCase();
  if (fill && fill !== "AUTO" && fill !== "FFFFFF") return fill;
  const themeFill = attrStr(tag, "w:themeFill");
  if (themeFill) {
    const shade = attrStr(tag, "w:themeFillShade");
    const tint = attrStr(tag, "w:themeFillTint");
    return `theme:${themeFill}${shade ? `:${shade}` : ""}${tint ? `:${tint}` : ""}`;
  }
  return null;
}

// ---------- body-children স্ক্যানার (top-level <w:p> রেঞ্জ) ----------

export interface BodyChild {
  /** ট্যাগের নাম (যেমন "w:p", "w:tbl", "w:bookmarkEnd") */
  kind: string;
  start: number;
  end: number;
  selfClosing: boolean;
}

const TAG_RE = /<(\/?)([A-Za-z][\w.-]*(?::[A-Za-z][\w.-]*)?)((?:"[^"]*"|'[^']*'|[^>"'])*?)(\/?)>/g;

/**
 * <w:body>…</w:body>-এর ভিতরের depth-1 এলিমেন্টগুলোর স্ট্রিং-রেঞ্জ।
 * ইনডেক্স = body-children ইনডেক্স (DOM-এর kids[i]-এর সাথে হুবহু মেলে)।
 * নেস্টেড w:p (টেবিল/টেক্সটবক্সের ভিতরের) depth গুনে বাদ পড়ে — শুধু
 * টপ-লেভেল শিশুরাই আলাদা এন্ট্রি পায়।
 */
export function scanBodyChildren(xml: string): BodyChild[] {
  const bodyOpen = xml.indexOf("<w:body");
  if (bodyOpen < 0) throw new Error("document.xml has no w:body");
  const openEnd = xml.indexOf(">", bodyOpen);
  const bodyClose = xml.lastIndexOf("</w:body>");
  if (openEnd < 0 || bodyClose < 0 || bodyClose <= openEnd) {
    throw new Error("document.xml has no w:body");
  }

  const out: BodyChild[] = [];
  TAG_RE.lastIndex = openEnd + 1;
  let depth = 0;
  let openStart = -1;
  let openKind = "";
  let m: RegExpExecArray | null;
  while ((m = TAG_RE.exec(xml)) && m.index < bodyClose) {
    const full = m[0];
    const closing = m[1] === "/";
    const name = m[2];
    const selfSlash = m[4] === "/";
    if (closing) {
      depth--;
      if (depth === 0 && openStart >= 0) {
        out.push({ kind: openKind, start: openStart, end: m.index + full.length, selfClosing: false });
        openStart = -1;
        openKind = "";
      }
    } else if (selfSlash) {
      if (depth === 0) out.push({ kind: name, start: m.index, end: m.index + full.length, selfClosing: true });
    } else {
      if (depth === 0) {
        openStart = m.index;
        openKind = name;
      }
      depth++;
    }
  }
  return out;
}

// ---------- বিশ্লেষণ ----------

export interface ColorPara {
  /** body-children ইনডেক্স — apply-এর সময় একই ইনডেক্সে এলিমেন্ট বসে */
  idx: number;
  text: string;
  colorKey: string | null;
  isQuestion: boolean;
}

export interface DetectedColor {
  key: string;
  name: string;
  hex: string | null;
  /** এই রঙের হেডার/সেকশন সংখ্যা */
  sections: number;
}

export interface ColorAnalysis {
  paras: ColorPara[];
  colors: DetectedColor[];
  questionCount: number;
  /** মোট shaded প্যারা (colors এর sections-এর যোগফল) */
  shadedCount: number;
}

/** document.xml থেকে প্যারা-প্রতি রঙ + প্রশ্ন-শুরু তথ্য তোলে (string-level, DOM ছাড়া) */
export function analyzeColorDocx(xml: string): ColorAnalysis {
  const children = scanBodyChildren(xml);

  // ধাপ ১: প্রতিটা প্যারার টেক্সট + রঙ + ট্যাব
  const texts: string[] = [];
  const colorKeys: (string | null)[] = [];
  const hasTabs: boolean[] = [];
  const paraChildIdx: number[] = []; // paras অ্যারের এন্ট্রি → children ইনডেক্স

  for (let i = 0; i < children.length; i++) {
    const ch = children[i];
    if (ch.kind !== "w:p") continue; // tbl/bookmarkEnd/sectPr — রঙ-মোডে স্কিপ
    if (ch.selfClosing) {
      texts.push("");
      colorKeys.push(null);
      hasTabs.push(false);
    } else {
      const sub = xml.slice(ch.start, ch.end);
      texts.push(paraTextOf(sub));
      colorKeys.push(paraShadingKeyOf(sub));
      hasTabs.push(sub.includes("<w:tab/>"));
    }
    paraChildIdx.push(i);
  }

  // ধাপ ২: প্রশ্ন-শুরু ডিটেকশন (রঙ-দেওয়া লাইন কখনো প্রশ্ন না)
  const nextNonEmpty = (from: number): string | null => {
    for (let j = from; j < texts.length; j++) {
      if (texts[j].trim()) return texts[j];
    }
    return null;
  };

  const paras: ColorPara[] = [];
  const sectionCount = new Map<string, number>();
  let questionCount = 0;

  for (let k = 0; k < texts.length; k++) {
    const colorKey = colorKeys[k];
    let isQuestion = false;
    if (!colorKey) {
      const si = detectSerialPrefix(texts[k]);
      if (si && isQuestionStart(si, hasTabs[k], nextNonEmpty(k + 1))) {
        isQuestion = true;
        questionCount++;
      }
    } else {
      sectionCount.set(colorKey, (sectionCount.get(colorKey) ?? 0) + 1);
    }
    paras.push({ idx: paraChildIdx[k], text: texts[k], colorKey, isQuestion });
  }

  const colors: DetectedColor[] = [...sectionCount.entries()]
    .map(([key, sections]) => ({ key, name: colorKeyName(key), hex: colorKeyHex(key), sections }))
    .sort((a, b) => b.sections - a.sections);

  return { paras, colors, questionCount, shadedCount: [...sectionCount.values()].reduce((a, b) => a + b, 0) };
}

/** কী থেকে সোয়াচ-এর hex (থিম-কী হলে null → UI-তে নিরপেক্ষ রঙ) */
export function colorKeyHex(key: string): string | null {
  if (key.startsWith("theme:")) return null;
  return key;
}

/** কী থেকে দেখানোর নাম: প্যালেটে থাকলে কোড (B1), না থাকলে কাস্টম */
export function colorKeyName(key: string): string {
  if (key.startsWith("theme:")) return "Custom color (theme)";
  const code = paletteCodeOf(key);
  return code ?? "Custom color";
}

// ---------- হেডার-স্ট্রিপ (শাফল মোডের জন্য) ----------

/**
 * টপ-লেভেল শেডিং-দেওয়া (রঙ-হেডার) প্যারাগুলো document.xml থেকে সরিয়ে দেয়।
 * শাফল মোডের নিয়ম (ইউজার): "header takle seta bad diye sobgolo ek serial e
 * niye ese shuffle" — হেডার বাদ পড়লে বাকি সব প্রশ্ন একটাই পুল/সিরিয়াল হয়,
 * আর শাফলের সময় হেডার কোনো প্রশ্নের সাথে জড়িয়ে এলোমেলো যায় না।
 *
 * • শুধু body-র depth-1 w:p — টেবিল/টেক্সটবক্সের ভিতরের শেড কখনো ধরা হয় না
 * • ডিটেকশন হুবহু analyzeColorDocx-এর paraShadingKey নিয়মে (সাদা/auto বাদ)
 * • string-level splice — বাকি বাইট byte-identical, বিশাল ফাইলেও মেমোরি-নিরাপদ
 */
export function stripShadedParasXml(xml: string): { xml: string; removed: number; texts: string[] } {
  const children = scanBodyChildren(xml);
  const cuts: Array<{ start: number; end: number; text: string }> = [];
  for (const ch of children) {
    if (ch.kind !== "w:p" || ch.selfClosing) continue;
    const sub = xml.slice(ch.start, ch.end);
    if (paraShadingKeyOf(sub)) cuts.push({ start: ch.start, end: ch.end, text: paraTextOf(sub).trim() });
  }
  if (!cuts.length) return { xml, removed: 0, texts: [] };
  const parts: string[] = [];
  let pos = 0;
  for (const c of cuts) {
    parts.push(xml.slice(pos, c.start));
    pos = c.end;
  }
  parts.push(xml.slice(pos));
  return { xml: parts.join(""), removed: cuts.length, texts: cuts.map((c) => c.text) };
}

// ---------- নন-MCQ লাইন ডিটেক্টর (রঙহীন হেডার/শিরোনাম) ----------

/** শাফল-পাইপলাইন থেকে বাদ পড়া লাইন — কারণসহ (UI-তে আলাদা লিস্টে দেখানো হয়) */
export interface BlockedLine {
  /** বাদ পড়া লাইনের টেক্সট */
  text: string;
  /** "color" = রঙ-হেডার (শেডিং ছিল), "pattern" = রঙ নেই কিন্তু টেক্সট-প্যাটার্নে হেডার/নন-MCQ */
  reason: "color" | "pattern";
}

/**
 * রঙহীন হেডার/শিরোনাম-টাইপ লাইনের প্যাটার্ন — ইউজারের নিয়ম: "jeta mcq noi
 * seta jate bad dey"। প্যাটার্ন ইচ্ছাকৃতভাবে টাইট (লাইনের শুরুতে হেডার-শব্দ),
 * যেন অপশন/প্রশ্ন-বডি লাইন কখনো ধরা না পড়ে — আর যা ধরা পড়ে সব UI-র
 * ব্লকড-লিস্টে দেখা যায়, তাই ভুল হলে ইউজার সাথে সাথে বুঝতে পারেন।
 */
const NON_MCQ_RES: RegExp[] = [
  /^Aa¨vq/, // Bijoy (SutonnyMJ): "অধ্যায়" — যেমন "Aa¨vq-8", "Aa¨vq 7"
  /^অধ্যায়/, // Unicode: "অধ্যায়-১"
  /^chapter\s*[-–—:.]?\s*\d/i, // English: "Chapter 1", "chapter-2:"
  /^type\s*[-–—:.]?\s*\d/i, // সেকশন হেডার: "Type-1", "type 2" (রঙ-নেই ভ্যারিয়েন্ট)
];

/**
 * টেক্সট দেখে নন-MCQ হেডার/শিরোনাম লাইন কি না।
 * ⚠️ শুধু এমন লাইনে ডাকতে হবে যারা প্রশ্ন-শুরু নয়, অপশন-লেড নয় —
 * স্ট্রিপ-ফাংশন সেই গার্ডগুলো নিজেই দেয়। হেডার লাইন ছোট হয় (≤৮০ অক্ষর)।
 */
export function isNonMcqText(text: string): boolean {
  const t = text.trim();
  if (!t || t.length > 80) return false;
  return NON_MCQ_RES.some((re) => re.test(t));
}

/**
 * রঙ নেই এমন নন-MCQ হেডার/শিরোনাম লাইন (যেমন Agri ফাইলের রঙহীন "Aa¨vq-8")
 * document.xml থেকে সরিয়ে দেয় — যাতে কোনো প্রশ্ন-ব্লকের সাথে জড়িয়ে
 * শাফলে এলোমেলো না যায়।
 *
 * গার্ড (শুধু এগুলোই কাটা হয়):
 *  • টপ-লেভেল (depth-1) w:p, টেবিল/টেক্সটবক্সের ভিতরের প্যারা স্পর্শ হয় না
 *  • রঙ-দেওয়া প্যারা কখনো নয় (ওগুলো stripShadedParasXml-এর কাজ)
 *  • প্রশ্ন-শুরু (সিরিয়াল + ট্যাব/অপশন-লেড/টিয়ার-৩) কখনো নয়
 *  • অপশন-লেড লাইন (K./ক./\t…) কখনো নয় — অপশন প্রশ্নের অংশ
 *  • খালি/শুধু-স্পেস প্যারা নয়
 *
 * রিটার্নে বাদ পড়া লাইনের টেক্সটগুলো — UI-র ব্লকড-লিস্টের জন্য।
 * string-level splice — বাকি বাইট byte-identical, বিশাল ফাইলেও মেমোরি-নিরাপদ।
 */
export function stripNonMcqLinesXml(xml: string): { xml: string; removed: BlockedLine[] } {
  const children = scanBodyChildren(xml);

  // প্রথম পাস: w:p-গুলোর টেক্সট + ট্যাব + শেড (প্রশ্ন-শুরু ডিটেকশনের জন্য)
  const paraIdx: number[] = []; // children-ইনডেক্স
  const texts: string[] = [];
  const hasTabs: boolean[] = [];
  const shaded: boolean[] = [];
  for (let i = 0; i < children.length; i++) {
    const ch = children[i];
    if (ch.kind !== "w:p") continue;
    if (ch.selfClosing) {
      texts.push("");
      hasTabs.push(false);
      shaded.push(false);
    } else {
      const sub = xml.slice(ch.start, ch.end);
      texts.push(paraTextOf(sub));
      hasTabs.push(sub.includes("<w:tab/>"));
      shaded.push(!!paraShadingKeyOf(sub));
    }
    paraIdx.push(i);
  }

  const nextNonEmpty = (from: number): string | null => {
    for (let j = from; j < texts.length; j++) {
      if (texts[j].trim()) return texts[j];
    }
    return null;
  };

  // দ্বিতীয় পাস: কোনগুলো কাটা হবে
  const cuts: Array<{ start: number; end: number; text: string }> = [];
  for (let k = 0; k < paraIdx.length; k++) {
    const t = texts[k];
    if (!t.trim() || shaded[k]) continue;
    const si = detectSerialPrefix(t);
    if (si && isQuestionStart(si, hasTabs[k], nextNonEmpty(k + 1))) continue;
    if (looksOptionLed(t)) continue;
    if (!isNonMcqText(t)) continue;
    const ch = children[paraIdx[k]];
    cuts.push({ start: ch.start, end: ch.end, text: t.trim() });
  }

  if (!cuts.length) return { xml, removed: [] };
  const parts: string[] = [];
  let pos = 0;
  for (const c of cuts) {
    parts.push(xml.slice(pos, c.start));
    pos = c.end;
  }
  parts.push(xml.slice(pos));
  return { xml: parts.join(""), removed: cuts.map((c) => ({ text: c.text, reason: "pattern" as const })) };
}

// ---------- নম্বর-প্ল্যান (স্ট্যাক/নেস্টিং অ্যালগরিদম) ----------

export type SerialScheme = { kind: "color"; key: string } | { kind: "continuous" };

/**
 * স্ট্যাক-অ্যালগরিদম v2 (ইউজারের নিয়ম হুবহু):
 *  - রঙ-দেওয়া হেডার C এলে: স্ট্যাকে C আগে থাকলে C-সহ ওপরের সব বন্ধ করে
 *    C নতুন সেকশন হিসেবে খোলা হয় (ভাই-সেকশন); না থাকলে সবচেয়ে ভিতরের
 *    খোলা সেকশনের সন্তান হিসেবে খোলে
 *  - সিলেক্ট করা রঙ X-এর হেডার এলে কাউন্টার ০ (নতুন সেকশন → ১ থেকে)
 *  - X যদি স্ট্যাকে না থাকে (অভিভাবক/ভাই-সীমানায় বন্ধ হয়ে গেছে) →
 *    নম্বর দেওয়া বন্ধ — "program oikane theme jabe"
 *  - X-এর ভিতরের গভীর রঙের হেডার নম্বর থামায় না, তাদের প্রশ্নও
 *    X-সেকশনের ক্রমের অংশ
 *  - continuous: পুরো ফাইলে একটানা ১,২,৩…
 *
 * 🎓 অধ্যায়-সোদক সোয়াপ (বাগ-ফিক্স: "অধ্যায়ের রঙ বদলালে" সমস্যা):
 *    বাস্তব ফাইলে একই স্তরের (যেমন অধ্যায়) হেডারের রঙ বদলায় — অধ্যায়-১ = B6,
 *    অধ্যায়-২…৫ = B1। পুরনো অ্যালগরিদমে নতুন রঙ B1-কে আগের অধ্যায়ের *সন্তান*
 *    ভেবে বসালে B6-সেকশন কখনো বন্ধ হতো না — B6-স্কিম পুরো ফাইলকে একটানা
 *    নম্বর দিয়ে দিত (আউটপুট continuous-এর হুবহু কপি হয়ে যেত)।
 *    এখন: fresh রঙ C এলে যদি — (১) স্ট্যাকের রুট R এ পর্যন্ত মাত্র ১ বার
 *    এসে থাকে (তার একটাই সেকশন খোলা), (২) R-এর সরাসরি-সন্তান রঙের প্রমাণ
 *    থাকে (R আসলেই একটা অভিভাবক-স্তর), (৩) C ও R-এর হেডার-ঘনত্ব একই
 *    অর্ডারে (≤১০×) — তাহলে C হলো R-এর *সোদক* (নতুন অধ্যায়): রুট-সেকশন
 *    বন্ধ করে C নতুন রুট হয়। ইউজারের A5/A2/A6 নেস্টিং উদাহরণে এই নিয়ম
 *    কখনো ফায়ার করে না (সেখানে রুট A5 বারবার রি-অ্যারাইভ করে)।
 *
 * 🛡️ ২×-গার্ড: কোনো রঙের রিস্টার্ট তার স্ট্যাক-পজিশনের ওপরে থাকা ২×-এর কম ঘন
 *    (তাই তুলনামূলক উঁচু-লেভেলের) সেকশনকে বন্ধ করতে পারে না — ঘন রঙের
 *    রিস্টার্ট কখনো উঁচু-লেভেলের খোলা সেকশন (যেমন সিলেক্টেড X) মেরে ফেলবে না।
 *
 * রিটার্ন: Map<paraIdx, newNumber> — শুধু প্রশ্ন-শুরু প্যারারাই থাকে
 */
export function planSerialByColor(analysis: ColorAnalysis, scheme: SerialScheme): Map<number, number> {
  const plan = new Map<number, number>();
  const X = scheme.kind === "color" ? scheme.key : null;

  // গ্লোবাল ঘনত্ব: যে রঙের হেডার তত বেশি, সে তত গভীর-লেভেলের (Type ×২৭ ⊂ অধ্যায় ×৪)
  const countOf = new Map<string, number>();
  for (const c of analysis.colors) countOf.set(c.key, c.sections);

  const stack: string[] = [];
  const seen = new Map<string, number>(); // রঙ → এ পর্যন্ত হেডার-সংখ্যা
  const kids = new Map<string, Set<string>>(); // রঙ → তার সরাসরি-সন্তান রঙের প্রমাণ (fresh-পুশ এজ)
  let counter = 0;
  let inX = X === null; // continuous → সব প্রশ্ন নম্বর পায়

  for (const para of analysis.paras) {
    if (para.colorKey) {
      const C = para.colorKey;
      let at = -1;
      for (let s = stack.length - 1; s >= 0; s--) {
        if (stack[s] === C) { at = s; break; }
      }
      if (at >= 0) {
        // ভাই-রিস্টার্ট — ২×-গার্ড
        const cCount = countOf.get(C) ?? 0;
        let cut = at;
        for (let s = at + 1; s < stack.length; s++) {
          if ((countOf.get(stack[s]) ?? 0) * 2 <= cCount) { cut = s + 1; break; }
        }
        stack.length = cut;
      } else if (stack.length > 0) {
        // fresh রঙ — অধ্যায়-সোদক সোয়াপ কি হবে?
        const root = stack[0];
        const seenRoot = seen.get(root) ?? 0;
        const cN = countOf.get(C) ?? 0;
        const rN = countOf.get(root) ?? 0;
        const hi = Math.max(cN, rN);
        const lo = Math.min(cN, rN);
        // প্রমাণ: রুটের অন্তত একটা সন্তান-রঙ ২+ বার এসেছে — অর্থাৎ রুটের
        // ভিতরের স্তরটা রিপিট হয়ে স্ট্রাকচার প্রতিষ্ঠিত (আসল ফাইলে অধ্যায়-১-এ
        // Type-সেকশন বারবার রিস্টার্ট হয়েছে; প্রথম Type-এর মাঝেই যে ভিতরের
        // লেভেল প্রথমবার খুলছে সেটা অধ্যায় নয় — varsity-স্টাইল গভীর স্তর)
        const childEstablished = [...(kids.get(root) ?? [])].some((ch) => (seen.get(ch) ?? 0) >= 2);
        // আরও প্রমাণ: C রুটের প্রতিষ্ঠিত সন্তানদের চেয়ে রেয়ার (তাই C-ও
        // সন্তানদের মতো উঁচু-লেভেলের ব্যান্ডে — গভীর-লেভেলের হেডার নয়)
        const childDensest = Math.max(...[...(kids.get(root) ?? [])].map((ch) => countOf.get(ch) ?? 0));
        // সবচেয়ে জোরালো প্রমাণ: C রুট ছাড়া বাকি *সব খোলা* রঙের চেয়ে কঠোরভাবে
        // রেয়ার — নতুন অধ্যায়ের রঙ সবসময় চলমান Type/varsity-স্তরের চেয়ে রেয়ার
        // (B1=৪ < Type=২৭ < varsity=২৫৭)। ইউজারের A5/A6-নেস্টিংয়ে A6(৩) A2(৩)-এর
        // চেয়ে রেয়ার নয় — তাই ভুল সোয়াপ হয় না।
        let openMin = Infinity;
        for (let s = 1; s < stack.length; s++) openMin = Math.min(openMin, countOf.get(stack[s]) ?? 0);
        if (seenRoot === 1 && childEstablished && cN <= childDensest && cN < openMin && hi <= lo * 10) {
          stack.length = 0; // হ্যাঁ — C রুটের সোদক: রুট-সেকশন বন্ধ, C নতুন রুট
        }
        // fresh পুশ-এজ: parent = বর্তমান টপ
        const parent = stack.length ? stack[stack.length - 1] : null;
        if (parent) {
          if (!kids.has(parent)) kids.set(parent, new Set());
          kids.get(parent)!.add(C);
        }
      }
      seen.set(C, (seen.get(C) ?? 0) + 1);
      stack.push(C);
      if (X !== null) {
        if (C === X) counter = 0; // নতুন X-সেকশন (হুবহু রঙে)
        inX = stack.includes(X); // স্কোপিংও হুবহু রঙে
      }
    } else if (para.isQuestion) {
      if (inX) {
        counter++;
        plan.set(para.idx, counter);
      }
    }
  }
  return plan;
}

// ---------- সার্জিক্যাল অ্যাপ্লাই (string-level splice) ----------

interface WtSegment {
  /** w:t কনটেন্টের শুরু/শেষ (sub-স্ট্রিংয়ের raw অফসেট) */
  rawStart: number;
  rawEnd: number;
  /** decoded টেক্সট */
  text: string;
}

const WT_RE = /<w:t(?=[\s>])[^>]*>([^<]*)<\/w:t>/g;

/**
 * একটা প্যারা-সাবস্ট্রিং-এর w:t-স্ট্রিমে decoded-স্প্যান রিপ্লেস —
 * DOM-যুগের replaceSpans-এর হুবহু সেমান্টিক্স: যে সেগমেন্টে স্প্যান শুরু
 * সেখানে নতুন টেক্সট বসে, মাঝের সেগমেন্ট খালি হয়, শেষ সেগমেন্টের বাকি
 * অংশ অক্ষত থাকে — মাঝের রান-মার্কআপ কখনো মোছে না।
 */
function replaceDecodedSpan(sub: string, segs: WtSegment[], decStart: number, decEnd: number, text: string): string {
  if (decEnd <= decStart) return sub;
  // সেগমেন্ট prefix-অফসেট
  const prefix: number[] = [];
  let acc = 0;
  for (const s of segs) {
    prefix.push(acc);
    acc += s.text.length;
  }
  // decoded পজিশন → (সেগমেন্ট, লোকাল decoded)
  const locate = (p: number): { si: number; local: number } => {
    let lo = 0;
    let hi = segs.length - 1;
    let si = 0;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (prefix[mid] <= p) {
        si = mid;
        lo = mid + 1;
      } else hi = mid - 1;
    }
    return { si, local: p - prefix[si] };
  };
  // সেগমেন্টের লোকাল decoded → raw অফসেট (entity হিসাব করে)
  const localToRaw = (si: number, local: number): number => {
    const s = segs[si];
    const content = sub.slice(s.rawStart, s.rawEnd);
    if (content.length === s.text.length) return s.rawStart + local; // entity নেই — দ্রুত পথ
    let i = 0;
    let dec = 0;
    while (i < content.length && dec < local) {
      if (content[i] === "&") {
        const semi = content.indexOf(";", i);
        i = semi < 0 ? i + 1 : semi + 1;
        dec += 1;
      } else {
        i++;
        dec++;
      }
    }
    return s.rawStart + i;
  };

  const a = locate(decStart);
  const b = locate(decEnd);
  const edits: Array<{ start: number; end: number; text: string }> = [];
  if (a.si === b.si) {
    const ra = localToRaw(a.si, a.local);
    const rb = localToRaw(b.si, b.local);
    edits.push({ start: ra, end: rb, text });
  } else {
    // শুরুর সেগমেন্ট: লোকাল থেকে কনটেন্ট-শেষ পর্যন্ত → নতুন টেক্সট
    edits.push({ start: localToRaw(a.si, a.local), end: segs[a.si].rawEnd, text });
    // মাঝের সেগমেন্ট: পুরো কনটেন্ট খালি
    for (let s = a.si + 1; s < b.si; s++) edits.push({ start: segs[s].rawStart, end: segs[s].rawEnd, text: "" });
    // শেষ সেগমেন্ট: কনটেন্ট-শুরু থেকে লোকাল পর্যন্ত খালি
    edits.push({ start: segs[b.si].rawStart, end: localToRaw(b.si, b.local), text: "" });
  }
  return spliceEdits(sub, edits);
}

/** raw এডিটগুলো (ascending, non-overlapping) এক পাসে বসায় */
function spliceEdits(sub: string, edits: Array<{ start: number; end: number; text: string }>): string {
  if (!edits.length) return sub;
  const sorted = [...edits].sort((x, y) => x.start - y.start);
  const parts: string[] = [];
  let pos = 0;
  for (const e of sorted) {
    parts.push(sub.slice(pos, e.start), e.text);
    pos = e.end;
  }
  parts.push(sub.slice(pos));
  return parts.join("");
}

/**
 * plan অনুযায়ী শুধু প্রশ্ন-প্যারার সিরিয়াল বদলায় (সেপারেটর "." ডট-স্টাইলে
 * নরমালাইজ — "44|" → "45.")। বাকি পুরো XML হুবহু অরিজিনাল (byte-identical):
 * এডিট হয় শুধু ডিজিট/সেপারেটরের raw অক্ষর। জিরো-প্যাডিং ("01.") ফাইলের
 * নিজের স্টাইল অনুযায়ী ধরে রাখা হয় (১ → "01")।
 */
export function applyColorSerialXml(xml: string, plan: Map<number, number>, targetSep = "."): string {
  if (plan.size === 0) return xml;
  const children = scanBodyChildren(xml);

  const parts: string[] = [];
  let lastPos = 0;
  const idxs = [...plan.keys()].sort((a, b) => a - b);

  for (const idx of idxs) {
    const ch = children[idx];
    if (!ch || ch.kind !== "w:p" || ch.selfClosing) continue;
    const sub = xml.slice(ch.start, ch.end);
    const edited = renumberParaSub(sub, plan.get(idx)!, targetSep);
    if (edited !== sub) {
      parts.push(xml.slice(lastPos, ch.start));
      parts.push(edited);
      lastPos = ch.end;
    }
  }
  parts.push(xml.slice(lastPos));
  return parts.join("");
}

/** একটা প্যারা-সাবস্ট্রিংয়ের সিরিয়াল নতুন নম্বরে বদলায় (ডিজিট+সেপারেটর) */
function renumberParaSub(sub: string, newNum: number, targetSep: string): string {
  const segs = collectWtSegs(sub);
  if (!segs.length) return sub;

  const joined = segs.map((s) => s.text).join("");
  const segEnds: number[] = [];
  let acc = 0;
  for (const s of segs) { acc += s.text.length; segEnds.push(acc); }
  const spans = serialMatchSpans(joined, segEnds);
  if (!spans) return sub;

  // জিরো-প্যাডিং সংরক্ষণ: "01" স্টাইলের ফাইলে ১ → "01"
  let digitsText = numberToDigits(newNum, spans.enc);
  const origDigits = joined.slice(spans.digitsStart, spans.digitsEnd);
  const zeroChar = spans.enc === "en" ? "0" : spans.enc === "bn" ? "০" : "ø";
  if (origDigits.startsWith(zeroChar) && digitsText.length < origDigits.length) {
    digitsText = zeroChar.repeat(origDigits.length - digitsText.length) + digitsText;
  }

  let out = replaceDecodedSpan(sub, segs, spans.digitsStart, spans.digitsEnd, digitsText);
  if (spans.sepEnd > spans.sepStart) {
    // আগের এডিটের পরে সেগমেন্ট raw-পজিশন বদলাতে পারে — আবার স্ক্যান
    const segs2 = collectWtSegs(out);
    const joined2 = segs2.map((s) => s.text).join("");
    const segEnds2: number[] = [];
    let acc2 = 0;
    for (const s of segs2) { acc2 += s.text.length; segEnds2.push(acc2); }
    const spans2 = serialMatchSpans(joined2, segEnds2);
    if (spans2 && spans2.sepEnd > spans2.sepStart) {
      out = replaceDecodedSpan(out, segs2, spans2.sepStart, spans2.sepEnd, targetSep);
    }
  }
  return out;
}

function collectWtSegs(sub: string): WtSegment[] {
  const segs: WtSegment[] = [];
  WT_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = WT_RE.exec(sub))) {
    const openEnd = m.index + m[0].indexOf(">") + 1;
    segs.push({ rawStart: openEnd, rawEnd: m.index + m[0].length - "</w:t>".length, text: decodeXmlEntities(m[1]) });
  }
  return segs;
}

/** রঙ-সিরিয়াল করা .docx blob (ডাউনলোড নয়) — PDF-কনভার্সন পাথও এটাই ব্যবহার করে.
 * fontSettings দিলে সিরিয়াল-এডিট শেষে document.xml (+ styles.xml) font-remap হয় */
export async function buildColorSerialDocxBlob(params: {
  originalFile: Blob;
  xml: string;
  plan: Map<number, number>;
  baseName: string;
  schemeLabel: string;
  fontSettings?: FontSettings;
}): Promise<{ blob: Blob; fileName: string }> {
  const newXml = applyColorSerialXml(params.xml, params.plan);
  const blob = await repackDocxRemapped(params.originalFile, newXml, params.fontSettings);
  return { blob, fileName: `${params.baseName} (color serial - ${params.schemeLabel}).docx` };
}

export type { DigitEnc };
