// Browser E2E: শাফল মোডে max ৫০ ফাইল এনফোর্সমেন্ট — ৫১টা দিলে প্রথম ৫০টা + ওয়ার্নিং + যোগ-বাটন বন্ধ
// রান: dev-server চালু (localhost:3000) থাকতে হবে → bun run scripts/e2e-shuffle-limit.ts
// ফাইল সাপ্লাই আসল upload/ থেকে নয় — মিনিমাল বৈধ docx নিজেই বানায় (প্রশ্ন ০টা, লিমিট-টেস্টের জন্য যথেষ্ট)
import { chromium } from "playwright";
import JSZip from "jszip";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";

const OUT_DIR = "/home/z/my-project/scripts/tmp-e2e/limit-files";
const N = 51; // ৫১ > ৫০ (SHUFFLE_MAX_FILES) → ক্যাপ ট্রিগার হবে

// মিনিমাল OOXML পার্টস — [Content_Types].xml + _rels/.rels + word/document.xml
const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`;
const RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`;
const DOC = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>e2e limit test file</w:t></w:r></w:p></w:body></w:document>`;

// একটা জিপ বানিয়ে ৫১ নামে লেখা — কনটেন্ট একই হলেও ফাইলনেম ভিন্ন হলেই চলে
const zip = new JSZip();
zip.file("[Content_Types].xml", CONTENT_TYPES);
zip.file("_rels/.rels", RELS);
zip.file("word/document.xml", DOC);
const buf = Buffer.from(await zip.generateAsync({ type: "nodebuffer" }));

rmSync(OUT_DIR, { recursive: true, force: true });
mkdirSync(OUT_DIR, { recursive: true });
const paths: string[] = [];
for (let i = 1; i <= N; i++) {
  const p = `${OUT_DIR}/limit-${String(i).padStart(2, "0")}.docx`;
  writeFileSync(p, buf);
  paths.push(p);
}
console.log(`✓ ${N} টা মিনিমাল docx বানানো হলো (${OUT_DIR})`);

const browser = await chromium.launch();
const page = await browser.newPage();
const errors: string[] = [];
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
page.on("console", (m) => {
  if (m.type() === "error") errors.push("console: " + m.text());
});

try {
  await page.goto("http://localhost:3000", { waitUntil: "networkidle" });

  // ধাপ ১: ৫১টা ফাইল আপলোড → স্টেজ
  await page.waitForSelector("#step-upload", { timeout: 30000 });
  await page.setInputFiles("#step-upload input[type='file']", paths);
  await page.waitForSelector("text=files ready", { timeout: 30000 });
  console.log("✓ ৫১টা ফাইল স্টেজ হলো");

  // ধাপ ২: শাফল মোডে ঢোকা → ৫০টাই লোড হবে, ওয়ার্নিং টোস্ট আসবে
  await page.click('button[role="tab"]:has-text("MCQ Shuffle")');
  await page.waitForSelector("text=Shuffle mode: max 50 files", { timeout: 180000 });
  console.log("✓ ৫১ দিলে ওয়ার্নিং টোস্ট: 'সর্বোচ্চ ৫০ টি ফাইল'");
  await page.waitForSelector("text=Uploaded files (50)", { timeout: 120000 });
  await page.waitForSelector("text=50/50 files", { timeout: 15000 });
  console.log("✓ লিস্টে ৫০টা ফাইল + কাউন্ট চিপ ৫০/৫০");

  // ধাপ ৩: পূর্ণ হলে 'আরও ফাইল' বাটন বন্ধ
  const disabled = await page.getAttribute('button:has-text("Add files")', "disabled");
  if (disabled === null) throw new Error("৫০/৫০ তে 'আরও ফাইল' বাটন এখনো চালু!");
  console.log("✓ ৫০/৫০ → 'আরও ফাইল' বাটন ডিজেবলড");

  // ধাপ ৪: ১টা বাদ দিলে আবার চালু (min/max স্পেস কাজ করছে)
  await page.locator('button[aria-label="Remove from list"]').nth(0).click();
  await page.waitForSelector("text=49/50 files", { timeout: 15000 });
  const disabled2 = await page.getAttribute('button:has-text("Add files")', "disabled");
  if (disabled2 !== null) throw new Error("৪৯/৫০ তে 'আরও ফাইল' বাটন বন্ধ আছে!");
  console.log("✓ ১টা বাদ → ৪৯/৫০ → যোগ-বাটন আবার চালু");

  console.log("\nJS errors:", errors.length ? errors : "শূন্য ✓");
  if (errors.length) throw new Error("ব্রাউজার JS-এরর পাওয়া গেছে");
  console.log("✅ শাফল max-50 এনফোর্সমেন্ট E2E পাস");
} finally {
  await browser.close();
  rmSync(OUT_DIR, { recursive: true, force: true });
}
