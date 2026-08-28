// ============================================================
// MCQ Parser — প্রশ্ন শনাক্তকরণ ও সিরিয়াল ডিটেকশন
// বাংলা (১২৩ / ০-৯) এবং English (1,2,3) উভয় নম্বরিং সাপোর্ট করে
// ============================================================

export interface McqQuestion {
  /** অরিজিনাল ডকুমেন্ট অর্ডারে ইউনিক আইডি (0-based) */
  id: number;
  /** ডিটেক্ট হওয়া নম্বর (১ → 1) */
  originalNumber: number;
  /** নম্বরের স্ক্রিপ্ট: বাংলা নাকি ইংরেজি */
  numberScript: "bn" | "en";
  /** লাইনের শুরুর ঠিক সেই raw টোকেন (অটো-ফিক্সে রিপ্লেস করতে ব্যবহৃত) */
  rawPrefix: string;
  /** সেপারেটর চিহ্ন (".", ")", ":", "।" বা "") */
  separator: string;
  /** প্রশ্নের সব লাইন (প্রথম লাইন + অপশন + কন্টিনিউয়েশন) */
  lines: string[];
  /** ডিটেক্ট হওয়া অপশন লাইন (ক/খ/গ/ঘ, a/b/c/d) */
  options: string[];
}

export interface SerialIssue {
  /** কোন প্রশ্নে (0-based ইনডেক্স) সমস্যা */
  index: number;
  expected: number;
  found: number;
}

export interface SerialReport {
  status: "ok" | "broken";
  /** প্রথম প্রশ্নের নম্বর */
  startAt: number;
  /** 1 থেকে শুরু কিনা */
  startsAtOne: boolean;
  issues: SerialIssue[];
}

export interface ParseOutput {
  questions: McqQuestion[];
  /** প্রথম প্রশ্নের আগের লাইনগুলো (হেডার/শিরোনাম) */
  preamble: string[];
  serial: SerialReport | null;
  /** নম্বর স্ক্রিপ্ট: "bn" | "en" | "mixed" | null */
  numberScript: "bn" | "en" | "mixed" | null;
}

// ---------- সংখ্যা রূপান্তর ----------

const BN_DIGITS = "০১২৩৪৫৬৭৮৯";

export function bnToNumber(s: string): number | null {
  if (/^[0-9]+$/.test(s)) return parseInt(s, 10);
  if (/^[০-৯]+$/.test(s)) {
    let n = 0;
    for (const ch of s) {
      const d = BN_DIGITS.indexOf(ch);
      if (d < 0) return null;
      n = n * 10 + d;
    }
    return n;
  }
  return null;
}

export function numberToBn(n: number): string {
  return String(n)
    .split("")
    .map((ch) => BN_DIGITS[Number(ch)] ?? ch)
    .join("");
}

export function formatNumberByScript(n: number, script: "bn" | "en"): string {
  return script === "bn" ? numberToBn(n) : String(n);
}

// ---------- রেজেক্স ----------

/** প্রশ্নের শুরু: নম্বর + (ঐচ্ছিক সেপারেটর) */
const Q_RE = /^\s*((?:\d{1,4}|[০-৯]{1,4}))\s*([.।):–\-—]?)\s*/;

/** অপশন (প্যারেন ফর্ম): (ক) (a) [খ] */
const OPT_PAREN_RE = /^[\(\[]\s*([কখগঘঙ]|[a-dA-D])\s*[\)\]]\s*/;

/** অপশন (সেপারেটর ফর্ম): ক. / খ) / a. / b) */
const OPT_SEP_RE = /^(?:([কখগঘঙ])\s*[.।:)\-–—]\s*|([a-dA-D])\s*[.):\-–—]\s+)/;

// ---------- ক্লাসিফাইকেশন হেল্পার ----------

type LineKind = "question" | "option" | "continuation";

function classifyLine(
  line: string,
  hasCurrent: boolean,
  lastNum: number | null
): { kind: LineKind; match?: RegExpExecArray } {
  if (!line.trim()) return { kind: "continuation" };

  // অপশন চেক (চলমান প্রশ্ন থাকলে)
  if (hasCurrent && (OPT_PAREN_RE.test(line) || OPT_SEP_RE.test(line))) {
    return { kind: "option" };
  }

  const m = Q_RE.exec(line);
  if (!m) return { kind: "continuation" };

  const num = bnToNumber(m[1]);
  if (num == null || num <= 0 || num > 2000) return { kind: "continuation" };

  const hasSep = m[2] !== "";
  const textAfter = line.slice(m[0].length);
  if (!textAfter.trim()) return { kind: "continuation" };

  if (hasSep) return { kind: "question", match: m };

  // সেপারেটর ছাড়া (শুধু স্পেস) — চেইন রুল:
  if (lastNum == null) {
    // প্রথম প্রশ্ন — বড় সংখ্যা (যেমন ২০২৪ সাল) হলে কন্টিনিউয়েশন ধরব
    return num <= 50 ? { kind: "question", match: m } : { kind: "continuation" };
  }
  if (num <= lastNum + 5 && num >= lastNum - 2) return { kind: "question", match: m };
  if (num === 1) return { kind: "question", match: m }; // নতুন সেকশন
  return { kind: "continuation" };
}

// ---------- মেইন পার্সার ----------

export function parseMcq(text: string): ParseOutput {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");

  const questions: McqQuestion[] = [];
  const preamble: string[] = [];
  let current: McqQuestion | null = null;

  for (const rawLine of lines) {
    const line = rawLine.replace(/\t/g, "  ").trimEnd();
    if (!line.trim()) continue; // খালি লাইন স্কিপ

    const { kind, match } = classifyLine(
      line,
      current !== null,
      questions.length ? questions[questions.length - 1].originalNumber : null
    );

    if (kind === "question" && match) {
      const num = bnToNumber(match[1]) ?? 0;
      current = {
        id: questions.length,
        originalNumber: num,
        numberScript: /[০-৯]/.test(match[1]) ? "bn" : "en",
        rawPrefix: line.slice(0, match[0].length),
        separator: match[2],
        lines: [line],
        options: [],
      };
      questions.push(current);
    } else if (kind === "option" && current) {
      current.options.push(line);
      current.lines.push(line);
    } else if (current) {
      current.lines.push(line);
    } else {
      preamble.push(line);
    }
  }

  // সিরিয়াল অ্যানালাইসিস
  const serial = questions.length ? analyzeSerial(questions) : null;

  // নম্বর স্ক্রিপ্ট নির্ধারণ
  let numberScript: "bn" | "en" | "mixed" | null = null;
  if (questions.length) {
    const hasBn = questions.some((q) => q.numberScript === "bn");
    const hasEn = questions.some((q) => q.numberScript === "en");
    numberScript = hasBn && hasEn ? "mixed" : hasBn ? "bn" : "en";
  }

  return { questions, preamble, serial, numberScript };
}

// ---------- সিরিয়াল অ্যানালাইসিস ----------

export function analyzeSerial(questions: McqQuestion[]): SerialReport {
  const issues: SerialIssue[] = [];
  const startAt = questions[0]?.originalNumber ?? 0;

  for (let i = 1; i < questions.length; i++) {
    const expected = questions[i - 1].originalNumber + 1;
    const found = questions[i].originalNumber;
    if (found !== expected) {
      issues.push({ index: i, expected, found });
      if (issues.length >= 30) break;
    }
  }

  return {
    status: issues.length ? "broken" : "ok",
    startAt,
    startsAtOne: startAt === 1,
    issues,
  };
}

// ---------- অটো-ফিক্স (অটো নম্বরিং) ----------

/**
 * পুরো টেক্সট রি-পার্স করে প্রশ্নগুলোকে 1..N (বা startFrom) দিয়ে
 * পুনঃক্রমিক নম্বর দেয়। নম্বরের স্ক্রিপ্ট প্রথম প্রশ্নের স্ক্রিপ্ট অনুসরণ করে।
 */
export function autoFixNumbering(text: string, startFrom = 1): string {
  const { questions, preamble } = parseMcq(text);
  if (!questions.length) return text;

  const script: "bn" | "en" = questions[0].numberScript === "bn" ? "bn" : "en";
  const out: string[] = [...preamble];

  questions.forEach((q, i) => {
    const newNum = startFrom + i;
    const firstLine = q.lines[0];
    const rest = firstLine.slice(q.rawPrefix.length);
    const token = formatNumberByScript(newNum, script) + (q.separator || ".") + " ";
    out.push(token + rest);
    for (let j = 1; j < q.lines.length; j++) out.push(q.lines[j]);
    out.push(""); // প্রশ্নের মাঝে ফাঁকা লাইন (রিডেবিলিটি)
  });

  return out.join("\n").trimEnd() + "\n";
}

// ---------- ডিটেকশন স্ট্যাটস ----------

export interface DetectionStats {
  total: number;
  withOptions: number;
  numberScript: "bn" | "en" | "mixed" | null;
  serial: SerialReport | null;
  optionsDetected: boolean;
}

export function getStats(parsed: ParseOutput): DetectionStats {
  const withOptions = parsed.questions.filter((q) => q.options.length >= 2).length;
  return {
    total: parsed.questions.length,
    withOptions,
    numberScript: parsed.numberScript,
    serial: parsed.serial,
    optionsDetected: parsed.questions.some((q) => q.options.length > 0),
  };
}
