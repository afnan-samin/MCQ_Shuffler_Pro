// ============================================================
// File Pipeline — সব মোডের এক লোডার: ভ্যালিডেশন → docx-পড়া → ইঞ্জিন-স্টেপ
// ============================================================
// আগে page.tsx-এর ৩টা লোডারে (শাফল সিঙ্গেল/মাল্টি, সিরিয়াল, রিডাউনলোড)
// একই ফাইল-পড়া/ভ্যালিডেশন লুপ কপি হয়ে ছিল। এখন এক জায়গায়:
//   ① সাইজ-গার্ড (MAX_FILE_BYTES — ব্রাউজার ফ্রিজ/ক্র্যাশ আগেই আটকায়)
//   ② এক্সটেনশন-গার্ড (.docx — UI-ফিল্টারের পরেও ডিফেন্স)
//   ③ পড়া: loadDocxXml (আগের হুবহু কোড — JSZip → word/document.xml)
//   ④ প্রতি-মোডের ইঞ্জিন-স্টেপ: opts.parse কলব্যাক
// ফল: items/failures/tooBig/notDocx — টোস্ট/স্টেট কলারেই (আগের আচরণ হুবহু)।
// ============================================================

import JSZip from "jszip";
import { loadDocxXml, parseDocxXml, zipMetaToProgress, type DocxParseResult, type ZipProgress } from "./docx-xml";
import {
  analyzeColorDocx,
  stripShadedParasXml,
  stripNonMcqLinesXml,
  type BlockedLine,
  type ColorAnalysis,
} from "./color-serial";
import { MAX_FILE_BYTES } from "./limits";

// মেসেজটাও MAX_FILE_BYTES-থেকে ডেরাইভ — লিমিট বদলালে টেক্সট-নস্ট আর বদলায় না
export const FILE_TOO_BIG_MSG = `File is too large (${MAX_FILE_BYTES / 1_000_000}MB+ not supported)`;
export const DOCX_EXT_RE = /\.docx$/i;

/**
 * LIGHT .docx validity check — loads the zip and verifies that
 * `word/document.xml` exists. No XML parsing, no rendering (fast enough
 * to run at staging time, before files are accepted into the app).
 * A renamed .zip/.txt/.pdf with a .docx extension fails here.
 */
export async function isValidDocxZip(file: Blob, onProgress?: ZipProgress): Promise<boolean> {
  try {
    const zip = await JSZip.loadAsync(file);
    return !!zip.file("word/document.xml");
  } catch {
    return false;
  }
}

/** ".docx"-এক্সটেনশন কেটে base-নাম (ডাউনলোড-ফাইলনেমের ভিত্তি) */
export const docxBaseName = (name: string): string => name.replace(/\.docx$/i, "");

export interface PipelineItem<T> {
  file: File;
  baseName: string;
  /** word/document.xml-এর কাঁচা টেক্সট (অরিজিনাল, প্রিজার্ভড) */
  xml: string;
  /** ইঞ্জিন-স্টেপের ফল (opts.parse-এর রিটার্ন) */
  value: T;
}

export interface PipelineFailure {
  file: File;
  name: string;
  message: string;
}

export interface PipelineRun<T> {
  items: PipelineItem<T>[];
  failures: PipelineFailure[];
  /** সাইজ-গার্ডে বাদ পড়া (কলার FILE_TOO_BIG_MSG টোস্ট দেখায়) */
  tooBig: File[];
  /** এক্সটেনশন-গার্ডে বাদ পড়া */
  notDocx: File[];
}

/** প্রসেস-ওভারলের জন্য প্রতি-ফেজ প্রগ্রেস রিপোর্ট */
export interface PipelineProgress {
  stage: string;
  /** 0..1 determinate, null = indeterminate */
  pct: number | null;
  fileNo: number;
  fileTotal: number;
  name: string;
}
export type PipelineReporter = (p: PipelineProgress) => void;
/** ডাউনলোড-পথের (repack/merge/zip) ভিতরের determinate প্রগ্রেস — পাইপলাইন-রিপোর্টে বাঁধা */
export type DownloadProgress = (frac: number) => void;

/**
 * একাধিক ফাইল → ভ্যালিডেশন + পড়া + পার্স। প্রতিটা ফাইল স্বাধীন —
 * একটার ব্যর্থতা বাকিদের আটকায় না (আগের লোডারগুলোর হুবহু আচরণ)।
 * report/yieldToUI দিলে ফেজ-মাঝে UI-থ্রেড শ্বাস নেয় — বড় ফাইলে
 * ওভারলে/প্রগ্রেস-বার রিপেইন্ট হয়ে যায় (পেজ "hang"-এর চেহারা নেয় না)।
 */
export async function runFilePipeline<T>(
  files: File[],
  opts: {
    /** প্রতি-মোডের ইঞ্জিন-স্টেপ — loadDocxXml-এর পরে চলে */
    parse: (xml: string, file: File) => Promise<T> | T;
    /** ডিফল্ট MAX_FILE_BYTES */
    maxBytes?: number;
    /** প্রতি-ফেজ প্রগ্রেস রিপোর্ট — কলার ProcessOverlay চালায় */
    report?: PipelineReporter;
    /** প্রতিটা ফেজের মাঝে UI-থ্রেডে শ্বাস-নেওয়ার জায়গা */
    yieldToUI?: () => Promise<void>;
  },
): Promise<PipelineRun<T>> {
  const maxBytes = opts.maxBytes ?? MAX_FILE_BYTES;
  const items: PipelineItem<T>[] = [];
  const failures: PipelineFailure[] = [];
  const tooBig: File[] = [];
  const notDocx: File[] = [];
  const hasUi = opts.report !== undefined || opts.yieldToUI !== undefined;
  const rep = (stage: string, pct: number | null, f: File, i: number, n: number) => {
    if (opts.report) opts.report({ stage, pct, fileNo: i + 1, fileTotal: n, name: f.name });
  };
  const step = async () => {
    if (opts.yieldToUI) await opts.yieldToUI();
  };
  // রিয়েল % — i-তম ফাইলের রিড-ফেজ হলো সামগ্রিক (i + frac) / n
  const fileFrac = (i: number, n: number, frac: number): number =>
    Math.min(1, Math.max(0, (i + frac) / Math.max(1, n)));
  const n = files.length;
  for (let i = 0; i < n; i++) {
    const f = files[i];
    if (hasUi) {
      rep(`Reading ${f.name}...`, n > 0 ? i / n : null, f, i, n);
      await step();
    }
    if (f.size > maxBytes) {
      tooBig.push(f);
      continue;
    }
    if (!DOCX_EXT_RE.test(f.name)) {
      notDocx.push(f);
      continue;
    }
    try {
      // JSZip unzip-এর ভিতরের % → সামগ্রিক determinate-এ ম্যাপ করে রিপোর্ট
      const xml = await loadDocxXml(f, hasUi ? (frac) => rep(`Reading ${f.name}...`, fileFrac(i, n, frac * 0.7), f, i, n) : undefined);
      if (hasUi) {
        rep(`Parsing ${f.name}...`, fileFrac(i, n, 0.75), f, i, n);
        await step();
      }
      const value = await opts.parse(xml, f);
      if (hasUi) {
        rep(`Preparing ${f.name}...`, fileFrac(i, n, 0.95), f, i, n);
        await step();
      }
      items.push({ file: f, baseName: docxBaseName(f.name), xml, value });
      if (hasUi) rep(`Reading ${f.name}...`, fileFrac(i, n, 1), f, i, n);
    } catch (e) {
      failures.push({ file: f, name: f.name, message: e instanceof Error ? e.message : String(e) });
    }
  }
  return { items, failures, tooBig, notDocx };
}

// ---------- শাফল-মোডের শেয়ার্ড প্রিপেয়ার (সিঙ্গেল + মাল্টি দুই পথেই ব্যবহৃত) ----------

export interface ShufflePrepared {
  /** হেডার/নন-MCQ স্ট্রিপ-করা xml — শাফলের পুল এখান থেকেই আসে */
  xml: string;
  /** রঙ-বিশ্লেষণ — রঙ-স্ট্রাকচার্ড ফাইলে হেডার হাত-অফে পুনঃব্যবহৃত হয় */
  colorAn: ColorAnalysis | null;
  /** বাদ পড়া রঙ-হেডার সংখ্যা (0 = রঙ-ফাইল না) */
  headersStripped: number;
  /** বাদ পড়া সব লাইন (রঙ-হেডার + টেক্সট-প্যাটার্নে ধরা নন-MCQ) */
  blocked: BlockedLine[];
  parse: DocxParseResult;
}

/**
 * শাফল মোডের xml-প্রিপেয়ার — ইউজারের নিয়ম: হেডার থাকলে হেডার বাদ দিয়ে সব
 * প্রশ্ন এক সিরিয়ালে শাফল। রঙ-হেডার (shaded) + নন-MCQ লাইন দুই ধাপে বাদ,
 * তারপর পার্স — সিঙ্গেল-ডক (handleDocxFile) ও মাল্টি-ফাইল দুই পথেই হুবহু এটা।
 */
export function prepareShuffleXml(originalXml: string): ShufflePrepared {
  let colorAn: ColorAnalysis | null = null;
  try {
    colorAn = analyzeColorDocx(originalXml);
  } catch {} // রঙ-বিশ্লেষণ ব্যর্থ হলেও পার্স চলবে — রঙ-ফাইল না ধরে
  let xml = originalXml;
  let headersStripped = 0;
  const blocked: BlockedLine[] = [];
  if (colorAn && colorAn.colors.length > 0) {
    const st = stripShadedParasXml(originalXml);
    xml = st.xml;
    headersStripped = st.removed;
    for (const t of st.texts) blocked.push({ text: t, reason: "color" });
  }
  const st2 = stripNonMcqLinesXml(xml);
  xml = st2.xml;
  blocked.push(...st2.removed);
  return {
    xml,
    // রঙ-আছে না এমন ফাইলে UI-তে null-ই দেখায় (আগের আচরণ) — তাই নরমালাইজ
    colorAn: colorAn && colorAn.colors.length > 0 ? colorAn : null,
    headersStripped,
    blocked,
    parse: parseDocxXml(xml),
  };
}
