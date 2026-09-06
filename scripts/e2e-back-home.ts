// Browser E2E: "পেছনে" অ্যারো-বাটন → হোমে ফেরা (আপলোড-কার্ড) — ৩ মোড-বাটন আর দেখায় না, সব ডেটা রিসেট
// + বাটনে শুধু অ্যারো আছে, "পেছনে" লেখা নেই
// রান: dev-server চালু (localhost:3000) থাকতে হবে → bun run scripts/e2e-back-home.ts
import { chromium } from "playwright";
import JSZip from "jszip";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";

const OUT_DIR = "/home/z/my-project/scripts/tmp-e2e/back-home-files";

// মিনিমাল বৈধ docx (প্রশ্ন ০টা — নেভিগেশন-টেস্টের জন্য যথেষ্ট)
const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`;
const RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`;
const DOC = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>back-home e2e test file</w:t></w:r></w:p></w:body></w:document>`;

const zip = new JSZip();
zip.file("[Content_Types].xml", CONTENT_TYPES);
zip.file("_rels/.rels", RELS);
zip.file("word/document.xml", DOC);
const buf = Buffer.from(await zip.generateAsync({ type: "nodebuffer" }));
rmSync(OUT_DIR, { recursive: true, force: true });
mkdirSync(OUT_DIR, { recursive: true });
const f = `${OUT_DIR}/back-home-test.docx`;
writeFileSync(f, buf);

const browser = await chromium.launch();
const page = await browser.newPage();
const errors: string[] = [];
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
page.on("console", (m) => {
  if (m.type() === "error") errors.push("console: " + m.text());
});

try {
  await page.goto("http://localhost:3000", { waitUntil: "networkidle" });

  // ধাপ ১: হোমে আপলোড-কার্ড; মোড-ট্যাব নেই
  await page.waitForSelector("#step-upload", { timeout: 30000 });
  console.log("✓ হোম = আপলোড-কার্ড");

  // ধাপ ২: ফাইল স্টেজ → ৩ মোড-ট্যাব
  await page.setInputFiles("#step-upload input[type='file']", [f]);
  await page.waitForSelector("text=ফাইল প্রস্তুত", { timeout: 30000 });
  await page.waitForSelector('button[role="tab"]:has-text("MCQ শাফল")', { timeout: 15000 });
  console.log("✓ স্টেজ হলো → ৩ মোড-ট্যাব দৃশ্যমান");

  // ধাপ ৩: শাফল মোডে ঢোকা → ওয়ার্ক-বার; বাটনে অ্যারো আছে, "পেছনে" লেখা নেই
  await page.click('button[role="tab"]:has-text("MCQ শাফল")');
  await page.waitForSelector('[data-testid="mode-work-bar"]', { timeout: 60000 });
  const backBtn = page.locator('button[aria-label="পেছনে — হোমে ফিরুন"]');
  if ((await backBtn.count()) !== 1) throw new Error("অ্যারো-ব্যাক বাটন নেই!");
  const btnText = (await backBtn.textContent())?.trim() ?? "";
  if (btnText.includes("পেছনে")) throw new Error(`বাটনে এখনো "পেছনে" লেখা আছে: "${btnText}"`);
  console.log("✓ ওয়ার্ক-বারে অ্যারো-বাটন — লেখা নেই, শুধু আইকন");

  // ধাপ ৪: অ্যারো-ব্যাক → হোম (আপলোড-কার্ড); ৩ মোড-বাটন আর দেখায় না
  await backBtn.click();
  await page.waitForSelector("#step-upload", { timeout: 15000 });
  const tabs = await page.locator('button[role="tab"]:has-text("MCQ")').count();
  if (tabs !== 0) throw new Error(`হোমে ফেরার পরেও ${tabs} টা মোড-বাটন দেখা যাচ্ছে!`);
  console.log("✓ পেছনে → হোমে ফেরা (আপলোড-কার্ড) — ৩ মোড-বাটন নেই, সব রিসেট");

  // ধাপ ৫: আবার একই ফাইল স্টেজ করা যায় (নতুন শুরু কাজ করছে)
  await page.setInputFiles("#step-upload input[type='file']", [f]);
  await page.waitForSelector("text=ফাইল প্রস্তুত", { timeout: 30000 });
  console.log("✓ হোম থেকে নতুন করে স্টেজ করা যায়");

  console.log("\nJS errors:", errors.length ? errors : "শূন্য ✓");
  if (errors.length) throw new Error("ব্রাউজার JS-এরর পাওয়া গেছে");
  console.log("✅ পেছনে→হোম (অ্যারো-বাটন) E2E পাস");
} finally {
  await browser.close();
  rmSync(OUT_DIR, { recursive: true, force: true });
}
