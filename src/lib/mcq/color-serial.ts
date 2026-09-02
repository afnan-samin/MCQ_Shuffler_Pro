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

import JSZip from "jszip";
import {
  detectSerialPrefix,
  isQuestionStart,
  serialMatchSpans,
  numberToDigits,
  type DigitEnc,
} from "./docx-xml";

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
  if (bodyOpen < 0) throw new Error("document.xml-এ w:body পাওয়া যায়নি");
  const openEnd = xml.indexOf(">", bodyOpen);
  const bodyClose = xml.lastIndexOf("</w:body>");
  if (openEnd < 0 || bodyClose < 0 || bodyClose <= openEnd) {
    throw new Error("document.xml-এ w:body পাওয়া যায়নি");
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
  if (key.startsWith("theme:")) return "কাস্টম রঙ (থিম)";
  const code = paletteCodeOf(key);
  return code ?? "কাস্টম রঙ";
}

// ---------- নম্বর-প্ল্যান (স্ট্যাক/নেস্টিং অ্যালগরিদম) ----------

export type SerialScheme = { kind: "color"; key: string } | { kind: "continuous" };

/**
 * স্ট্যাক-অ্যালগরিদম (ইউজারের নিয়ম হুবহু):
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
 * 🛡️ X-প্রোটেকশন (আসল ফাইলের বাগ-ফিক্স): অধ্যায়ের রঙ ফাইলভেদে বদলায়
 *    (যেমন অধ্যায়-১ = B6, অধ্যায়-২…৫ = B1)। তখন আগের অধ্যায়ের Type/Varsity
 *    এন্ট্রি স্ট্যাকে পুঁজে থাকে; নতুন অধ্যায়ের প্রথম Type হেডার এসেই
 *    "ভাই-রিস্টার্ট" মনে করে স্ট্যাক কেটে খোলা X-সেকশন (B1) বন্ধ করে
 *    দিত — ফলে কোনো প্রশ্ন নম্বরই পেত না। এখন চেক করা হয়: C যদি এই
 *    X-সেকশনের শেষ হওয়ার আগেই (nextX-এর আগে) আবার ফিরে আসে, তাহলে C
 *    হলো X-এর ভিতরের লেভেলের হেডার — X-কে রেখে তার ভিতরে নেস্ট হয়।
 *
 * রিটার্ন: Map<paraIdx, newNumber> — শুধু প্রশ্ন-শুরু প্যারারাই থাকে
 */
export function planSerialByColor(analysis: ColorAnalysis, scheme: SerialScheme): Map<number, number> {
  const plan = new Map<number, number>();
  const X = scheme.kind === "color" ? scheme.key : null;

  // প্রতি রঙের সেকশন-সংখ্যা — লেভেল অনুমানের ভিত্তি:
  // যে রঙ তত বেশি ঘন (বেশি হেডার), সে তত নিচু লেভেলের (Type ×২৭ অধ্যায় ×৪-এর ভিতরে)।
  // তাই C-এর সংখ্যা X-এর কমপক্ষে ২ গুণ হলে C হলো X-এর ভিতরের লেভেলের রঙ —
  // C রি-অ্যারাইভ করলেও X-সেকশন বন্ধ হবে না। না হলে C সম-উচ্চ-লেভেল —
  // ভাই-রিস্টার্টে X বন্ধ (সীমানায় "থিমে যাওয়া")।
  const countOf = new Map<string, number>();
  for (const c of analysis.colors) countOf.set(c.key, c.sections);

  const stack: Array<{ color: string; pos: number }> = [];
  let counter = 0;
  let inX = false;

  analysis.paras.forEach((para) => {
    if (para.colorKey) {
      let at = -1;
      for (let s = stack.length - 1; s >= 0; s--) {
        if (stack[s].color === para.colorKey) {
          at = s;
          break;
        }
      }
      if (at >= 0) {
        let protectXAt = -1;
        if (X !== null && X !== para.colorKey) {
          // `at`-এর ওপরে কোনো খোলা X-এন্ট্রি আছে কি? (থাকলে এই pop X-কে মারতে চলেছিল)
          let xAt = -1;
          for (let s = stack.length - 1; s > at; s--) {
            if (stack[s].color === X) {
              xAt = s;
              break;
            }
          }
          const cCount = countOf.get(para.colorKey) ?? 0;
          const xCount = countOf.get(X) ?? 0;
          if (xAt > at && cCount >= 2 * xCount) {
            protectXAt = xAt; // C হলো X-এর ভিতরের লেভেলের হেডার — X খোলা থাকুক
          }
        }
        if (protectXAt >= 0) {
          stack.length = protectXAt + 1; // X ধরে রেখে তার ওপরেরগুলো বন্ধ
        } else {
          stack.length = at; // সাধারণ ভাই-রিস্টার্ট: C-সহ ওপরের সব বন্ধ
        }
      }
      stack.push({ color: para.colorKey, pos: 0 });
      if (X !== null && para.colorKey === X) counter = 0; // নতুন X-সেকশন
      inX = X !== null && stack.some((e) => e.color === X);
    } else if (para.isQuestion) {
      if (X === null || inX) {
        counter++;
        plan.set(para.idx, counter);
      }
    }
  });
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
  const segs: WtSegment[] = [];
  WT_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = WT_RE.exec(sub))) {
    const openEnd = m.index + m[0].indexOf(">") + 1;
    segs.push({ rawStart: openEnd, rawEnd: m.index + m[0].length - "</w:t>".length, text: decodeXmlEntities(m[1]) });
  }
  if (!segs.length) return sub;

  const joined = segs.map((s) => s.text).join("");
  const spans = serialMatchSpans(joined);
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
    const spans2 = serialMatchSpans(joined2);
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

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

/** রঙ-সিরিয়াল করা .docx ডাউনলোড — অরিজিনাল zip-এর বাকি সব (ছবি/স্টাইল/সেটিংস) অক্ষত */
export async function downloadColorSerialDocx(params: {
  originalFile: Blob;
  xml: string;
  plan: Map<number, number>;
  baseName: string;
  schemeLabel: string;
}): Promise<void> {
  const newXml = applyColorSerialXml(params.xml, params.plan);
  const src = await JSZip.loadAsync(params.originalFile);
  // নতুন zip-এ নন-ডিরেক্টরি এন্ট্রিগুলো হুবহু কপি, document.xml বদলে নতুন XML —
  // (JSZip নিজে ফোল্ডার-এন্ট্রি বানায়, আর remove() রিকার্সিভ — তাই সরাসরি কপি-নির্মাণ)
  const others: Array<{ path: string; data: Promise<Uint8Array> }> = [];
  src.forEach((path, entry) => {
    if (!entry.dir && path !== "word/document.xml") others.push({ path, data: entry.async("uint8array") });
  });
  const zip = new JSZip();
  zip.file("word/document.xml", new TextEncoder().encode(newXml));
  for (const o of others) zip.file(o.path, await o.data);
  const blob = await zip.generateAsync({ type: "blob", mimeType: DOCX_MIME, compression: "DEFLATE" });

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${params.baseName} (color serial - ${params.schemeLabel}).docx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export type { DigitEnc };
