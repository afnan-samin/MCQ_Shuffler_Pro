// ============================================================
// PDF-export E2E — "Download as" DOCX/PDF toggle in every mode
// ============================================================
// Self-sufficient (gen-e2e-fixtures generator pattern): generates its own
// minimal docx fixtures with JSZip — no upload/ fixtures needed.
// Flow:
//   1) Upload 1 docx → shuffle mode → format toggle shows DOCX active (default)
//   2) Download → filename *.docx, file starts with "PK" (zip magic)
//   3) Toggle PDF (testid format-pdf) → localStorage "mcq-download-format"=pdf
//   4) Download again → filename *.pdf, file starts with "%PDF"
//   5) Add a 2nd file (multi-file merge/ZIP view) → PDF persisted →
//      merged download is %PDF; ZIP keeps its docx-era name and contains
//      ONLY *.pdf entries, each starting with "%PDF" (unzipped via JSZip)
//   6) Zero console/page errors
// Run: dev server on localhost:3000 → bun run scripts/e2e-pdf-export.ts
// ============================================================
import { chromium } from "playwright";
import JSZip from "jszip";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";

const OUT_DIR = "/home/z/my-project/scripts/tmp-e2e/pdf-export-files";
const DOCX_1 = "/tmp/pdf-e2e-single.docx";
const OUT_DOCX = "/tmp/pdf-e2e-download.docx";
const OUT_PDF = "/tmp/pdf-e2e-single.pdf";
const MERGED_PDF = "/tmp/pdf-e2e-multi-merged.pdf";
const ZIP_PDF = "/tmp/pdf-e2e-multi.zip";

let passed = 0;
let failed = 0;
const ok = (c: boolean, n: string) => {
  if (c) { passed++; console.log("  ✓", n); }
  else { failed++; console.error("  ✗ FAIL:", n); }
};
const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// ---------- minimal docx generator (same pattern as e2e-font-remap) ----------

const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const RFONTS = (font: string) =>
  `<w:rPr><w:rFonts w:ascii="${font}" w:hAnsi="${font}" w:cs="${font}" w:eastAsia="${font}"/></w:rPr>`;
const run = (t: string) => `<w:r>${RFONTS("SutonnyMJ")}<w:t xml:space="preserve">${esc(t)}</w:t></w:r>`;
const para = (inner: string) => `<w:p><w:pPr></w:pPr>${inner}</w:p>`;

const docXmlOf = (tag: string) =>
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="${W}"><w:body>` +
  para(run("১.") + run(` বাংলা নমুনা প্রশ্ন এক ${tag} — সঠিক উত্তরটি কোনটি?`)) +
  para(run("ক) বিকল্প-ক খ) বিকল্প-খ গ) বিকল্প-গ ঘ) বিকল্প-ঘ")) +
  para(run("উত্তর: ক")) +
  para(run("২.") + run(` বাংলা নমুনা প্রশ্ন দুই ${tag} — সঠিক উত্তরটি কোনটি?`)) +
  para(run("ক) বিকল্প-ক খ) বিকল্প-খ গ) বিকল্প-গ ঘ) বিকল্প-ঘ")) +
  para(run("উত্তর: খ")) +
  para(run("৩.") + run(` বাংলা নমুনা প্রশ্ন তিন ${tag} — সঠিক উত্তরটি কোনটি?`)) +
  para(run("ক) বিকল্প-ক খ) বিকল্প-খ গ) বিকল্প-গ ঘ) বিকল্প-ঘ")) +
  para(run("উত্তর: গ")) +
  para(run("৪.") + run(` বাংলা নমুনা প্রশ্ন চার ${tag} — সঠিক উত্তরটি কোনটি?`)) +
  para(run("ক) বিকল্প-ক খ) বিকল্প-খ গ) বিকল্প-গ ঘ) বিকল্প-ঘ")) +
  para(run("উত্তর: ঘ")) +
  para(run("৫.") + run(` বাংলা নমুনা প্রশ্ন পাঁচ ${tag} — সঠিক উত্তরটি কোনটি?`)) +
  para(run("ক) বিকল্প-ক খ) বিকল্প-খ গ) বিকল্প-গ ঘ) বিকল্প-ঘ")) +
  para(run("উত্তর: ক")) +
  `<w:sectPr><w:pgSz w:w="11906" w:h="16838"/></w:sectPr></w:body></w:document>`;

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`;
const RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`;

async function makeDocx(path: string, tag: string): Promise<void> {
  const zip = new JSZip();
  zip.file("[Content_Types].xml", CONTENT_TYPES);
  zip.file("_rels/.rels", RELS);
  zip.file("word/document.xml", docXmlOf(tag));
  writeFileSync(path, Buffer.from(await zip.generateAsync({ type: "nodebuffer" })));
}

// ---------- helpers ----------

const startsWithPk = (path: string) => {
  const b = readFileSync(path);
  return b.length > 4 && b[0] === 0x50 && b[1] === 0x4b;
};
const startsWithPdf = (path: string) => {
  const b = readFileSync(path);
  return b.length > 5 && b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46; // "%PDF"
};

async function clickDownload(page: import("playwright").Page, text: string, outPath: string): Promise<string> {
  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: 180000 }),
    page.click(`button:has-text("${text}")`),
  ]);
  await download.saveAs(outPath);
  return download.suggestedFilename();
}

rmSync(OUT_DIR, { recursive: true, force: true });
mkdirSync(OUT_DIR, { recursive: true });
await makeDocx(DOCX_1, "ফাইল-১");

const browser = await chromium.launch();
const page = await browser.newPage();
const errors: string[] = [];
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
page.on("console", (m) => { if (m.type() === "error") errors.push("console: " + m.text()); });

try {
  await page.goto("http://localhost:3000", { waitUntil: "networkidle" });
  // পুরনো persisted ফরম্যাট থাকলে পরিষ্কার — ডিফল্ট (DOCX) থেকেই শুরু হবে
  await page.evaluate(() => localStorage.removeItem("mcq-download-format"));
  await page.reload({ waitUntil: "networkidle" });

  // ---- 1) আপলোড → শাফল মোড (সিঙ্গেল docx) ----
  await page.waitForSelector("#step-upload", { timeout: 30000 });
  await page.setInputFiles("#step-upload input[type='file']", DOCX_1);
  await page.waitForSelector('button[role="tab"]:has-text("MCQ Shuffle")', { timeout: 30000 });
  await page.click('button[role="tab"]:has-text("MCQ Shuffle")');
  await page.waitForSelector('[data-testid="mode-work-bar"]', { timeout: 60000 });
  await page.waitForSelector("text=question(s) detected", { timeout: 60000 });
  await page.click('button:has-text("Shuffle & build sets")');
  await page.waitForSelector("text=Shuffle complete", { timeout: 120000 });
  ok(true, "আপলোড → শাফল মোড → ৫ প্রশ্ন শাফল হলো");

  // ---- 2) ফরম্যাট-টগল: DOCX ডিফল্ট ----
  const toggle = page.locator('[data-testid="download-format"]');
  ok((await toggle.count()) === 1, "ডাউনলোড-কার্ডে [data-testid=download-format] টগল একবারই রেন্ডার");
  ok((await page.getAttribute('[data-testid="format-docx"]', "aria-pressed")) === "true", "DOCX ডিফল্ট-এই active (aria-pressed)");
  ok((await page.getAttribute('[data-testid="format-pdf"]', "aria-pressed")) === "false", "PDF ডিফল্টে inactive");

  // ---- 3) DOCX ডাউনলোড (ডিফল্ট) — নাম .docx + PK ম্যাজিক ----
  const docxName = await clickDownload(page, "renumbered serials", OUT_DOCX);
  ok(docxName.endsWith(".docx"), `DOCX ডাউনলোড ফাইলনাম .docx দিয়ে শেষ (${docxName})`);
  ok(startsWithPk(OUT_DOCX), "ডাউনলোড বাইট 'PK' দিয়ে শুরু (docx = zip)");

  // ---- 4) PDF টগল → PDF ডাউনলোড — নাম .pdf + %PDF ম্যাজিক ----
  await page.click('[data-testid="format-pdf"]');
  ok((await page.getAttribute('[data-testid="format-pdf"]', "aria-pressed")) === "true", "টগলের পরে PDF active");
  ok((await page.getAttribute('[data-testid="format-docx"]', "aria-pressed")) === "false", "টগলের পরে DOCX inactive");
  const stored = await page.evaluate(() => localStorage.getItem("mcq-download-format"));
  ok(stored === "pdf", `পছন্দ localStorage "mcq-download-format"-এ গেল (${stored})`);
  const pdfName = await clickDownload(page, "renumbered serials", OUT_PDF);
  ok(pdfName.endsWith(".pdf"), `PDF ডাউনলোড ফাইলনাম .pdf দিয়ে শেষ (${pdfName})`);
  ok(startsWithPdf(OUT_PDF), "ডাউনলোড বাইট '%PDF' দিয়ে শুরু");

  // ---- 5) মাল্টি-ফাইল (merge/ZIP ভিউ) — PDF পছন্দ persisted থাকে ----
  await page.click('button[aria-label="Back — return home"]');
  await page.waitForSelector("#step-upload", { timeout: 15000 });
  await page.setInputFiles("#step-upload input[type='file']", [DOCX_1, OUT_DOCX]);
  await page.waitForSelector('button[role="tab"]:has-text("MCQ Shuffle")', { timeout: 30000 });
  await page.click('button[role="tab"]:has-text("MCQ Shuffle")');
  await page.waitForSelector("text=Uploaded files (2)", { timeout: 120000 });
  await page.click('button:has-text("Shuffle & build sets")');
  await page.waitForSelector("text=Shuffle complete — download now", { timeout: 120000 });
  const storedAfterNav = await page.evaluate(() => localStorage.getItem("mcq-download-format"));
  ok(storedAfterNav === "pdf", "মাল্টি-ভিউতেও persisted পছন্দ PDF-ই");
  ok((await page.getAttribute('[data-testid="format-pdf"]', "aria-pressed")) === "true", "মাল্টি ডাউনলোড-কার্ডের টগলও PDF active");

  // ---- 5a) মার্জ PDF ডাউনলোড ----
  const mergedName = await clickDownload(page, "Download as one file (.pdf)", MERGED_PDF);
  ok(mergedName.endsWith(".pdf"), `মার্জ PDF ফাইলনাম .pdf (${mergedName})`);
  ok(startsWithPdf(MERGED_PDF), "মার্জ PDF বাইট '%PDF' দিয়ে শুরু");

  // ---- 5b) ZIP ডাউনলোড — নাম docx-যুগের কনভেনশনেই, ভিতরে শুধু .pdf ----
  const zipName = await clickDownload(page, "Download separately (.zip)", ZIP_PDF);
  ok(zipName === "MCQ-shuffled-files.zip", `ZIP-এর নাম আগের কনভেনশনেই (${zipName})`);
  const zz = await JSZip.loadAsync(readFileSync(ZIP_PDF));
  const entries = Object.keys(zz.files).filter((n) => !zz.files[n].dir);
  ok(entries.length === 2 && entries.every((e) => e.endsWith(".pdf")), `ZIP-এ শুধু .pdf এন্ট্রি ×২ (${entries.join(" | ")})`);
  for (const e of entries) {
    const bytes = await zz.file(e)!.async("uint8array");
    const isPdf = bytes.length > 5 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46;
    ok(isPdf, `ZIP-এন্ট্রি "${e}" বাইট '%PDF' দিয়ে শুরু`);
  }

  // ---- 6) DOCX-এ ফেরা — টগল ব্যাক কাজ করে ----
  await page.click('[data-testid="format-docx"]');
  const storedBack = await page.evaluate(() => localStorage.getItem("mcq-download-format"));
  ok(storedBack === "docx", `DOCX-এ ফেরাও persist হয় (${storedBack})`);

  console.log("\nJS errors:", errors.length ? errors : "শূন্য ✓");
  if (errors.length) throw new Error("ব্রাউজার JS-এরর পাওয়া গেছে");
} finally {
  await browser.close();
  rmSync(OUT_DIR, { recursive: true, force: true });
}
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
