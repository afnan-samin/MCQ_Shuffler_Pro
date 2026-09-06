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

/**
 * ডিজিট-ক্লাস — English (0-9) + বাংলা ইউনিকোড (০-৯) + Bijoy ASCII ডিজিট
 * (SutonnyMJ এনকোডিং: ø«ˆµ∏Ï¾˜Ùœ = ০-৯, docx-xml.ts থেকে মিলিয়ে)
 */
const DIG_CL = "0-9\u09E6-\u09EFø«ˆµ∏Ï¾˜Ùœ";

/** বছর-রেঞ্জ: 22-23, 2019-20, ২০-২১, '21-22, ø«-«ˆ — তিন এনকোডিং-ই */
const YEAR_RANGE_RE = new RegExp(
  `(?:^|[^${DIG_CL}])(?:['’′]?[${DIG_CL}]{2}|[${DIG_CL}]{4})\\s*[-–—]\\s*(?:['’′]?[${DIG_CL}]{2}|[${DIG_CL}]{4})(?:[^${DIG_CL}]|$)`
);
/** একক বছর: 2019 / ২০১৭ / '22 (রেঞ্জ ছাড়া) — শুধু অ্যাব্রেভ/কীওয়ার্ডের সাথে গৃহীত */
const SINGLE_YEAR_RE = new RegExp(
  `(?:^|[^${DIG_CL}])(?:[${DIG_CL}]{4}|['’′][${DIG_CL}]{2})(?:[^${DIG_CL}]|$)`
);
/** code:22 / code: 22-23 স্টাইল — অক্ষর-কোড + কোলন + ডিজিট (তিন এনকোডিং-ই) */
const COLON_CODE_RE = new RegExp(
  `^[A-Za-z\u0980-\u09FF][^:${DIG_CL}]{0,30}:\\s*[${DIG_CL}]`
);
/** প্রচলিত কীওয়ার্ড (Unicode + Bijoy ASCII রেন্ডারিং) — ব্র্যাকেট-ভেতরে একাই যথেষ্ট */
const KEYWORD_RE = /(বোর্ড|সাল|বর্ষ|প্রশ্নব্যাংক|প্রশ্ন\s*ব্যাংক|পরীক্ষা|ভার্সি|বিশ্ববিদ্যালয়|মেডিকেল|মেডিক্যাল|নার্সিং|মাদ্রাসা|কারিগরি|কলেজ|বিসিএস|প্রাইমারি|নিয়োগ|বার্ষিক|wefxK|cÖhyw³|fvl\b|board|year|exam|university|varsity|college|medical|nursing|admission|projukti)/i;
/**
 * প্রতিষ্ঠান-অ্যাব্রেভ (WEAK টিয়ার) — একা যথেষ্ট নয়; ব্র্যাকেট-ভেতরে
 * একক-বছরের সাথে গৃহীত হয় ("[BUET 2019]", "[ঢাবি ২০১৭]")
 */
const ABBR_RE = /\b(?:DU|JU|CU|RU|KU|BU|BAU|AUST|NSU|BRAC|IUT|EWU|DIU|JUST|SUST|BUET|CUET|RUET|KUET|MBBS|BCS|HSC|SSC|USTC)\b|ঢাবি|জাবি|চবি|রাবি|খুবি|শাবি|সমবি|বুয়েট|কুয়েট|রুয়েট|চুয়েট|সাস্ট/;

/** প্রকৃত অক্ষর (ডিজিট বাদ) — খাঁটি-সংখ্যা ব্র্যাকেট "(২০-২৫)" রেফারেন্স নয় */
const LETTER_RE = /[A-Za-z\u00C0-\u024F\u0980-\u09E5\u09F0-\u09FF]/;

/**
 * ব্র্যাকেটের ভেতরের লেখা রেফারেন্স কি না।
 * শর্ত: ভেতরে অন্তত ১টা প্রকৃত অক্ষর (ডিজিট নয়), এবং (বছর-রেঞ্জ |
 * কোলন-কোড | কীওয়ার্ড | একক-বছর+অ্যাব্রেভ)। বিশুদ্ধ সংখ্যা/গণিত —
 * "(0-5)", "(273-373)", "(NH4)", "(২০-২৫)" — রেফারেন্স নয়।
 */
function innerIsReference(inner: string): boolean {
  const t = inner.trim();
  if (!t || !LETTER_RE.test(t)) return false; // অন্তত ১ প্রকৃত অক্ষর
  if (YEAR_RANGE_RE.test(t)) return true; // অক্ষর থাকায় বিশুদ্ধ-রেঞ্জ আগেই বাদ
  if (COLON_CODE_RE.test(t)) return true;
  if (KEYWORD_RE.test(t) && t.length <= 40) return true;
  // একক-বছর + প্রতিষ্ঠান-অ্যাব্রেভ — "[BUET 2019]", "[ঢাবি ২০১৭]"
  if (SINGLE_YEAR_RE.test(t) && ABBR_RE.test(t) && t.length <= 40) return true;
  return false;
}

// ---------- ব্র্যাকেট-ছাড়া রেফারেন্স (স্ট্যান্ডঅ্যালোন লাইন / লাইন-শেষের ট্যাগ) ----------
// "ঢাকা বোর্ড ২০১৭", "DU '21-22", "ঢাবি ১৯-২০, জাবি ২০-২১", "BUET 19-20"
// শেপ-গার্ড: কঠোর লেক্সিকন-শেপ (কীওয়ার্ড-প্রথম + বছর-শেষ, অজানা শব্দ নিষেধ) —
// ব্যাখ্যার গদ্য ("…1967 সালে", "(1716-1771) GKRb …") কখনোই ধরা পড়ে না।

/**
 * লাইন-শুরুর অপশন/উত্তর/ব্যাখ্যা-লিড — এমন লাইনে ব্র্যাকেট-ছাড়া ডিটেকশন বন্ধ
 * (অপশন-টেক্সট নিজেই "ঢাকা বোর্ড ২০১৭" হতে পারে — মুছে ফেলা যাবে না)
 */
const NONQ_LEAD_RE =
  /^\s*(?:[কখগঘ]\s*[.।:)\-–—]|[a-dA-DKLMN]\s*[.।:)\-–—]|(?:i{1,3}|iv|v)\s*[.।)]|Dt?\s*[:.]|Ans\b|উত্তর|Cvw|সমাধান|e¨vL¨v|ব্যাখ্যা|explanation)/i;

/** ব্র্যাকেট-ছাড়া ইউনিটে STRONG কীওয়ার্ড — বাংলা/Bijoy (একক-বছরে শুধু এই টিয়ার চলে) */
const BL_STRONG_BN_RE =
  /^(?:বোর্ড|পরীক্ষা|ভার্সি|বিশ্ববিদ্যালয়|মেডিকেল|মেডিক্যাল|নার্সিং|মাদ্রাসা|কারিগরি|কলেজ|বিসিএস|প্রাইমারি|নিয়োগ|বার্ষিক|প্রশ্নব্যাংক|প্রশ্ন\s*ব্যাংক|wefxK|cÖhyw³)$/;
/** STRONG English — রেঞ্জ-বছরসহ ইউনিটে চলে (একক-বছরে গদ্য-ঝুঁকি বলে নিষেধ) */
const BL_STRONG_EN_RE = /^(?:board|exam|university|varsity|college|medical|nursing|admission)$/i;
/** WEAK অ্যাব্রেভ — রেঞ্জ/কোলন-বছরসহ ইউনিটে চলে */
const BL_WEAK_RE =
  /^(?:DU|JU|CU|RU|KU|BU|BAU|AUST|NSU|BRAC|IUT|EWU|DIU|JUST|SUST|BUET|CUET|RUET|KUET|MBBS|BCS|HSC|SSC|USTC|ঢাবি|জাবি|চবি|রাবি|খুবি|শাবি|সমবি|বুয়েট|কুয়েট|রুয়েট|চুয়েট|সাস্ট)$/i;
/** স্থান-নাম ফিলার ("ঢাকা বোর্ড ২০১৭"-এর "ঢাকা") — শুধু কীওয়ার্ডের সাথে */
const BL_PLACE_RE =
  /^(?:ঢাকা|রাজশাহী|চট্টগ্রাম|কুমিল্লা|যশোর|বরিশাল|সিলেট|দিনাজপুর|ময়মনসিংহ|মোমেনশাহী|ঢা\.?|রা\.?|চ\.?|সি\.?|কু\.?|দি\.?)$/;
/** স্পষ্ট লেবেল-শব্দ ("রেফারেন্স: ঢাবি ১৯-২০"-এর লেবেল) */
const BL_LABEL_RE = /^(?:রেফারেন্স|রেফ|উৎস|ref|refs|source)$/i;

/** পূর্ণ বছর-টোকেন: 2019, ২০-২১, '21-22, ২০১৭, ø«-«ˆ */
const YEAR_TOK_RE = new RegExp(
  `^['’′]?[${DIG_CL}]{2,4}(?:\\s*[-–—]\\s*['’′]?[${DIG_CL}]{2,4})?$`
);

const YTOK = "year" as const;
type WordCls = "kw-bn" | "kw-en" | "kw-weak" | "place" | "label" | typeof YTOK | null;

function classifyBareWord(w: string): WordCls {
  const t = w.replace(/[.।]+$/, "").trim();
  if (!t) return null;
  if (YEAR_TOK_RE.test(t)) return YTOK;
  if (BL_STRONG_BN_RE.test(t)) return "kw-bn";
  if (BL_STRONG_EN_RE.test(t)) return "kw-en";
  if (BL_WEAK_RE.test(t)) return "kw-weak";
  if (BL_PLACE_RE.test(t)) return "place";
  if (BL_LABEL_RE.test(t)) return "label";
  // হাইফেন-যৌগিক ("DU-cÖhyw³") — উপ-টোকেন ভেঙে দেখা হয়; সবাই লেক্সিকন/
  // বছর হলে চলবে, অন্তত একটা কীওয়ার্ড লাগবে
  if (/[-–—_/]/.test(t)) {
    const subs = t.split(/[-–—_/]+/).filter(Boolean);
    if (!subs.length) return null;
    let kw = false;
    for (const s of subs) {
      const cls = classifyBareWord(s);
      if (cls === null) return null;
      if (cls === YTOK) continue;
      if (cls.startsWith("kw")) kw = true;
    }
    return kw ? "kw-weak" : null;
  }
  return null;
}

/**
 * এক ইউনিট (কমা-বিভাজিত অংশ) রেফারেন্স-শেপ কি না:
 * ≥১ বছর + ≥১ কীওয়ার্ড, কীওয়ার্ড-প্রথম বছর-পরে নয়, অজানা শব্দ নেই।
 * একক-বছর হলে কীওয়ার্ড STRONG-BN টিয়ারে হতে হবে (গদ্য-ঝুঁকি বন্ধ)।
 */
function bareUnitOk(unit: string): boolean {
  const words = unit.split(/\s+|\s*:\s*/).filter(Boolean);
  if (!words.length || words.length > 5) return false;
  let kw = false;
  let kwBn = false;
  let hasYear = false;
  let hasRange = false;
  for (const w of words) {
    const cls = classifyBareWord(w);
    if (cls === YTOK) {
      if (/[-–—]/.test(w)) hasRange = true;
      if (hasYear) return false; // দুই বছর-টোকেন = অস্পষ্ট
      hasYear = true;
      continue;
    }
    if (cls === null) return false; // অজানা শব্দ — গদ্য, ভাঙবে
    if (hasYear) return false; // কীওয়ার্ড/স্থান বছরের পরে = গদ্য-শেপ
    if (cls === "kw-bn") { kw = true; kwBn = true; }
    else if (cls === "kw-en" || cls === "kw-weak") kw = true;
  }
  if (!hasYear || !kw) return false;
  if (!hasRange && !kwBn) return false; // একক-বছর → শুধু বাংলা-STRONG কীওয়ার্ড
  return true;
}

/** পুরো কোর (কমা-চেইনসহ) রেফারেন্স-শেপ কি না */
function bareRefCoreOk(core: string): boolean {
  const s = core.trim().replace(/[.,;:।|]+$/, "").trim();
  if (s.length < 4 || s.length > 64) return false;
  if (!LETTER_RE.test(s)) return false;
  const units = s.split(/\s*[,;/&]+\s*/).filter(Boolean);
  if (!units.length) return false;
  return units.every(bareUnitOk);
}

/**
 * লাইনে ব্র্যাকেট-ছাড়া রেফারেন্স-টোকেন — ① পুরো লাইন (স্ট্যান্ডঅ্যালোন লাইন)
 * ② লাইনের শেষে স্পেস/পাংকচুয়েশন-বিচ্ছিন্ন ঝোলা ট্যাগ। পাওয়া না গেলে null।
 */
function findBareRefToken(line: string): RefToken | null {
  let end = line.length;
  while (end > 0 && /\s/.test(line[end - 1])) end--;
  if (end < 4) return null;
  // ① পুরো লাইন
  if (bareRefCoreOk(line.slice(0, end))) {
    const t = line.slice(0, end).trim().replace(/[.,;:।|]+$/, "").trim();
    const pad = line.slice(0, end).length - line.slice(0, end).trimStart().length;
    return { start: pad, end: pad + t.length, text: t };
  }
  // ② শেষের ঝোলা ট্যাগ — সবচেয়ে বড় (সবচেয়ে আগের) ম্যাচটা নেওয়া হয়
  const minStart = Math.max(1, end - 72);
  for (let i = minStart; i < end; i++) {
    if (!/[\s?:।!.,;—–-]/.test(line[i - 1])) continue;
    const cand = line.slice(i, end);
    if (bareRefCoreOk(cand)) {
      const trimmed = cand.trim();
      const pad = cand.length - trimmed.length;
      const t = trimmed.replace(/[.,;:।|]+$/, "").trim();
      return { start: i + pad, end: i + pad + t.length, text: t };
    }
  }
  return null;
}

/**
 * এক লাইনের রেফারেন্স টোকেনগুলো — শুধু লাইনের শেষ-প্রান্তের ব্র্যাকেট ধরে
 * (ট্রেইলিং স্পেস/ডট/দাঁড়ি সহ), পাশাপাশি স্পেস-দূরত্বে বসা চেইন
 * ("…[Xvwe: 19-20] [JU: 20-21]") ধরা হয়। মাঝ-লাইনের ব্র্যাকেট অস্পৃশ্য।
 * ব্র্যাকেট না পেলে ব্র্যাকেট-ছাড়া ফরম্যাট দেখা হয় (অপশন/উত্তর/ব্যাখ্যা-লিডের
 * লাইনে বন্ধ — অপশন-টেক্সট রক্ষা)।
 */
export function findRefTokens(line: string): RefToken[] {
  const all: Array<{ start: number; end: number; inner: string }> = [];
  REF_BRACKET_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = REF_BRACKET_RE.exec(line))) {
    all.push({ start: m.index, end: m.index + m[0].length, inner: m[1] ?? m[2] });
  }
  if (!all.length) {
    // ব্র্যাকেট নেই — ব্র্যাকেট-ছাড়া ফরম্যাট (লাইন/লাইন-শেষ)
    if (!NONQ_LEAD_RE.test(line)) {
      const bare = findBareRefToken(line);
      if (bare) return [bare];
    }
    return [];
  }

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
  // ব্র্যাকেট-টোকেন না পেলে ব্র্যাকেট-ছাড়া ফরম্যাট (লাইন/লাইন-শেষ)
  if (!out.length && !NONQ_LEAD_RE.test(line)) {
    const bare = findBareRefToken(line);
    if (bare) return [bare];
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
    // টোকেনের পরের ঝোলা পাংকচুয়েশন/স্পেসও মুছি ("…[CU: 22-23]।" → "…।" না রেখে;
    // ব্র্যাকেট-ছাড়া পুরো-লাইন টোকেনে দাঁড়িসহ মুছলে প্যারা ফাঁকা হয়ে drop হবে)
    let end = t.end;
    while (end < joined.length && /[.,;:।|\s]/.test(joined[end])) end++;
    spans.push({ start, end, text: "" });
  }
  // ওভারল্যাপ ছাঁটা — আগের স্প্যানের এক্সটেনশন পরের টোকেন খেয়ে ফেললে
  spans.sort((a, b) => a.start - b.start);
  for (let i = 0; i < spans.length - 1; i++) {
    if (spans[i].end > spans[i + 1].start) spans[i].end = spans[i + 1].start;
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
