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
  type DocxQuestion,
} from "./docx-xml";
import {
  buildRefEditedMap,
  type RefMode,
} from "./reference";
import { downloadBlob } from "./exporter";
import type { FontSettings } from "./font-remap";
import { repackDocxRemapped } from "./repack-docx";

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

/** ছোট সেট-হেডার: bold, centered — pure ASCII ("Set A") */
function makeSetHeaderPara(doc: Document, name: string): Element {
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

  // body খালি করি — এলিমেন্টগুলো kids অ্যারেতে ধরা আছে, সেখান থেকেই ক্লোন হবে
  while (body.firstChild) body.removeChild(body.firstChild);

  sets.forEach((setIds, si) => {
    if (si > 0) body.appendChild(makePageBreakPara(doc));
    if (opts.includeSetHeader) body.appendChild(makeSetHeaderPara(doc, englishSetName(si)));

    setIds.forEach((qid, qi) => {
      const q = byId.get(qid);
      if (!q) return;
      const edited = editedMap?.get(q.id) ?? null;
      let rel = -1;
      for (let i = q.blockStart; i <= q.blockEnd; i++) {
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
async function zipWithXml(originalFile: Blob, newXml: string, fontSettings?: FontSettings): Promise<Blob> {
  return repackDocxRemapped(originalFile, newXml, fontSettings);
}

/** শাফল্ড সেটগুলো এক .docx-এ ডাউনলোড — প্রতি সেট আলাদা পেজে.
 * fontSettings দিলে শাফল-XML বানানোর পরে document.xml (+ styles.xml) font-remap হয় */
export async function downloadShuffledDocx(params: {
  originalFile: Blob;
  xml: string;
  questions: DocxQuestion[];
  sets: number[][];
  baseName: string;
  suffix: string;
  opts: ShuffleExportOptions;
  fontSettings?: FontSettings;
}): Promise<void> {
  const newXml = buildShuffledXml(params.xml, params.questions, params.sets, params.opts);
  const blob = await zipWithXml(params.originalFile, newXml, params.fontSettings);
  downloadBlob(blob, `${params.baseName}${params.suffix}.docx`);
}

/**
 * সিরিয়াল ফিক্স এক্সপোর্ট ("Start"): অরিজিনাল অর্ডারেই প্রশ্নগুলো,
 * সিরিয়াল ১..N দিয়ে ঠিক করা — এক ফাইল, কোনো সেট-ভাগ নেই।
 */
export async function downloadSerialFixedDocx(params: {
  originalFile: Blob;
  xml: string;
  questions: DocxQuestion[];
  baseName: string;
  refMode?: RefMode;
  fontSettings?: FontSettings;
}): Promise<void> {
  const allIds = params.questions.map((q) => q.id);
  const newXml = buildShuffledXml(params.xml, params.questions, [allIds], {
    renumber: true,
    includeSetHeader: false,
    refMode: params.refMode,
  });
  const blob = await zipWithXml(params.originalFile, newXml, params.fontSettings);
  downloadBlob(blob, `${params.baseName} (serial fixed).docx`);
}
