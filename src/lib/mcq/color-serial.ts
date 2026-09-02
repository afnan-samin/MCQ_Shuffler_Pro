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
// ============================================================

import JSZip from "jszip";
import {
  W_NS,
  extractParaText,
  detectSerialPrefix,
  countRunTabs,
  isQuestionStart,
  renumberSerialParaTo,
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
  // রো ৫
  ["A6A6A6", "262626", "4A442A", "17365D", "365F91", "943634", "76923C", "5F497A", "31849B", "E36C0A"],
  // রো ৬ — গাঢ়
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

// ---------- প্যারা-লেভেল shading ডিটেকশন ----------

function wAttr(el: Element, local: string): string {
  return el.getAttributeNS(W_NS, local) ?? el.getAttribute(`w:${local}`) ?? "";
}

/**
 * প্যারার paragraph-shading কী রিটার্ন করে:
 *  - fill hex থাকলে সেটা ("000000", "D0CECE"…) — সাদা/auto হলে null
 *  - fill নেই কিন্তু themeFill আছে → "theme:accent1:E6" স্টাইলের কী
 *  - কিছু না থাকলে null
 */
export function paraShadingKey(p: Element): string | null {
  const pPr = Array.from(p.children).find((c) => c.localName === "pPr");
  if (!pPr) return null;
  const shd = Array.from(pPr.children).find((c) => c.localName === "shd");
  if (!shd) return null;
  const fill = wAttr(shd, "fill").toUpperCase();
  if (fill && fill !== "AUTO" && fill !== "FFFFFF") return fill;
  const themeFill = wAttr(shd, "themeFill");
  if (themeFill) {
    const shade = wAttr(shd, "themeFillShade");
    const tint = wAttr(shd, "themeFillTint");
    return `theme:${themeFill}${shade ? `:${shade}` : ""}${tint ? `:${tint}` : ""}`;
  }
  return null;
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

/** document.xml থেকে প্যারা-প্রতি রঙ + প্রশ্ন-শুরু তথ্য তোলে */
export function analyzeColorDocx(xml: string): ColorAnalysis {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  if (doc.getElementsByTagName("parsererror").length) {
    throw new Error("document.xml পার্স করা যায়নি");
  }
  const body = doc.getElementsByTagNameNS(W_NS, "body")[0];
  if (!body) throw new Error("document.xml-এ w:body পাওয়া যায়নি");

  const kids = Array.from(body.children) as Element[];
  const texts = kids.map((el) => (el.localName === "p" ? extractParaText(el) : ""));
  const hasTabs = kids.map((el) => (el.localName === "p" ? countRunTabs(el) > 0 : false));

  const nextNonEmpty = (from: number): string | null => {
    for (let j = from; j < kids.length; j++) {
      if (kids[j].localName !== "p") continue;
      if (texts[j].trim()) return texts[j];
    }
    return null;
  };

  const paras: ColorPara[] = [];
  const sectionCount = new Map<string, number>();
  let questionCount = 0;

  for (let i = 0; i < kids.length; i++) {
    const el = kids[i];
    if (el.localName !== "p") continue; // tbl/sectPr — রঙ-মোডে স্কিপ
    const colorKey = paraShadingKey(el);
    let isQuestion = false;
    if (!colorKey) {
      // রঙ-দেওয়া লাইন কখনো প্রশ্ন না — সেগুলোই হেডার/সেকশন মার্কার
      const si = detectSerialPrefix(texts[i]);
      if (si && isQuestionStart(si, hasTabs[i], nextNonEmpty(i + 1))) {
        isQuestion = true;
        questionCount++;
      }
    } else {
      sectionCount.set(colorKey, (sectionCount.get(colorKey) ?? 0) + 1);
    }
    paras.push({ idx: i, text: texts[i], colorKey, isQuestion });
  }

  const colors: DetectedColor[] = [...sectionCount.entries()]
    .map(([key, sections]) => ({ key, name: colorKeyName(key), hex: colorKeyHex(key), sections }))
    .sort((a, b) => b.sections - a.sections);

  return { paras, colors, questionCount, shadedCount: [...sectionCount.values()].reduce((a, b) => a + b, 0) };
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
 * রিটার্ন: Map<paraIdx, newNumber> — শুধু প্রশ্ন-শুরু প্যারারাই থাকে
 */
export function planSerialByColor(analysis: ColorAnalysis, scheme: SerialScheme): Map<number, number> {
  const plan = new Map<number, number>();
  const stack: string[] = [];
  let counter = 0;
  let inX = false;
  const X = scheme.kind === "color" ? scheme.key : null;

  for (const para of analysis.paras) {
    if (para.colorKey) {
      const at = stack.lastIndexOf(para.colorKey);
      if (at >= 0) stack.length = at; // C ও তার ভিতরের সব বন্ধ
      stack.push(para.colorKey);
      if (X !== null && para.colorKey === X) counter = 0; // নতুন X-সেকশন
      inX = X !== null && stack.includes(X);
    } else if (para.isQuestion) {
      if (X === null || inX) {
        counter++;
        plan.set(para.idx, counter);
      }
    }
  }
  return plan;
}

// ---------- সার্জিক্যাল অ্যাপ্লাই ----------

/**
 * plan অনুযায়ী শুধু প্রশ্ন-প্যারার সিরিয়াল বদলায় (সেপারেটর "." ডট-স্টাইলে
 * নরমালাইজ — "44|" → "45.")। বাকি পুরো XML হুবহু থাকে।
 */
export function applyColorSerialXml(xml: string, plan: Map<number, number>, targetSep = "."): string {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  if (doc.getElementsByTagName("parsererror").length) {
    throw new Error("document.xml পার্স করা যায়নি");
  }
  const body = doc.getElementsByTagNameNS(W_NS, "body")[0];
  if (!body) throw new Error("document.xml-এ w:body পাওয়া যায়নি");
  const kids = Array.from(body.children) as Element[];

  for (const [idx, num] of plan) {
    const el = kids[idx];
    if (el && el.localName === "p") renumberSerialParaTo(el, num, targetSep);
  }

  const out = new XMLSerializer().serializeToString(doc);
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n' + out;
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
  const zip = await JSZip.loadAsync(params.originalFile);
  zip.file("word/document.xml", newXml);
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
