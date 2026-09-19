// ============================================================
// Font-remap E2E — persisted font-সেটিংস (localStorage "mcq-font-settings")
// ডাউনলোড-করা .docx-এর document.xml (+styles.xml)-এ রিম্যাপ যাচাই (ON ও OFF দুই পাথ)
// ============================================================
// সেলফ-সাফিশিয়েন্ট: নিজেই JSZip দিয়ে মিনিমাল Bijoy+Bengali docx জেনারেট করে
// (gen-e2e-fixtures.ts-এর জেনারেটর-প্যাটার্ন) — upload/ ফিক্সচার লাগে না।
// ফন্ট-কার্ড এখন শুধু Serial/Redownload মোডে আছে — শাফল মোডে নেই; তাই সেটিংস
// addInitScript দিয়ে localStorage-এ সিড করা হয় (হুক মাউন্টে হাইড্রেট করে)।
// ফ্লো: সিড(ON) → আপলোড → শাফল মোড → শাফল → ডাউনলোড → document.xml-এ নতুন
// ফন্ট + styles.xml-এ লিগ্যাসি রিম্যাপ। এরপর সিড(OFF) + reload → পুনঃশাফল →
// পুনঃডাউনলোড → ফন্ট অস্পৃশ্য (সোর্সের সাথে বাইট-অভিন্ন যাচাই)।
// রান: dev-server চালু (localhost:3000) → bun run scripts/e2e-font-remap.ts
// ============================================================
import { chromium } from "playwright";
import JSZip from "jszip";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";

const OUT_DIR = "/home/z/my-project/scripts/tmp-e2e/font-remap-files";
const ON_PATH = "/tmp/font-remap-e2e-on.docx";
const OFF_PATH = "/tmp/font-remap-e2e-off.docx";

let passed = 0;
let failed = 0;
const ok = (c: boolean, n: string) => {
  if (c) { passed++; console.log("  ✓", n); }
  else { failed++; console.error("  ✗ FAIL:", n); }
};
const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// ---------- মিনিমাল docx জেনারেটর (সব রানে SutonnyMJ ফন্ট) ----------

const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const RFONTS = (font: string) =>
  `<w:rPr><w:rFonts w:ascii="${font}" w:hAnsi="${font}" w:cs="${font}" w:eastAsia="${font}"/></w:rPr>`;
const run = (t: string) => `<w:r>${RFONTS("SutonnyMJ")}<w:t xml:space="preserve">${esc(t)}</w:t></w:r>`;
const para = (inner: string) => `<w:p><w:pPr></w:pPr>${inner}</w:p>`;

const DOC_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="${W}"><w:body>` +
  // প্রশ্ন ১ — বাংলা টেক্সট + প্যারার ভিতরে একটা Bijoy রান
  para(run("১.") + run(" বাংলা নমুনা প্রশ্ন এক — সঠিক উত্তরটি কোনটি?") + run(" †KvW wKQz")) +
  para(run("ক) বিকল্প-ক খ) বিকল্প-খ গ) বিকল্প-গ ঘ) বিকল্প-ঘ")) +
  para(run("উত্তর: ক")) +
  // প্রশ্ন ২ — বাংলা টেক্সট + প্যারার ভিতরে একটা English রান
  para(run("২.") + run(" বাংলা নমুনা প্রশ্ন দুই — সঠিক উত্তরটি কোনটি?") + run(" (Board 2019)")) +
  para(run("ক) বিকল্প-ক খ) বিকল্প-খ গ) বিকল্প-গ ঘ) বিকল্প-ঘ")) +
  para(run("উত্তর: খ")) +
  // প্রশ্ন ৩–৫ — ডিফল্ট সেট-সংখ্যা ৪-এর গেট পাস করাতে ≥৪ প্রশ্ন
  para(run("৩.") + run(" বাংলা নমুনা প্রশ্ন তিন — সঠিক উত্তরটি কোনটি?")) +
  para(run("ক) বিকল্প-ক খ) বিকল্প-খ গ) বিকল্প-গ ঘ) বিকল্প-ঘ")) +
  para(run("উত্তর: গ")) +
  para(run("৪.") + run(" বাংলা নমুনা প্রশ্ন চার — সঠিক উত্তরটি কোনটি?")) +
  para(run("ক) বিকল্প-ক খ) বিকল্প-খ গ) বিকল্প-গ ঘ) বিকল্প-ঘ")) +
  para(run("উত্তর: ঘ")) +
  para(run("৫.") + run(" বাংলা নমুনা প্রশ্ন পাঁচ — সঠিক উত্তরটি কোনটি?")) +
  para(run("ক) বিকল্প-ক খ) বিকল্প-খ গ) বিকল্প-গ ঘ) বিকল্প-ঘ")) +
  para(run("উত্তর: ক")) +
  `<w:sectPr><w:pgSz w:w="11906" w:h="16838"/></w:sectPr></w:body></w:document>`;

// styles.xml — লিগ্যাসি SutonnyMJ ফন্ট-ভ্যালু (রিম্যাপে bijoyFont হওয়ার কথা)
const STYLES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="${W}"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="SutonnyMJ" w:hAnsi="SutonnyMJ" w:cs="SutonnyMJ"/></w:rPr></w:rPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:rPr><w:rFonts w:ascii="SutonnyMJ" w:hAnsi="SutonnyMJ"/></w:rPr></w:style></w:styles>`;

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>`;
const RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`;

rmSync(OUT_DIR, { recursive: true, force: true });
mkdirSync(OUT_DIR, { recursive: true });
const zip = new JSZip();
zip.file("[Content_Types].xml", CONTENT_TYPES);
zip.file("_rels/.rels", RELS);
zip.file("word/document.xml", DOC_XML);
zip.file("word/styles.xml", STYLES_XML);
const f = `${OUT_DIR}/font-remap-e2e.docx`;
writeFileSync(f, Buffer.from(await zip.generateAsync({ type: "nodebuffer" })));

const SRC_SUTONNY_COUNT = (DOC_XML.match(/w:ascii="SutonnyMJ"/g) || []).length;

async function readPart(path: string, part: string): Promise<string> {
  const z = await JSZip.loadAsync(readFileSync(path));
  return await z.file(part)!.async("string");
}
async function downloadDocx(page: import("playwright").Page, outPath: string): Promise<void> {
  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: 120000 }),
    page.click('button:has-text("renumbered serials")'),
  ]);
  await download.saveAs(outPath);
}

const browser = await chromium.launch();
const page = await browser.newPage();
const errors: string[] = [];
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
page.on("console", (m) => { if (m.type() === "error") errors.push("console: " + m.text()); });

try {
  // ফন্ট-কার্ড এখন শুধু Serial/Redownload মোডে — শাফল মোডে সেটিংস localStorage-সিডে হাইড্রেট হয়
  // English-স্লটও এক্সপ্লিসিট (কার্ডের ডিফল্ট "Default" = অরিজিনাল রাখে, তাই TNR আসত না)
  const ON_JSON = JSON.stringify({ englishFont: "Times New Roman", bijoyFont: "Shibly", unicodeFont: "Noto Sans Bengali", enabled: true });
  const OFF_JSON = JSON.stringify({ englishFont: "Default", bijoyFont: "Default", unicodeFont: "Default", enabled: false });
  // ⚠️ addInitScript ব্যবহার করা যাবে না — ওটা প্রতিটা নেভিগেশনে (reload-এও) আবার সিড
  // করে OFF-সিডকে ক্লোব করে দেয় (OFF পাথ চুপচাপ ON-এই চলত)। তাই: goto → সিড → reload।
  await page.goto("http://localhost:3000", { waitUntil: "networkidle" });
  await page.evaluate((v) => localStorage.setItem("mcq-font-settings", v as string), ON_JSON);
  await page.reload({ waitUntil: "networkidle" });

  // ---- আপলোড → শাফল মোড ----
  await page.waitForSelector("#step-upload", { timeout: 30000 });
  await page.setInputFiles("#step-upload input[type='file']", f);
  await page.waitForSelector('button[role="tab"]:has-text("MCQ Shuffle")', { timeout: 30000 });
  await page.click('button[role="tab"]:has-text("MCQ Shuffle")');
  await page.waitForSelector('[data-testid="mode-work-bar"]', { timeout: 60000 });
  await page.waitForSelector("text=question(s) detected", { timeout: 60000 });
  ok(true, "ফাইল আপলোড → শাফল মোডে ৫ প্রশ্ন ডিটেক্ট");

  // ---- ফন্ট-কার্ড শাফল মোডে আর রেন্ডার হয় না (Serial/Redownload মোডে আছে) ----
  ok((await page.locator('[data-testid="font-settings-card"]').count()) === 0, "ফন্ট-কার্ড শাফল মোডে নেই");

  // ---- শাফল → ডাউনলোড (সিড করা ON সেটিংস) ----
  await page.click('button:has-text("Shuffle & build sets")');
  await page.waitForSelector("text=Shuffle complete", { timeout: 120000 });
  await downloadDocx(page, ON_PATH);
  const docOn = await readPart(ON_PATH, "word/document.xml");
  const stylesOn = await readPart(ON_PATH, "word/styles.xml");
  ok(docOn.includes('w:ascii="Noto Sans Bengali"'), "ON: document.xml-এ w:ascii=\"Noto Sans Bengali\" আছে");
  ok(docOn.includes('w:ascii="Shibly"'), "ON: document.xml-এ Bijoy-রানে w:ascii=\"Shibly\" আছে");
  ok(docOn.includes('w:ascii="Times New Roman"'), "ON: English/সেট-হেডার রানে w:ascii=\"Times New Roman\" আছে");
  ok(docOn.includes("বাংলা নমুনা প্রশ্ন"), "ON: বাংলা প্রশ্ন-টেক্সট অক্ষত");
  ok(docOn.includes("†KvW wKQz"), "ON: Bijoy রান-টেক্সট অক্ষত");
  ok(!docOn.includes('w:ascii="SutonnyMJ"'), "ON: document.xml-এ লিগ্যাসি SutonnyMJ শূন্য");
  ok(!stylesOn.includes("SutonnyMJ") && stylesOn.includes('w:ascii="Shibly"'), "ON: styles.xml লিগ্যাসি ভ্যালু → Shibly");

  // ---- রিম্যাপ OFF (localStorage সিড + reload) → পুনঃশাফল → পুনঃডাউনলোড ----
  await page.evaluate((v) => localStorage.setItem("mcq-font-settings", v as string), OFF_JSON);
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForSelector("#step-upload", { timeout: 30000 });
  await page.setInputFiles("#step-upload input[type='file']", f);
  await page.waitForSelector('button[role="tab"]:has-text("MCQ Shuffle")', { timeout: 30000 });
  await page.click('button[role="tab"]:has-text("MCQ Shuffle")');
  await page.waitForSelector("text=question(s) detected", { timeout: 60000 });
  await page.click('button:has-text("Shuffle & build sets")');
  await page.waitForSelector("text=Shuffle complete", { timeout: 120000 });
  await downloadDocx(page, OFF_PATH);
  const docOff = await readPart(OFF_PATH, "word/document.xml");
  const stylesOff = await readPart(OFF_PATH, "word/styles.xml");
  ok(!docOff.includes("Noto Sans Bengali") && !docOff.includes("Shibly") && !docOff.includes("Times New Roman"), "OFF: document.xml-এ নতুন কোনো ফন্ট নেই");
  // ডিফল্ট distribution এখন "original" (প্রতি সেটে সব প্রশ্ন) — তাই সোর্সের প্রতিটি
  // SutonnyMJ অ্যাট্রিবিউট প্রতি সেটে ১ বার = × সেট-সংখ্যা। সেট-হেডার ("Set A"…) অ্যাপের
  // নিজের Arial ফন্ট নেয়, SutonnyMJ যোগ করে না (আগের "+১ প্রতি হেডারে" ধারণা বদলেছে)।
  const offSetHeaders = (docOff.match(/>Set [A-Z0-9]+</g) || []).length;
  const offSutonny = (docOff.match(/w:ascii="SutonnyMJ"/g) || []).length;
  ok(offSutonny === SRC_SUTONNY_COUNT * offSetHeaders, `OFF: সোর্সের ${SRC_SUTONNY_COUNT}টা × ${offSetHeaders} সেট = ${SRC_SUTONNY_COUNT * offSetHeaders} w:ascii="SutonnyMJ" হুবহু অক্ষত [পেয়েছি ${offSutonny}]`);
  ok(docOff.includes("বাংলা নমুনা প্রশ্ন") && docOff.includes("†KvW wKQz"), "OFF: প্রশ্ন-টেক্সট অক্ষত");
  ok(stylesOff === STYLES_XML, "OFF: styles.xml সোর্সের সাথে বাইট-অভিন্ন");
  const storedOff = await page.evaluate(() => {
    try {
      const parsed: unknown = JSON.parse(localStorage.getItem("mcq-font-settings") ?? "{}");
      return (parsed as { enabled?: boolean }).enabled;
    } catch {
      return undefined;
    }
  });
  ok(storedOff === false, "persisted সেটিংসে enabled=false (Remap OFF)");

  console.log("\nJS errors:", errors.length ? errors : "শূন্য ✓");
  if (errors.length) throw new Error("ব্রাউজার JS-এরর পাওয়া গেছে");
} finally {
  await browser.close();
  rmSync(OUT_DIR, { recursive: true, force: true });
}
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
