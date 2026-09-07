// ============================================================
// Option Labels — MCQ অপশন-লেবেল কাস্টমাইজার (Redownload মোড)
// ============================================================
// আপলোড করা ফাইলের options-কাইন্ড প্যারাগুলোর লেবেল টোকেন ধরে ধরে
// ব্যবহারকারীর বেছে নেওয়া স্টাইলে বদলায়:
//   লেবেল-স্টাইল: A B C D / a b c d / i ii iii iv / ক খ গ ঘ
//   সেপারেটর:    "." (ডট) / ")" (ব্র্যাকেট)
//   উদাহরণ:      "ক. পানি" + (A, ".") → "A. পানি"
//                "(ক) পানি" + (ক, ")") → "ক) পানি"
//
// শুধু লেবেল টোকেন বদলায় — বাকি সব টেক্সট/ফরম্যাটিং/রান-কাঠামো অক্ষত
// (redownload.ts-এর span-edit মেকানিজমের মতই — লেবেল একাধিক w:t-রানে
// ভাগ হয়ে থাকলেও সঠিক জায়গায় বসে)।
//
// শনাক্তযোগ্য সোর্স-লেবেল: "ক." "খ।" "গ)" "(ক)" "[a]" "a)" "B." ইত্যাদি —
// উত্তর-মালা/সিরিয়াল প্যারা ধরা হয় না (শুধু options-কাইন্ড প্যারায় চলে)।
// খাঁটি-শব্দের অক্ষর (যেমন "Md."-এর d) বাউন্ডারি-চেকে বাদ পড়ে।
// ============================================================

/** টার্গেট লেবেল-স্টাইল */
export type OptionLabelStyle = "A" | "a" | "i" | "ka";

/** টার্গেট সেপারেটর */
export type OptionLabelSeparator = "." | ")";

export interface OptionLabelSettings {
  /** false হলে আউটপুট অপরিবর্তিত (আপলোড করা ফাইলের লেবেলই থাকে) */
  enabled: boolean;
  style: OptionLabelStyle;
  separator: OptionLabelSeparator;
}

export const DEFAULT_OPTION_LABEL_SETTINGS: OptionLabelSettings = {
  enabled: false,
  style: "A",
  separator: ".",
};

/** প্রতিটা স্টাইলের ৪-অপশন সিকোয়েন্স (ক্রম: ক/খ/গ/ঘ ↔ a/b/c/d ↔ 0..3) */
export const OPTION_LABEL_SEQ: Record<OptionLabelStyle, readonly string[]> = {
  A: ["A", "B", "C", "D"],
  a: ["a", "b", "c", "d"],
  i: ["i", "ii", "iii", "iv"],
  ka: ["ক", "খ", "গ", "ঘ"],
};

/** UI-ড্রপডাউনের লেবেল */
export const OPTION_LABEL_STYLE_CHOICES: ReadonlyArray<{
  value: OptionLabelStyle;
  label: string;
}> = [
  { value: "A", label: "A  B  C  D" },
  { value: "a", label: "a  b  c  d" },
  { value: "i", label: "i  ii  iii  iv" },
  { value: "ka", label: "ক  খ  গ  ঘ" },
];

/** সোর্স-লেবেল অক্ষর → সিকোয়েন্স-ইনডেক্স (0-3) */
const SOURCE_IDX: Record<string, number> = {
  "ক": 0,
  "খ": 1,
  "গ": 2,
  "ঘ": 3,
  a: 0,
  b: 1,
  c: 2,
  d: 3,
};

/**
 * অপশন-লেবেল টোকেন — চার রূপ:
 *  ① paren   "(ক)" "(a)"      ② bracket "[ক]" "[a]"
 *  ③ বাংলা   "ক." "খ।" "গ)"   ④ ল্যাটিন "a." "B)" "d)"
 * paren/bracket আগে — নাহলে "(ক)"-এর ভিতরের "ক)" bare রূপে ধরা পড়ত।
 */
const OPTION_TOK_RE =
  /\(\s*([কখগঘA-Da-d])\s*\)|\[\s*([কখগঘA-Da-d])\s*\]|([কখগঘ])\s*([.।):])|([A-Da-d])\s*([.):])/g;

/**
 * options-কাইন্ড প্যারা (cloneNode-করা এলিমেন্ট) রিলেবেল করে —
 * রিটার্ন: বদলে যাওয়া লেবেল-সংখ্যা (টেস্ট/টেলিমেট্রির জন্য)।
 * লেবেল টোকেন একাধিক w:t-তে ভাগ হয়ে থাকলেও স্প্যান-এডিট ঠিক জায়গায় বসে।
 */
export function relabelOptionPara(p: Element, s: OptionLabelSettings): number {
  if (!s?.enabled) return 0;
  const stream: Element[] = [];
  collectTs(p, stream);
  if (!stream.length) return 0;
  const joined = stream.map((t) => t.textContent ?? "").join("");

  const edits: Array<{ start: number; end: number; text: string }> = [];
  for (const m of joined.matchAll(OPTION_TOK_RE)) {
    const letter = m[1] ?? m[2] ?? m[3] ?? m[5];
    if (!letter) continue;
    const bare = m[3] !== undefined || m[5] !== undefined;
    if (bare) {
      // বাউন্ডারি-চেক: bare লেবেলের আগে শুধু লাইন-শুরু/হোয়াইটস্পেস থাকতে পারে —
      // শব্দের ভিতরের অক্ষর ("Md."-এর d, "U.S.A."-এর A) লেবেল নয়
      const prev = m.index > 0 ? joined[m.index - 1] : "";
      if (prev && !/\s/.test(prev)) continue;
    }
    const idx = SOURCE_IDX[letter.toLowerCase()];
    if (idx === undefined) continue;
    edits.push({
      start: m.index,
      end: m.index + m[0].length,
      text: `${OPTION_LABEL_SEQ[s.style][idx]}${s.separator}`,
    });
  }
  if (!edits.length) return 0;
  replaceSpans(stream, edits);
  return edits.length;
}

/**
 * Persisted সেটিংস হাইড্রেশন-গার্ড — অজানা স্টাইল/সেপারেটর ড্রপ করে
 * ডিফল্টে ফেরায় (Radix Select খালি ভ্যালু রেন্ডার না করে)।
 */
export function sanitizeOptionLabelSettings(raw: unknown): OptionLabelSettings {
  const r = (raw ?? {}) as Partial<OptionLabelSettings>;
  const style =
    typeof r.style === "string" && r.style in OPTION_LABEL_SEQ
      ? (r.style as OptionLabelStyle)
      : DEFAULT_OPTION_LABEL_SETTINGS.style;
  const separator: OptionLabelSeparator =
    r.separator === ")" ? ")" : r.separator === "." ? "." : DEFAULT_OPTION_LABEL_SETTINGS.separator;
  return {
    enabled: typeof r.enabled === "boolean" ? r.enabled : DEFAULT_OPTION_LABEL_SETTINGS.enabled,
    style,
    separator,
  };
}

// ---------- টেক্সট-স্ট্রিম হেল্পার (redownload.ts-এর প্যাটার্ন অনুযায়ী) ----------

function collectTs(el: Element, out: Element[]): void {
  const walk = (node: Element) => {
    for (const child of Array.from(node.children)) {
      if (
        child.localName === "t" &&
        child.namespaceURI === "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
      ) {
        out.push(child);
      } else if (child.localName === "oMath" || child.localName === "oMathPara") {
        continue;
      } else if (child.children.length) {
        walk(child);
      }
    }
  };
  walk(el);
}

function replaceSpans(
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