// ============================================================
// রেফারেন্স ট্যাগ ডিটেকশন ও বিচ্ছিন্নকরণ (শাফল মোড)
// ============================================================
// প্রশ্নের সাথে জড়ানো সোর্স-ট্যাগ — যেমন [CU-A: 22-23], [JU-A: 23-24],
// (DU-cÖhyw³: 21-22), [BAU-03-04], [Xvwe (cÖhyw³): 21-22] — ধরে
// আলাদা করে: ① যেমন আছে রাখা ② পুরোপুরি বাদ ③ প্রশ্নের শেষে
// আলাদা লাইনে সরানো। বিভিন্ন ধরনের (বোর্ড/ভার্সিটি/ইউনিট/বছর) ট্যাগ
// ধরতে নমনীয় নিয়ম; মাঝ-লাইনের গণিত/রাসায়নিক ব্র্যাকেট নিরাপদ থাকে।
// ============================================================

import {
  W_NS,
  collectParaTs,
  replaceJoinedSpans,
  type DocxQuestion,
} from "./docx-xml";

export type RefMode = "keep" | "strip" | "endline";

export const REF_MODE_LABEL: Record<RefMode, string> = {
  keep: "যেমন আছে তেমন রাখুন",
  strip: "রেফারেন্স বাদ দিন",
  endline: "প্রশ্নের শেষে আলাদা লাইনে সরান",
};

// ---------- টোকেন ডিটেকশন ----------

export interface RefToken {
  /** লাইনে টোকেনের শুরু (w:t-জয়েন্ট টেক্সটে offset) */
  start: number;
  end: number;
  /** পুরো টোকেন, ব্র্যাকেটসহ ("[CU-A: 22-23]") */
  text: string;
}

/**
 * ব্র্যাকেট টোকেন — [] বা () — ভেতরে ২..৮০ অক্ষর।
 * নেস্টিং সাপোর্ট: [..(..)..] ও (..[..]..) — অন্য-ধরনের ব্র্যাকেট ভেতরে চলে
 * (যেমন [Xvwe (cÖhyw³): 21-22]), নিজের-ধরনের ব্র্যাকেট ভেতরে চলে না।
 */
const REF_BRACKET_RE = /\[([^\[\]\n]{2,80})\]|\(([^\(\)\n]{2,80})\)/g;

/** বছর-রেঞ্জ: 22-23, 2019-20, 24-25, 03-04 (EN ডিজিট) */
const YEAR_RANGE_RE = /(?:^|[^\d])(?:\d{2}|\d{4})\s*[-–—]\s*(?:\d{2}|\d{4})(?:[^\d]|$)/;
/** code:22 / code: 22-23 স্টাইল — অক্ষর-কোড + কোলন + ডিজিট */
const COLON_CODE_RE = /^[A-Za-z\u0980-\u09FF][^:\d]{0,30}:\s*\d/;
/** প্রচলিত কীওয়ার্ড (Unicode + Bijoy ASCII রেন্ডারিং) */
const KEYWORD_RE = /(বোর্ড|সাল|বর্ষ|প্রশ্নব্যাংক|পরীক্ষা|wefxK|cÖhyw³|fvl\b|board|year|exam|university|projukti)/i;

/**
 * ব্র্যাকেটের ভেতরের লেখা রেফারেন্স কি না।
 * শর্ত: ভেতরে অন্তত ১টা অক্ষর আছে, এবং (বছর-রেঞ্জ | কোলন-কোড | কীওয়ার্ড)।
 * বিশুদ্ধ সংখ্যা/গণিত — "(0-5)", "(273-373)", "(NH4)" — রেফারেন্স নয়।
 */
function innerIsReference(inner: string): boolean {
  const t = inner.trim();
  if (!t || !/[A-Za-z\u0980-\u09FF]/.test(t)) return false; // অন্তত ১ অক্ষর
  if (YEAR_RANGE_RE.test(t)) return true; // অক্ষর থাকায় বিশুদ্ধ-রেঞ্জ আগেই বাদ
  if (COLON_CODE_RE.test(t)) return true;
  return KEYWORD_RE.test(t) && t.length <= 40;
}

/**
 * এক লাইনের রেফারেন্স টোকেনগুলো — শুধু লাইনের শেষ-প্রান্তের ব্র্যাকেট ধরে
 * (ট্রেইলিং স্পেস/ডট/দাঁড়ি সহ), পাশাপাশি স্পেস-দূরত্বে বসা চেইন
 * ("…[Xvwe: 19-20] [JU: 20-21]") ধরা হয়। মাঝ-লাইনের ব্র্যাকেট অস্পৃশ্য।
 */
export function findRefTokens(line: string): RefToken[] {
  const all: Array<{ start: number; end: number; inner: string }> = [];
  REF_BRACKET_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = REF_BRACKET_RE.exec(line))) {
    all.push({ start: m.index, end: m.index + m[0].length, inner: m[1] ?? m[2] });
  }
  if (!all.length) return [];

  // শেষ টোকেন থেকে শুরু করে চেইন তৈরি — প্রতিটির পরের ফাঁক হতে হবে
  // শুধু স্পেস/ট্যাব/ডট/দাঁড়ি, আর প্রতিটির ভেতর রেফারেন্স-স্বীকৃত
  const out: RefToken[] = [];
  let idx = all.length - 1;
  let tailOk = (end: number) => /^\s*[.,;|:।]*\s*$/.test(line.slice(end));
  while (idx >= 0) {
    const cand = all[idx];
    if (!tailOk(cand.end) || !innerIsReference(cand.inner)) break;
    out.unshift({ start: cand.start, end: cand.end, text: line.slice(cand.start, cand.end) });
    // আগের টোকেনের সাথে ফাঁক শুধু স্পেস হলে চেইন চলবে
    const prev = all[idx - 1];
    if (!prev || !/^\s*$/.test(line.slice(prev.end, cand.start))) break;
    tailOk = () => true; // চেইনের ভেতরের টোকেনের পরে টোকেনই আছে — টেইল যাচাই নেই
    idx--;
  }
  return out;
}

/** প্যারা-টেক্সট পুরোটাই (ট্রিম-করে) একটাই রেফারেন্স টোকেন — স্ট্যান্ডঅ্যালোন লাইন */
function isWholeLineRef(line: string, tokens: RefToken[]): boolean {
  if (tokens.length !== 1) return false;
  const trimmed = line.trim().replace(/[.,;|:।]+$/, "").trim();
  return trimmed === tokens[0].text.trim();
}

// ---------- প্রশ্ন-ব্লক বিশ্লেষণ ----------

export interface ParaRefInfo {
  paraIndex: number;
  tokens: RefToken[];
  /** স্ট্যান্ডঅ্যালোন লাইন (পুরো প্যারা রেফারেন্স) */
  wholeLine: boolean;
}

export interface QRefInfo {
  questionId: number;
  paras: ParaRefInfo[];
  /** রিপোর্টের জন্য নমুনা ("[CU-A: 22-23]") */
  samples: string[];
}

/** এক প্রশ্নের সব প্যারা স্ক্যান — রেফারেন্স না পেলে null */
export function analyzeQRefs(q: DocxQuestion): QRefInfo | null {
  const paras: ParaRefInfo[] = [];
  const samples: string[] = [];
  q.paras.forEach((text, paraIndex) => {
    if (!text) return;
    const tokens = findRefTokens(text);
    if (!tokens.length) return;
    paras.push({ paraIndex, tokens, wholeLine: isWholeLineRef(text, tokens) });
    for (const t of tokens) if (samples.length < 3) samples.push(t.text.trim());
  });
  return paras.length ? { questionId: q.id, paras, samples } : null;
}

export interface RefReport {
  /** যেসব প্রশ্নে রেফারেন্স আছে তাদের সংখ্যা */
  questionCount: number;
  /** মোট টোকেন সংখ্যা */
  tokenCount: number;
  /** ইউনিক নমুনা (সর্বোচ্চ ৩) */
  samples: string[];
}

export function analyzeRefReport(questions: DocxQuestion[]): RefReport | null {
  let questionCount = 0;
  let tokenCount = 0;
  const samples: string[] = [];
  for (const q of questions) {
    const info = analyzeQRefs(q);
    if (!info) continue;
    questionCount++;
    tokenCount += info.paras.reduce((a, p) => a + p.tokens.length, 0);
    for (const s of info.samples) {
      if (samples.length < 3 && !samples.includes(s)) samples.push(s);
    }
  }
  return questionCount ? { questionCount, tokenCount, samples } : null;
}

// ---------- XML ব্লক-এডিটিং (এক্সপোর্টের আগে) ----------

/**
 * এক প্যারার ক্লোন থেকে রেফারেন্স-টোকেন মুছে দেয়।
 * ⚠️ টোকেন খোঁজা হয় এই ক্লোনের নিজের w:t-জয়েন্ট টেক্সটে — q.paras-টেক্সটে
 * \t থাকে কিন্তু t-স্ট্রিমে থাকে না; ওই offset ব্যবহার করলে ভুল জায়গায়
 * ডিলিট হয়ে XML ভেঙে যায় (Task 33-এর ক্যাচ-ফিক্স)।
 * রিটার্ন: action "drop" = প্যারা এখন খালি (এক্সপোর্ট থেকে বাদ), নইলে "keep";
 * tokens = পাওয়া টোকেনের লেখা (endline-এ সরানোর জন্য)।
 */
function stripParaRefs(clone: Element): {
  action: "keep" | "drop";
  tokens: string[];
} {
  const { stream, joined } = collectParaTs(clone);
  if (!stream.length) return { action: "drop", tokens: [] };
  const tokens = findRefTokens(joined);
  if (!tokens.length) return { action: "keep", tokens: [] };
  const spans: Array<{ start: number; end: number; text: string }> = [];
  for (const t of tokens) {
    // টোকেনের আগের ফাঁকা-জায়গাও মুছি (প্রশ্নের শেষ "?" অক্ষত রেখে)
    let start = t.start;
    while (start > 0 && /[ \t]/.test(joined[start - 1])) start--;
    spans.push({ start, end: t.end, text: "" });
  }
  replaceJoinedSpans(stream, spans);
  const after = stream
    .map((el) => el.textContent ?? "")
    .join("")
    .trim();
  return {
    action: after ? "keep" : "drop",
    tokens: tokens.map((t) => t.text.trim()),
  };
}

/**
 * এক প্রশ্নের ব্লক (body-children স্লাইস) থেকে রেফারেন্স-সম্পাদিত ক্লোন
 * বানায় — প্রতি প্রশ্নে একবারই কল হয়; প্রতিটি সেট এখান থেকে আবার ক্লোন নেয়।
 * elems ব্লকের কমপ্যাক্ট-ইনডেক্সে aligned — বাদ-পড়া প্যারায় null;
 * extra = ব্লকের শেষে যোগ হবে (endline-এর রেফারেন্স-লাইন)।
 * mode = "strip": রেফারেন্স মুছে যায় (খালি প্যারাও বাদ)।
 * mode = "endline": মুছে ব্লকের শেষে এক লাইনে সরে (ফন্ট/স্টাইল অক্ষত)।
 */
export function buildRefEditedBlock(
  doc: Document,
  blockEls: Element[],
  q: DocxQuestion,
  info: QRefInfo,
  mode: Exclude<RefMode, "keep">
): { elems: Array<Element | null>; extra: Element[] } {
  void q;
  void info;
  const elems: Array<Element | null> = [];
  const extra: Element[] = [];
  const movedTokens: string[] = [];

  for (const el of blockEls) {
    const clone = el.cloneNode(true) as Element;
    const res = stripParaRefs(clone);
    if (!res.tokens.length) {
      elems.push(clone); // রেফারেন্স-শূন্য প্যারা — অস্পৃশ্য
      continue;
    }
    if (mode === "endline") {
      // endline: ইনলাইন হোক বা স্ট্যান্ডঅ্যালোন — সব টোকেন শেষ-লাইনে সরবে
      movedTokens.push(...res.tokens);
    }
    if (res.action === "keep") elems.push(clone);
    else elems.push(null);
    // strip-এ খালি প্যারা বাদই থাকে
  }

  if (mode === "endline" && movedTokens.length) {
    extra.push(makeRefPara(doc, blockEls, movedTokens));
  }
  return { elems, extra };
}

/** প্রশ্নের শেষে রেফারেন্স-লাইন প্যারা — প্রথম প্যারার pPr + টোকেন-রানের rPr কপি */
function makeRefPara(doc: Document, blockEls: Element[], tokens: string[]): Element {
  const NS = W_NS;
  const p = doc.createElementNS(NS, "w:p");
  const src = blockEls.find((e) => e.localName === "p") ?? blockEls[0];
  // প্রথম প্যারার pPr (স্পেসিং/অ্যালাইনমেন্ট) — থাকলে
  const srcPPr = src?.getElementsByTagNameNS(NS, "pPr")[0];
  if (srcPPr) {
    const pPr = srcPPr.cloneNode(true) as Element;
    const shd = pPr.getElementsByTagNameNS(NS, "shd")[0];
    if (shd) shd.parentNode?.removeChild(shd); // রঙ-হেডারের শেড ধরবে না
    p.appendChild(pPr);
  }
  const r = doc.createElementNS(NS, "w:r");
  // টোকেন-রানের rPr (ফন্ট — SutonnyMJ/Bijoy প্রিজার্ভ)
  const srcRun = Array.from(src?.getElementsByTagNameNS(NS, "r") ?? []).find((rr) =>
    (rr.textContent ?? "").includes(tokens[0])
  );
  const srcRPr = srcRun?.getElementsByTagNameNS(NS, "rPr")[0];
  if (srcRPr) r.appendChild(srcRPr.cloneNode(true));
  const t = doc.createElementNS(NS, "w:t");
  t.setAttribute("xml:space", "preserve");
  t.textContent = tokens.join("  ");
  r.appendChild(t);
  p.appendChild(r);
  return p;
}

// ---------- এক্সপোর্ট-ক্যাশে হেল্পার ----------

/**
 * refMode ≠ "keep" হলে প্রতি প্রশ্নের edited-ব্লক একবার বানিয়ে ম্যাপে রাখে;
 * প্রশ্নে রেফারেন্স না থাকলে ম্যাপে থাকবে না (অরিজিনাল পথই চলবে)।
 */
export function buildRefEditedMap(
  doc: Document,
  questions: DocxQuestion[],
  mode: Exclude<RefMode, "keep">,
  getBlock: (q: DocxQuestion) => Element[]
): Map<number, { elems: Array<Element | null>; extra: Element[] }> {
  const map = new Map<number, { elems: Array<Element | null>; extra: Element[] }>();
  for (const q of questions) {
    const info = analyzeQRefs(q);
    if (!info) continue;
    map.set(q.id, buildRefEditedBlock(doc, getBlock(q), q, info, mode));
  }
  return map;
}
