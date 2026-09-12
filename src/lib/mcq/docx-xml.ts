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

import { MARKER_WINDOW_PARAS, MAX_SERIAL_NUMBER, MIN_OPTIONS_PER_MCQ } from "./limits";

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
  en: "English digits (Word shows ১,২,৩ in the SutonnyMJ font)",
  bn: "Bengali Unicode digits (১,২,৩)",
  bijoy: "Bijoy ASCII digits (SutonnyMJ-encoded)",
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

/**
 * আইসোটোপ-গার্ড: ডিজিটের ঠিক পরে (স্পেস/সেপারেটর ছাড়াই) ইংরেজি অক্ষর বসলে
 * সেটা সিরিয়াল নয় — পারমাণবিক আইসোটোপ নোটেশন: "714N" = ₇¹⁴N, "12Cl2" = ¹²Cl₂,
 * "1224Mg" = ₁₂²⁴Mg। বাস্তব সিরিয়ালের পরে থাকে সেপারেটর (".", "|", "।") বা স্পেস।
 */
function isotopeLikeAfterDigits(text: string, digitsEnd: number): boolean {
  const ch = text[digitsEnd];
  return ch !== undefined && /[A-Za-z]/.test(ch);
}

/** প্যারা-টেক্সটের একদম শুরুতে সিরিয়াল আছে কিনা ("32. …" স্টাইল) */
export function detectSerialPrefix(text: string): SerialPrefix | null {
  const m = SERIAL_RE.exec(text);
  if (!m) return null;
  const conv = digitsToNumber(m[1]);
  if (!conv || conv.num <= 0) return null;
  const digitsEnd = m.index + m[0].indexOf(m[1]) + m[1].length;
  if (isotopeLikeAfterDigits(text, digitsEnd)) return null;
  const after = text.slice(m[0].length);
  if (!after.trim()) return null;
  return { raw: m[0], digits: m[1], num: conv.num, enc: conv.enc, separator: m[2] ?? "", after };
}

export function looksOptionLed(t: string): boolean {
  if (/^\t/.test(t)) return true;
  // `*`-প্রিফিক্স = B-টাইমার ফরম্যাটের উত্তর-মার্কড অপশন-লাইন ("*A. টেক্সট")
  return /^\s*\*?\s*(?:[KLMNklmn]\s*[.।):]|[কখগঘ]\s*[.।):]|[a-dA-D]\s*[.):]|[([]\s*[কখগঘa-dA-D]\s*[)\]]|Dt\b|উঃ|উত্তর)/.test(t);
}

/**
 * পরীক্ষা/সেকশন-টাইটেল লাইন — প্রশ্ন-ব্লক ভাঙে:
 *   Bijoy:  "46Zg wewmGm wcÖwjwgbvwi cix¶v"  (= ৪৬তম বিসিএস প্রিলিমিনারি পরীক্ষা)
 *   Unicode: "৪৫তম বিসিএস প্রিলিমিনারি পরীক্ষা"
 * শর্ত: শেষে "পরীক্ষা/cix¶v" + শুরুতে ক্রমবাচক (NNতম/NNZg) বা পরীক্ষা-কীওয়ার্ড
 */
const EXAM_TITLE_TAIL_RE = /(?:cix[¶ÿ]v|পরীক্ষা)\s*$/;
const ORDINAL_HEAD_RE = /^\d{1,4}\s*(?:Zg|wW|gw|তম|শে|য়|র্থ|ঠ|ম(?=[\s।,]|$))/;
const EXAM_TITLE_KEYWORD_RE = /(?:wewmGm|বিসিএস|wcÖwjwgbvwi|প্রিলিমিনারি|লিখিত|প্রশ্নপত্র|বিষয়|সালের)/;

export function isExamTitleLine(text: string): boolean {
  const t = text.trim();
  if (!t || t.includes("\t") || t.length < 6 || t.length > 100) return false;
  if (!EXAM_TITLE_TAIL_RE.test(t)) return false;
  if (looksOptionLed(t)) return false;
  return ORDINAL_HEAD_RE.test(t) || EXAM_TITLE_KEYWORD_RE.test(t);
}

/** সেকশন সেপারেটর/শিরোনাম ("PHYSICS", "A", পরীক্ষা-টাইটেল ইত্যাদি) — প্রশ্ন নয়।
 * ট্যাব-গার্ড কাঁচা টেক্সটে (trim-এর আগে): ট্যাব-লেড সারি (অপশন/কনটেন্ট)
 * কখনো হেডার নয় — trim-এর পরে চেক করলে "\tA. CH3…" → "A. CH3…" হয়ে
 * ALL-CAPS নিয়মে হেডার ধরা পড়ত, প্রশ্ন-ব্লক ভেঙে অপশন-সারি হারিয়ে যেত
 * (shuffle-এ প্রশ্ন কমে যাওয়া/ড্রপের কারণ)। */
export function isSectionSeparator(text: string): boolean {
  if (!text.trim() || text.includes("\t")) return false;
  const t = text.trim();
  if (isExamTitleLine(t)) return true;
  if (t.length <= 3) return true;
  return /^[A-Za-z][A-Za-z0-9 .\-]{1,29}$/.test(t) && t === t.toUpperCase();
}

/** সিরিয়ালের পরে সরাসরি ক্রমবাচক-সাফিক্স ("৪৫তম বিসিএস…" — টাইটেল, প্রশ্ন নয়) */
const ORDINAL_AFTER_RE = /^\s*(?:তম|শে|য়|র্থ|ঠ|ই|ম(?=[\s।,]|$))/;

export function isQuestionStart(si: SerialPrefix, hasRunTab: boolean, nextText: string | null): boolean {
  // সিলিং = MAX_SERIAL_NUMBER (৪-ডিজিট, SERIAL_RE-এর {1,4}-এর সাথে সামঞ্জস্য) —
  // টেক্সট-পার্সারের (parser.ts) সাথে ইউনিফাইড; আগে এখানে 5000 ছিল (Task 21-a)
  if (si.num > MAX_SERIAL_NUMBER) return false;
  // সাল-গার্ড (parser.ts-এর সাথে সামঞ্জস্য + Bijoy "mv‡?j"/সালে): "1815 mv‡j…" /
  // "2016 সালের ফলাফল…" — ইতিহাস-নোটের সাল-লাইন, সিরিয়াল নয়
  // (‡ হলো SutonnyMJ া-কার: সালে = m+v+‡+j)
  if (si.num >= 1500 && si.num <= 2100) {
    const head = si.after.trimStart().slice(0, 10).toLowerCase();
    if (/সাল|year|mv‡?j/.test(head)) return false;
  }
  // ক্রমবাচক-গার্ড: সেপারেটর-হীন সিরিয়ালের পরে সরাসরি "তম/শে/য়…" — টাইটেল
  if (!si.separator && ORDINAL_AFTER_RE.test(si.after)) return false;
  // টিয়ার ১: সিরিয়ালের পরে ট্যাব আছে (ইউজারের ফরম্যাট: "32.<tab>প্রশ্ন")
  if (hasRunTab) return true;
  // টিয়ার ২: পরের নন-এম্পটি প্যারা অপশন-লেড (ট্যাব/ক খ গ ঘ মার্কার)
  if (nextText !== null && looksOptionLed(nextText)) return true;
  // টিয়ার ৩: ডেসিমাল গার্ড — "2.5 মিটার" যেন সিরিয়াল না হয়
  if (si.separator && !/^[0-9০-৯]/.test(si.after)) return si.num <= 999;
  return false;
}

// ---------- অপশন ও উত্তর/ব্যাখ্যা ডিটেকশন (প্রিভিউয়ের জন্য) ----------

export interface OptionPreview {
  /** ফাইলে যেমন আছে সেরকম লেবেল ("K" বা "ক" বা "a") */
  label: string;
  text: string;
}

/**
 * লাইনের শেষে উত্তর-মার্কার + অক্ষর: "Dt K" / "D: L + N" / "উত্তর: খ" / "Ans. C"।
 * — বেয়ার "D" = Bijoy (SutonnyMJ)-এ "উ" — শুধু কোলন/ডট-সহ গৃহীত (D: K)
 * — একাধিক উত্তরও ধরা পড়ে: "D: L + N", "উত্তর: ক, খ"
 */
/** অপশন-লাইনের শেষে গ্লুড উত্তর — redownload-এর টেইল-স্প্লিটও একই রেজেক্স;
 * `DËi?t?` = Bijoy "উত্তর(ঃ)" (Chemistry Set-C ফরম্যাট: "…DËit K") */
export const ANSWER_TAIL_RE =
  /(?:Dt|DËi?t?|Cvw|wU|উঃ|উত্তর|উওর|Ans?\.?|Answer|D(?=\s*[:.]))\s*[:.]?\s*([KLMNklmnকখগঘa-dA-D1-4](?:\s*[+&,/]\s*[KLMNklmnকখগঘa-dA-D1-4])*)\s*$/;

/**
 * অক্ষর-হীন ঝুলন্ত উত্তর-মার্কার (ফাইলের টাইপো): "…\tDt" / "…\tD: -"।
 * উত্তর-অক্ষর নেই — শুধু অপশন-টেক্সট থেকে কেটে ফেলা হয় (উত্তর null থাকে)।
 * লাইন-শুরু বা ট্যাবের পরে হতে হবে — "No Answer"-জাতীয় অপশন রক্ষা পায়।
 */
const ANSWER_DANGLING_RE =
  /(?:^|\t)(?:Dt|DËi?t?|Cvw|wU|উঃ|উত্তর|উওর|Ans?\.?|Answer|D(?=\s*[:.]))\s*[:.]?\s*[-–—]?\s*$/;

/** লাইন-শুরুর ব্যাখ্যা-মার্কার: Bijoy "e¨vL¨v:" / Unicode "ব্যাখ্যা:" / "সমাধান:" */
export const BEKKHA_LINE_RE =
  /^\s*(?:e¨vL¨v|ব্যাখ্যা|সমাধান|explanation)\s*[:.\-—]?/i;

/**
 * স্লট-ক্রমের DP (K→L→M→N / ক→খ→গ→ঘ / A→B→C→D) — অপশন-লেবেল টোকেনের
 * সেরা রান। প্রতিটা টোকেন নিজের লেবেল-স্লট অথবা টাইপো-রিপিটে ঠিক পরের
 * স্লট (K,L,L,M তে ২য় L=M, ৩য় M=N) পূরণ করে; dp[p] = p-তম স্লটে শেষ
 * হওয়া সেরা রান। fams-এর প্রতিটা ফ্যামিলি চেষ্টা হয়, minLen-এর চেয়ে
 * বড় রানগুলোর মধ্যে দৈর্ঘ্যে সেরাটা (টাই হলে আগের ফ্যামিলি) ফেরে।
 * key অবশ্যই document-ক্রমে monotonic (scan: region-অফসেট,
 * redownload: token-ইনডেক্স)। scanOptions আর redownload-এর লেবেল-টাইপো
 * ডিটেকশন দুইজনাই এই helper — দুই জায়গায় নিয়ম বিচ্যুত হওয়ার সুযোগ নেই।
 */
export interface DpSlotRun<T> {
  fam: readonly string[];
  labels: string[];
  picks: T[];
}

export const LABEL_FAMS: readonly (readonly string[])[] = [
  ["K", "L", "M", "N"], // Bijoy (SutonnyMJ): ক খ গ ঘ
  ["ক", "খ", "গ", "ঘ"], // Unicode
  ["A", "B", "C", "D"], // English
];

export function dpSlotRun<T extends { key: number; ch: string; slot: string }>(
  toks: readonly T[],
  fams: readonly (readonly string[])[],
  minLen: number
): DpSlotRun<T> | null {
  let best: DpSlotRun<T> | null = null;
  for (const fam of fams) {
    const dp: Array<{ labels: string[]; picks: T[] } | null> = [null, null, null, null];
    for (const t of toks) {
      const s = fam.indexOf(t.slot); // টোকেনের নিজের স্লট
      if (s < 0) continue;
      if (s === 0 && !dp[0]) dp[0] = { labels: [t.ch], picks: [t] };
      // ① নিজের স্লট: dp[s-1] → dp[s]
      if (s > 0 && dp[s - 1]) {
        const prev = dp[s - 1]!;
        if (t.key > prev.picks[prev.picks.length - 1].key) {
          const cand = { labels: [...prev.labels, t.ch], picks: [...prev.picks, t] };
          if (!dp[s] || cand.labels.length > dp[s]!.labels.length) dp[s] = cand;
        }
      }
      // ② টাইপো-রিপিট: dp[s] → dp[s+1] (একই লেবেল আবার → পরের অপশন)
      if (s < 3 && dp[s]) {
        const prev = dp[s]!;
        if (t.key > prev.picks[prev.picks.length - 1].key) {
          const cand = { labels: [...prev.labels, t.ch], picks: [...prev.picks, t] };
          if (!dp[s + 1] || cand.labels.length > dp[s + 1]!.labels.length) {
            dp[s + 1] = cand;
          }
        }
      }
    }
    for (const run of dp) {
      if (run && run.labels.length >= minLen && (!best || run.labels.length > best.labels.length)) {
        best = { fam, labels: run.labels, picks: run.picks };
      }
    }
  }
  return best;
}

/**
 * কেস-মিক্স ফ্যামিলি-ম্যাচ (বাস্তব টাইপো: "K. … L. … M. … N." নয়,
 * "K. … L. … L. … N." বা "K. … L. … M. …\td. …" — m-ছোটহাতের/missing-dot
 * অবস্থায় ফ্যামিলিগুলো একীভূত হয়ে মিলতে হবে। familyKeys-এর বাইরের
 * অক্ষর (D. — dotless "N 50 g" নয়) আলাদা ফ্যামিলি হিসেবে গোনা হয় না।
 */
/** স্লট-ফোল্ড: কেস-মিক্স টাইপো এক ফ্যামিলিতে মেলে (k/K→K, d/D→D) */
export const CASE_FOLD: Record<string, string> = {
  K: "K", L: "L", M: "M", N: "N",
  k: "K", l: "L", m: "M", n: "N",
  ক: "ক", খ: "খ", গ: "গ", ঘ: "ঘ",
  a: "A", A: "A", b: "B", B: "B", c: "C", C: "C", d: "D", D: "D",
};

/**
 * `*`-উত্তর-অক্ষর (B-টাইমার ফরম্যাট): লেবেলের আগে ("*C. টেক্সট", "*A.B.")
 * বা সঠিক অপশনের টেক্সটের পরে ("টেক্সট*", "টেক্সট*D.")। redownload-এর
 * findStarAnswer-এর হুবহু নিয়ম (দুই মোডে উত্তর-গণনা এক থাকে) — লেবেল
 * না মিললে null (গুণের `*` বা বুলেট ভুল করে উত্তর হয় না)।
 */
export function findStarAnswerLetter(text: string): string | null {
  const at: number[] = [];
  for (let i = 0; i < text.length; i++) if (text[i] === "*") at.push(i);
  if (!at.length) return null;
  const labelAfter = /^([KLMNklmnকখগঘa-dA-D])\s*[.।):]/;
  const labelScan = /([KLMNklmnকখগঘa-dA-D])\s*[.।):]/g;
  for (const s of at) {
    // ① স্টারের ঠিক পরেই লেবেল ("*C. টেক্সট" / "*A.B.")
    const after = labelAfter.exec(text.slice(s + 1));
    if (after) return after[1];
    // ② স্টারের আগের নিকটতম লেবেল — ওই অপশনের টেক্সটের শেষেই স্টার
    const before = text.slice(0, s);
    labelScan.lastIndex = 0;
    let last: RegExpExecArray | null = null;
    let mm: RegExpExecArray | null;
    while ((mm = labelScan.exec(before))) last = mm;
    if (last) return last[1];
  }
  return null;
}

/**
 * অপশন-মার্কার গণনা (টাইপো-সহনশীল MCQ-শর্তের জন্য): অপশন-অক্ষর
 * (K/L/M/N, ক/খ/গ/ঘ, a-d/A-D) + পরে সেপারেটর/স্পেস/শেষ।
 * ডট-ছাড়া লেবেল ("A ivB"), glued উত্তর ("Dt M"), `*`-মার্কড অপশনও
 * ধরা পড়ে; কিন্তু ডিজিট-সিরিয়াল ("1.", "২."), আইসোটোপ ("714N"),
 * দশমিক ("5.3"), শব্দের ভিতরের অক্ষর ("Credit", "Genome") নয় —
 * অক্ষরের আগে লাইন-শুরু/স্পেস/ট্যাব/ব্র্যাকেট/`*` লাগে, পরে সেপ/স্পেস/শেষ।
 */
const OPTION_MARKER_RE = /(?:^|[\s\(\[*])([KLMNklmnকখগঘa-dA-D])(?=[\s.,;।:)\-–—\]/|]|$)/gm;

export function countOptionMarkers(text: string): number {
  OPTION_MARKER_RE.lastIndex = 0;
  let n = 0;
  while (OPTION_MARKER_RE.exec(text) !== null) n++;
  return n;
}

/**
 * প্রশ্ন-ব্লকের জয়েন্ট টেক্সট থেকে অপশন/উত্তর/ব্যাখ্যা আলাদা করে।
 * কাজের ক্রম:
 *   ① ব্যাখ্যা-মার্কার-লাইন ("e¨vL¨v:" / "ব্যাখ্যা:") থেকে ব্লক-শেষ = ব্যাখ্যা —
 *      অপশনের টেক্সটে আর লেগে থাকবে না
 *   ② উত্তর: অপশন-অঞ্চলের শেষতম লাইনের শেষে মার্কার+অক্ষর (গ্লুড "…sand\tD: L + N"
 *      বা একা-লাইন "D: K") — মার্কারটা কেটে বাদ; একা-লাইন হলে পুরো লাইন বাদ
 *   ③ ফ্যামিলি-স্ক্যানে (K/L/M/N, ক/খ/গ/ঘ, a-d) অপশন ভাগ
 */
export function scanOptions(blockText: string, serialRaw: string): { options: OptionPreview[]; answer: string | null; qText: string; bekkha: string | null } {
  const si = blockText.indexOf(serialRaw);
  const body = si >= 0 ? blockText.slice(si + serialRaw.length) : blockText;

  // ---- ① ব্যাখ্যা-বিভাজন ----
  const rawLines = body.split("\n");
  let bekkhaAt = -1;
  for (let i = 0; i < rawLines.length; i++) {
    if (BEKKHA_LINE_RE.test(rawLines[i])) {
      bekkhaAt = i;
      break;
    }
  }
  const regionLines = bekkhaAt >= 0 ? rawLines.slice(0, bekkhaAt) : rawLines;
  let bekkha: string | null = null;
  if (bekkhaAt >= 0) {
    const first = rawLines[bekkhaAt].replace(BEKKHA_LINE_RE, "");
    bekkha = [first, ...rawLines.slice(bekkhaAt + 1)].join("\n").trim() || null;
  }

  // ---- ② উত্তর-কাটা ----
  let answer: string | null = null;
  const cutAnswerLine = (i: number, m: RegExpExecArray) => {
    if (regionLines[i].slice(0, m.index).trim() === "") {
      regionLines.splice(i, 1); // একা-উত্তর-লাইন — পুরোটাই বাদ
    } else {
      regionLines[i] = regionLines[i].slice(0, m.index).trimEnd(); // অপশনের শেষে গ্লুড
    }
  };
  for (let i = regionLines.length - 1; i >= 0; i--) {
    const m = ANSWER_TAIL_RE.exec(regionLines[i]);
    if (!m) continue;
    answer = m[1] ?? null;
    cutAnswerLine(i, m);
    break;
  }
  if (answer === null) {
    // ঝুলন্ত মার্কার ("…\tDt" / "…\tD: -") — শুধু টেক্সট পরিষ্কার, উত্তর nullই
    for (let i = regionLines.length - 1; i >= 0; i--) {
      const m = ANSWER_DANGLING_RE.exec(regionLines[i]);
      if (!m) continue;
      cutAnswerLine(i, m);
      break;
    }
  }
  if (answer === null) {
    // `*`-উত্তর (B-টাইমার: "*A. টেক্সট" / "টেক্সট*") — অক্ষর বসিয়ে সব
    // `*` মোছা (মার্কারটা কনটেন্ট নয়; redownload-প্রিভিউর সাথে সামঞ্জস্য)
    const star = findStarAnswerLetter(regionLines.join("\n"));
    if (star !== null) {
      answer = star;
      for (let i = 0; i < regionLines.length; i++) {
        if (regionLines[i].includes("*")) regionLines[i] = regionLines[i].replace(/\*/g, "");
      }
    }
  }
  const region = regionLines.join("\n");

  // ---- ③ ফ্যামিলি-স্ক্যান ----
  // অপশন-লেবেল occurrence-ভিত্তিক: region-এর প্রতিটা "[A-Zকখগঘa-d][.।):]"
  // টোকেনকে স্লট-কীতে fold করা হয় (k/K→"K", a/A→"A" — কেস-মিক্স টাইপো
  // "K. … L. … M. …\td. …" এক ফ্যামিলিতেই মেলে; "N 50 g" ডটলেস টোকেন
  // নয়, তাই "D." ফ্যামিলি-ম্যাচে ভুয়া-৪র্থ হয় না)।
  // তারপর স্লট-ক্রমে (K→L→M→N) longest increasing run — এটাই অপশন-সেট।
  // টাইপো-টলারেন্ট: ক্রমে repeat-স্লট (যেমন "L. … L. …" — ২য় L) থাকলে
  // ওই স্লটে আসল অক্ষরসহই বসে (Physics Q27: K, L, L(typo), N → ৪ অপশন)।
  const SEPS = new Set([".", "।", ")", ":"]);
  interface Tok { at: number; ch: string; slot: string }
  const toks: Tok[] = [];
  for (let i = 0; i < region.length; i++) {
    const ch = region[i];
    const slot = (CASE_FOLD as Record<string, string>)[ch];
    if (!slot) continue;
    // বাউন্ডারি: আগে লাইন-শুরু/স্পেস/ট্যাব/ব্র্যাকেট/`*`
    const prev = i > 0 ? region[i - 1] : "\n";
    if (prev !== "\n" && !/[\s\t([*]/.test(prev)) continue;
    const sep = region[i + 1];
    if (!sep) continue;
    if (SEPS.has(sep)) {
      toks.push({ at: i, ch, slot });
      continue;
    }
    // ডটলেস-লেবেল (টাইপো-সহনশীল): ট্যাব-লেড/লাইন-শুরুতে "A ivB"/"K text"
    // — অক্ষরের পরে স্পেস/ট্যাব/নিউলাইন। শব্দের ভিতরের অক্ষর নয়
    // (সেপারেটর-হীন "Credit" ইত্যাদি বাদ থাকে), মিড-লাইন "5000 A"ও নয়।
    if ((prev === "\t" || prev === "\n" || prev === "*") && /[\s\t\n]/.test(sep)) {
      toks.push({ at: i, ch, slot });
    }
  }
  if (process.env.MCQ_DEBUG_SCAN) {
    console.log("SCAN-TOKS=" + JSON.stringify(toks));
  }
  // স্লট-ক্রমের DP — dpSlotRun helper (redownload-এর লেবেল-টাইপো ডিটেকশনও
  // একই helper; দুই জায়গায় নিয়ম বিচ্যুত হওয়ার সুযোগ নেই)
  const best = dpSlotRun(
    toks.map((t) => ({ key: t.at, ch: t.ch, slot: t.slot })),
    LABEL_FAMS,
    2
  );

  const options: OptionPreview[] = [];
  let qText = region.trim();
  if (best) {
    const { labels, picks } = best;
    const idxs = picks.map((t) => t.key);
    qText = region.slice(0, idxs[0]).trim();
    for (let i = 0; i < labels.length; i++) {
      // occurrence-পজিশনের আসল অক্ষরই লেবেল (repeat-টাইপোতে প্রত্যাশিত
      // অক্ষর নয় — "L. 100 mm" স্লটে L-ই থাকে, M বানানো হয় না)
      const atLabel = region[idxs[i]] ?? labels[i];
      const start = idxs[i] + atLabel.length + 1; // লেবেল + সেপারেটর বাদ
      const end = i + 1 < labels.length ? idxs[i + 1] : region.length;
      const text = region.slice(start, end).trim();
      options.push({ label: atLabel, text });
    }
  }
  return { options, answer, qText, bekkha };
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
  /** ব্লকের ব্যাখ্যা-অংশের টেক্সট ("e¨vL¨v:"/"ব্যাখ্যা:" মার্কার বাদে) — না থাকলে null */
  bekkha: string | null;
  hasUnicode: boolean;
}

export interface SerialIssue {
  index: number;
  expected: number;
  found: number;
  /** found===1 মানে নতুন সেকশন/পরীক্ষা শুরু — সত্যিকারের ভাঙা নয় */
  restart: boolean;
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
    throw new Error("Could not parse document.xml — the file looks corrupt");
  }
  const body = doc.getElementsByTagNameNS(W_NS, "body")[0];
  if (!body) throw new Error("No w:body found in document.xml");

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
  /** প্রশ্ন-প্রার্থী ব্লক — MCQ-শর্ত (৪ মার্কার) যাচাইয়ের পর pushQuestion হয় */
  const cands: Cur[] = [];

  const pushQuestion = (c: Cur) => {
    const text = c.texts.join("\n");
    const { options, answer, qText, bekkha } = scanOptions(text, c.si.raw);
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
      bekkha,
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
        if (cur) cands.push(cur);
        cur = { start: i, end: i, si, texts: [text] };
        started = true;
      }
    }

    if (!started) {
      if (!cur) {
        if (isSectionSeparator(text)) separators.push(text.trim());
      } else if (isSectionSeparator(text)) {
        cands.push(cur);
        cur = null;
        separators.push(text.trim());
      } else {
        cur.end = i;
        cur.texts.push(text);
      }
    }
  }
  if (cur) cands.push(cur);

  // MCQ-শর্ত (সিরিয়াল + প্রশ্ন + ৪ অপশন-মার্কার): কম মার্কারের ব্লক
  // স্বতন্ত্র MCQ নয় — আগের ব্লকের ধারাবাহিক অংশ হিসেবে জুড়ে যায়
  // (ব্যাখ্যার ভিতরের "1./2./3." তালিকা, সাল/রেঞ্জ-লাইন — এরা নতুন প্রশ্ন
  // ভেঙে shuffle/redownload-এর সংখ্যা বাড়াবে না)। গণনা ব্লকের প্রথম
  // কয় প্যারায় (MARKER_WINDOW_PARAS) — প্রশ্ন+অপশন পাশাপাশি থাকতে হবে।
  // গ্লোবাল-গেট: পুরো ফাইলে গড়ে ৪-এর কম মার্কার থাকলে (অপশন-বিহীন ফাইল —
  // যেমন শুধু সিরিয়াল+প্রশ্নের রিডাউনলোড) নিয়ম প্রযোজ্য নয় — সিরিয়াল-
  // বিভাজনই থাকে, সব ব্লক আলাদা প্রশ্ন হিসেবে থাকে।
  const totalMarkers = cands.reduce((a, c) => a + countOptionMarkers(c.texts.join("\n")), 0);
  const applyMcqRule = totalMarkers >= MIN_OPTIONS_PER_MCQ * cands.length;
  const merged: Cur[] = [];
  for (const c of cands) {
    if (
      applyMcqRule &&
      merged.length > 0 &&
      countOptionMarkers(c.texts.slice(0, MARKER_WINDOW_PARAS).join("\n")) < MIN_OPTIONS_PER_MCQ
    ) {
      const prev = merged[merged.length - 1];
      prev.end = c.end;
      prev.texts.push(...c.texts);
    } else {
      merged.push(c);
    }
  }
  for (const c of merged) pushQuestion(c);

  // সিরিয়াল রিপোর্ট
  let serial: DocxParseResult["serial"] = null;
  if (questions.length) {
    const issues: SerialIssue[] = [];
    for (let i = 1; i < questions.length; i++) {
      const expected = questions[i - 1].serial + 1;
      const found = questions[i].serial;
      if (found !== expected) {
        issues.push({ index: i, expected, found, restart: found === 1 && expected > 1 });
        if (issues.length >= 30) break;
      }
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

/** JSZip load/generate-এর determinate প্রগ্রেস (0..1) */
export type ZipProgress = (frac: number) => void;

/** JSZip onUpdate-মেটাডেটা ({ percent: 0..100 }) → 0..1 কলব্যাকে বাঁধা */
export function zipMetaToProgress(onProgress?: ZipProgress): ((meta: { percent?: number }) => void) | undefined {
  if (!onProgress) return undefined;
  return (meta) => {
    const p = typeof meta.percent === "number" ? meta.percent / 100 : 0;
    onProgress(Math.min(1, Math.max(0, p)));
  };
}

export async function loadDocxXml(file: Blob, onProgress?: ZipProgress): Promise<string> {
  // NOTE: JSZip loadAsync-এর options-এ onUpdate হুক নেই (শুধু entry.async/generateAsync-এ
  // ২য় আর্গুমেন্টে) — তাই প্রগ্রেস document.xml-রিডে বাঁধা
  const zip = await JSZip.loadAsync(file);
  const entry = zip.file("word/document.xml");
  if (!entry) throw new Error("Not a valid .docx file (word/document.xml missing)");
  return entry.async("string", zipMetaToProgress(onProgress));
}

// ---------- রেফারেন্স-মডিউলের জন্য এক্সপোজড হেল্পার ----------

/** প্যারার w:t-স্ট্রিম + জয়েন্ট টেক্সট + রান-বাউন্ডারি — reference.ts-এর স্প্যান-এডিটে লাগে */
export function collectParaTs(p: Element): { stream: Element[]; joined: string; segEnds: number[] } {
  const stream: Element[] = [];
  collectTs(p, stream);
  const texts = stream.map((t) => t.textContent ?? "");
  const joined = texts.join("");
  const segEnds: number[] = [];
  let acc = 0;
  for (const t of texts) {
    acc += t.length;
    segEnds.push(acc);
  }
  return { stream, joined, segEnds };
}

/** জয়েন্ট-টেক্সট অফসেট-স্প্যান রিপ্লেস (text: "" হলে ডিলিট) — reference.ts ব্যবহার করে */
export function replaceJoinedSpans(
  stream: Element[],
  spans: Array<{ start: number; end: number; text: string }>
): void {
  replaceSpans(stream, spans);
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
export function serialMatchSpans(joined: string, segEnds?: number[]): { digitsStart: number; digitsEnd: number; sepStart: number; sepEnd: number; enc: DigitEnc } | null {
  const m = SERIAL_RE.exec(joined);
  if (!m) return null;
  const conv = digitsToNumber(m[1]);
  if (!conv) return null;
  // ডিজিট ম্যাচের শুরু: লিডিং স্পেস ও ডিজিট-সেপারেটরের মাঝের স্পেস সঠিকভাবে স্কিপ
  const digitsStart = m.index + joined.indexOf(m[1], m.index);
  const digitsEnd = digitsStart + m[1].length;
  if (isotopeLikeAfterDigits(joined, digitsEnd)) {
    // ব্যতিক্রম: ডিজিট যদি নিজের w:t-রানের একদম শেষে থাকে, অক্ষরটা পরের রানে —
    // তাহলে মাঝে ট্যাব/স্পেস থাকতে পারে ("02<tab>প্রশ্ন") — আইসোটোপ নয়
    const atRunBoundary = segEnds ? segEnds.includes(digitsEnd) : false;
    if (!atRunBoundary) return null;
  }
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

  const texts = stream.map((t) => t.textContent ?? "");
  const joined = texts.join("");
  const segEnds: number[] = [];
  let acc = 0;
  for (const t of texts) { acc += t.length; segEnds.push(acc); }
  const spans = serialMatchSpans(joined, segEnds);
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

  const texts = stream.map((t) => t.textContent ?? "");
  const joined = texts.join("");
  const segEnds: number[] = [];
  let acc = 0;
  for (const t of texts) { acc += t.length; segEnds.push(acc); }
  const spans = serialMatchSpans(joined, segEnds);
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
