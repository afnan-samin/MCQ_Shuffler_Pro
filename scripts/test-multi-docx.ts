// ============================================================
// Multi-DOCX unit tests — body-extract / sectPr-split / merge / zip / offset
// রান: bun scripts/test-multi-docx.ts
// ============================================================

import JSZip from "jszip";
import { JSDOM } from "jsdom";

// ---- মার্জড XML স্ট্রাকচার যাচাইয়ের জন্য DOMParser (jsdom) ----
const dom = new JSDOM("<!doctype html><html><body></body></html>");
(globalThis as unknown as Record<string, unknown>).DOMParser = dom.window.DOMParser;

// ---- bun-এ FileReader নেই — JSZip-এর Blob-ইনপুট পথ (prepareContent) ব্রাউজারে
// FileReader দিয়ে Blob→ArrayBuffer করে; টেস্টে মিনিমাল shim বসাই (lib অক্ষত থাকে) ----
class FileReaderShim {
  result: ArrayBuffer | null = null;
  error: unknown = null;
  onload: ((e: { target: FileReaderShim }) => void) | null = null;
  onerror: ((e: { target: FileReaderShim }) => void) | null = null;
  readAsArrayBuffer(blob: Blob): void {
    blob
      .arrayBuffer()
      .then((buf) => {
        this.result = buf;
        this.onload?.({ target: this });
      })
      .catch((err: unknown) => {
        this.error = err;
        this.onerror?.({ target: this });
      });
  }
}
(globalThis as unknown as Record<string, unknown>).FileReader = FileReaderShim;

const {
  PAGE_BREAK_P,
  extractBodyInner,
  splitTrailingSectPr,
  buildMergedDocumentXml,
  DOCX_MIME,
  replaceDocumentXml,
  buildMergedDocxBlob,
  buildZipBlob,
  offsetSerialPlan,
} = await import("../src/lib/mcq/multi-docx");

let passed = 0;
let failed = 0;
function ok(cond: boolean, name: string) {
  if (cond) {
    passed++;
    console.log("  ✓", name);
  } else {
    failed++;
    console.error("  ✗ FAIL:", name);
  }
}

/** হে-স্ট্রিংয়ে needle কতবার আছে */
function countOf(hay: string, needle: string): number {
  let n = 0;
  let i = hay.indexOf(needle);
  while (i >= 0) {
    n++;
    i = hay.indexOf(needle, i + needle.length);
  }
  return n;
}

// ---------- সিনথেটিক মিনিমাল docx নির্মাণ (সব ইন-মেমরি) ----------

const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";

function pText(text: string): string {
  return `<w:p><w:r><w:t>${text}</w:t></w:r></w:p>`;
}

function wrapDoc(body: string): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="${W}"><w:body>${body}</w:body></w:document>`;
}

/** প্রতিটা ফাইলের styles.xml আলাদা মার্কার বহন করে — base-এরটা টিকে আছে কিনা প্রমাণে */
function stylesXml(marker: string): string {
  return `<w:styles xmlns:w="${W}"><w:style w:type="paragraph" w:styleId="Normal"><w:name w:val="Normal"/><w:rPr><w:rFonts w:ascii="${marker}"/></w:rPr></w:style></w:styles>`;
}

const CONTENT_TYPES_XML =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
  `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
  `<Default Extension="xml" ContentType="application/xml"/>` +
  `<Override PartName="/word/document.xml" ContentType="${DOCX_MIME}"/></Types>`;

/** base: BASE-Q1 + মিড-ডক pPr-sectPr প্যারা (BASE-Q2) + trailing body-level sectPr (বাস্তব Word ফাইলের মত) */
const BODY_SECTPR = '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/></w:sectPr>';
const BASE_XML = wrapDoc(
  pText("BASE-Q1") +
    `<w:p><w:pPr>${BODY_SECTPR}</w:pPr><w:r><w:t>BASE-Q2</w:t></w:r></w:p>` +
    BODY_SECTPR,
);
/** extra-১: EXTRA-Q1 + আলাদা pgSz-এর trailing body-level sectPr (বাদ যাওয়ার প্রমাণে "21001" মার্কার) */
const EXTRA1_XML = wrapDoc(pText("EXTRA-Q1") + '<w:sectPr><w:pgSz w:w="21001" w:h="29701"/></w:sectPr>');
/** extra-২: EXTRA2-Q1 + SELF-CLOSING trailing sectPr */
const EXTRA2_XML = wrapDoc(pText("EXTRA2-Q1") + "<w:sectPr/>");

async function makeDocx(docXml: string, styles: string): Promise<Blob> {
  const zip = new JSZip();
  zip.file("[Content_Types].xml", CONTENT_TYPES_XML);
  zip.file("word/document.xml", docXml);
  zip.file("word/styles.xml", styles);
  const u8 = await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
  return new Blob([u8 as unknown as BlobPart]); // jszip-এর Uint8Array<ArrayBufferLike> টাইপ BlobPart-এ সরাসরি বসে না
}

/** মার্জড XML-এর সব স্ট্রিং-লেভেল দাবি — buildMergedDocumentXml আর buildMergedDocxBlob দুই জায়গাতেই চালানো হয় */
function assertMergedXml(merged: string) {
  const atBase = merged.indexOf("BASE-Q1");
  const atExtra = merged.indexOf("EXTRA-Q1");
  const atExtra2 = merged.indexOf("EXTRA2-Q1");
  ok(atBase >= 0 && atExtra >= 0 && atExtra2 >= 0, "তিন ফাইলের প্রশ্নই আউটপুটে আছে");
  ok(atBase < atExtra && atExtra < atExtra2, "অর্ডার: BASE-Q1 → EXTRA-Q1 → EXTRA2-Q1");
  ok(countOf(merged, PAGE_BREAK_P) === 2, `PAGE_BREAK_P ঠিক ২ বার (পাওয়া গেছে ${countOf(merged, PAGE_BREAK_P)})`);
  ok(countOf(merged, "</w:p>" + BODY_SECTPR) === 1, "base body-level sectPr ঠিক ১ বার");
  ok(!merged.includes("21001"), "extra-১-এর sectPr (pgSz 21001) বাদ গেছে");
  ok(!merged.includes("<w:sectPr/>"), "extra-২-এর self-closing sectPr বাদ গেছে");
  ok(merged.includes(`<w:pPr>${BODY_SECTPR}</w:pPr>`), "মিড-ডক pPr-sectPr (BASE-Q2) অক্ষত");
  ok(countOf(merged, "<w:body>") === 1 && countOf(merged, "</w:body>") === 1, "<w:body> ও </w:body> ঠিক একবার করে");
  // স্ট্রাকচার: body-children = BASE-Q1 p, BASE-Q2 p, ব্রেক p, EXTRA-Q1 p, ব্রেক p, EXTRA2-Q1 p, sectPr = ৭টা
  const doc = new dom.window.DOMParser().parseFromString(merged, "application/xml");
  ok(doc.getElementsByTagName("parsererror").length === 0, "মার্জড XML well-formed (DOMParser পার্স ক্লিন)");
  const bodyEl = doc.getElementsByTagNameNS(W, "body")[0];
  ok(!!bodyEl && bodyEl.children.length === 7, `body-children ৭টা (৬ প্যারা + sectPr) (পাওয়া গেছে ${bodyEl?.children.length})`);
  const brs = doc.getElementsByTagNameNS(W, "br") as Element[];
  ok(brs.length === 2 && brs[0].getAttribute("w:type") === "page" && brs[1].getAttribute("w:type") === "page", "২টা page-break w:br");
}

// ============================================================

console.log("\n== ১) extractBodyInner ==");
{
  const inner = extractBodyInner(BASE_XML);
  ok(inner.includes("BASE-Q1") && inner.includes("BASE-Q2"), "body-INNER-এ দুই প্রশ্নই আছে");
  ok(!inner.includes("<w:body") && !inner.includes("</w:body>") && !inner.includes("<?xml"), "prologue/body-ট্যাগ বাইরে থেকে গেছে");
  ok(inner.includes("<w:pPr>") && inner.endsWith(BODY_SECTPR), "মিড-ডক sectPr + trailing sectPr ভিতরেই");
  let threw = "";
  try {
    extractBodyInner("<w:document></w:document>");
  } catch (e) {
    threw = String(e);
  }
  ok(threw.includes("body"), `body না থাকলে বাংলা এরর (${threw.slice(0, 40)}…)`);
}

console.log("\n== ২) splitTrailingSectPr ==");
{
  const { content, sectPr } = splitTrailingSectPr(extractBodyInner(BASE_XML));
  ok(sectPr === BODY_SECTPR, "trailing body-level sectPr হুবহু আলাদা হয়েছে");
  ok(content.includes("BASE-Q2"), "content-এ BASE-Q2 আছে (মিড-ডক প্যারা কাটায়নি)");
  ok(content.includes(`<w:pPr>${BODY_SECTPR}</w:pPr>`), "content-এ মিড-ডক pPr-sectPr অক্ষত");
  ok(content.trim().endsWith("</w:p>"), "content শেষ হয়েছে প্যারা-ক্লোজে (sectPr স্ট্রিপড)");
}
{
  const inner = pText("ONLY-Q");
  const r = splitTrailingSectPr(inner);
  ok(r.sectPr === null && r.content === inner, "sectPr না থাকলে null — content হুবহু অক্ষত");
}
{
  const inner = pText("EXTRA2-Q1") + "<w:sectPr/>";
  const { content, sectPr } = splitTrailingSectPr(inner);
  ok(sectPr === "<w:sectPr/>", "self-closing trailing sectPr ধরা পড়েছে");
  ok(content === pText("EXTRA2-Q1"), "self-closing ক্ষেত্রেও content ঠিক");
}
{
  // শেষ <w:sectPr স্প্যান pPr-লেভেল হলে (পরে </w:pPr>… থাকে) — কিছুই স্ট্রিপ হবে না
  const inner = `<w:p><w:pPr><w:sectPr/></w:pPr><w:r><w:t>ONLY-PPr</w:t></w:r></w:p>`;
  const r = splitTrailingSectPr(inner);
  ok(r.sectPr === null && r.content === inner, "শেষ স্প্যান pPr-লেভেল হলে body-level নয় — স্ট্রিপ হয়নি");
}
{
  const inner = pText("WS-Q") + "\n " + BODY_SECTPR + " \n";
  const { content, sectPr } = splitTrailingSectPr(inner);
  ok(sectPr === BODY_SECTPR && content.includes("WS-Q"), "sectPr-এর পরে হোয়াইটস্পেস থাকলেও ধরা পড়ে");
}

console.log("\n== ৩) buildMergedDocumentXml ==");
try {
  const merged = buildMergedDocumentXml(BASE_XML, [EXTRA1_XML, EXTRA2_XML]);
  assertMergedXml(merged);
  ok(merged.startsWith(BASE_XML.slice(0, BASE_XML.indexOf("<w:body>"))), "prologue (declaration+document ট্যাগ) byte-হুবহু");
  ok(merged.endsWith(BASE_XML.slice(BASE_XML.indexOf("</w:body>"))), "epilogue (</w:body></w:document>) byte-হুবহু");
} catch (e) {
  ok(false, `buildMergedDocumentXml: ${String(e)}`);
}
{
  let threw = "";
  try {
    buildMergedDocumentXml(BASE_XML, []);
  } catch (e) {
    threw = String(e);
  }
  ok(threw.includes("items খালি"), `extras খালি → "items খালি" এরর (${threw.slice(0, 40)}…)`);
}

console.log("\n== ৪) replaceDocumentXml + buildMergedDocxBlob ==");
try {
  const baseBlob = await makeDocx(BASE_XML, stylesXml("BASE-STYLE-MARK"));
  const extra1Blob = await makeDocx(EXTRA1_XML, stylesXml("EXTRA1-STYLE-MARK"));
  const extra2Blob = await makeDocx(EXTRA2_XML, stylesXml("EXTRA2-STYLE-MARK"));

  // replaceDocumentXml একা: extra1-এর document.xml বদলে EXTRA2_XML — styles extra1-এরই থাকে
  const swapped = await replaceDocumentXml(extra1Blob, EXTRA2_XML);
  ok(swapped.type === DOCX_MIME, `replaceDocumentXml blob MIME = DOCX_MIME (${swapped.type.slice(-20)})`);
  {
    const z = await JSZip.loadAsync(swapped);
    ok((await z.file("word/document.xml")!.async("string")) === EXTRA2_XML, "replaceDocumentXml: document.xml হুবহু বদলেছে");
    ok((await z.file("word/styles.xml")!.async("string")).includes("EXTRA1-STYLE-MARK"), "replaceDocumentXml: styles.xml (অন্য এন্ট্রি) অক্ষত");
  }

  const mergedBlob = await buildMergedDocxBlob([
    { xml: BASE_XML, file: baseBlob },
    { xml: EXTRA1_XML, file: extra1Blob },
    { xml: EXTRA2_XML, file: extra2Blob },
  ]);
  ok(mergedBlob.type === DOCX_MIME, "merged blob MIME = DOCX_MIME");

  const zip = await JSZip.loadAsync(mergedBlob);
  const names = Object.keys(zip.files).sort();
  // JSZip createFolders-এ "word/" ডিরেক্টরি-এন্ট্রি নিজেই বানায় (downloadColorSerialDocx-ও একই) — ফাইল এন্ট্রি ৩টাই মূল কথা
  const fileEntries = names.filter((n) => !zip.files[n].dir);
  ok(
    JSON.stringify(fileEntries) === JSON.stringify(["[Content_Types].xml", "word/document.xml", "word/styles.xml"]),
    `zip ফাইল-এন্ট্রি ৩টা: ${fileEntries.join(", ")}`,
  );
  ok(names.includes("word/") && zip.files["word/"].dir, '"word/" ডিরেক্টরি-এন্ট্রি JSZip-এর নিজস্ব আচরণে আছে');
  const mergedXml2 = await zip.file("word/document.xml")!.async("string");
  assertMergedXml(mergedXml2);
  const styles = await zip.file("word/styles.xml")!.async("string");
  ok(styles.includes("BASE-STYLE-MARK"), "styles.xml BASE-এরটাই টিকে আছে");
  ok(!styles.includes("EXTRA1-STYLE-MARK") && !styles.includes("EXTRA2-STYLE-MARK"), "extra-দের styles.xml আসেনি (base container নিয়ম)");
  {
    let threw = "";
    try {
      await buildMergedDocxBlob([{ xml: BASE_XML, file: baseBlob }]);
    } catch (e) {
      threw = String(e);
    }
    ok(threw.includes("items খালি"), `একা ১টা item → বাংলা এরর (${threw.slice(0, 40)}…)`);
  }
} catch (e) {
  ok(false, `buildMergedDocxBlob: ${String(e)}`);
}

console.log("\n== ৫) buildZipBlob — ডুপ্লিকেট নাম ডিডাপ ==");
try {
  const zipBlob = await buildZipBlob([
    { name: "set.docx", blob: new Blob(["AAA"]) },
    { name: "set.docx", blob: new Blob(["BBB"]) },
    { name: "other.docx", blob: new Blob(["CCC"]) },
  ]);
  const zip = await JSZip.loadAsync(zipBlob);
  const names = Object.keys(zip.files);
  ok(names.length === 3, `৩ ফাইল → ৩ এন্ট্রি (${names.length})`);
  ok(names.includes("set.docx") && names.includes("set (2).docx"), 'ডুপ্লিকেটে extension-এর আগে " (2)" বসেছে');
  ok(names.includes("other.docx"), "ইউনিক নাম অক্ষত");
  ok(
    (await zip.file("set.docx")!.async("string")) === "AAA" &&
      (await zip.file("set (2).docx")!.async("string")) === "BBB" &&
      (await zip.file("other.docx")!.async("string")) === "CCC",
    "ডিডাপ-নামে সঠিক blob-ই ম্যাপ হয়েছে (AAA/BBB/CCC)",
  );
  let threw = "";
  try {
    await buildZipBlob([]);
  } catch (e) {
    threw = String(e);
  }
  ok(threw.includes("তালিকা খালি"), `তালিকা খালি → বাংলা এরর (${threw.slice(0, 40)}…)`);
} catch (e) {
  ok(false, `buildZipBlob: ${String(e)}`);
}

console.log("\n== ৬) offsetSerialPlan ==");
{
  const plan = new Map<number, number>([
    [1, 1],
    [2, 2],
  ]);
  const out = offsetSerialPlan(plan, 50);
  ok(out.get(1) === 51 && out.get(2) === 52 && out.size === 2, "{1→1, 2→2} + 50 → {1→51, 2→52}");
  ok(plan.get(1) === 1 && plan.get(2) === 2, "আসল plan mutate হয়নি");
  ok(out !== plan, "নতুন Map রিটার্ন (রেফারেন্স আলাদা)");

  const out0 = offsetSerialPlan(plan, 0);
  ok(out0 !== plan && out0.get(1) === 1 && out0.get(2) === 2, "offset 0 হলেও নতুন Map, মান অক্ষত");

  const empty = offsetSerialPlan(new Map<number, number>(), 7);
  ok(empty.size === 0, "খালি plan → খালি নতুন Map");
}

// ============================================================

console.log("\n== ৭) রিল-ইন্টিগ্রেশন — extra-এর ছবি + xmlns-ইউনিয়ন (Word-corruption ফিক্স) ==");
{
  const R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
  const WP = "http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing";
  const A = "http://schemas.openxmlformats.org/drawingml/2006/main";
  const PIC = "http://schemas.openxmlformats.org/drawingml/2006/picture";
  const IMG_TYPE = `${R}/image`;
  const RELS_NS = "http://schemas.openxmlformats.org/package/2006/relationships";

  const IMG_BASE = new Uint8Array([1, 2, 3, 4]); // base-এর word/media/image1.png
  const IMG_EXTRA = new Uint8Array([9, 8, 7, 6, 5]); // extra-র image1.png — একই নাম, ভিন্ন বাইট

  const relsXml = (inner: string) =>
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="${RELS_NS}">${inner}</Relationships>`;
  const imageRel = (id: string) =>
    `<Relationship Id="${id}" Type="${IMG_TYPE}" Target="media/image1.png"/>`;

  // extra-এর root-এ wp/a/pic ডিক্লেয়ার্ড (বাস্তব Word-ফাইলের মত); body সেগুলোই ব্যবহার করে,
  // কিন্তু base-এর root-এ নেই — মার্জে base root-এ xmlns-ইউনিয়ন হওয়ার প্রমাণে
  const EXTRA_IMG_XML =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="${W}" xmlns:r="${R}"` +
    ` xmlns:wp="${WP}" xmlns:a="${A}" xmlns:pic="${PIC}"><w:body>${pText("EXTRA-IMG-Q")}` +
    `<w:p><w:r><w:drawing><wp:inline><a:graphic><a:graphicData><pic:pic><pic:blipFill>` +
    `<a:blip r:embed="rIdImg"/></pic:blipFill></pic:pic></a:graphicData></a:graphic></wp:inline>` +
    `</w:drawing></w:r></w:p></w:body></w:document>`;

  async function makeDocxEntries(entries: Record<string, string | Uint8Array>): Promise<Blob> {
    const zip = new JSZip();
    for (const [path, data] of Object.entries(entries)) zip.file(path, data);
    const u8 = await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
    return new Blob([u8 as unknown as BlobPart]);
  }

  const baseEntries = (rels: string): Record<string, string | Uint8Array> => ({
    "[Content_Types].xml": CONTENT_TYPES_XML, // png-Default নেই — CT-যোগের প্রমাণে
    "word/document.xml": BASE_XML,
    "word/styles.xml": stylesXml("BASE-STYLE-MARK"),
    "word/_rels/document.xml.rels": rels,
    "word/media/image1.png": IMG_BASE,
  });
  const extraEntries: Record<string, string | Uint8Array> = {
    "[Content_Types].xml": CONTENT_TYPES_XML,
    "word/document.xml": EXTRA_IMG_XML,
    "word/styles.xml": stylesXml("EXTRA-IMG-STYLE-MARK"),
    "word/_rels/document.xml.rels": relsXml(imageRel("rIdImg")),
    "word/media/image1.png": IMG_EXTRA,
  };

  // ---- কেস A: base-এ ভিন্ন-কনটেন্ট image1.png → নতুন rel + ইউনিক নামে কপি ----
  try {
    const baseBlob = await makeDocxEntries(baseEntries(relsXml(imageRel("rIdBase"))));
    const mergedBlob = await buildMergedDocxBlob([
      { xml: BASE_XML, file: baseBlob },
      { xml: EXTRA_IMG_XML, file: await makeDocxEntries(extraEntries) },
    ]);
    const zip = await JSZip.loadAsync(mergedBlob);
    const mergedXml = await zip.file("word/document.xml")!.async("string");
    const mergedRels = await zip.file("word/_rels/document.xml.rels")!.async("string");

    // xmlns-ইউনিয়ন: extra body-র wp:/a:/pic: base root-এ ডিক্লেয়ার্ড হয়েছে
    const rootTag = mergedXml.slice(mergedXml.indexOf("<w:document"), mergedXml.indexOf(">", mergedXml.indexOf("<w:document")) + 1);
    ok(
      /xmlns:wp="/.test(rootTag) && /xmlns:a="/.test(rootTag) && /xmlns:pic="/.test(rootTag),
      "xmlns-ইউনিয়ন: wp/a/pic base root-এ ডিক্লেয়ার্ড",
    );

    // ড্যাংলিং রিল শূন্য: প্রতিটা r:embed মার্জড rels-এ আছে, পুরনো rIdImg নেই
    const embeds = [...mergedXml.matchAll(/r:embed="([^"]+)"/g)].map((m) => m[1]);
    const relIdsOut = new Set([...mergedRels.matchAll(/Id="([^"]+)"/g)].map((m) => m[1]));
    ok(
      embeds.length > 0 && embeds.every((id) => relIdsOut.has(id)) && !embeds.includes("rIdImg"),
      `ড্যাংলিং r:embed নেই — রিম্যাপড: ${embeds.join(", ") || "—"} `,
    );

    // নতুন rel + ইউনিক নামের পার্ট, বাইট-হুবহু extra-র ছবি
    const newRel = /<Relationship\b[^>]*Type="[^"]*\/image"[^>]*Target="(media\/image1_m\d+\.png)"[^>]*\/>/.exec(mergedRels);
    ok(!!newRel, `নতুন image-rel যোগ হয়েছে (Target=${newRel?.[1] ?? "—"})`);
    const partPath = newRel ? `word/${newRel[1]}` : "";
    const copied = partPath ? await zip.file(partPath)?.async("uint8array") : null;
    ok(!!copied && copied.every((b, i) => b === IMG_EXTRA[i]), "কপি হওয়া পার্ট-বাইট = extra-র ছবি (base-এরটা নয়)");

    // [Content_Types].xml png-Default পেয়েছে; base-এর নিজের rel/কনটেন্ট অক্ষত
    const ctOut = await zip.file("[Content_Types].xml")!.async("string");
    ok(ctOut.includes('Extension="png"'), "[Content_Types].xml-এ png-Default যোগ হয়েছে");
    ok(
      mergedRels.includes(imageRel("rIdBase")) && mergedXml.includes("BASE-Q1"),
      "base-এর নিজের rel (rIdBase) ও body অক্ষত",
    );

    // well-formed (document.xml + rels দুটোই)
    const dp = new dom.window.DOMParser();
    ok(
      dp.parseFromString(mergedXml, "application/xml").getElementsByTagName("parsererror").length === 0 &&
        dp.parseFromString(mergedRels, "application/xml").getElementsByTagName("parsererror").length === 0,
      "মার্জড document.xml + rels well-formed",
    );
  } catch (e) {
    ok(false, `রিল-ইন্টিগ্রেশন কেস A: ${String(e)}`);
  }

  // ---- কেস B: base-এ একই-কনটেন্ট image1.png থাকলে ডিডাপ — নতুন পার্ট/rel ছাড়াই রিম্যাপ ----
  try {
    const baseBlob = await makeDocxEntries({
      ...baseEntries(relsXml(imageRel("rIdBase") + imageRel("rIdSame"))),
      "word/media/image1.png": IMG_EXTRA, // extra-র বাইটের সাথে হুবহু মিল
    });
    const mergedBlob = await buildMergedDocxBlob([
      { xml: BASE_XML, file: baseBlob },
      { xml: EXTRA_IMG_XML, file: await makeDocxEntries(extraEntries) },
    ]);
    const zip = await JSZip.loadAsync(mergedBlob);
    const mergedXml = await zip.file("word/document.xml")!.async("string");
    const mergedRels = await zip.file("word/_rels/document.xml.rels")!.async("string");
    const embeds = [...mergedXml.matchAll(/r:embed="([^"]+)"/g)].map((m) => m[1]);
    // rels-অর্ডারে প্রথম path-ম্যাচ = rIdBase — সেটাতেই রিম্যাপ, নতুন পার্ট/rel কিছুই নেই
    ok(
      embeds.length === 1 && embeds[0] === "rIdBase" && !mergedRels.includes("_m"),
      "কনটেন্ট-সমতুল্য হলে existing rel-এ (rIdBase) রিম্যাপ — নতুন পার্ট/rel নেই",
    );
  } catch (e) {
    ok(false, `রিল-ইন্টিগ্রেশন কেস B: ${String(e)}`);
  }
}

// ============================================================
console.log(`\n===== ফলাফল: ${passed} পাস, ${failed} ফেল =====`);
process.exit(failed ? 1 : 0);
