// ============================================================
// DOCX XML Pipeline — আপলোড করা .docx-এর XML সরাসরি প্রসেস করে
// ============================================================
// মূল নীতি: Word-এর word/document.xml কনটেন্ট হুবহু প্রিজার্ভ হয় —
// আমরা শুধু ① প্যারাগ্রাফ-ব্লক সাজাই (শাফল) এবং ② সিরিয়ালের ডিজিট
// বদলাই (রিনাম্বার)। তাই tab, equation (OMML math), sub/superscript,
// সিম্বল, ছবি, ফন্ট (SutonnyMJ/Bijoy) — কিছুই ভাঙে না; আর আউটপুটে
// নতুন কোনো Unicode বাংলা ঢোকে না (নতুন সিরিয়ালও ফাইলের নিজের
// ডিজিট-স্টাইলেই বসে)।
// ============================================================

import JSZip from "jszip";

export const W_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
export const M_NS = "http://schemas.openxmlformats.org/officeDocument/2006/math";
const XML_NS = "http://www.w3.org/XML/1998/namespace";

// ---------- ডিজিট এনকোডিং (English / বাংলা Unicode / Bijoy ASCII) ----------

export type DigitEnc = "en" | "bn" | "bijoy";

const EN_DIGITS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];
const BN_DIGITS = ["০", "১", "২", "৩", "৪", "৫", "৬", "৭", "৮", "৯"];
/** Bijoy (SutonnyMJ) ASCII-তে বাংলা ডিজিট — ০ ১ ২ ৩ ৪ ৫ ৬ ৭ ৮ ৯ */
const BIJOY_DIGITS = ["ø", "«", "ˆ", "µ", "∏", "Ï", "¾", "˜", "Ù", "œ"];

const DIGIT_CLASS: Record<DigitEnc, string> = {
  en: "0-9",
  bn: "০-৯",
  bijoy: "ø«ˆµ∏Ï¾˜Ùœ",
};

export function digitsToNumber(s: string): { num: number; enc: DigitEnc } | null {
  if (/^[0-9]+$/.test(s)) return { num: parseInt(s, 10), enc: "en" };
  if (/^[০-৯]+$/.test(s)) {
    let n = 0;
    for (const ch of s) {
      const d = BN_DIGITS.indexOf(ch);
      if (d < 0) return null;
      n = n * 10 + d;
    }
    return { num: n, enc: "bn" };
  }
  if (s.length > 0 && [...s].every((ch) => BIJOY_DIGITS.includes(ch))) {
    let n = 0;
    for (const ch of s) {
      const d = BIJOY_DIGITS.indexOf(ch);
      if (d < 0) return null;
      n = n * 10 + d;
    }
    return { num: n, enc: "bijoy" };
  }
  return null;
}

export function numberToDigits(n: number, enc: DigitEnc): string {
  const chars = enc === "en" ? EN_DIGITS : enc === "bn" ? BN_DIGITS : BIJOY_DIGITS;
  return String(n)
    .split("")
    .map((c) => chars[Number(c)] ?? c)
    .join("");
}

export const DIGIT_ENC_LABEL: Record<DigitEnc, string> = {
  en: "English ডিজিট (Word-এ SutonnyMJ ফন্টে ১,২,৩ দেখায়)",
  bn: "বাংলা Unicode ডিজিট (১,২,৩)",
  bijoy: "Bijoy ASCII ডিজিট (SutonnyMJ এনকোডেড)",
};

// ---------- সিগমেন্ট-মুক্ত টেক্সট এক্সট্র্যাকশন ----------

/** OMML math-কে সরল লেখায় (linear) রূপান্তর — প্রিভিউ/সিরিয়াল ডিটেকশনের জন্য */
function linearizeMath(math: Element): string {
  const ts = math.getElementsByTagNameNS(M_NS, "t");
  let s = "";
  for (let i = 0; i < ts.length; i++) s += ts[i].textContent ?? "";
  return s;
}

function symChar(sym: Element): string {
  const hex = attrOf(sym, "char");
  if (!hex) return "";
  const code = parseInt(hex.replace(/^0[xX]/, ""), 16);
  return isNaN(code) ? "" : String.fromCharCode(code);
}

function attrOf(el: Element, local: string): string {
  return el.getAttributeNS(W_NS, local) ?? el.getAttribute(`w:${local}`) ?? "";
}

/**
 * একটি w:p (বা w:tbl) থেকে পড়ার উপযোগী প্লেইন টেক্সট:
 * w:t = লেখা, w:tab = \t, w:br = স্পেস, w:sym = ক্যারেক্টার,
 * m:oMath = সরল লেখা। ফরম্যাটিং নিজেই Word-এর XML-এ অক্ষত থাকে।
 */
export function extractParaText(el: Element): string {
  let out = "";
  const walk = (node: Element) => {
    for (const child of Array.from(node.children)) {
      const ln = child.localName;
      // প্রপার্টি এলিমেন্ট (pPr/tblPr/rPr...) — ভেতরে টেক্সট নেই, ট্যাব-স্টপও এখানে
      if (ln === "pPr" || ln === "rPr" || ln === "tblPr" || ln === "trPr" || ln === "tcPr" || ln === "sectPr") {
        continue;
      }
      if (ln === "t") {
        if (child.namespaceURI === W_NS) out += child.textContent ?? "";
      } else if (ln === "tab") {
        // শুধু রান-লেভেল ট্যাব (<w:r><w:tab/></w:r>) — ট্যাব-স্টপ নয়
        const parent = child.parentNode;
        if (parent && parent.nodeType === 1 && (parent as Element).localName === "r") out += "\t";
      } else if (ln === "br") {
        out += " ";
      } else if (ln === "sym") {
        out += symChar(child);
      } else if (ln === "oMath" || ln === "oMathPara") {
        out += linearizeMath(child);
      } else if (ln === "delText" || ln === "instrText") {
        // ট্র্যাকড-চেঞ্জ/ফিল্ড কোড — টেক্সটে দেখাব না
      } else if (child.children.length) {
        walk(child);
      }
    }
  };
  walk(el);
  return out;
}

/** রান-লেভেল ট্যাব (<w:tab/>) সংখ্যা — ট্যাব-স্টপ নয় */
export function countRunTabs(el: Element): number {
  const tabs = el.getElementsByTagNameNS(W_NS, "tab");
  let n = 0;
  for (let i = 0; i < tabs.length; i++) {
    const parent = tabs[i].parentNode;
    if (parent && parent.nodeType === 1 && (parent as Element).localName === "r") n++;
  }
  return n;
}

/** প্যারার প্রথম ফন্ট (সিরিয়াল ডিজিট SutonnyMJ-এ কিনা বোঝার জন্য) */
function firstRunFont(el: Element): string {
  const fonts = el.getElementsByTagNameNS(W_NS, "rFonts");
  if (fonts.length) return attrOf(fonts[0], "ascii") || attrOf(fonts[0], "hAnsi") || "";
  return "";
}

const MJ_FONT_RE = /sutonny|mj|bijoy|shibly|shushree|shorif|topoji|padma|prothom/i;
export function isMjFont(font: string): boolean {
  return MJ_FONT_RE.test(font);
}

// ---------- সিরিয়াল ডিটেকশন ----------

export interface SerialPrefix {
  /** ম্যাচ হওয়া পুরো প্রিফিক্স (স্পেস + ডিজিট + সেপারেটর) */
  raw: string;
  digits: string;
  num: number;
  enc: DigitEnc;
  /** "." ")" "।" "-" "–" "—" ":" বা "" */
  separator: string;
  /** সেপারেটরের পরের টেক্সট */
  after: string;
}

// "|" = SutonnyMJ-এ দাঁড়ি (।) — Bijoy ফাইলে "44|" = "৪৪।" — তাই pipe-ও সেপারেটর
const SEP_CLASS = ".।):\\-–—:|";
const ALL_DIGITS = DIGIT_CLASS.en + DIGIT_CLASS.bn + DIGIT_CLASS.bijoy;
const SERIAL_RE = new RegExp(`^\\s*([${ALL_DIGITS}]{1,4})\\s*([${SEP_CLASS}])?`);

/** প্যারা-টেক্সটের একদম শুরুতে সিরিয়াল আছে কিনা ("32. …" স্টাইল) */
export function detectSerialPrefix(text: string): SerialPrefix | null {
  const m = SERIAL_RE.exec(text);
  if (!m) return null;
  const conv = digitsToNumber(m[1]);
  if (!conv || conv.num <= 0) return null;
  const after = text.slice(m[0].length);
  if (!after.trim()) return null;
  return { raw: m[0], digits: m[1], num: conv.num, enc: conv.enc, separator: m[2] ?? "", after };
}

export function looksOptionLed(t: string): boolean {
  if (/^\t/.test(t)) return true;
  return /^\s*(?:[KLMNklmn]\s*[.।):]|[কখগঘ]\s*[.।):]|[a-dA-D]\s*[.):]|[([]\s*[কখগঘa-dA-D]\s*[)\]]|Dt\b|উঃ|উত্তর)/.test(t);
}

/** সেকশন সেপারেটর/শিরোনাম ("PHYSICS", "A" ইত্যাদি) — প্রশ্ন নয় */
function isSectionSeparator(text: string): boolean {
  const t = text.trim();
  if (!t || t.includes("\t")) return false;
  if (t.length <= 3) return true;
  return /^[A-Za-z][A-Za-z0-9 .\-]{1,29}$/.test(t) && t === t.toUpperCase();
}

export function isQuestionStart(si: SerialPrefix, hasRunTab: boolean, nextText: string | null): boolean {
  if (si.num > 5000) return false;
  // টিয়ার ১: সিরিয়ালের পরে ট্যাব আছে (ইউজারের ফরম্যাট: "32.<tab>প্রশ্ন")
  if (hasRunTab) return true;
  // টিয়ার ২: পরের নন-এম্পটি প্যারা অপশন-লেড (ট্যাব/ক খ গ ঘ মার্কার)
  if (nextText !== null && looksOptionLed(nextText)) return true;
  // টিয়ার ৩: ডেসিমাল গার্ড — "2.5 মিটার" যেন সিরিয়াল না হয়
  if (si.separator && !/^[0-9০-৯]/.test(si.after)) return si.num <= 999;
  return false;
}

// ---------- অপশন ও উত্তর ডিটেকশন (প্রিভিউয়ের জন্য) ----------

export interface OptionPreview {
  /** ফাইলে যেমন আছে সেরকম লেবেল ("K" বা "ক" বা "a") */
  label: string;
  text: string;
}

const ANSWER_RE =
  /(?:Dt|Cvw|wU|উঃ|উত্তর|Ans?\.?|Answer)\s*[:.]?\s*([KLMNklmnকখগঘa-dA-D1-4])\s*$/;

const OPTION_FAMILIES: string[][] = [
  ["K", "L", "M", "N"], // Bijoy (SutonnyMJ): ক খ গ ঘ
  ["ক", "খ", "গ", "ঘ"], // Unicode
  ["a", "b", "c", "d"],
  ["A", "B", "C", "D"],
];

function scanOptions(blockText: string, serialRaw: string): { options: OptionPreview[]; answer: string | null; qText: string } {
  const si = blockText.indexOf(serialRaw);
  const body = si >= 0 ? blockText.slice(si + serialRaw.length) : blockText;

  const am = ANSWER_RE.exec(body);
  const answer = am ? am[1] : null;

  let best: { labels: string[]; idxs: number[] } | null = null;
  for (const family of OPTION_FAMILIES) {
    const labels: string[] = [];
    const idxs: number[] = [];
    let pos = 0;
    for (const label of family) {
      let found = -1;
      for (const sep of [".", "।", ")", ":"]) {
        const at = body.indexOf(label + sep, pos);
        if (at >= 0 && (found === -1 || at < found)) found = at;
      }
      if (found === -1) break;
      labels.push(label);
      idxs.push(found);
      pos = found + label.length + 1;
    }
    if (labels.length >= 2 && (!best || labels.length > best.labels.length)) {
      best = { labels, idxs };
    }
  }

  const options: OptionPreview[] = [];
  let qText = body.trim();
  if (best) {
    const { labels, idxs } = best;
    qText = body.slice(0, idxs[0]).trim();
    for (let i = 0; i < labels.length; i++) {
      const start = idxs[i] + labels[i].length + 1; // লেবেল + সেপারেটর বাদ
      const end = i + 1 < labels.length ? idxs[i + 1] : body.length;
      let text = body.slice(start, end).trim();
      if (i === labels.length - 1 && answer) {
        text = text.replace(/(?:Dt|Cvw|wU|উঃ|উত্তর|Ans?\.?|Answer)\s*[:.]?\s*[KLMNklmnকখগঘa-dA-D1-4]\s*$/, "").trim();
      }
      options.push({ label: labels[i], text });
    }
  }
  return { options, answer, qText };
}

// ---------- প্রশ্ন মডেল ----------

export interface DocxQuestion {
  id: number;
  serial: number;
  serialEnc: DigitEnc;
  serialDigits: string;
  serialSeparator: string;
  /** সিরিয়ালের ফন্ট SutonnyMJ-টাইপ কিনা (প্রিভিউতে Word-এর মত ১,২,৩ দেখাতে) */
  serialFontBijoy: boolean;
  /** body-children ইনডেক্স রেঞ্জ (inclusive) — এক্সপোর্টে এই ব্লকই ক্লোন হয় */
  blockStart: number;
  blockEnd: number;
  /** ব্লকের প্যারা টেক্সটগুলো (tab = \t) */
  paras: string[];
  text: string;
  qText: string;
  options: OptionPreview[];
  answer: string | null;
  hasUnicode: boolean;
}

export interface SerialIssue {
  index: number;
  expected: number;
  found: number;
}

export interface DocxParseResult {
  questions: DocxQuestion[];
  /** সেকশন হেডিং/সেপারেটর (প্রশ্নের অন্তর্ভুক্ত নয়) */
  separators: string[];
  serial: {
    status: "ok" | "broken";
    startAt: number;
    issues: SerialIssue[];
  } | null;
  /** যেসব প্রশ্নে Unicode বাংলা (Avro-টাইপ) টেক্সট আছে */
  unicodeQuestionIds: number[];
  fullText: string;
}

// ---------- মেইন পার্সার ----------

export function parseDocxXml(xml: string): DocxParseResult {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  if (doc.getElementsByTagName("parsererror").length) {
    throw new Error("document.xml পার্স করা যায়নি — ফাইলটি করাপ্ট মনে হচ্ছে");
  }
  const body = doc.getElementsByTagNameNS(W_NS, "body")[0];
  if (!body) throw new Error("document.xml-এ w:body পাওয়া যায়নি");

  const kids = Array.from(body.children) as Element[];

  const questions: DocxQuestion[] = [];
  const separators: string[] = [];
  const paraTexts: string[] = kids.map((el) => (el.localName === "sectPr" ? "" : extractParaText(el)));
  const hasRunTabs: boolean[] = kids.map((el) => (el.localName === "sectPr" ? false : countRunTabs(el) > 0));

  const nextNonEmptyText = (from: number): string | null => {
    for (let j = from; j < kids.length; j++) {
      if (kids[j].localName === "sectPr") continue;
      const t = paraTexts[j].trim();
      if (t) return paraTexts[j];
    }
    return null;
  };

  interface Cur {
    start: number;
    end: number;
    si: SerialPrefix;
    texts: string[];
  }
  let cur: Cur | null = null;

  const pushQuestion = (c: Cur) => {
    const text = c.texts.join("\n");
    const { options, answer, qText } = scanOptions(text, c.si.raw);
    const q: DocxQuestion = {
      id: questions.length,
      serial: c.si.num,
      serialEnc: c.si.enc,
      serialDigits: c.si.digits,
      serialSeparator: c.si.separator,
      serialFontBijoy: isMjFont(firstRunFont(kids[c.start])),
      blockStart: c.start,
      blockEnd: c.end,
      paras: c.texts,
      text,
      qText,
      options,
      answer,
      hasUnicode: /[\u0980-\u09FF]/.test(text),
    };
    questions.push(q);
  };

  for (let i = 0; i < kids.length; i++) {
    const el = kids[i];
    if (el.localName === "sectPr") continue;
    const text = paraTexts[i];

    let started = false;
    if (el.localName === "p") {
      const si = detectSerialPrefix(text);
      if (si && isQuestionStart(si, hasRunTabs[i], nextNonEmptyText(i + 1))) {
        if (cur) pushQuestion(cur);
        cur = { start: i, end: i, si, texts: [text] };
        started = true;
      }
    }

    if (!started) {
      if (!cur) {
        if (isSectionSeparator(text)) separators.push(text.trim());
      } else if (isSectionSeparator(text)) {
        pushQuestion(cur);
        cur = null;
        separators.push(text.trim());
      } else {
        cur.end = i;
        cur.texts.push(text);
      }
    }
  }
  if (cur) pushQuestion(cur);

  // সিরিয়াল রিপোর্ট
  let serial: DocxParseResult["serial"] = null;
  if (questions.length) {
    const issues: SerialIssue[] = [];
    for (let i = 1; i < questions.length; i++) {
      const expected = questions[i - 1].serial + 1;
      const found = questions[i].serial;
      if (found !== expected) issues.push({ index: i, expected, found });
      if (issues.length >= 30) break;
    }
    serial = { status: issues.length ? "broken" : "ok", startAt: questions[0].serial, issues };
  }

  return {
    questions,
    separators,
    serial,
    unicodeQuestionIds: questions.filter((q) => q.hasUnicode).map((q) => q.id),
    fullText: questions.map((q) => q.text).join("\n"),
  };
}

// ---------- ফাইল লোড ----------

export async function loadDocxXml(file: Blob): Promise<string> {
  const zip = await JSZip.loadAsync(file);
  const entry = zip.file("word/document.xml");
  if (!entry) throw new Error("এটা সঠিক .docx ফাইল না (word/document.xml নেই)");
  return entry.async("string");
}

// ---------- রিনাম্বার ইঞ্জিন ----------

/** w:t এলিমেন্টগুলো ডকুমেন্ট-অর্ডারে সংগ্রহ (m:t বাদ) */
function collectTs(el: Element, out: Element[]): void {
  const walk = (node: Element) => {
    for (const child of Array.from(node.children)) {
      if (child.localName === "t" && child.namespaceURI === W_NS) out.push(child);
      else if (child.localName === "oMath" || child.localName === "oMathPara") continue;
      else if (child.children.length) walk(child);
    }
  };
  walk(el);
}

function setTText(t: Element, text: string): void {
  t.textContent = text;
  if (/^\s|\s$/.test(text)) t.setAttribute("xml:space", "preserve");
}

/**
 * একাধিক [start,end)→text স্প্যান এক পাসে মাল্টি-রান w:t স্ট্রিমে রিপ্লেস —
 * স্প্যানগুলো ascending + non-overlapping হতে হবে। এক পাসে করায় আগের
 * রিপ্লেসমেন্টের দৈর্ঘ্য বদলালেও পরের স্প্যানের offset ঠিক থাকে
 * (যেমন "৪৪|" → "৭." — ডিজিট ২ অক্ষর থেকে ১ হলেও সেপ ঠিক জায়গায় বসে)।
 */
function replaceSpans(stream: Element[], spans: Array<{ start: number; end: number; text: string }>): void {
  if (!spans.length) return;
  const sorted = [...spans].sort((a, b) => a.start - b.start);
  let offset = 0;
  for (const t of stream) {
    const s = t.textContent ?? "";
    const tStart = offset;
    offset += s.length;
    const tEnd = offset;
    if (tEnd <= sorted[0].start) continue;
    if (tStart >= sorted[sorted.length - 1].end) continue;
    let out = "";
    let pos = 0; // local স্লাইস পজিশন
    for (const sp of sorted) {
      if (sp.end <= tStart || sp.start >= tEnd) continue;
      const ls = Math.max(0, sp.start - tStart);
      const le = Math.min(s.length, sp.end - tStart);
      out += s.slice(pos, ls);
      if (tStart <= sp.start) out += sp.text; // স্প্যান এই t-তে শুরু হলে রিপ্লেসমেন্ট ঢোকে
      pos = le;
    }
    out += s.slice(pos);
    if (out !== s) setTText(t, out);
  }
}

/** joined w:t-টেক্সটে সিরিয়ালের ডিজিট+সেপারেটরের decoded-স্প্যান বের করে */
export function serialMatchSpans(joined: string): { digitsStart: number; digitsEnd: number; sepStart: number; sepEnd: number; enc: DigitEnc } | null {
  const m = SERIAL_RE.exec(joined);
  if (!m) return null;
  const conv = digitsToNumber(m[1]);
  if (!conv) return null;
  // ডিজিট ম্যাচের শুরু: লিডিং স্পেস ও ডিজিট-সেপারেটরের মাঝের স্পেস সঠিকভাবে স্কিপ
  const digitsStart = m.index + joined.indexOf(m[1], m.index);
  const digitsEnd = digitsStart + m[1].length;
  const sepLen = m[2] ? m[2].length : 0;
  const sepStart = m.index + m[0].length - sepLen;
  return { digitsStart, digitsEnd, sepStart, sepEnd: sepStart + sepLen, enc: conv.enc };
}

/**
 * সিরিয়াল প্যারার ডিজিট নতুন নম্বর দিয়ে রিপ্লেস করে —
 * ডিজিট একাধিক রানে ভাগ থাকলেও ঠিকঠাক বসে; সেপারেটর ("." ইত্যাদি),
 * ট্যাব, পরের লেখা — সব অক্ষত থাকে। এনকোডিং ফাইলের নিজের স্টাইলেই।
 */
export function renumberSerialPara(p: Element, newNum: number): void {
  const stream: Element[] = [];
  collectTs(p, stream);
  if (!stream.length) return;

  const joined = stream.map((t) => t.textContent ?? "").join("");
  const spans = serialMatchSpans(joined);
  if (!spans) return;

  replaceSpans(stream, [
    { start: spans.digitsStart, end: spans.digitsEnd, text: numberToDigits(newNum, spans.enc) },
  ]);
}

/**
 * রিনাম্বার + সেপারেটর নরমালাইজ (যেমন "44|" → "45.") —
 * ডিজিট বদলায়, আর পুরনো সেপারেটর থাকলে সেটাকে targetSep করে দেয়।
 * সেপারেটর না থাকলে নতুন করে যোগ করে না (গ্লুড-লেখা অক্ষত থাকে)।
 */
export function renumberSerialParaTo(p: Element, newNum: number, targetSep = "."): void {
  const stream: Element[] = [];
  collectTs(p, stream);
  if (!stream.length) return;

  const joined = stream.map((t) => t.textContent ?? "").join("");
  const spans = serialMatchSpans(joined);
  if (!spans) return;

  // জিরো-প্যাডিং সংরক্ষণ: "01." স্টাইলের ফাইলে ১ → "01." (ফাইলের নিজের স্টাইল)
  let digitsText = numberToDigits(newNum, spans.enc);
  const origDigits = joined.slice(spans.digitsStart, spans.digitsEnd);
  const zeroChar = spans.enc === "en" ? "0" : spans.enc === "bn" ? "০" : "ø";
  if (origDigits.startsWith(zeroChar) && digitsText.length < origDigits.length) {
    digitsText = zeroChar.repeat(origDigits.length - digitsText.length) + digitsText;
  }

  const edits: Array<{ start: number; end: number; text: string }> = [
    { start: spans.digitsStart, end: spans.digitsEnd, text: digitsText },
  ];
  if (spans.sepEnd > spans.sepStart) {
    edits.push({ start: spans.sepStart, end: spans.sepEnd, text: targetSep });
  }
  replaceSpans(stream, edits);
}
