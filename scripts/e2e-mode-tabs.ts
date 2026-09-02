// Browser E2E: মোড-ট্যাব (শাফল / সিরিয়াল) — আলাদা ওয়ার্কফ্লো ভেরিফিকেশন
// রান: bun run scripts/e2e-mode-tabs.ts
import { chromium } from "playwright";

const CHEM = "/home/z/my-project/upload/Final Chemistry 1st paper only varsity Question (1-5).docx";
const HSC = "/home/z/my-project/public/sample/hsc27-physics-bijoy.docx";
const NOCOLOR = "/home/z/my-project/upload/color-free-test.docx";

const browser = await chromium.launch();
const page = await browser.newPage();
const errors: string[] = [];
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
page.on("console", (m) => {
  if (m.type() === "error") errors.push("console: " + m.text());
});

await page.goto("http://localhost:3000", { waitUntil: "networkidle" });

// ---- ১. দুইটা মোড-বাটন; ডিফল্ট = শাফল ----
await page.waitForSelector('[role="tablist"]', { timeout: 30000 });
const shuffleSel = await page.getAttribute('button[role="tab"]:has-text("MCQ শাফল")', "aria-selected");
const serialSel = await page.getAttribute('button[role="tab"]:has-text("MCQ সিরিয়াল")', "aria-selected");
if (shuffleSel !== "true" || serialSel !== "false") throw new Error(`ডিফল্ট মোড ভুল: shuffle=${shuffleSel} serial=${serialSel}`);
console.log("✓ দুই মোড-বাটন আছে; ডিফল্ট = শাফল");

// ---- ২. সিরিয়াল মোড: রঙ-ফাইল আপলোড → চিপ → B1 ডাউনলোড ----
await page.click('button[role="tab"]:has-text("MCQ সিরিয়াল")');
await page.waitForSelector("text=MCQ সিরিয়াল — ফাইল আপলোড", { timeout: 15000 });
await page.setInputFiles('input[type="file"]', CHEM);
await page.waitForSelector("text=রঙ-ভিত্তিক সিরিয়াল", { timeout: 120000 });
for (const chip of ["A3", "A4", "B1", "B6"]) {
  await page.waitForSelector(`button:has-text("${chip}")`, { timeout: 20000 });
}
console.log("✓ সিরিয়াল মোডে রঙ-ফাইল → A3/A4/B1/B6 চিপ");

await page.click('button:has-text("B1")');
const [dl1] = await Promise.all([
  page.waitForEvent("download", { timeout: 180000 }),
  page.click('button:has-text("সিরিয়াল করে .docx ডাউনলোড")'),
]);
await page.waitForSelector("text=রঙ-অনুযায়ী সিরিয়াল করা .docx ডাউনলোড হয়েছে", { timeout: 60000 });
if (!dl1.suggestedFilename().includes("color serial - B1")) throw new Error("B1 ফাইলনাম ভুল: " + dl1.suggestedFilename());
console.log("✓ সিরিয়াল মোড B1 ডাউনলোড OK:", dl1.suggestedFilename());

// ---- ৩. শাফল মোডে রঙ-ফাইল → নোটিস + হাত-অফ ----
await page.click('button[role="tab"]:has-text("MCQ শাফল")');
await page.waitForSelector("text=প্রশ্ন দিন — ফাইল আপলোড বা পেস্ট", { timeout: 15000 });
await page.setInputFiles('input[type="file"]', CHEM);
await page.waitForSelector("text=সিরিয়াল মোডে এই ফাইল খুলুন", { timeout: 120000 });
await page.waitForSelector("text=এই ফাইল রঙ-স্ট্রাকচার্ড — শাফল মোডে করা যাবে না", { timeout: 15000 });
console.log("✓ শাফল মোডে রঙ-ফাইল → শাফল বন্ধ-নোটিস + হাত-অফ বাটন");

await page.click('button:has-text("সিরিয়াল মোডে এই ফাইল খুলুন")');
await page.waitForSelector("text=রঙ-ভিত্তিক সিরিয়াল", { timeout: 15000 });
const serialSel2 = await page.getAttribute('button[role="tab"]:has-text("MCQ সিরিয়াল")', "aria-selected");
if (serialSel2 !== "true") throw new Error("হাত-অফে সিরিয়াল মোডে যায়নি");
console.log("✓ হাত-অফ: ফাইলসহ সিরিয়াল মোডে পৌঁছেছে (আবার আপলোড লাগেনি)");

// ---- ৪. সিরিয়াল মোডে রঙহীন ফাইল → একটানা সিরিয়াল ----
await page.setInputFiles('input[type="file"]', NOCOLOR);
await page.waitForSelector("text=এই ফাইলে রঙ-হেডার পাওয়া যায়নি", { timeout: 60000 });
const [dl2] = await Promise.all([
  page.waitForEvent("download", { timeout: 120000 }),
  page.click('button:has-text("একটানা ১..N সিরিয়াল করে .docx ডাউনলোড")'),
]);
await page.waitForSelector("text=রঙ-অনুযায়ী সিরিয়াল করা .docx ডাউনলোড হয়েছে", { timeout: 60000 });
if (!dl2.suggestedFilename().includes("continuous")) throw new Error("continuous ফাইলনাম ভুল: " + dl2.suggestedFilename());
console.log("✓ রঙহীন ফাইল → নো-কালার কার্ড + একটানা সিরিয়াল ডাউনলোড OK:", dl2.suggestedFilename());

// ---- ৫. মোড মনে থাকে (reload) ----
await page.reload({ waitUntil: "networkidle" });
const serialSel3 = await page.getAttribute('button[role="tab"]:has-text("MCQ সিরিয়াল")', "aria-selected");
if (serialSel3 !== "true") throw new Error("reload-এর পরে মোড মনে নেই");
console.log("✓ reload-এর পরেও সিরিয়াল মোড সক্রিয় (মনে রাখে)");

// ---- ৬. শাফল মোড অক্ষত: রঙহীন docx → শাফল ফ্লো (HSC নমুনা রঙ-স্ট্রাকচার্ড তাই সেটা নয়) ----
await page.click('button[role="tab"]:has-text("MCQ শাফল")');
await page.setInputFiles('input[type="file"]', NOCOLOR);
await page.waitForSelector("text=টি প্রশ্ন", { timeout: 60000 });
const noticeCount = await page.locator("text=সিরিয়াল মোডে এই ফাইল খুলুন").count();
if (noticeCount !== 0) throw new Error("রঙহীন ফাইলে নোটিস এসেছে?");
console.log("✓ শাফল মোডে রঙহীন docx → সাধারণ শাফল ফ্লো (নোটিস নেই)");

await page.screenshot({ path: "scripts/e2e-mode-tabs.png", fullPage: false });
console.log("\nJS errors:", errors.length ? errors : "শূন্য ✓");
await browser.close();
