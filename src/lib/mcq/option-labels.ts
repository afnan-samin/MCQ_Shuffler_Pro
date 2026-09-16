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
// এনকোডিং-নিয়ম: Bijoy (SutonnyMJ জাতীয়)-ফন্ট রানে Bangla-লেবেল (কখগঘ)
// Bijoy-ASCII-তে (KLMN) বসে — Unicode ক SutonnyMJ-তে গার্বেজ হতো।
// ============================================================

import { LEGACY_BIJOY_FONT_VALUE_RE } from "./font-remap";

const W_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";

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

/** প্রতিটা স্টাইলের ৪-অপশন সিকোয়েন্স (ক্রম: ক/খ/গ/ঘ ↔ K/L/M/N ↔ a/b/c/d ↔ 0..3) */
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

/** সোর্স-লেবেল অক্ষর → সিকোয়েন্স-ইনডেক্স (0-3)। K/L/M/N = Bijoy-ফাইলে টাইপ
 * করা ক/খ/গ/ঘ (Physics/Chemistry/Botany ফরম্যাটের প্রধান লেবেল) */
const SOURCE_IDX: Record<string, number> = {
  "ক": 0,
  "খ": 1,
  "গ": 2,
  "ঘ": 3,
  K: 0,
  L: 1,
  M: 2,
  N: 3,
  k: 0,
  l: 1,
  m: 2,
  n: 3,
  a: 0,
  b: 1,
  c: 2,
  d: 3,
};

/**
 * অপশন-লেবেল টোকেন — পাঁচ রূপ:
 *  ① paren   "(ক)" "(a)" "(K)"   ② bracket "[ক]" "[a]"
 *  ③ বাংলা/বিজয় "ক." "খ।" "গ)" "K." "N)"  ④ ল্যাটিন "a." "B)" "d)"
 *  ⑤ সেপারেটর-ছাড়া সারি-শুরু ("A ivB" — ডট-টাইপো; শুধু প্যারা-শুরু/ট্যাবের পরে)
 * paren/bracket আগে — নাহলে "(ক)"-এর ভিতরের "ক)" bare রূপে ধরা পড়ত।
 */
const OPTION_TOK_RE =
  /\(\s*([কখগঘK-Nk-nA-Da-d])\s*\)|\[\s*([কখগঘK-Nk-nA-Da-d])\s*\]|([কখগঘK-Nk-n])\s*([.।):])|([A-Da-d])\s*([.):])|(?:^|\t) ?([KLMNklmnকখগঘa-dA-D]) (?= ?\S)/gm;

/** Bangla-লেবেলের Bijoy-ASCII রূপ (SutonnyMJ-ফন্টে ক খ গ ঘ হিসেবে দেখায়) */
const BIJOY_LABEL: Record<string, string> = { "ক": "K", "খ": "L", "গ": "M", "ঘ": "N" };

interface LabelSeg {
  /** w:t-জয়েন্ট স্পেসে শুরু/শেষ */
  jStart: number;
  jEnd: number;
  run: Element | null;
  /** রানের ফন্ট (rFonts ascii/hAnsi; না থাকলে "") */
  font: string;
}

/** রানের ফন্ট-নাম (rFonts ascii → hAnsi) */
function runFontOf(run: Element | null): string {
  if (!run) return "";
  const rfs = run.getElementsByTagNameNS(W_NS, "rFonts");
  if (!rfs.length) return "";
  const rf = rfs[0];
  return rf.getAttributeNS(W_NS, "ascii") || rf.getAttributeNS(W_NS, "hAnsi") || rf.getAttribute("w:ascii") || "";
}

/**
 * options-কাইন্ড প্যারা (cloneNode-করা এলিমেন্ট) রিলেবেল করে —
 * রিটার্ন: বদলে যাওয়া লেবেল-সংখ্যা (টেস্ট/টেলিমেট্রির জন্য)।
 * লেবেল টোকেন একাধিক w:t-তে ভাগ হয়ে থাকলেও স্প্যান-এডিট ঠিক জায়গায় বসে।
 * ম্যাচিং ট্যাব-দৃশ্য টেক্সটে (w:tab-এলিমেন্ট → \t): সারির মাঝের লেবেল
 * ("\tB. …" — w:t-জয়েন্টে ট্যাব অদৃশ্য বলে "…gB." হয়ে বাউন্ডারি-চেকে
 * বাদ পড়ত) ধরা পড়ে; অফসেট w:t-জয়েন্ট স্পেসে ম্যাপ করে এডিট হয়।
 */
export function relabelOptionPara(p: Element, s: OptionLabelSettings): number {
  if (!s?.enabled) return 0;
  // ---- w:t-সেগমেন্ট + ট্যাব-পজিশন (ডকুমেন্ট-অর্ডার) ----
  const segs: LabelSeg[] = [];
  const tabbedParts: string[] = [];
  const tabs: number[] = [];
  let jointPos = 0;
  let tabbedPos = 0;
  const walk = (node: Element): void => {
    for (const child of Array.from(node.children)) {
      if (child.localName === "t" && child.namespaceURI === W_NS) {
        const text = child.textContent ?? "";
        let run: Element | null = null;
        let n: Node | null = child.parentNode;
        while (n && n.nodeType === 1) {
          if ((n as Element).localName === "r") {
            run = n as Element;
            break;
          }
          n = n.parentNode;
        }
        segs.push({ jStart: jointPos, jEnd: jointPos + text.length, run, font: runFontOf(run) });
        tabbedParts.push(text);
        jointPos += text.length;
        tabbedPos += text.length;
      } else if (
        child.localName === "tab" &&
        child.namespaceURI === W_NS &&
        node.localName === "r" &&
        child.attributes.length === 0
      ) {
        // রান-লেভেল খালি ট্যাব (pPr-এর ট্যাব-স্টপ নয় — ওতে অ্যাট্রিবিউট থাকে)
        tabs.push(tabbedPos);
        tabbedParts.push("\t");
        tabbedPos += 1;
      } else if (child.localName === "oMath" || child.localName === "oMathPara") {
        continue;
      } else if (child.children.length) {
        walk(child);
      }
    }
  };
  walk(p);
  const tabbed = tabbedParts.join("");
  if (!tabbed) return 0;
  const stream: Element[] = [];
  collectTs(p, stream);
  if (!stream.length) return 0;
  /** ট্যাব-স্পেস অফসেট → w:t-জয়েন্ট অফসেট (ট্যাব বাদে দুই স্ট্রিং অভিন্ন) */
  const toJoint = (x: number): number => {
    let c = 0;
    for (const t of tabs) {
      if (t < x) c++;
      else break;
    }
    return x - c;
  };
  const segAt = (js: number): LabelSeg | undefined =>
    segs.find((g) => g.jStart <= js && js < g.jEnd) ?? segs.find((g) => g.jEnd > js);

  const edits: Array<{ start: number; end: number; text: string }> = [];
  for (const m of tabbed.matchAll(OPTION_TOK_RE)) {
    const letter = m[1] ?? m[2] ?? m[3] ?? m[5] ?? m[7];
    if (!letter) continue;
    const isDotless = m[7] !== undefined;
    let spanStart = m.index;
    let spanEnd = m.index + m[0].length;
    if (isDotless) {
      // শুধু অক্ষরটুকু (m[0] = প্রিফিক্স-ট্যাব/স্পেস + অক্ষর + স্পেস;
      // অক্ষর শেষ থেকে ২য়: শেষে স্পেস, তার আগে ১-অক্ষর লেবেল)
      spanStart = m.index + m[0].length - 1 - letter.length;
      spanEnd = spanStart + letter.length;
    } else if (m[3] !== undefined || m[5] !== undefined) {
      // বাউন্ডারি-চেক (ট্যাব-দৃশ্য): bare লেবেলের আগে শুধু লাইন-শুরু/
      // হোয়াইটস্পেস থাকতে পারে — শব্দের ভিতরের অক্ষর ("Md."-এর d,
      // "U.S.A."-এর A) লেবেল নয়
      const prev = spanStart > 0 ? tabbed[spanStart - 1] : "";
      if (prev && !/\s/.test(prev)) continue;
    }
    const idx = SOURCE_IDX[letter.toLowerCase()];
    if (idx === undefined) continue;
    let outLabel = OPTION_LABEL_SEQ[s.style][idx];
    // Bijoy-ফন্ট রানে Bangla-লেবেল Bijoy-ASCII-তে — Unicode ক SutonnyMJ-তে গার্বেজ হতো
    if (s.style === "ka") {
      const seg = segAt(toJoint(spanStart));
      if (seg && LEGACY_BIJOY_FONT_VALUE_RE.test(seg.font)) {
        outLabel = BIJOY_LABEL[outLabel] ?? outLabel;
      }
    }
    edits.push({
      start: toJoint(spanStart),
      end: toJoint(spanEnd),
      text: `${outLabel}${s.separator}`,
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