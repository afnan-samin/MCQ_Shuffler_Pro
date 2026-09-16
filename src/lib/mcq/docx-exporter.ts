// ============================================================
// DOCX Exporter (faithful) — অরিজিনাল .docx-এর XML হুবহু রেখে
// শাফল্ড সেট-বাই-সেট নতুন .docx বানায়।
// ============================================================
// • প্রতিটি সেট আলাদা পেজে (page break)
// • সেটের পেজে ছোট English হেডার ("Set A") — কোনো Unicode নয়
// • রিনাম্বার ON হলে প্রতি সেটে প্রথম প্রশ্ন = ১, এরপর ২, ৩…
//   (ফাইলের নিজের ডিজিট-স্টাইলে); OFF হলে প্রশ্নের আসল নম্বরই থাকে
// • সিরিয়াল-ফিক্স এক্সপোর্ট: অরিজিনাল অর্ডারে ১..N নম্বর
// ============================================================

import {
  W_NS,
  renumberSerialPara,
  detectSerialPrefix,
  looksOptionLed,
  ANSWER_TAIL_RE,
  BEKKHA_LINE_RE,
  type DocxQuestion,
} from "./docx-xml";
import {
  buildRefEditedMap,
  type RefMode,
} from "./reference";
import type { FontSettings } from "./font-remap";
import { repackDocxRemapped, DOCX_MIME } from "./repack-docx";
import type { ZipProgress } from "./docx-xml";

/** ডকুমেন্টের প্রথম ফন্ট-অ্যাট্রিবিউট সেট (সেট-হেডারে ডকুমেন্টের নিজের ফন্ট বসাতে) */
interface BodyFontAttrs {
  ascii: string;
  hAnsi: string;
  cs: string;
  eastAsia: string;
}

export interface ShuffleExportOptions {
  renumber: boolean;
  includeSetHeader: boolean;
  /** রেফারেন্স-ট্যাগ ([CU-A: 22-23] স্টাইল) কী হবে — ডিফল্ট "keep" (আগের আচরণ) */
  refMode?: RefMode;
}

/** সেটের English নাম — আউটপুটে কোনো Unicode না ঢোকে বলে "Set A" স্টাইল */
export function englishSetName(i: number): string {
  const n = i + 1;
  if (n <= 26) return `Set ${String.fromCharCode(64 + n)}`;
  const cycle = Math.ceil(n / 26);
  return `Set ${String.fromCharCode(64 + ((n - 1) % 26) + 1)}${cycle > 1 ? cycle : ""}`;
}

function wEl(doc: Document, name: string): Element {
  return doc.createElementNS(W_NS, name);
}

/** body-children-এ পাওয়া প্রথম অর্থবহ w:rFonts-এর অ্যাট্রিবিউট — না পাওয়া গেলে null */
function firstBodyFont(kids: Element[]): BodyFontAttrs | null {
  for (const el of kids) {
    const fonts = el.getElementsByTagNameNS(W_NS, "rFonts");
    for (let i = 0; i < fonts.length; i++) {
      const f = fonts[i];
      const get = (a: string) => f.getAttributeNS(W_NS, a) || f.getAttribute(`w:${a}`) || "";
      const attrs: BodyFontAttrs = { ascii: get("ascii"), hAnsi: get("hAnsi"), cs: get("cs"), eastAsia: get("eastAsia") };
      if (attrs.ascii || attrs.hAnsi || attrs.cs || attrs.eastAsia) return attrs;
    }
  }
  return null;
}

/** ছোট সেট-হেডার: bold, centered — pure ASCII ("Set A"); সবসময় Latin ফন্টে
 * (SutonnyMJ-এ "Set A" বাংলা গিববেরিশ হয়ে যায় — তাই Latin ফন্ট বাধ্যতামূলক) */
function makeSetHeaderPara(doc: Document, name: string, _docFont?: BodyFontAttrs | null): Element {
  const p = wEl(doc, "w:p");
  const pPr = wEl(doc, "w:pPr");
  const spacing = wEl(doc, "w:spacing");
  spacing.setAttributeNS(W_NS, "w:after", "160");
  const jc = wEl(doc, "w:jc");
  jc.setAttributeNS(W_NS, "w:val", "center");
  pPr.appendChild(spacing);
  pPr.appendChild(jc);

  const r = wEl(doc, "w:r");
  const rPr = wEl(doc, "w:rPr");
  // সেট-হেডার সবসময় Latin ফন্টে — SutonnyMJ হলে "Set A" বাংলা গিববেরিশ হয়ে যায়
  const rFonts = wEl(doc, "w:rFonts");
  rFonts.setAttributeNS(W_NS, "w:ascii", "Arial");
  rFonts.setAttributeNS(W_NS, "w:hAnsi", "Arial");
  rFonts.setAttributeNS(W_NS, "w:cs", "Arial");
  rFonts.setAttributeNS(W_NS, "w:eastAsia", "Arial");
  rPr.appendChild(rFonts);
  rPr.appendChild(wEl(doc, "w:b"));
  rPr.appendChild(wEl(doc, "w:bCs"));
  const sz = wEl(doc, "w:sz");
  sz.setAttributeNS(W_NS, "w:val", "30");
  const szCs = wEl(doc, "w:szCs");
  szCs.setAttributeNS(W_NS, "w:val", "30");
  rPr.appendChild(sz);
  rPr.appendChild(szCs);

  const t = wEl(doc, "w:t");
  t.setAttribute("xml:space", "preserve");
  t.textContent = name;

  r.appendChild(rPr);
  r.appendChild(t);
  p.appendChild(pPr);
  p.appendChild(r);
  return p;
}

/** প্যারার সব w:t মিলিয়ে টেক্সট — খালি/স্পেস-মাত্র প্যারা আলাদা করতে লাগে */
function paraTextOfEl(el: Element): string {
  let s = "";
  const ts = el.getElementsByTagNameNS(W_NS, "t");
  for (let i = 0; i < ts.length; i++) s += ts[i].textContent ?? "";
  return s;
}

/**
 * প্যারা-টেক্সট আসল প্রশ্ন-কনটেন্ট কি না — টেক্সট-প্যাটার্ন-তালিকা নয়, গঠন দিয়ে:
 * সিরিয়াল-লাইন / অপশন-লেড লাইন / উত্তর-লাইন / ব্যাখ্যা-মার্কার — এই চার গঠনের
 * বাইরের সব কিছুই "নন-প্রশ্ন" (হেডার, প্রতিষ্ঠানের নাম, নির্দেশনামূলক লাইন)।
 * Phase 1.1: এগুলো প্রশ্নের সাথে শাফল হলে ভুল বিষয়ের প্রশ্নের গায়ে আটকে যায়।
 */
function isQuestionContentPara(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  if (detectSerialPrefix(t)) return true;
  if (looksOptionLed(t)) return true;
  if (ANSWER_TAIL_RE.test(t)) return true;
  if (BEKKHA_LINE_RE.test(t)) return true;
  return false;
}

function makePageBreakPara(doc: Document): Element {
  const p = wEl(doc, "w:p");
  const r = wEl(doc, "w:r");
  const br = wEl(doc, "w:br");
  br.setAttributeNS(W_NS, "w:type", "page");
  r.appendChild(br);
  p.appendChild(r);
  return p;
}

/**
 * অরিজিনাল document.xml থেকে শাফল্ড ভার্সনের XML বানায়।
 * ব্লক এলিমেন্ট cloneNode হয় — তাই tab/math/ফরম্যাটিং হুবহু থাকে।
 *
 * ফরম্যাট-প্রিজার্ভেশন (আপলোড করা ফাইলের লুক হুবহু): প্রশ্ন-ব্লকের বাইরের
 * কনটেন্টও থাকে —
 *   • প্রি-কনটেন্ট: প্রথম প্রশ্নের আগের সব (পরীক্ষার টাইটেল/প্রতিষ্ঠান/নির্দেশনা)
 *     — একবার, ডকুমেন্টের একদম উপরে
 *   • লিডিং-গ্যাপ: আগের প্রশ্নের শেষ থেকে এই প্রশ্নের শুরুর মাঝের প্যারা
 *     (সেকশন-হেডার/ফাঁকা-স্পেসিং) — প্রশ্নের সাথেই শাফল হয়
 *   • পোস্ট-কনটেন্ট: শেষ প্রশ্নের পরের সব (উত্তরমালা/সমাপ্তি-লাইন) — একবার,
 *     সব সেটের পরে
 * সেট-হেডার ("Set A") ডকুমেন্টের নিজের ফন্ট-ফ্যামিলিতে বসে — ফন্ট-মিসম্যাচ নেই।
 */
export function buildShuffledXml(
  xml: string,
  questions: DocxQuestion[],
  sets: number[][],
  opts: ShuffleExportOptions
): string {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  const body = doc.getElementsByTagNameNS(W_NS, "body")[0];
  if (!body) throw new Error("document.xml has no w:body");

  const kids = Array.from(body.children) as Element[];
  const sectPr = kids.find((k) => k.localName === "sectPr") ?? null;
  const byId = new Map(questions.map((q) => [q.id, q]));

  // ---- প্রশ্ন-ব্লকের বাইরের কনটেন্ট-জোন (ফরম্যাট-প্রিজার্ভেশন) ----
  const docOrder = [...questions].sort((a, b) => a.blockStart - b.blockStart);
  const sliceElems = (from: number, to: number): Element[] => {
    const out: Element[] = [];
    for (let i = Math.max(0, from); i < to && i < kids.length; i++) {
      const el = kids[i];
      if (el && el.localName !== "sectPr") out.push(el);
    }
    return out;
  };
  const firstStart = docOrder.length ? docOrder[0].blockStart : kids.length;
  const lastEnd = docOrder.length ? docOrder[docOrder.length - 1].blockEnd : -1;
  const preContent = sliceElems(0, firstStart);
  const gapBefore = new Map<number, Element[]>();
  let prevEnd = firstStart - 1;
  for (const q of docOrder) {
    gapBefore.set(q.id, sliceElems(prevEnd + 1, q.blockStart));
    prevEnd = q.blockEnd;
  }
  const postContent = sliceElems(lastEnd + 1, kids.length);

  // ---- নন-প্রশ্ন প্যারা (প্রশ্ন-ব্লকের বাইরের "গ্যাপ" কনটেন্ট) — Phase 1.1 ফিক্স ----
  // প্রশ্নের ক্রম না বদলালে (সিরিয়াল-ফিক্স / অরিজিনাল-অর্ডার) গ্যাপগুলো হুবহু
  // নিজের জায়গাতেই থাকে — লেআউট byte-প্রায় অভিন্ন। কিন্তু শাফল হলে গ্যাপ-টেক্সট
  // প্রশ্নের সাথে ঘুরে **ভুল বিষয়ের প্রশ্নের গায়ে** আটকে যায় (যেমন "Part A -
  // Physics" একটা Chemistry প্রশ্নের আগে বসে যেত — টেস্টে প্রমাণিত)।
  // তাই ক্রম বদলালে: অ-খালি গ্যাপ-প্যারা (হেডার/প্রতিষ্ঠানের নাম/নির্দেশনা — যে
  // টেক্সট-প্যাটার্নই হোক) একবার, **ডকুমেন্টের নিজের ক্রমে** প্রি-কনটেন্টের পরে
  // বসে; অর্থাৎ নিজের অবস্থানে আটকে থাকে, শাফল হয় না। খালি স্পেসার-প্যারা
  // প্রশ্নের সাথেই চলে (ওগুলো কিছু বোঝায় না, শুধু ফাঁকা জায়গা)।
  const docKey = docOrder.map((q) => q.id).join(",");
  const orderChanged = sets.some((s) => s.join(",") !== docKey);
  /** প্রশ্নের বাইরের কোনো কনটেন্ট-প্যারা (অ-খালি) কিনা — প্যারা নয় এমন এলিমেন্ট (টেবিল) সবসময় কনটেন্ট */
  const isBlankGapEl = (el: Element): boolean => el.localName === "p" && !paraTextOfEl(el).trim();
  /**
   * প্রশ্নের ব্লকের শেষ-প্রান্তে লেগে থাকা নন-প্রশ্ন প্যারা (যেমন পরের সেকশনের
   * হেডার — পার্সার সেটা আগের প্রশ্নের ব্লকে গিলে ফেলে, তাই শাফলে প্রশ্নের
   * সাথেই ঘোরে) → ক্রম বদলালে এগুলোও পিন হবে, প্রশ্নের ব্লকে থাকবে না।
   * খালি স্পেসার বা আসল কনটেন্ট পেলেই থেমে যায় — শুধু ফরেন টেক্সট-প্যারা বাদ।
   */
  const coreEnd = new Map<number, number>();
  const pinned: Element[] = [];
  if (orderChanged) {
    for (const q of docOrder) {
      let tailStart = q.blockEnd + 1;
      for (let i = q.blockEnd; i > q.blockStart; i--) {
        const el = kids[i];
        if (!el || el.localName === "sectPr") continue;
        if (el.localName !== "p") break; // টেবিল/অন্য এলিমেন্ট = কনটেন্ট — থামো
        const txt = paraTextOfEl(el);
        if (!txt.trim()) break; // খালি স্পেসার — প্রশ্নের সাথেই থাকুক
        if (isQuestionContentPara(txt)) break; // আসল কনটেন্ট — থামো
        tailStart = i;
      }
      coreEnd.set(q.id, tailStart - 1);
      // ডকুমেন্ট-ক্রমেই পিন: ব্লকের ফরেন-টেইল আগে, তারপর ব্লকের আগের গ্যাপ
      for (let i = tailStart; i <= q.blockEnd; i++) {
        const el = kids[i];
        if (el && el.localName !== "sectPr") pinned.push(el);
      }
      for (const el of gapBefore.get(q.id) ?? []) {
        if (!isBlankGapEl(el)) pinned.push(el);
      }
    }
  }

  // রেফারেন্স-মোড (keep বাদে) — প্রতি প্রশ্নের edited-ব্লক একবারই বানাই,
  // প্রতিটি সেট এখান থেকে আবার ক্লোন নেয় (রিনাম্বার-মিউটেশন আইসোলেটেড থাকে)
  const refMode: RefMode = opts.refMode ?? "keep";
  const editedMap =
    refMode === "keep"
      ? null
      : buildRefEditedMap(doc, questions, refMode, (q) => {
          const els: Element[] = [];
          for (let i = q.blockStart; i <= q.blockEnd; i++) {
            const src = kids[i];
            if (!src || src.localName === "sectPr") continue;
            els.push(src);
          }
          return els;
        });

  // সেট-হেডারের ফন্ট = ডকুমেন্টের প্রথম ফন্ট (Bijoy ফাইলে SutonnyMJ-ই থাকে)
  const docFont = firstBodyFont(kids);

  // body খালি করি — এলিমেন্টগুলো kids অ্যারেতে ধরা আছে, সেখান থেকেই ক্লোন হবে
  while (body.firstChild) body.removeChild(body.firstChild);

  // প্রি-কনটেন্ট (টাইটেল/নির্দেশনা) — হুবহু ক্লোন, একবার
  for (const el of preContent) body.appendChild(el.cloneNode(true));
  // Shuffled order: hoist non-empty gap content once, in document order (Phase 1.1).
  for (const el of pinned) body.appendChild(el.cloneNode(true));

  sets.forEach((setIds, si) => {
    if (si > 0) body.appendChild(makePageBreakPara(doc));
    if (opts.includeSetHeader) body.appendChild(makeSetHeaderPara(doc, englishSetName(si), docFont));

    setIds.forEach((qid, qi) => {
      const q = byId.get(qid);
      if (!q) return;
      // Leading gap of the question (section header / blank spacing).
      // Shuffled: non-empty gap content already pinned once above — only blank
      // spacers still travel with the question (Phase 1.1).
      for (const el of gapBefore.get(q.id) ?? []) {
        if (orderChanged && !isBlankGapEl(el)) continue;
        body.appendChild(el.cloneNode(true));
      }
      const edited = editedMap?.get(q.id) ?? null;
      let rel = -1;
      const blockEnd = orderChanged ? (coreEnd.get(q.id) ?? q.blockEnd) : q.blockEnd;
      for (let i = q.blockStart; i <= blockEnd; i++) {
        const src = kids[i];
        if (!src || src.localName === "sectPr") continue;
        rel++;
        const origin = edited ? edited.elems[rel] : null;
        if (edited && origin === null) continue; // রেফারেন্স-মোডে বাদ-পড়া খালি প্যারা
        const clone = (origin ?? src).cloneNode(true) as Element;
        // position-based রিনাম্বার: সেটে যে পজিশনে থাকে সেটাই তার নতুন নম্বর (১, ২, ৩…)
        if (opts.renumber && i === q.blockStart) {
          renumberSerialPara(clone, qi + 1);
        }
        body.appendChild(clone);
      }
      if (edited) {
        for (const extra of edited.extra) body.appendChild(extra.cloneNode(true));
      }
    });
  });

  // পোস্ট-কনটেন্ট (উত্তরমালা/সমাপ্তি) — হুবহু ক্লোন, সব সেটের পরে একবার
  for (const el of postContent) body.appendChild(el.cloneNode(true));

  if (sectPr) body.appendChild(sectPr);

  const out = new XMLSerializer().serializeToString(doc);
  // ⚠️ ব্রাউজারের XMLSerializer নিজেই <?xml …?> ডেক্লারেশন সিরিয়ালাইজ করে
  // (jsdom করে না) — দুবার ঢোকালে XML অবৈধ হয়ে যায়, তাই আগেটা কেটে ফেলি
  const bodyXml = out.startsWith("<?xml")
    ? out.slice(out.indexOf("?>") + 2).replace(/^[\r\n]+/, "")
    : out;
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n' + bodyXml;
}

/** অরিজিনাল zip-এর বাকি সব এন্ট্রি অক্ষত রেখে document.xml বদলানো (শেয়ার্ড repack কোর);
 * fontSettings দিলে নতুন document.xml (+ সোর্সের styles.xml থাকলে সেটাও) font-remap হয় */
async function zipWithXml(originalFile: Blob, newXml: string, fontSettings?: FontSettings, onProgress?: ZipProgress): Promise<Blob> {
  return repackDocxRemapped(originalFile, newXml, fontSettings, {}, [], DOCX_MIME, onProgress);
}

/** শাফল্ড সেটগুলোর .docx blob (ডাউনলোড নয়) — PDF-কনভার্সন পাথও এটাই ব্যবহার করে.
 * fontSettings দিলে শাফল-XML বানানোর পরে document.xml (+ styles.xml) font-remap হয় */
export async function buildShuffledDocxBlob(params: {
  originalFile: Blob;
  xml: string;
  questions: DocxQuestion[];
  sets: number[][];
  baseName: string;
  suffix: string;
  opts: ShuffleExportOptions;
  fontSettings?: FontSettings;
  onProgress?: ZipProgress;
}): Promise<{ blob: Blob; fileName: string }> {
  const newXml = buildShuffledXml(params.xml, params.questions, params.sets, params.opts);
  const blob = await zipWithXml(params.originalFile, newXml, params.fontSettings, params.onProgress);
  return { blob, fileName: `${params.baseName}${params.suffix}.docx` };
}

/**
 * সিরিয়াল ফিক্স এক্সপোর্ট ("Start"): অরিজিনাল অর্ডারেই প্রশ্নগুলো,
 * সিরিয়াল ১..N দিয়ে ঠিক করা — এক ফাইল, কোনো সেট-ভাগ নেই।
 */
/** সিরিয়াল-ফিক্স .docx blob (ডাউনলোড নয়) — PDF-কনভার্সন পাথও এটাই ব্যবহার করে */
export async function buildSerialFixedDocxBlob(params: {
  originalFile: Blob;
  xml: string;
  questions: DocxQuestion[];
  baseName: string;
  refMode?: RefMode;
  fontSettings?: FontSettings;
  onProgress?: ZipProgress;
}): Promise<{ blob: Blob; fileName: string }> {
  const allIds = params.questions.map((q) => q.id);
  const newXml = buildShuffledXml(params.xml, params.questions, [allIds], {
    renumber: true,
    includeSetHeader: false,
    refMode: params.refMode,
  });
  const blob = await zipWithXml(params.originalFile, newXml, params.fontSettings, params.onProgress);
  return { blob, fileName: `${params.baseName} (serial fixed).docx` };
}
