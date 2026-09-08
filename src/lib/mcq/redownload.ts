// ============================================================
// Redownload engine — অংশ-বাছাই করে নতুন .docx বানানো
// ============================================================
// ছয় ধরনের অংশ ডিটেক্ট হয়: সিরিয়াল / প্রশ্ন / রেফারেন্স / অপশন /
// উত্তর / ব্যাখ্যা। ডিটেকশনের ভিত্তি:
//   ① রঙ-হেডার (শেডিং) — সিরিয়াল মোডের হেডার-ডিটেকশনের মতই; হেডারের
//     কীওয়ার্ড ("উত্তরমালা", "ব্যাখ্যা"…) দেখে পরের প্যারাগুলোর সেকশন ঠিক হয়
//   ② টেক্সট-প্যাটার্ন — অপশন-লেড (ক) খ) …), উত্তর-লাইন (উঃ ক / উত্তর: খ),
//     ব্যাখ্যা/রেফারেন্স প্রিফিক্স, একাধিক "১. ক ২. খ" জোড়া
// এক্সপোর্টে বাছাই করা অংশের অরিজিনাল OOXML প্যারা cloneNode করে হুবহু
// বসে (deep copy) — tab, ইকুয়েশন, ফন্ট, ছবি কিছুই ভাঙে না। অপশন বাদ +
// উত্তর থাকলে উত্তরের অক্ষরের জায়গায় ওই অপশনের পুরো লেখা verbatim
// ঢুকে যায় (উত্তর-বিস্তার)। সিরিয়াল চাইলে ১..N রিনাম্বার (ফাইলের নিজের
// ডিজিট-স্টাইলে)।
// ============================================================

import JSZip from "jszip";

import { MAX_SERIAL_NUMBER } from "./limits";
import { relabelOptionPara, type OptionLabelSettings } from "./option-labels";
import { findRefTokens } from "./reference";
import {
  ANSWER_TAIL_RE,
  W_NS,
  countRunTabs,
  detectSerialPrefix,
  extractParaText,
  isSectionSeparator,
  numberToDigits,
  renumberSerialParaTo,
  scanOptions,
  serialMatchSpans,
  type DigitEnc,
  type OptionPreview,
  type SerialPrefix,
} from "./docx-xml";

// ---------- অংশ-কাইন্ড ----------

export type PartKind =
  | "serial"
  | "question"
  | "reference"
  | "options"
  | "answer"
  | "bekkha"
  | "other";

/** ব্যবহারকারী যে ছয়টা অংশ টিক দিয়ে বাছাই করে ("other" অংশ টিক-নির্ভর নয়) */
export type PartSel = Record<Exclude<PartKind, "other">, boolean>;

export const PART_LABELS: Record<PartKind, string> = {
  serial: "Serial (number)",
  question: "Question",
  reference: "Reference / stimulus",
  options: "Options (ক খ গ ঘ)",
  answer: "Answer",
  bekkha: "Explanation",
  other: "Other",
};

export const DEFAULT_PART_SELECTION: PartSel = {
  serial: true,
  question: true,
  reference: false,
  options: false,
  answer: false,
  bekkha: false,
};

// ---------- প্যাটার্ন ----------

/** উত্তর-টোকেন (docx-xml-এর ANSWER_TAIL_RE-এর সাথে সামঞ্জস্যপূর্ণ)।
 * বেয়ার "D" = Bijoy "উ" — শুধু কোলন/ডট-সহ ("D: K") */
const ANSWER_TOK = "(?:Dt|DËi?t?|Cvw|wU|উঃ|উত্তরমালা|উত্তর|Ans?\\.?|Answer|D(?=\\s*[:.]))";
/** অক্ষর-গ্রুপ: একাধিক উত্তরও ("D: L + N", "উত্তর: ক, খ") */
const LETTER_GROUP = "([KLMNklmnকখগঘa-dA-D1-4](?:\\s*[+&,/]\\s*[KLMNklmnকখগঘa-dA-D1-4])*)";
/** লাইন-শুরুতে উত্তর-টোকেন ("উত্তর: ক", "উঃ খ", "Dt. K", "D: L + N") */
const ANSWER_LINE_RE = new RegExp(`^\\s*${ANSWER_TOK}\\s*[:.]?`, "i");
/** লাইন-শেষে অক্ষর-উত্তর ("… উঃ ক" / "উত্তর: খ") */
const ANSWER_END_RE = new RegExp(`${ANSWER_TOK}\\s*[:.]?\\s*${LETTER_GROUP}\\s*$`);
/** পুরো লাইনটাই সিরিয়াল+অক্ষর ("১২. ক" — উত্তরমালা-স্টাইল) */
const ALL_DIGITS_CLASS = "0-9০-৯ø«ˆµ∏Ï¾˜Ùœ";
const NOT_DIGIT_LOOKAHEAD = `(?![${ALL_DIGITS_CLASS}])`;
const SERIAL_LETTER_RE = new RegExp(
  `^\\s*[${ALL_DIGITS_CLASS}]{1,4}\\s*[.।):|\\-–—]\\s*([KLMNklmnকখগঘa-dA-D])\\s*$`
);
/** পুরো লাইনটাই উত্তর-টোকেন+অক্ষর ("উঃ ক", "Dt. K", "D: L + N") */
const ANSWER_WHOLE_RE = new RegExp(
  `^\\s*${ANSWER_TOK}\\s*[:.]?\\s*${LETTER_GROUP}\\s*$`
);
/** এক লাইনে একাধিক "১. ক ২. খ" জোড়া → উত্তরমালা। সেপারেটর বাধ্যতমক +
 * অক্ষরের পরে ডিজিট থাকলে সেটা সংখ্যা-রেঞ্জ ("22-23") — জোড়া নয়। */
const SERIAL_LETTER_PAIR_RE = new RegExp(
  `[${ALL_DIGITS_CLASS}]{1,4}\\s*[.।):|\\-–—]\\s*[KLMNklmnকখগঘa-dA-D1-4]${NOT_DIGIT_LOOKAHEAD}`,
  "g"
);

/** অপশন-লেড (উত্তর নয়): "ক)" "K." "a)" "(গ)" বা ট্যাব-লেড;
 * `*`-প্রিফিক্স = B-টাইমার ফরম্যাটের উত্তর-মার্কড অপশন-লাইন ("*A. টেক্সট") */
const OPTION_LEAD_RE =
  /^\s*\*?\s*(?:[KLMNklmn]\s*[.।):]|[কখগঘ]\s*[.।):]|[a-dA-D]\s*[.):]|[([]\s*[কখগঘa-dA-D]\s*[)\]])/;
/** ব্যাখ্যা/রেফারেন্স প্রিফিক্স — Bijoy "e¨vL¨v" সহ (docx-xml BEKKHA_LINE_RE-এর সাথে একই তালিকা) */
const BEKKHA_PREFIX_RE = /^\s*(?:e¨vL¨v|ব্যাখ্যা|সমাধান|explanation)\s*[:.\-—]?/i;
const REFERENCE_PREFIX_RE =
  /^\s*(?:রেফারেন্স|উদ্দীপক|reference|stimulus)\s*[:.\-—]?/i;

function countSerialLetterPairs(t: string): number {
  const m = t.match(SERIAL_LETTER_PAIR_RE);
  return m ? m.length : 0;
}

/**
 * উত্তর-লাইন কি না। ক্রম গুরুত্বপূর্ণ:
 * ① পুরো লাইন = উত্তর ("উঃ ক", "Dt. K", "১২. ক") → উত্তর
 * ② অপশন-সারি (ট্যাব/লেবেল-শুরু) — শেষে "Dt K" থাকলেও অপশনই (উত্তরসহ অপশন-রো)
 * ③ উত্তর-টোকেনে শুরু / একাধিক জোড়া → উত্তর
 * ④ সিরিয়াল-প্রিফিক্স (প্রশ্ন-শুরু) → উত্তর নয় — scanOptions পরে উত্তর তোলে
 * ⑤ মাঝ-লাইনে উত্তর-টোকেন+অক্ষর-শেষ → উত্তর
 */
export function isAnswerLine(t: string): boolean {
  if (ANSWER_WHOLE_RE.test(t)) return true;
  if (SERIAL_LETTER_RE.test(t)) return true;
  if (/^\t/.test(t) || OPTION_LEAD_RE.test(t)) return false;
  if (ANSWER_LINE_RE.test(t)) return true;
  if (countSerialLetterPairs(t) >= 2) return true;
  if (detectSerialPrefix(t)) return false;
  if (ANSWER_END_RE.test(t)) return true;
  return false;
}

/** অপশন-লেড লাইন (উত্তর বাদে) */
export function isOptionLine(t: string): boolean {
  if (isAnswerLine(t)) return false;
  if (/^\t/.test(t)) return true;
  return OPTION_LEAD_RE.test(t);
}

// ---------- সেকশন-হেডার কীওয়ার্ড ----------

const SECTION_KINDS: Array<{ re: RegExp; kind: PartKind }> = [
  { re: /রেফারেন্স|উদ্দীপক|reference|stimulus/i, kind: "reference" },
  { re: /ব্যাখ্যা|সমাধান|explanation|solution/i, kind: "bekkha" },
  { re: /উত্তর|উওর|answer/i, kind: "answer" },
  { re: /অপশন|options?/i, kind: "options" },
  { re: /সিরিয়াল|serial/i, kind: "serial" },
  { re: /প্রশ্ন|question/i, kind: "question" },
];

/** হেডার-টেক্সটে যে কীওয়ার্ড আগে বসে সেটাই সেকশন জেতে (টাই-এ তালিকার ক্রম) */
function sectionKindOf(text: string): PartKind | null {
  let best: { index: number; kind: PartKind } | null = null;
  for (const { re, kind } of SECTION_KINDS) {
    const m = re.exec(text);
    if (m && (!best || m.index < best.index)) best = { index: m.index, kind };
  }
  return best?.kind ?? null;
}

/** pPr-এর সরাসরি w:shd সন্তানের fill (সাদা/auto হলে null) — color-serial-এর নিয়ম */
export function paraShadingFill(p: Element): string | null {
  if (p.localName !== "p") return null;
  for (const c of Array.from(p.children)) {
    if (c.localName === "pPr") {
      for (const s of Array.from(c.children)) {
        if (s.localName === "shd") {
          const fill = (s.getAttribute("w:fill") ?? s.getAttributeNS(W_NS, "fill") ?? "").toUpperCase();
          if (fill && fill !== "AUTO" && fill !== "FFFFFF") return fill;
        }
      }
    }
  }
  return null;
}

// ---------- পার্স-মডেল ----------

export interface RdQuestion {
  id: number;
  /** 1-based পজিশন (প্রিভিউর বাংলা নম্বর) */
  pos: number;
  serial: number;
  serialEnc: DigitEnc;
  serialDigits: string;
  serialSeparator: string;
  serialFontBijoy: boolean;
  blockStart: number;
  blockEnd: number;
  /** ব্লকের প্যারা-টেক্সট (tab = \t) */
  texts: string[];
  /** texts-এর সাথে aligned — প্রতি প্যারার অংশ-কাইন্ড */
  kinds: PartKind[];
  qText: string;
  options: OptionPreview[];
  answer: string | null;
  /** উত্তর `*`-মার্কার থেকে এসেছে (B-টাইমার ফরম্যাট — সোর্সে আলাদা উত্তর-লাইন নেই) */
  answerFromStar: boolean;
  /** ব্লকের ব্যাখ্যা-অংশের টেক্সট (মার্কার বাদে) — না থাকলে null */
  bekkha: string | null;
  hasUnicode: boolean;
}

/**
 * প্যারা-স্প্লিট প্ল্যান — w:t-জয়েন্ট টেক্সটের `start`-অফসেটে প্যারা দু-ভাগ হয়;
 * টেইল-অংশটি নিজের কাইন্ডের অংশ-টিক মেনে ডাউনলোডে যায়/বাদ যায়।
 * (অপশন-লাইনের শেষে গ্লুড "Dt K" → answer; প্রশ্ন-লাইনের শেষে "(JU: 21-22)" → reference)
 */
export interface RdSplit {
  /** body-child ইনডেক্স */
  para: number;
  kind: "answer" | "reference";
  start: number;
}

export interface RdParseResult {
  questions: RdQuestion[];
  /** প্রতি body-child-এর অংশ-কাইন্ড (sectPr সহ — "other") */
  kinds: PartKind[];
  /** প্রতি body-child কোন প্রশ্নের ব্লকে আছে (ব্লকের বাইরে -1) */
  blockIndex: number[];
  kindCounts: Record<PartKind, number>;
  separators: string[];
  hasUnicode: boolean;
  /** টেইল-স্প্লিট প্ল্যান (গ্লুড উত্তর / টেইল-রেফারেন্স) */
  splits: RdSplit[];
  /** অপশন-প্যারা থেকে `*`-উত্তর-মার্কার সরানোর স্প্যান */
  starStrips: Array<{ para: number; start: number; end: number }>;
}

interface CurBlock {
  start: number;
  end: number;
  si: SerialPrefix;
  texts: string[];
}

/** বডি-চিল্ড্রেনের টেক্সট থেকে পরের নন-এম্পটি টেক্সট */
function nextNonEmpty(texts: string[], from: number): string | null {
  for (let j = from; j < texts.length; j++) {
    if (texts[j].trim()) return texts[j];
  }
  return null;
}

/**
 * গার্ডেড প্রশ্ন-শুরু: সিরিয়াল-প্রিফিক্স থাকতেই হবে, কিন্তু
 * ① উত্তর/ব্যাখ্যা/রেফারেন্স/অপশন সেকশনের ভিতরে "১২. ক"-টাইপ লাইন প্রশ্ন নয় —
 *    তবে জোরালো প্রমাণ (ট্যাব+লেখা, বা পরের প্যারা অপশন-লেড) থাকলে প্রশ্নই —
 *    প্রতি-প্রশ্নের ব্যাখ্যার পরের প্রশ্ন এভাবেই ধরা পড়ে
 * ② এক লাইনে একাধিক সিরিয়াল+অক্ষর জোড়া থাকলে উত্তরমালা — প্রশ্ন নয়
 * ③ ট্যাব/পরের-অপশন-লেড/যথেষ্ট লম্বা টেক্সট — যেকোনো একটা হলে প্রশ্ন
 */
function isQuestionStartPara(
  t: string,
  si: SerialPrefix,
  hasTab: boolean,
  nextText: string | null,
  section: PartKind | null
): boolean {
  if (si.num > MAX_SERIAL_NUMBER) return false;
  if (countSerialLetterPairs(t) >= 2) return false;
  const afterTrim = si.after.trim();
  const nextOpt = nextText !== null && isOptionLine(nextText);
  const strongEvidence = (hasTab && afterTrim.length >= 1) || nextOpt;
  if (section === "answer" || section === "bekkha" || section === "reference" || section === "options") {
    return strongEvidence;
  }
  if (hasTab && afterTrim.length >= 1) return true;
  if (nextOpt) return true;
  if (afterTrim.length >= 6 && (!si.separator || !/^[0-9০-৯]/.test(si.after))) return true;
  return false;
}

/** রঙ-হেডার (শেডেড + টেক্সট) ব্লক ভাঙে কি না — হ্যাঁ, সেকশন-সীমানা */
function isShadedHeaderText(t: string): boolean {
  return t.trim().length > 0;
}

// ---------- মেইন পার্সার ----------

export function parseRedownloadXml(xml: string): RdParseResult {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  if (doc.getElementsByTagName("parsererror").length) {
    throw new Error("Could not parse document.xml — the file looks corrupt");
  }
  const body = doc.getElementsByTagNameNS(W_NS, "body")[0];
  if (!body) throw new Error("No w:body found in document.xml");

  const kids = Array.from(body.children) as Element[];
  const texts = kids.map((el) => (el.localName === "sectPr" ? "" : extractParaText(el)));
  const tabs = kids.map((el) => (el.localName === "sectPr" ? false : countRunTabs(el) > 0));
  const shd = kids.map((el) => paraShadingFill(el));

  const kinds: PartKind[] = kids.map(() => "other" as PartKind);
  const isQStart: boolean[] = kids.map(() => false);
  const blockIndex: number[] = kids.map(() => -1);

  let section: PartKind | null = null;
  let lastKind: PartKind | null = null;

  // ---- পাস ১: প্রতি প্যারার কাইন্ড + প্রশ্ন-শুরু ফ্ল্যাগ ----
  for (let i = 0; i < kids.length; i++) {
    if (kids[i].localName === "sectPr") {
      kinds[i] = "other";
      continue;
    }
    const t = texts[i];
    const trim = t.trim();

    if (shd[i] && isShadedHeaderText(t)) {
      const sk = sectionKindOf(trim);
      if (sk) {
        kinds[i] = sk;
        section = sk;
        lastKind = sk;
      } else {
        // সাধারণ রঙ-হেডার (অধ্যায়/টাইটেল) — সেকশন-কনটেক্সট রিসেট
        kinds[i] = "other";
        section = null;
        lastKind = null;
      }
      continue;
    }

    if (!trim) {
      kinds[i] = "other"; // খালি প্যারা — ধারাবাহিকতা ভাঙে না
      continue;
    }

    // পুরো প্যারাই রেফারেন্স-ব্র্যাকেট ("(JU: 21-22)" / "(নমুনা - 93)" / "[X] [Y]")
    // — নম্বর-বাছাইয়ে আলাদা অংশ; ধারাবাহিকতা বদলায় না বলে lastKind অস্পৃশ্য
    if (isRefOnlyPara(t)) {
      kinds[i] = "reference";
      continue;
    }

    if (isAnswerLine(t)) {
      kinds[i] = "answer";
      lastKind = "answer";
      continue;
    }
    // ব্যাখ্যা/রেফারেন্স চলমান — অপশন-লেড কনটিনিউয়েশনও ("\t†hgb : i. …") একই অংশ;
    // সিরিয়াল-লেড হলে পরের প্রশ্ন — গার্ড স্কিপ
    if (
      (lastKind === "bekkha" || lastKind === "reference") &&
      !detectSerialPrefix(t) &&
      (isOptionLine(t) || OPTION_LEAD_RE.test(t))
    ) {
      kinds[i] = lastKind;
      continue;
    }
    if (isOptionLine(t)) {
      kinds[i] = "options";
      lastKind = "options";
      continue;
    }
    if (BEKKHA_PREFIX_RE.test(t)) {
      kinds[i] = "bekkha";
      section = "bekkha";
      lastKind = "bekkha";
      continue;
    }
    if (REFERENCE_PREFIX_RE.test(t)) {
      kinds[i] = "reference";
      section = "reference";
      lastKind = "reference";
      continue;
    }

    // সেকশন-সেপারেটর/পরীক্ষা-টাইটেল ("46Zg wewmGm…", "PHYSICS") — কনটেক্সট রিসেট
    if (isSectionSeparator(t)) {
      kinds[i] = "other";
      section = null;
      lastKind = null;
      continue;
    }

    // সিরিয়াল-প্রিফিক্স দিয়ে শুরু — প্রশ্ন-শুরু কি না?
    const si = detectSerialPrefix(t);
    if (si) {
      // নিজেই সিরিয়াল-মাত্র লাইন? ("১২." একা)
      if (!trim.replace(new RegExp(`^[${ALL_DIGITS_CLASS}\\s.।):|\\-–—]+`), "")) {
        kinds[i] = "serial";
        lastKind = "serial";
        continue;
      }
      if (isQuestionStartPara(t, si, tabs[i], nextNonEmpty(texts, i + 1), section)) {
        isQStart[i] = true;
        kinds[i] = "question";
        lastKind = "question";
        section = null; // নতুন প্রশ্ন — সেকশন-কনটেক্সট শেষ
        continue;
      }
      // সিরিয়াল আছে কিন্তু প্রশ্ন-শুরু না — ধারাবাহিকতার লাইন
      kinds[i] = lastKind ?? section ?? "question";
      continue;
    }

    // কোনো মার্কার নেই — ধারাবাহিকতা
    kinds[i] = lastKind ?? section ?? "other";
  }

  // ---- পাস ১.৫: স্প্লিট-প্ল্যান + `*`-মার্কার (w:t-জয়েন্ট টেক্সটে ডিটেকশন) ----
  // ① অপশন-প্যারার শেষে গ্লুড উত্তর ("…Dt K" / "…DËit M" / "…Ans: C" / "…D: L + N")
  // ② প্রশ্ন-প্যারার শেষ-প্রান্তের রেফারেন্স-টোকেন ("…(Ju: 21-22)" / "…[CU-A: 22-23]")
  // ③ অপশন-প্যারার `*`-উত্তর-মার্কার (B-টাইমার: "*A. টেক্সট" / "টেক্সট*")
  const splits: RdSplit[] = [];
  const starStrips: Array<{ para: number; start: number; end: number }> = [];
  const starLetters = new Map<number, string>();
  for (let i = 0; i < kids.length; i++) {
    if (kids[i].localName === "sectPr") continue;
    const text = paraStreamText(kids[i]);
    if (!text.trim()) continue;
    const kind = kinds[i];
    if (kind === "options") {
      const ta = findTailAnswer(text);
      if (ta !== null) {
        splits.push({ para: i, kind: "answer", start: ta });
        continue;
      }
      const star = findStarAnswer(text);
      if (star) {
        starLetters.set(i, star.letter);
        starStrips.push(...star.spans.map((s) => ({ para: i, ...s })));
      }
    } else if (kind === "question") {
      const rs = findTailRefStart(text);
      if (rs !== null) splits.push({ para: i, kind: "reference", start: rs });
    }
  }

  // ---- পাস ২: প্রশ্ন-ব্লক গঠন ----
  const questions: RdQuestion[] = [];
  const separators: string[] = [];
  let cur: CurBlock | null = null;

  const pushBlock = (c: CurBlock) => {
    const id = questions.length;
    const blockText = c.texts.join("\n");
    const { options, answer, qText, bekkha } = scanOptions(blockText, c.si.raw);
    // `*`-উত্তর (B-টাইমার) — scanOptions ধরে না; প্যারা-স্টার-ম্যাপ থেকে
    let answerFromStar = false;
    let effAnswer = answer;
    if (!effAnswer) {
      for (let j = c.start; j <= c.end; j++) {
        const st = starLetters.get(j);
        if (st) {
          effAnswer = st;
          answerFromStar = true;
          break;
        }
      }
    }
    const slicedKinds = kinds.slice(c.start, c.end + 1);
    const q: RdQuestion = {
      id,
      pos: id + 1,
      serial: c.si.num,
      serialEnc: c.si.enc,
      serialDigits: c.si.digits,
      serialSeparator: c.si.separator,
      serialFontBijoy: isBijoyFontElement(kids[c.start]),
      blockStart: c.start,
      blockEnd: c.end,
      texts: c.texts,
      kinds: slicedKinds,
      qText,
      options: options.map((o) => ({ ...o, text: o.text.replace(/\*/g, "") })), // প্রিভিউ থেকে * সরানো
      answer: effAnswer,
      answerFromStar,
      bekkha,
      hasUnicode: /[\u0980-\u09FF]/.test(blockText),
    };
    questions.push(q);
    for (let j = c.start; j <= c.end; j++) blockIndex[j] = id;
  };

  for (let i = 0; i < kids.length; i++) {
    if (kids[i].localName === "sectPr") continue;
    const t = texts[i];

    // রঙ-হেডার সবসময় ব্লক ভাঙে
    if (shd[i] && isShadedHeaderText(t)) {
      if (cur) {
        pushBlock(cur);
        cur = null;
      }
      continue;
    }

    if (isQStart[i]) {
      if (cur) pushBlock(cur);
      const si = detectSerialPrefix(t)!;
      cur = { start: i, end: i, si, texts: [t] };
      continue;
    }

    // সেকশন-সেপারেটর — শুধু অন্যান্য-কাইন্ড প্যারা (অপশন/উত্তর/ব্যাখ্যা প্যারা প্রশ্ন-ব্লক ভাঙবে না)
    if (kinds[i] === "other" && isSectionSeparator(t)) {
      if (cur) {
        pushBlock(cur);
        cur = null;
      }
      separators.push(t.trim());
      continue;
    }

    if (cur) {
      cur.end = i;
      cur.texts.push(t);
    }
    // ব্লকের বাইরের লাইন (টাইটেল/নির্দেশনা) — blockIndex -1ই থাকে
  }
  if (cur) pushBlock(cur);

  // ---- কাউন্ট ----
  const kindCounts: Record<PartKind, number> = {
    serial: 0,
    question: 0,
    reference: 0,
    options: 0,
    answer: 0,
    bekkha: 0,
    other: 0,
  };
  for (const k of kinds) kindCounts[k]++;

  return {
    questions,
    kinds,
    blockIndex,
    kindCounts,
    separators,
    hasUnicode: questions.some((q) => q.hasUnicode),
    splits,
    starStrips,
  };
}

function isBijoyFontElement(el: Element): boolean {
  const fonts = el.getElementsByTagNameNS(W_NS, "rFonts");
  if (!fonts.length) return false;
  const f = fonts[0].getAttribute("w:ascii") ?? fonts[0].getAttributeNS(W_NS, "ascii") ?? "";
  return /sutonny|mj|bijoy|shibly|shushree|shorif|topoji|padma|prothom/i.test(f);
}

// ---------- অক্ষর-নরমালাইজ (K=ক, L=খ, M=গ, N=ঘ) ----------

const LETTER_NORM: Record<string, string> = {
  k: "ক",
  l: "খ",
  m: "গ",
  n: "ঘ",
  ক: "ক",
  খ: "খ",
  গ: "গ",
  ঘ: "ঘ",
  a: "a",
  b: "b",
  c: "c",
  d: "d",
};

function normLetter(ch: string): string {
  return LETTER_NORM[ch.toLowerCase()] ?? ch.toLowerCase();
}

// ---------- এক্সপোর্ট ----------

export interface RedownloadOptions {
  /** কোন অংশগুলো থাকবে */
  partSel: PartSel;
  /** সিরিয়াল ১..N রিনাম্বার (বাছাই করা প্রশ্নের ক্রমে) */
  renumber: boolean;
  /** অপশন বাদ + উত্তর থাকলে অক্ষরের জায়গায় অপশনের পুরো লেখা বসবে */
  expandAnswer: boolean;
  /** অপশন-লেবেল কাস্টমাইজ (ক. খ. → A. B.) — শুধু options-অংশের লেবেল বদলায় */
  optionLabels?: OptionLabelSettings | null;
}

/**
 * বাছাই করা প্রশ্ন + অংশ দিয়ে নতুন document.xml।
 * কিপ করা প্রতিটা এলিমেন্ট cloneNode(true) — অরিজিনাল XML হুবহু।
 * ব্লকের ভিতর: সিলেক্টেড প্রশ্নের কিপ-করা অংশ; ব্লকের বাইরে: টাইটেল/
 * নির্দেশনা/সাধারণ হেডার সবসময়, আর ছয়-অংশের লাইনগুলো নিজের চেকবক্স অনুযায়ী।
 */
export function buildRedownloadXml(
  xml: string,
  parse: RdParseResult,
  selectedIds: Iterable<number>,
  opts: RedownloadOptions
): string {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  if (doc.getElementsByTagName("parsererror").length) {
    throw new Error("Could not parse document.xml");
  }
  const body = doc.getElementsByTagNameNS(W_NS, "body")[0];
  if (!body) throw new Error("No w:body in document.xml");

  const kids = Array.from(body.children) as Element[];
  const sectPr = kids.find((k) => k.localName === "sectPr") ?? null;
  const byId = new Map(parse.questions.map((q) => [q.id, q]));
  const selIds = [...selectedIds].filter((qid) => byId.has(qid));
  const selSet = new Set(selIds);
  // আউটপুটে সিলেক্টেড প্রশ্নের ক্রম-পজিশন (১, ২, ৩… রিনাম্বারের ভিত্তি)
  const outPos = new Map<number, number>();
  selIds.forEach((qid, idx) => outPos.set(qid, idx + 1));

  const expandActive = opts.expandAnswer && !opts.partSel.options && opts.partSel.answer;

  // স্প্লিট/স্টার-প্ল্যান + প্রতি প্রশ্নের শেষ অপশন-প্যারা (`*`-উত্তর লাইন এখানেই বসবে)
  const splitByPara = new Map(parse.splits.map((s) => [s.para, s]));
  const starStripByPara = new Map<number, Array<{ start: number; end: number }>>();
  for (const s of parse.starStrips) {
    const arr = starStripByPara.get(s.para) ?? [];
    arr.push({ start: s.start, end: s.end });
    starStripByPara.set(s.para, arr);
  }
  const lastOptPara = new Map<number, number>();
  for (const q of parse.questions) {
    for (let j = q.blockStart; j <= q.blockEnd; j++) {
      if (parse.kinds[j] === "options") lastOptPara.set(q.id, j);
    }
  }

  while (body.firstChild) body.removeChild(body.firstChild);

  for (let i = 0; i < kids.length; i++) {
    const src = kids[i];
    if (src.localName === "sectPr") continue;
    const kind = parse.kinds[i];
    const bid = parse.blockIndex[i];

    if (bid < 0) {
      // ---- ব্লকের বাইরে ----
      if (kind === "other") {
        // টাইটেল, নির্দেশনা, সাধারণ হেডার, খালি প্যারা — সবসময় থাকে
        body.appendChild(src.cloneNode(true));
        continue;
      }
      const sp = splitByPara.get(i) ?? null;
      if (!opts.partSel[kind] && !(sp && opts.partSel[sp.kind])) continue;
      const clone = src.cloneNode(true) as Element;
      const tail = sp ? splitParaAtOffset(clone, sp.start) : null;
      // উত্তরমালা-স্টাইল লাইন ("১২. ক") — সিরিয়াল নম্বর দিয়ে প্রশ্ন খুঁজে বিস্তার
      if (kind === "answer" && expandActive) {
        expandAnswerBySerial(clone, parse, kids);
      }
      if (!sp && kind === "options" && opts.optionLabels?.enabled) {
        relabelOptionPara(clone, opts.optionLabels);
      }
      if (opts.partSel[kind]) body.appendChild(clone);
      if (tail && sp && opts.partSel[sp.kind]) body.appendChild(tail);
      continue;
    }

    // ---- প্রশ্ন-ব্লকের ভিতর ----
    const q = byId.get(bid)!;
    if (!selSet.has(bid)) continue;
    const split = splitByPara.get(i);
    const keep = kind === "other" ? opts.partSel.question : opts.partSel[kind];

    const clone = src.cloneNode(true) as Element;

    // স্প্লিট আগে — renumber/strip হেডের লেখা বদলায়, অফসেট সরে যেত
    const tail = split ? splitParaAtOffset(clone, split.start) : null;

    if (i === q.blockStart) {
      if (opts.partSel.serial && opts.renumber) {
        renumberSerialParaTo(clone, outPos.get(bid) ?? q.pos, q.serialSeparator || ".");
      } else if (!opts.partSel.serial) {
        stripSerialPrefix(clone);
      }
    }

    // `*`-উত্তর-মার্কার সরানো (অপশন-প্যারা — মার্কারটা কনটেন্ট নয়)
    const stars = starStripByPara.get(i);
    if (stars?.length) {
      const stream: Element[] = [];
      collectTsLocal(clone, stream);
      replaceSpansLocal(stream, stars.map((s) => ({ ...s, text: "" })));
    }

    // উত্তর-বিস্তার: অপশন বাদ + উত্তর আছে + অক্ষর-উত্তর ("উঃ ক")
    if (kind === "answer" && expandActive) {
      expandAnswerPara(clone, q, kids, parse, opts.optionLabels ?? null);
    }

    if (kind === "options" && opts.optionLabels?.enabled) {
      relabelOptionPara(clone, opts.optionLabels);
    }

    if (keep) body.appendChild(clone);

    // টেইল-অংশ (গ্লুড উত্তর / টেইল-রেফারেন্স) — নিজের অংশ-টিক অনুযায়ী
    if (tail && split && opts.partSel[split.kind]) {
      if (split.kind === "answer" && expandActive) {
        expandAnswerPara(tail, q, kids, parse, opts.optionLabels ?? null);
      }
      body.appendChild(tail);
    }

    // `*`-উত্তর-লাইন জেনারেট (অপশন A) — শেষ অপশন-প্যারার ঠিক পরে "Dt X"
    if (q.answerFromStar && opts.partSel.answer && lastOptPara.get(bid) === i) {
      body.appendChild(makeStarAnswerPara(doc, src, q.answer ?? ""));
    }
  }

  if (sectPr) body.appendChild(sectPr);

  const out = new XMLSerializer().serializeToString(doc);
  const bodyXml = out.startsWith("<?xml")
    ? out.slice(out.indexOf("?>") + 2).replace(/^[\r\n]+/, "")
    : out;
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n' + bodyXml;
}

/**
 * ব্লকের বাইরের উত্তরমালা-লাইন ("১২. ক") — সিরিয়াল নম্বর দিয়ে প্রশ্ন খুঁজে
 * সেই প্রশ্নের মিলে-যাওয়া অপশনের লেখা verbatim বসানো।
 */
function expandAnswerBySerial(answerClone: Element, parse: RdParseResult, kids: Element[]): void {
  const stream: Element[] = [];
  collectTsLocal(answerClone, stream);
  if (!stream.length) return;
  const joined = stream.map((t) => t.textContent ?? "").join("");
  const slM = SERIAL_LETTER_RE.exec(joined);
  if (!slM) return;
  const si = detectSerialPrefix(joined);
  if (!si) return;
  const q = parse.questions.find((qq) => qq.serial === si.num);
  if (!q || !q.answer) return;
  if (normLetter(slM[1]) !== normLetter(q.answer)) return;
  expandAnswerPara(answerClone, q, kids, parse, null);
}

/** প্রশ্ন-শুরু প্যারা থেকে সিরিয়াল (ডিজিট+সেপারেটর) সরানো */
function stripSerialPrefix(p: Element): void {
  const stream: Element[] = [];
  collectTsLocal(p, stream);
  if (!stream.length) return;
  const joined = stream.map((t) => t.textContent ?? "").join("");
  const spans = serialMatchSpans(joined);
  if (!spans) return;
  const edits: Array<{ start: number; end: number; text: string }> = [];
  if (spans.sepEnd > spans.sepStart) {
    edits.push({ start: spans.digitsStart, end: spans.sepEnd, text: "" });
  } else {
    edits.push({ start: spans.digitsStart, end: spans.digitsEnd, text: "" });
  }
  replaceSpansLocal(stream, edits);
}

/**
 * উত্তর-প্যারার অক্ষরের জায়গায় মিলে-যাওয়া অপশন-প্যারার রানগুলো verbatim বসানো।
 * "উঃ ক" → "উঃ ক) পানির ঘনত্ব…" ; "১২. ক" → "১২. ক) পানির ঘনত্ব…"
 */
function expandAnswerPara(
  answerClone: Element,
  q: RdQuestion,
  kids: Element[],
  parse: RdParseResult,
  labelSettings: OptionLabelSettings | null = null
): void {
  if (!q.answer) return;
  const answerLetter = normLetter(q.answer);

  // মিলে-যাওয়া অপশন-প্যারা খোঁজা (ব্লকের ভিতরে, options-কাইন্ড)
  let optionEl: Element | null = null;
  for (let j = q.blockStart; j <= q.blockEnd; j++) {
    if (parse.kinds[j] !== "options") continue;
    const opt = q.options.find((o) => normLetter(o.label) === answerLetter);
    if (!opt) continue;
    const t = (extractParaText(kids[j]) ?? "").trimStart();
    const labelEsc = opt.label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const m = new RegExp(`^${labelEsc}\\s*[.।):]`).exec(t);
    if (m) {
      optionEl = kids[j];
      break;
    }
  }
  if (!optionEl) return;

  // উত্তর-প্যারার টেক্সট-স্ট্রিমে অক্ষর-স্প্যান বের করে মুছা
  const stream: Element[] = [];
  collectTsLocal(answerClone, stream);
  if (stream.length) {
    const joined = stream.map((t) => t.textContent ?? "").join("");
    let letterSpan: { start: number; end: number } | null = null;

    const endM = ANSWER_END_RE.exec(joined);
    if (endM && normLetter(endM[1]) === answerLetter) {
      const start = endM.index + endM[0].length - endM[1].length;
      letterSpan = { start, end: start + endM[1].length };
    } else {
      const slM = SERIAL_LETTER_RE.exec(joined);
      if (slM) {
        const start = slM.index + slM[0].length - slM[1].length;
        letterSpan = { start, end: start + slM[1].length };
      }
    }
    if (letterSpan) {
      replaceSpansLocal(stream, [{ ...letterSpan, text: "" }]);
    }
  }

  // অপশন-প্যারার রানগুলো (pPr বাদ) উত্তর-প্যারায় জোড়া — বুকমার্ক বাদ (id-দ্বন্দ্ব এড়াতে)
  // লেবেল-কাস্টমাইজ চালু থাকলে ক্লোনে রিলেবেল করে তবেই জোড়া (উত্তরের অপশন-লেখাও একই স্টাইলে)
  let sourceEl = optionEl;
  if (labelSettings?.enabled) {
    const labeledClone = optionEl.cloneNode(true) as Element;
    relabelOptionPara(labeledClone, labelSettings);
    sourceEl = labeledClone;
  }
  for (const child of Array.from(sourceEl.childNodes)) {
    if (child.nodeType !== 1) continue;
    const el = child as Element;
    const ln = el.localName;
    if (ln === "pPr" || ln === "bookmarkStart" || ln === "bookmarkEnd") continue;
    answerClone.appendChild(el.cloneNode(true));
  }
}

// ---------- টেক্সট-স্ট্রিম হেল্পার (docx-xml-এর প্যাটার্ন অনুযায়ী) ----------

function collectTsLocal(el: Element, out: Element[]): void {
  const walk = (node: Element) => {
    for (const child of Array.from(node.children)) {
      if (child.localName === "t" && child.namespaceURI === W_NS) out.push(child);
      else if (child.localName === "oMath" || child.localName === "oMathPara") continue;
      else if (child.children.length) walk(child);
    }
  };
  walk(el);
}

function replaceSpansLocal(
  stream: Element[],
  spans: Array<{ start: number; end: number; text: string }>
): void {
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
    let pos = 0;
    for (const sp of sorted) {
      if (sp.end <= tStart || sp.start >= tEnd) continue;
      const ls = Math.max(0, sp.start - tStart);
      const le = Math.min(s.length, sp.end - tStart);
      out += s.slice(pos, ls);
      if (tStart <= sp.start) out += sp.text;
      pos = le;
    }
    out += s.slice(pos);
    if (out !== s) {
      t.textContent = out;
      if (/^\s|\s$/.test(out)) t.setAttribute("xml:space", "preserve");
    }
  }
}

// ---------- টেইল-স্প্লিট + `*`-মার্কার ডিটেকশন (w:t-জয়েন্ট টেক্সট-স্পেস) ----------

/** প্যারার w:t-জয়েন্ট টেক্সট (oMath বাদ — splitParaAtOffset-এর স্পেসের সাথে সামঞ্জস্যপূর্ণ) */
function paraStreamText(p: Element): string {
  const els: Element[] = [];
  collectTsLocal(p, els);
  return els.map((t) => t.textContent ?? "").join("");
}

/** গ্লুড (স্পেস-ছাড়া) অবস্থায় শুধু নির্দিষ্ট উত্তর-টোকেনই বিশ্বস্ত — "wU"-জাতীয়
 * বিজয়-শব্দ-প্রত্যয় ভুল করে উত্তর হয়ে যাওয়া আটকায় ("…wbDwU K" রক্ষা) */
const TAIL_GLUE_OK_RE = /^(?:Dt|DË|D:|Cvw|উঃ|উত্তর|উওর|Ans|Answer)/;

/**
 * অপশন-প্যারার শেষে গ্লুড উত্তর — "…Dt K" / "…DËit M" / "…উঃ খ" / "…Ans: C" /
 * "…D: L + N" (docx-xml-এর ANSWER_TAIL_RE reuse — $-অ্যাঙ্করড, লেটার-গ্রুপসহ)।
 * রিটার্ন: টেইল-শুরুর অফসেট (টোকেনের শুরু)।
 */
function findTailAnswer(text: string): number | null {
  const m = ANSWER_TAIL_RE.exec(text);
  if (!m) return null;
  const prev = m.index > 0 ? text[m.index - 1] : "";
  if (prev && !/\s/.test(prev) && !TAIL_GLUE_OK_RE.test(m[0])) return null;
  return m.index;
}

/**
 * অপশন-প্যারার `*`-উত্তর-মার্কার (B-টাইমার ফরম্যাট) — লেবেলের আগে ("*C. টেক্সট",
 * "*A.B.") বা সঠিক অপশনের টেক্সটের পরে ("টেক্সট*", "টেক্সট*D.")।
 * রিটার্ন: উত্তর-অক্ষর (যেমন টাইপ করা, "A"/"c") + সরানোর স্প্যান (প্যারার সব `*`)।
 */
function findStarAnswer(text: string): {
  letter: string;
  spans: Array<{ start: number; end: number }>;
} | null {
  const at: number[] = [];
  for (let i = 0; i < text.length; i++) if (text[i] === "*") at.push(i);
  if (!at.length) return null;
  const labelAfter = /^([KLMNklmnকখগঘa-dA-D])\s*[.।):]/;
  const labelScan = /([KLMNklmnকখগঘa-dA-D])\s*[.।):]/g;
  let letter: string | null = null;
  for (const s of at) {
    // ① স্টারের ঠিক পরেই লেবেল ("*C. টেক্সট" / "*A.B.")
    const after = labelAfter.exec(text.slice(s + 1));
    if (after) {
      letter = after[1];
      break;
    }
    // ② স্টারের আগের নিকটতম লেবেল — ওই অপশনের টেক্সটের শেষেই স্টার
    const before = text.slice(0, s);
    labelScan.lastIndex = 0;
    let last: RegExpExecArray | null = null;
    let mm: RegExpExecArray | null;
    while ((mm = labelScan.exec(before))) last = mm;
    if (last) {
      letter = last[1];
      break;
    }
  }
  if (!letter) return null;
  return { letter, spans: at.map((s) => ({ start: s, end: s + 1 })) };
}

/**
 * প্রশ্ন-প্যারার শেষ-প্রান্তের রেফারেন্স-টোকেন — "(JU: 21-22)" / "[CU-A: 22-23]" /
 * চেইন "[X] [Y]"। reference.ts-এর findRefTokens reuse (টেইল-যাচাই + inner-ভ্যালিড
 * সেখানেই; bare-ফরম্যাট টোকেন বাদ — শুধু ব্র্যাকেট)।
 * রিটার্ন: টেইল-শুরুর অফসেট (হেড খালি হলে null — সেটা isRefOnlyPara-র কাজ)।
 */
function findTailRefStart(text: string): number | null {
  const toks = findRefTokens(text).filter((t) => /^[(\[]/.test(t.text));
  if (!toks.length) return null;
  const start = toks[0].start;
  const head = text.slice(0, start).trim();
  if (!head) return null;
  return start;
}

/**
 * পুরো প্যারাটাই রেফারেন্স-ব্র্যাকেট — "(JU: 21-22)" / "(নমুনা - 93)" / "[X] [Y]"।
 * অন্তত একটা গ্রুপে ডিজিট লাগবে ("(a)"-জাতীয় খালি অপশন ও "(কেন্দ্র)"-জাতীয়
 * শব্দ-ব্র্যাকেট রক্ষা)।
 */
function isRefOnlyPara(text: string): boolean {
  const stripped = text
    .replace(/\([^()]*\)/g, "")
    .replace(/\[[^\[\]]*\]/g, "")
    .trim();
  if (stripped) return false;
  const groups = text.match(/\([^()]*\)|\[[^\[\]]*\]/g) ?? [];
  return groups.some((g) => /[0-9০-৯]/.test(g));
}


// ---------- প্যারা-স্প্লিট সার্জারি ----------

/**
 * প্যারাকে জয়েন্ট w:t-টেক্সটের `offset`-এ দু-ভাগ করে — head (মূল el-ই, বাকি লেখা) +
 * tail (নতুন <w:p>; pPr ক্লোনসহ — numPr বাদ, রান-rPr ক্লোন)। রান-বাউন্ডারি ও
 * মাঝ-রান (w:t ভাঙা) দুটোই সামলায়; oMath/ছবি হারায় না (অফসেটের পরেরটা tail-এ যায়)।
 * রিটার্ন: tail প্যারা — অফসেট বাইরে/টেইল খালি হলে null (মূল el অপরিবর্তিত থাকে)।
 */
function splitParaAtOffset(p: Element, offset: number): Element | null {
  if (offset <= 0) return null;
  const doc = p.ownerDocument;
  if (!doc) return null;
  const stream: Element[] = [];
  collectTsLocal(p, stream);
  let total = 0;
  for (const t of stream) total += (t.textContent ?? "").length;
  if (offset >= total) return null;
  const rest = stream
    .map((t) => t.textContent ?? "")
    .join("")
    .slice(offset);
  if (!rest.trim()) return null;

  const tail = doc.createElementNS(W_NS, "w:p");
  const srcPPr = Array.from(p.children).find((c) => c.localName === "pPr") ?? null;
  if (srcPPr) {
    const pPr = srcPPr.cloneNode(true) as Element;
    // লিস্ট-নাম্বারিং থাকলে বাদ — টেইল-প্যারা নিজের নম্বর পেয়ে বসবে না
    const numPr = pPr.getElementsByTagNameNS(W_NS, "numPr")[0];
    if (numPr?.parentNode) numPr.parentNode.removeChild(numPr);
    tail.appendChild(pPr);
  }

  let pos = 0;
  for (const child of Array.from(p.childNodes)) {
    if (child.nodeType !== 1) continue; // টেক্সট/প্রসেসিং নোড — head-এই
    const el = child as Element;
    if (el.localName === "pPr") continue; // head-এই (tail-এ ক্লোন হয়ে গেছে)
    const ts: Element[] = [];
    if (el.localName === "t") ts.push(el);
    else collectTsLocal(el, ts);
    const len = ts.reduce((a, t) => a + (t.textContent ?? "").length, 0);
    const cStart = pos;
    const cEnd = pos + len;
    pos = cEnd;
    if (cEnd <= offset) continue; // পুরোটা head-এ
    if (cStart >= offset) {
      // পুরোটা tail-এ
      p.removeChild(el);
      tail.appendChild(el);
      continue;
    }
    // স্ট্র্যাডল — বাউন্ডারি এই চাইল্ডের ভিতরে
    if (el.localName === "r") splitRun(el, offset - cStart, tail);
    else {
      // কনটেইনার (hyperlink ইত্যাদি) — পুরোটা tail-এ (এজ-কেস; কনটেন্ট হারায় না)
      p.removeChild(el);
      tail.appendChild(el);
    }
  }
  return tail;
}

/** রান-ভিতরে `relOffset`-এ ভাগ — পরের অংশ (w:t-রেমাইন্ডার/ট্যাব) ক্লোন-rPr-সহ tail-রানে */
function splitRun(run: Element, relOffset: number, tail: Element): void {
  const doc = run.ownerDocument;
  if (!doc) return;
  const tailRun = doc.createElementNS(W_NS, "w:r");
  for (const c of Array.from(run.childNodes)) {
    if (c.nodeType === 1 && (c as Element).localName === "rPr") {
      tailRun.appendChild(c.cloneNode(true));
      break;
    }
  }
  let pos = 0;
  for (const c of Array.from(run.childNodes)) {
    if (c.nodeType === 1 && (c as Element).localName === "rPr") continue;
    if (c.nodeType === 1 && (c as Element).localName === "t") {
      const t = c as Element;
      const s = t.textContent ?? "";
      const sEnd = pos + s.length;
      if (sEnd <= relOffset) {
        pos = sEnd;
        continue; // head-এই
      }
      if (pos >= relOffset) {
        // পুরোটা tail-এ
        run.removeChild(t);
        tailRun.appendChild(t);
        pos = sEnd;
        continue;
      }
      // স্ট্র্যাডল — w:t দু-ভাগ
      const cut = relOffset - pos;
      t.textContent = s.slice(0, cut);
      if (/^\s|\s$/.test(t.textContent)) t.setAttribute("xml:space", "preserve");
      const tt = doc.createElementNS(W_NS, "w:t");
      tt.setAttribute("xml:space", "preserve");
      tt.textContent = s.slice(cut);
      tailRun.appendChild(tt);
      pos = sEnd;
      continue;
    }
    // শূন্য-প্রস্থ (w:tab/w:br/w:drawing/...) — বাউন্ডারির পরে হলে tail-এ
    if (pos >= relOffset) {
      run.removeChild(c);
      tailRun.appendChild(c);
    }
  }
  if (tailRun.childNodes.length) tail.appendChild(tailRun);
}

/**
 * `*`-উত্তরের জন্য নতুন উত্তর-প্যারা ("Dt X") — ফন্ট/বিন্যাস সোর্স অপশন-প্যারা থেকে
 * ক্লোন (Bijoy ফাইলে SutonnyMJ-ই থাকে, তাই "Dt X" ওই ফন্টেই "উঃ ক" দেখায়)।
 */
function makeStarAnswerPara(doc: Document, srcPara: Element, letter: string): Element {
  const p = doc.createElementNS(W_NS, "w:p");
  const srcPPr = Array.from(srcPara.children).find((c) => c.localName === "pPr") ?? null;
  if (srcPPr) {
    const pPr = srcPPr.cloneNode(true) as Element;
    const numPr = pPr.getElementsByTagNameNS(W_NS, "numPr")[0];
    if (numPr?.parentNode) numPr.parentNode.removeChild(numPr);
    p.appendChild(pPr);
  }
  const r = doc.createElementNS(W_NS, "w:r");
  const firstRun = srcPara.getElementsByTagNameNS(W_NS, "r")[0] ?? null;
  const srcRPr = firstRun
    ? Array.from(firstRun.children).find((c) => c.localName === "rPr") ?? null
    : null;
  if (srcRPr) r.appendChild(srcRPr.cloneNode(true));
  const t = doc.createElementNS(W_NS, "w:t");
  t.setAttribute("xml:space", "preserve");
  t.textContent = `Dt ${letter}`;
  r.appendChild(t);
  p.appendChild(r);
  return p;
}

// ---------- ওয়াটারমার্ক এক্সট্র্যাকশন ----------

export interface WatermarkInfo {
  text: string;
  color: string;
}

const XML_ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&apos;": "'",
  "&#39;": "'",
};

function decodeXmlEntities(s: string): string {
  return s.replace(/&(?:amp|lt|gt|quot|apos|#39);/g, (m) => XML_ENTITIES[m] ?? m);
}

/**
 * হেডার-পার্টের VML shape থেকে ওয়াটারমার্ক (v:textpath string) বের করা —
 * প্রিভিউতে ঘোরানো হালকা টেক্সট হিসেবে দেখানো হয়; ডাউনলোডে হেডার
 * byte-হুবহু কপি হয় বলে ওয়াটারমার্ক নিজেই অক্ষত থাকে।
 */
export async function extractWatermark(
  file: Blob | Uint8Array | ArrayBuffer
): Promise<WatermarkInfo | null> {
  try {
    const zip = await JSZip.loadAsync(file);
    const headerPaths: string[] = [];
    zip.forEach((path, entry) => {
      if (!entry.dir && /^word\/header\d*\.xml$/i.test(path)) headerPaths.push(path);
    });
    headerPaths.sort();
    for (const path of headerPaths) {
      const xml = await zip.file(path)!.async("string");
      const tp = /<v:textpath\b[^>]*\bstring="([^"]*)"/i.exec(xml);
      if (tp && tp[1].trim()) {
        const colorM = /fillcolor="([^"]*)"/i.exec(xml);
        return {
          text: decodeXmlEntities(tp[1].trim()),
          color: colorM?.[1] ?? "#808080",
        };
      }
    }
  } catch {
    // ওয়াটারমার্ক না পাওয়া গেলেও ক্ষতি নেই — null
  }
  return null;
}

// ---------- প্রিভিউ হেল্পার ----------

/** বাংলা পজিশন-নম্বর (১, ২, …) */
export function bnPos(n: number): string {
  return numberToDigits(n, "bn");
}
