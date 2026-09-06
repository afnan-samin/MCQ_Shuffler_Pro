// Browser E2E: মাল্টি-ফাইল আপলোড — সিরিয়াল + শাফল দুই মোডে
// রান: bun run scripts/e2e-multi-file.ts
import { chromium } from "playwright";
import JSZip from "jszip";
import fs from "node:fs";

const CHEM = "/home/z/my-project/upload/Final Chemistry 1st paper only varsity Question (1-5).docx";
const HSC = "/home/z/my-project/public/sample/hsc27-physics-bijoy.docx";
const NOCOLOR = "/home/z/my-project/upload/color-free-test.docx";

/** ফাইলের সবচেয়ে বড় w:t-টেক্সট — সিরিয়াল-রিনাম্বারে অপরিবর্তিত থাকে বলে মার্কার হিসেবে নিরাপদ */
const markerOf = (xml: string): string => {
  const texts = [...xml.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map((m) => m[1].trim()).filter(Boolean);
  if (!texts.length) throw new Error("w:t টেক্সট পাওয়া যায়নি");
  return texts.reduce((a, b) => (b.length > a.length ? b : a));
};

/** শাফল-মোড চেক: সোর্সের অন্তত একটা বড় টেক্সট-রান আউটপুটে আছে কিনা (স্ট্রিপ-সেফ) */
const contentOverlap = async (src: string, out: string): Promise<boolean> => {
  const x = await readDocxXml(src);
  const texts = [...x.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)]
    .map((m) => m[1].trim())
    .filter((t) => t.length >= 8);
  texts.sort((a, b) => b.length - a.length);
  return texts.some((t) => out.includes(t));
};

const readDocxXml = async (path: string): Promise<string> => {
  const z = await JSZip.loadAsync(fs.readFileSync(path));
  return (await z.file("word/document.xml")!.async("string"));
};

const browser = await chromium.launch();
const page = await browser.newPage();
const errors: string[] = [];
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
page.on("console", (m) => {
  if (m.type() === "error") errors.push("console: " + m.text());
});

await page.goto("http://localhost:3000", { waitUntil: "networkidle" });

// ================== সিরিয়াল মোড — মাল্টি-ফাইল ==================
// নতুন ফ্লো: আগে ৩ ফাইল আপলোড → সিরিয়াল মোড-বাটনে ক্লিকেই সব বহন
await page.waitForSelector("#step-upload", { timeout: 30000 });
await page.setInputFiles("#step-upload input[type='file']", [CHEM, HSC, NOCOLOR]);
await page.waitForSelector('[role="tablist"]', { timeout: 30000 });
await page.click('button[role="tab"]:has-text("MCQ সিরিয়াল")');
await page.waitForSelector("text=সব ফাইল একসাথে সিরিয়াল করুন", { timeout: 120000 });
const nameCount = await page.locator("span.flex-1.truncate").count();
if (nameCount !== 3) throw new Error(`লিস্টে ৩ টা নাম দরকার, পাওয়া গেছে ${nameCount}`);
const singleCard = await page.locator("text=রঙ-ভিত্তিক সিরিয়াল").count();
if (singleCard !== 0) throw new Error("মাল্টি মোডে একক-ফাইল রঙ-কার্ড দেখা যাচ্ছে!");
console.log("✓ সিরিয়াল: ৩ ফাইল আপলোড → ক্রম-লিস্ট + মাল্টি ডাউনলোড কার্ড (রঙ-কার্ড নেই)");

// ---- ২. তীর-বাটনে রি-অর্ডার ----
const before = await page.locator("span.flex-1.truncate").first().textContent();
await page.locator('button[aria-label="উপরে তুলুন"]').nth(1).click();
const after = await page.locator("span.flex-1.truncate").first().textContent();
if (!before || !after || before === after) throw new Error(`রি-অর্ডার হয়নি: ${before} → ${after}`);
if (!after.includes("hsc27")) throw new Error("২য় ফাইল উপরে ওঠেনি: " + after);
console.log("✓ রি-অর্ডার (তীর-বাটন):", before?.trim(), "→", after?.trim());

// ---- ৩. মার্জ (.docx) ডাউনলোড + কন্টেন্ট ভেরিফিকেশন ----
const [merged] = await Promise.all([
  page.waitForEvent("download", { timeout: 180000 }),
  page.click('button:has-text("এক ফাইলে ডাউনলোড (.docx)")'),
]);
await page.waitForSelector("text=মার্জ করা .docx ডাউনলোড হয়েছে", { timeout: 60000 });
if (!merged.suggestedFilename().includes("merged serial")) throw new Error("মার্জ ফাইলনাম ভুল: " + merged.suggestedFilename());
const mergedXml = await readDocxXml(await merged.path());
const pb = (mergedXml.match(/<w:br w:type="page"\/>/g) || []).length;
if (pb < 2) throw new Error(`পেজ-ব্রেক কম (৩ ফাইলে ন্যূনতম ২): ${pb}`);
for (const src of [CHEM, HSC, NOCOLOR]) {
  const m = markerOf(await readDocxXml(src));
  if (!mergedXml.includes(m)) throw new Error(`মার্জে ফাইলের কন্টেন্ট নেই (${src}): ${m.slice(0, 40)}`);
}
console.log("✓ মার্জ .docx: পেজ-ব্রেক", pb, "টি + ৩ ফাইলের কন্টেন্ট ক্রমানুসারে আছে");

// ---- ৪. ZIP ডাউনলোড + ভেরিফিকেশন ----
const [zipDl] = await Promise.all([
  page.waitForEvent("download", { timeout: 180000 }),
  page.click('button:has-text("আলাদা আলাদা ডাউনলোড (.zip)")'),
]);
await page.waitForSelector("text=ZIP ডাউনলোড হয়েছে", { timeout: 60000 });
if (zipDl.suggestedFilename() !== "MCQ-serial-files.zip") throw new Error("ZIP নাম ভুল: " + zipDl.suggestedFilename());
const zz = await JSZip.loadAsync(fs.readFileSync(await zipDl.path()));
const entries = Object.keys(zz.files).filter((n) => n.endsWith(".docx"));
if (entries.length !== 3) throw new Error("ZIP-এ ৩ টা .docx দরকার: " + entries.join(", "));
for (const e of entries) {
  // zip-এর ভিতরের .docx নিজেই একটা zip — আগে আবার unzip, তারপর document.xml
  const inner = await JSZip.loadAsync(await zz.file(e)!.async("uint8array"));
  const x = await inner.file("word/document.xml")!.async("string");
  if (!x.includes("<w:body")) throw new Error("ZIP-এর ভিতরের ফাইল ভাঙা: " + e);
}
console.log("✓ ZIP:", entries.length, "টি সিরিয়াল-করা .docx —", entries.join(" | "));

// ---- ৫. সিঙ্গেল-ফাইল রিগ্রেশন: ২ টা বাদ দিলে রঙ-চিপ কার্ড ফেরে ----
await page.locator('button[aria-label="তালিকা থেকে বাদ দিন"]').nth(0).click();
await page.waitForTimeout(300);
await page.locator('button[aria-label="তালিকা থেকে বাদ দিন"]').nth(1).click();
await page.waitForSelector("text=রঙ-ভিত্তিক সিরিয়াল", { timeout: 30000 });
console.log("✓ ১ ফাইলে নামলে পুরনো রঙ-চিপ কার্ড ফিরে আসে (রিগ্রেশন OK)");

// ================== শাফল মোড — মাল্টি-ফাইল ==================
await page.click('button[role="tab"]:has-text("MCQ শাফল")');
await page.waitForSelector("text=প্রশ্ন দিন — ফাইল আপলোড বা পেস্ট", { timeout: 30000 });
await page.locator('input[type="file"]').first().setInputFiles([HSC, NOCOLOR]);
await page.waitForSelector("text=আপলোড হওয়া ফাইল", { timeout: 120000 });
console.log("✓ শাফল: ২ ফাইল আপলোড → মাল্টি লিস্ট");

await page.click('button:has-text("শাফল করুন ও সেট তৈরি করুন")');
await page.waitForSelector("text=শাফল সম্পন্ন — এখন ডাউনলোড করুন", { timeout: 120000 });
console.log("✓ সব ফাইল একসাথে শাফল হলো");

// ---- মার্জ ডাউনলোড + ভেরিফিকেশন ----
const [shMerged] = await Promise.all([
  page.waitForEvent("download", { timeout: 180000 }),
  page.click('button:has-text("এক ফাইলে ডাউনলোড (.docx)")'),
]);
await page.waitForSelector("text=মার্জ করা Word ফাইল ডাউনলোড হয়েছে", { timeout: 60000 });
if (!shMerged.suggestedFilename().includes("merged shuffled")) throw new Error("শাফল-মার্জ নাম ভুল: " + shMerged.suggestedFilename());
const shXml = await readDocxXml(await shMerged.path());
const setA = (shXml.match(/>Set A</g) || []).length;
if (setA < 2) throw new Error("প্রতি ফাইলে Set A হেডার দরকার (≥২): " + setA);
const shPb = (shXml.match(/<w:br w:type="page"\/>/g) || []).length;
if (shPb < 7) throw new Error(`শাফল-মার্জ পেজ-ব্রেক কম: ${shPb}`);
for (const src of [HSC, NOCOLOR]) {
  if (!(await contentOverlap(src, shXml))) throw new Error(`শাফল-মার্জে কন্টেন্ট নেই (${src})`);
}
console.log("✓ শাফল-মার্জ: Set A ×", setA, "+ পেজ-ব্রেক", shPb, "+ ২ ফাইলের কন্টেন্ট আছে");

// ---- ZIP ডাউনলোড + ভেরিফিকেশন ----
const [shZip] = await Promise.all([
  page.waitForEvent("download", { timeout: 180000 }),
  page.click('button:has-text("আলাদা আলাদা ডাউনলোড (.zip)")'),
]);
await page.waitForSelector("text=ZIP ডাউনলোড হয়েছে", { timeout: 60000 });
if (shZip.suggestedFilename() !== "MCQ-shuffled-files.zip") throw new Error("শাফল-ZIP নাম ভুল: " + shZip.suggestedFilename());
const sz = await JSZip.loadAsync(fs.readFileSync(await shZip.path()));
const shEntries = Object.keys(sz.files).filter((n) => n.endsWith(".docx"));
if (shEntries.length !== 2) throw new Error("শাফল-ZIP-এ ২ টা .docx দরকার");
for (const e of shEntries) {
  const inner = await JSZip.loadAsync(await sz.file(e)!.async("uint8array"));
  const x = await inner.file("word/document.xml")!.async("string");
  if (!x.includes(">Set A<")) throw new Error("ZIP-এর ফাইলে সেট নেই: " + e);
}
console.log("✓ শাফল-ZIP:", shEntries.join(" | "));

// ---- কনসোল-এরর চেক ----
if (errors.length) {
  console.log("\n❌ কনসোল এরর:");
  for (const e of errors) console.log("  " + e);
  process.exit(1);
}

console.log("\n✅ সব মাল্টি-ফাইল E2E পাস (কনসোল এরর শূন্য)");
await browser.close();
