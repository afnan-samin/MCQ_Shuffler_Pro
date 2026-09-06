// Browser E2E: নতুন ফ্লো — আগে আপলোড → ৩ মোড → কাজ → ডাউনলোডের পরে বাকি মোডে ফাইল-বহন
// রান: bun run scripts/e2e-mode-tabs.ts
import { chromium } from "playwright";

const CHEM = "/home/z/my-project/upload/Final Chemistry 1st paper only varsity Question (1-5).docx";
const NOCOLOR = "/home/z/my-project/upload/color-free-test.docx";

const browser = await chromium.launch();
const page = await browser.newPage();
const errors: string[] = [];
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
page.on("console", (m) => {
  if (m.type() === "error") errors.push("console: " + m.text());
});

await page.goto("http://localhost:3000", { waitUntil: "networkidle" });

// ---- ১. প্রথমে আপলোড-কার্ড; মোড-ট্যাব এখনো নেই ----
await page.waitForSelector("#step-upload", { timeout: 30000 });
const tabsBefore = await page.locator('button[role="tab"]:has-text("MCQ শাফল")').count();
if (tabsBefore !== 0) throw new Error("আপলোডের আগেই মোড-ট্যাব দেখা যাচ্ছে!");
console.log("✓ প্রথমে শুধু আপলোড-কার্ড — মোড-ট্যাব লুকানো");

// ---- ২. ফাইল আপলোড → স্টেজ-কার্ড + ৩ মোড-ট্যাব দেখা যায় ----
await page.setInputFiles("#step-upload input[type='file']", CHEM);
await page.waitForSelector("text=ফাইল প্রস্তুত — এখন মোড বেছে নিন", { timeout: 30000 });
await page.waitForSelector('button[role="tab"]:has-text("MCQ রিডাউনলোড")', { timeout: 15000 });
const tabCount = await page.locator('button[role="tab"]:has-text("MCQ")').count();
if (tabCount !== 3) throw new Error(`৩ মোড-বাটন নেই: ${tabCount}`);
console.log("✓ আপলোডের পরে স্টেজ-কার্ড + ৩টা মোড-বাটন");

// ---- ৩. সিরিয়াল মোডে ক্লিক → স্টেজ ফাইল নিজেই চলে যায় ----
await page.click('button[role="tab"]:has-text("MCQ সিরিয়াল")');
await page.waitForSelector("text=রঙ-ভিত্তিক সিরিয়াল", { timeout: 120000 });
for (const chip of ["A3", "A4", "B1", "B6"]) {
  await page.waitForSelector(`button:has-text("${chip}")`, { timeout: 20000 });
}
console.log("✓ মোড-ক্লিকেই স্টেজ-ফাইল সিরিয়াল মোডে লোড → A3/A4/B1/B6 চিপ");

// ---- ৪. B1 ডাউনলোড ----
await page.click('button:has-text("B1")');
const [dl1] = await Promise.all([
  page.waitForEvent("download", { timeout: 180000 }),
  page.click('button:has-text("সিরিয়াল করে .docx ডাউনলোড")'),
]);
await page.waitForSelector("text=রঙ-অনুযায়ী সিরিয়াল করা .docx ডাউনলোড হয়েছে", { timeout: 60000 });
if (!dl1.suggestedFilename().includes("color serial - B1")) throw new Error("B1 ফাইলনাম ভুল: " + dl1.suggestedFilename());
console.log("✓ সিরিয়াল মোড B1 ডাউনলোড OK:", dl1.suggestedFilename());

// ---- ৫. ডাউনলোড-কার্ডের পরে বাকি ২ মোড দেখা যায় ----
await page.waitForSelector("text=এই ফাইলগুলো দিয়ে আরও কাজ করুন", { timeout: 15000 });
const nextShuffle = await page.locator('button:has-text("MCQ শাফল")').count();
const nextRd = await page.locator('button:has-text("MCQ রিডাউনলোড")').count();
if (nextShuffle < 2 || nextRd < 1) throw new Error(`নেক্সট-মোড বাটন নেই: shuffle=${nextShuffle} rd=${nextRd}`);
console.log("✓ ডাউনলোডের পরে বাকি ২ মোডের বাটন দেখা যাচ্ছে");

// ---- ৬. নেক্সট-মোড বাটনে ক্লিক → ফাইল শাফল মোডে বহন ----
await page.locator('button:has-text("MCQ শাফল"):below(:text("এই ফাইলগুলো দিয়ে আরও কাজ করুন"))').first().click();
await page.waitForSelector("text=শাফলে হেডার বাদ যাবে", { timeout: 120000 });
await page.waitForSelector('button:has-text("শাফল করুন ও সেট তৈরি করুন")', { timeout: 60000 });
console.log("✓ ফাইল শাফল মোডে সরাসরি বহন → ইনফো-কার্ড + শাফল-ফ্লো চালু");

// ---- ৭. শাফল মোড থেকে রিডাউনলোডে বহন (ট্যাব দিয়ে) ----
await page.click('button[role="tab"]:has-text("MCQ রিডাউনলোড")');
await page.waitForSelector("text=নতুন ফাইলে কী কী থাকবে", { timeout: 120000 });
console.log("✓ ট্যাব-ক্লিকেই ফাইল রিডাউনলোড মোডে বহন");

// ---- ৮. একক ফাইলে একটাই ডাউনলোড বাটন (ZIP নেই) ----
const singleBtn = await page.locator('button:has-text("ডাউনলোড করুন (.docx)")').count();
const zipBtn = await page.locator('button:has-text("আলাদা আলাদা ডাউনলোড (.zip)")').count();
if (singleBtn !== 1 || zipBtn !== 0) throw new Error(`একক-ফাইল ডাউনলোড ভুল: single=${singleBtn} zip=${zipBtn}`);
console.log("✓ একক ফাইল → একটাই ডাউনলোড বাটন, ZIP বাটন নেই");

// ---- ৯. reload → ইনপুট রিসেট → আবার আপলোড-কার্ড থেকে শুরু (নতুন ফ্লোর আচরণ) ----
await page.reload({ waitUntil: "networkidle" });
await page.waitForSelector("#step-upload", { timeout: 30000 });
const tabsAfterReload = await page.locator('button[role="tab"]:has-text("MCQ শাফল")').count();
if (tabsAfterReload !== 0) throw new Error("reload-এর পরে ইনপুট ছাড়াই মোড-ট্যাব দেখা যাচ্ছে!");
console.log("✓ reload → ফ্রেশ শুরু: আবার আপলোড-কার্ড (মোড-ট্যাব লুকানো)");

await page.screenshot({ path: "scripts/e2e-mode-tabs.png", fullPage: false });
console.log("\nJS errors:", errors.length ? errors : "শূন্য ✓");
await browser.close();
