// Browser E2E: "Mode Change" বাটন (ব্যাক-অ্যারোর ঠিক পরে) — অন্য মোডে সরাসরি সুইচ,
// আপলোড করা ফাইল নিজে থেকেই বহন হয় (NextModesCard-এর মত carry) — ৩ মোড ঘুরে যাচাই
// রান: dev-server চালু (localhost:3000) থাকতে হবে → bun run scripts/e2e-mode-change.ts
import { chromium } from "playwright";
import JSZip from "jszip";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";

const OUT_DIR = "/home/z/my-project/scripts/tmp-e2e/mode-change-files";

// মিনিমাল বৈধ docx (নেভিগেশন-টেস্ট — প্রশ্ন না থাকলেও মোড-সুইচ হয়)
const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`;
const RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`;
const DOC = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>mode-change e2e test file</w:t></w:r></w:p></w:body></w:document>`;

const zip = new JSZip();
zip.file("[Content_Types].xml", CONTENT_TYPES);
zip.file("_rels/.rels", RELS);
zip.file("word/document.xml", DOC);
const buf = Buffer.from(await zip.generateAsync({ type: "nodebuffer" }));
rmSync(OUT_DIR, { recursive: true, force: true });
mkdirSync(OUT_DIR, { recursive: true });
const f = `${OUT_DIR}/mode-change-test.docx`;
writeFileSync(f, buf);

const browser = await chromium.launch();
const page = await browser.newPage();
const errors: string[] = [];
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
page.on("console", (m) => {
  if (m.type() === "error") errors.push("console: " + m.text());
});

let passed = 0;
function ok(cond: boolean, name: string) {
  if (!cond) throw new Error(`FAIL: ${name}`);
  passed++;
  console.log("  ✓", name);
}

try {
  await page.goto("http://localhost:3000", { waitUntil: "networkidle" });

  // স্টেজ → শাফল মোড
  await page.waitForSelector("#step-upload", { timeout: 30000 });
  await page.setInputFiles("#step-upload input[type='file']", [f]);
  await page.waitForSelector("text=files ready", { timeout: 30000 });
  await page.click('button[role="tab"]:has-text("MCQ Shuffle")');
  await page.waitForSelector('[data-testid="mode-work-bar"]', { timeout: 60000 });
  ok(true, "শাফল মোডে ঢোকা হয়েছে (ওয়ার্ক-বার দৃশ্যমান)");

  // Mode Change বাটন ব্যাক-অ্যারোর ঠিক পরেই
  const bar = page.locator('[data-testid="mode-work-bar"]');
  const backBtn = bar.locator('button[aria-label="Back — return home"]');
  const mcBtn = bar.locator('[data-testid="mode-change-btn"]');
  ok((await backBtn.count()) === 1 && (await mcBtn.count()) === 1, "ব্যাক-অ্যারো + Mode Change বাটন দুটোই আছে");
  const backIdx = await bar.locator("button").nth(0).evaluate((el) => el.getAttribute("aria-label"));
  ok(backIdx === "Back — return home", "ব্যাক-অ্যারোই প্রথম বাটন");

  // মেনু খোলা → বাকি ২ মোড
  await mcBtn.click();
  await page.waitForSelector('[data-testid="mode-change-menu"]', { timeout: 5000 });
  const items = await page.locator('[data-testid="mode-change-menu"] [role="menuitem"]').count();
  ok(items === 2, `মেনুতে বাকি ২টা মোড [পেয়েছি ${items}]`);

  // সিরিয়াল মোডে সুইচ
  await page.click('[data-testid="mode-change-serial"]');
  await page.waitForSelector('[data-testid="mode-change-menu"]', { state: "detached", timeout: 5000 });
  await page.waitForFunction(
    () => document.querySelector('[data-testid="mode-work-bar"]')?.textContent?.includes("MCQ Serial"),
    { timeout: 10000 }
  );
  ok(true, "Mode Change → MCQ Serial (ওয়ার্ক-বার টাইটেল বদলেছে)");

  // ফাইল বহন হয়েছে — সিরিয়াল মোডের ফাইল-লিস্টে সেই ফাইলই দেখা যাচ্ছে (আবার আপলোড লাগেনি)
  await page.waitForSelector("text=mode-change-test.docx", { timeout: 30000 });
  ok(true, "আপলোড করা ফাইল সিরিয়াল মোডে বহন হয়েছে (ফাইল-লিস্টে নাম)");

  // আবার Mode Change → রিডাউনলোড
  await mcBtn.click();
  await page.waitForSelector('[data-testid="mode-change-menu"]', { timeout: 5000 });
  await page.click('[data-testid="mode-change-redownload"]');
  await page.waitForFunction(
    () => document.querySelector('[data-testid="mode-work-bar"]')?.textContent?.includes("MCQ Redownload"),
    { timeout: 10000 }
  );
  ok(true, "Mode Change → MCQ Redownload");

  // রিডাউনলোডেও ফাইল বহন হয়েছে
  await page.waitForSelector("text=mode-change-test.docx", { timeout: 30000 });
  ok(true, "ফাইল রিডাউনলোড মোডেও বহন হয়েছে");

  // আবার শাফলে ফিরে আসা — ফাইল-কাউন্ট ব্যাজ (শাফলে maxFiles আছে) "1/50 files"
  await mcBtn.click();
  await page.waitForSelector('[data-testid="mode-change-menu"]', { timeout: 5000 });
  await page.click('[data-testid="mode-change-shuffle"]');
  await page.waitForFunction(
    () => document.querySelector('[data-testid="mode-work-bar"]')?.textContent?.includes("MCQ Shuffle"),
    { timeout: 10000 }
  );
  await page.waitForSelector('[data-testid="mode-work-bar"] >> text=1/50 files', { timeout: 15000 });
  ok(true, "ফের শাফলে — ফাইল-ব্যাজ '1/50 files' (ফাইল পুরো পথে সাথেই)");

  // Escape-এ মেনু বন্ধ
  await mcBtn.click();
  await page.waitForSelector('[data-testid="mode-change-menu"]', { timeout: 5000 });
  await page.keyboard.press("Escape");
  await page.waitForSelector('[data-testid="mode-change-menu"]', { state: "detached", timeout: 5000 });
  ok(true, "Escape-এ মেনু বন্ধ হয়");

  console.log(`\nJS errors: ${errors.length ? errors.join(" | ") : "শূন্য ✓"}`);
  if (errors.length) throw new Error("ব্রাউজার JS-এরর পাওয়া গেছে");
  console.log(`✅ Mode Change E2E পাস (${passed} assertion)`);
} finally {
  await browser.close();
  rmSync(OUT_DIR, { recursive: true, force: true });
}
