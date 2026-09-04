// ============================================================
// Multi-DOCX merge — একাধিক প্রসেস-করা .docx এক ফাইলে জোড়া + zip বান্ডেল
// ============================================================
// মূল নীতি: DOMParser ছাড়াই string-level এডিট (বিশাল ফাইলেও OOM হয় না)।
// base ফাইলের <w:body>-এর ভিতরে প্রতিটা extra-এর body-INNER আগে
// PAGE_BREAK_P বসিয়ে জোড়া হয়; base-এর body-level sectPr (পেজ-সেটআপ)
// অক্ষত থাকে, extra-দের sectPr বাদ যায়। pPr-লেভেল মিড-ডক sectPr
// (সেকশন-ব্রেক) কখনো স্ট্রিপ হয় না। zip রি-বিল্ড হয় color-serial-এর
// downloadColorSerialDocx-এর হুবহু JSZip কপি-প্যাটার্নে (নন-ডিরেক্টরি
// এন্ট্রি byte-হুবহু কপি; JSZip নিজে ফোল্ডার-এন্ট্রি বানায় বলে সরাসরি
// কপি-নির্মাণ)।
// ============================================================

import JSZip from "jszip";

export const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

/** পেজ-ব্রেক প্যারা (body-এর ভিতরে ঢোকে, নেমস্পেস root-এ ডিক্লেয়ার্ড থাকে বলে নিরাপদ) */
export const PAGE_BREAK_P = '<w:p><w:r><w:br w:type="page"/></w:r></w:p>';

const BODY_OPEN = "<w:body>";
const BODY_CLOSE = "</w:body>";
const SECTPR_OPEN = "<w:sectPr";
const SECTPR_CLOSE = "</w:sectPr>";

// ---------- ২) body-inner এক্সট্র্যাকশন ----------

/** <w:body>...</w:body>-এর ভিতরের অংশ বের করে (প্রথম occurrence; docx-এ ঠিক একটাই body থাকে) */
export function extractBodyInner(xml: string): string {
  const open = xml.indexOf(BODY_OPEN);
  const close = xml.indexOf(BODY_CLOSE);
  if (open < 0 || close < open) {
    throw new Error("document.xml-এ <w:body> পাওয়া যায়নি — ফাইলটি সঠিক .docx না মনে হচ্ছে");
  }
  return xml.slice(open + BODY_OPEN.length, close);
}

// ---------- ৩) শেষের (body-level) sectPr আলাদা করা ----------

/**
 * body-INNER থেকে শেষের (body-level) sectPr আলাদা করে।
 * সাবধান: প্যারার pPr-লেভেল <w:sectPr> (মিড-ডক সেকশন-ব্রেক) স্ট্রিপ করা যাবে না।
 * body-level sectPr হলো w:body-এর শেষ ডিরেক্ট চাইল্ড — অর্থাৎ তার পরে
 * শুধু হোয়াইটস্পেস থাকে। তাই শেষ <w:sectPr স্প্যানের পরের অংশ
 * whitespace-only না হলে সেটা body-level নয় — কিছুই কাটা হয় না (defensive)।
 */
export function splitTrailingSectPr(inner: string): { content: string; sectPr: string | null } {
  const idx = inner.lastIndexOf(SECTPR_OPEN);
  if (idx < 0) return { content: inner, sectPr: null };

  // self-closing (<w:sectPr/>) নাকি জোড়া (<w:sectPr>…</w:sectPr>)?
  const selfClose = /^<w:sectPr[^>]*\/>/.exec(inner.slice(idx));
  let end: number;
  if (selfClose) {
    end = idx + selfClose[0].length;
  } else {
    const closeAt = inner.indexOf(SECTPR_CLOSE, idx);
    if (closeAt < 0) return { content: inner, sectPr: null }; // ভাঙা XML — কিছুই ধরি না
    end = closeAt + SECTPR_CLOSE.length;
  }

  // স্প্যানের পরে শুধু হোয়াইটস্পেস থাকলেই কেবল body-level sectPr
  const rest = inner.slice(end);
  if (!/^\s*$/.test(rest)) return { content: inner, sectPr: null };

  return { content: inner.slice(0, idx), sectPr: inner.slice(idx, end) };
}

// ---------- ৪) মার্জড document.xml ----------

/**
 * base-এর body-এর ভিতরে, base-এর body-level sectPr-এর ঠিক আগে, প্রতিটা
 * extra-এর আগে PAGE_BREAK_P বসিয়ে মার্জ। extra-দের নিজের body-level
 * sectPr বাদ (base-এর পেজ-সেটআপই চলবে); pPr-লেভেল মিড-ডক sectPr সবার অক্ষত।
 * রিকনস্ট্রাকশন base-এর ORIGINAL offsets-এই হয় — বাইরের prologue/epilogue
 * byte-হুবহু প্রিজার্ভ।
 */
export function buildMergedDocumentXml(baseXml: string, extraInnerXmls: string[]): string {
  if (!extraInnerXmls.length) throw new Error("items খালি — অন্তত একটা extra ফাইলের body-XML দিন");
  if (!baseXml) throw new Error("base XML খালি");

  const bodyOpen = baseXml.indexOf(BODY_OPEN);
  const bodyClose = baseXml.indexOf(BODY_CLOSE);
  if (bodyOpen < 0 || bodyClose < bodyOpen) {
    throw new Error("base XML-এ <w:body> পাওয়া যায়নি — ফাইলটি সঠিক .docx না মনে হচ্ছে");
  }
  const bodyContentStart = bodyOpen + BODY_OPEN.length;

  const baseInner = baseXml.slice(bodyContentStart, bodyClose);
  const { content, sectPr } = splitTrailingSectPr(baseInner);

  const parts: string[] = [content];
  for (const extra of extraInnerXmls) {
    if (!extra) throw new Error("extra XML খালি");
    const extraInner = extractBodyInner(extra);
    const sp = splitTrailingSectPr(extraInner);
    parts.push(PAGE_BREAK_P + sp.content); // extra-র body-level sectPr ইচ্ছাকৃত বাদ
  }
  const mergedInner = parts.join("");

  return baseXml.slice(0, bodyContentStart) + mergedInner + (sectPr ?? "") + baseXml.slice(bodyClose);
}

// ---------- ৫) যেকোনো docx blob-এর word/document.xml বদলানো ----------

/**
 * যেকোনো .docx blob-এর word/document.xml বদলে নতুন XML দিয়ে নতুন blob —
 * বাকি সব এন্ট্রি (styles/headers/media/settings) byte-হুবহু কপি।
 * downloadColorSerialDocx-এর হুবহু JSZip কপি-প্যাটার্ন।
 */
export async function replaceDocumentXml(file: Blob, newXml: string): Promise<Blob> {
  const src = await JSZip.loadAsync(file);
  const others: Array<{ path: string; data: Promise<Uint8Array> }> = [];
  src.forEach((path, entry) => {
    if (!entry.dir && path !== "word/document.xml") others.push({ path, data: entry.async("uint8array") });
  });
  const zip = new JSZip();
  zip.file("word/document.xml", new TextEncoder().encode(newXml));
  for (const o of others) zip.file(o.path, await o.data);
  return zip.generateAsync({ type: "blob", mimeType: DOCX_MIME, compression: "DEFLATE" });
}

// ---------- ৬) একাধিক docx → এক মার্জড docx ----------

/**
 * একাধিক প্রসেস-করা docx → এক মার্জড docx blob।
 * items[0] = base container — তার styles/headers/media/rels-ই আউটপুটে চলে;
 * বাকিগুলো থেকে শুধু body-INNER নেওয়া হয়।
 */
export async function buildMergedDocxBlob(items: Array<{ xml: string; file: Blob }>): Promise<Blob> {
  if (items.length < 2) throw new Error("items খালি — মার্জে অন্তত ২টা docx লাগবে (base + extra)");
  const mergedXml = buildMergedDocumentXml(
    items[0].xml,
    items.slice(1).map((it) => it.xml),
  );
  return replaceDocumentXml(items[0].file, mergedXml);
}

// ---------- ৭) একাধিক blob → এক .zip ----------

/**
 * একাধিক blob → এক .zip blob। একই নাম একাধিকবার এলে extension-এর আগে
 * " (2)", " (3)" বসে (যেমন "set.docx", "set (2).docx") — zip-এ নাম-সংঘর্ষ যেন না হয়।
 */
export async function buildZipBlob(files: Array<{ name: string; blob: Blob }>): Promise<Blob> {
  if (!files.length) throw new Error("ফাইল তালিকা খালি");
  const zip = new JSZip();
  const used = new Set<string>();
  for (const f of files) {
    let name = f.name;
    if (used.has(name)) {
      const dot = name.lastIndexOf(".");
      const stem = dot > 0 ? name.slice(0, dot) : name; // ".docx"-টাইপ ডটফাইল হলে পুরোটাই stem
      const ext = dot > 0 ? name.slice(dot) : "";
      let n = 2;
      while (used.has(`${stem} (${n})${ext}`)) n++; // "a (2).docx" নিজেই থাকলে পরের নম্বর
      name = `${stem} (${n})${ext}`;
    }
    used.add(name);
    zip.file(name, f.blob);
  }
  return zip.generateAsync({ type: "blob", mimeType: "application/zip", compression: "DEFLATE" });
}

// ---------- ৮) সিরিয়াল-প্ল্যানে অফসেট ----------

/**
 * সিরিয়াল-প্ল্যানের প্রতিটা নতুন সিরিয়ালে offset যোগ করে (গ্লোবাল কন্টিনিউয়াস
 * সিরিয়ালের জন্য: পরের ফাইলের সিরিয়াল আগের ফাইলের শেষ সিরিয়ালের পর থেকে)।
 * সবসময় নতুন Map রিটার্ন করে — আসল plan কখনো mutate হয় না (offset 0 হলেও)।
 */
export function offsetSerialPlan(plan: Map<number, number>, offset: number): Map<number, number> {
  const out = new Map<number, number>();
  for (const [blockIndex, serial] of plan) out.set(blockIndex, serial + offset);
  return out;
}
