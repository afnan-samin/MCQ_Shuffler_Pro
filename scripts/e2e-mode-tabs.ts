// Browser E2E: নতুন ফ্লো — আপলোড → মোড-বাছাই → কাজ (৩ মোড-বাটন লুকানো; পেছনে + আরও ফাইল) → ডাউনলোডের পরে বাকি মোডে বহন
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

// ---- ৩. সিরিয়াল মোডে ক্লিক → ৩ মোড-বাটন লুকানো + ওয়ার্ক-বার (পেছনে + আরও ফাইল) ----
await page.click('button[role="tab"]:has-text("MCQ সিরিয়াল")');
await page.waitForSelector("text=রঙ-ভিত্তিক সিরিয়াল", { timeout: 120000 });
const tabsInWork = await page.locator('button[role="tab"]:has-text("MCQ")').count();
if (tabsInWork !== 0) throw new Error(`কাজের ভিউতে ${tabsInWork} টা মোড-বাটন এখনো দেখা যাচ্ছে — লুকানো উচিত!`);
await page.waitForSelector('[data-testid="mode-work-bar"]', { timeout: 15000 });
await page.waitForSelector('button[aria-label="পেছনে — মোড বাছাই"]', { timeout: 10000 });
const addBtn = await page.locator('button:has-text("আরও ফাইল")').count();
if (addBtn < 1) throw new Error("ওয়ার্ক-বারে 'আরও ফাইল' বাটন নেই!");
for (const chip of ["A3", "A4", "B1", "B6"]) {
  await page.waitForSelector(`button:has-text("${chip}")`, { timeout: 20000 });
}
console.log("✓ মোডে ঢুকতেই ৩ মোড-বাটন লুকানো → ওয়ার্ক-বার (পেছনে + আরও ফাইল) → A3/A4/B1/B6 চিপ");

// ---- ৪. ওয়ার্ক-বারের 'আরও ফাইল' → একই মোডে ফাইল যোগ ----
await page.setInputFiles('[data-testid="mode-work-bar-input"]', NOCOLOR);
await page.waitForSelector("text=সব ফাইল একসাথে সিরিয়াল করুন", { timeout: 120000 });
console.log("✓ 'আরও ফাইল' দিয়ে ২য় ফাইল সিরিয়াল মোডেই যোগ → মাল্টি-ডাউনলোড কার্ড");

// ---- ৫. ২য় ফাইল বাদ দিয়ে আগের ১-ফাইল অবস্থায় ফেরা → B1 ডাউনলোড ----
await page.locator('button[aria-label="তালিকা থেকে বাদ দিন"]').nth(1).click();
await page.waitForSelector("text=রঙ-ভিত্তিক সিরিয়াল", { timeout: 30000 });
await page.click('button:has-text("B1")');
const [dl1] = await Promise.all([
  page.waitForEvent("download", { timeout: 180000 }),
  page.click('button:has-text("সিরিয়াল করে .docx ডাউনলোড")'),
]);
await page.waitForSelector("text=রঙ-অনুযায়ী সিরিয়াল করা .docx ডাউনলোড হয়েছে", { timeout: 60000 });
if (!dl1.suggestedFilename().includes("color serial - B1")) throw new Error("B1 ফাইলনাম ভুল: " + dl1.suggestedFilename());
console.log("✓ সিরিয়াল মোড B1 ডাউনলোড OK:", dl1.suggestedFilename());

// ---- ৬. ডাউনলোড-কার্ডের পরে বাকি ২ মোড দেখা যায় ----
await page.waitForSelector("text=এই ফাইলগুলো দিয়ে আরও কাজ করুন", { timeout: 15000 });
const nextShuffle = await page.locator('button:has-text("MCQ শাফল")').count();
const nextRd = await page.locator('button:has-text("MCQ রিডাউনলোড")').count();
// ট্যাব এখন লুকানো — শুধু নেক্সট-মোড কার্ডের ২টা বাটনই থাকবে
if (nextShuffle < 1 || nextRd < 1) throw new Error(`নেক্সট-মোড বাটন নেই: shuffle=${nextShuffle} rd=${nextRd}`);
console.log("✓ ডাউনলোডের পরে বাকি ২ মোডের বাটন দেখা যাচ্ছে");

// ---- ৭. নেক্সট-মোড বাটনে ক্লিক → ফাইল শাফল মোডে বহন ----
await page.locator('button:has-text("MCQ শাফল"):below(:text("এই ফাইলগুলো দিয়ে আরও কাজ করুন"))').first().click();
await page.waitForSelector("text=শাফলে হেডার বাদ যাবে", { timeout: 120000 });
await page.waitForSelector('button:has-text("শাফল করুন ও সেট তৈরি করুন")', { timeout: 60000 });
await page.waitForSelector("text=১/১০ ফাইল", { timeout: 15000 });
console.log("✓ ফাইল শাফল মোডে সরাসরি বহন → ইনফো-কার্ড + ফাইল-কাউন্ট চিপ ১/১০");

// ---- ৮. 'আরও ফাইল' দিয়ে শাফলে ২য় ফাইল যোগ → ২/১০ ----
await page.setInputFiles('[data-testid="mode-work-bar-input"]', NOCOLOR);
await page.waitForSelector("text=আপলোড হওয়া ফাইল (2 টি)", { timeout: 120000 });
await page.waitForSelector("text=২/১০ ফাইল", { timeout: 15000 });
console.log("✓ শাফলে 'আরও ফাইল' append → ২/১০ চিপ");

// ---- ৯. পেছনে বাটন → মোড-বাছাইয়ে ফেরা (৩ ট্যাব আবার দেখা যায়) → রিডাউনলোডে বহন ----
await page.click('button[aria-label="পেছনে — মোড বাছাই"]');
await page.waitForSelector('button[role="tab"]:has-text("MCQ রিডাউনলোড")', { timeout: 15000 });
console.log("✓ পেছনে → মোড-বাছাই ধাপে ফেরা (৩টা মোড-বাটন আবার দৃশ্যমান)");
await page.click('button[role="tab"]:has-text("MCQ রিডাউনলোড")');
await page.waitForSelector("text=নতুন ফাইলে কী কী থাকবে", { timeout: 120000 });
console.log("✓ পেছনে-ফেরা ধাপ থেকেই ফাইল রিডাউনলোড মোডে বহন");

// ---- ১০. ২ ফাইল → মার্জ (.docx) + ZIP দুই বাটনই; ১ ফাইলে নামলে একটাই বাটন (ZIP নেই) ----
const mergedBtn = await page.locator('button:has-text("এক ফাইলে ডাউনলোড (.docx)")').count();
const zipBtn = await page.locator('button:has-text("আলাদা আলাদা ডাউনলোড (.zip)")').count();
if (mergedBtn !== 1 || zipBtn !== 1) throw new Error(`মাল্টি-ফাইল ডাউনলোড ভুল: merged=${mergedBtn} zip=${zipBtn}`);
console.log("✓ ২ ফাইল → মার্জ .docx + ZIP দুটোই (মাল্টি = ZIP অপশন)");
await page.locator('button[aria-label="তালিকা থেকে বাদ দিন"]').nth(1).click();
await page.waitForSelector('button:has-text("ডাউনলোড করুন (.docx)")', { timeout: 30000 });
const singleBtn2 = await page.locator('button:has-text("ডাউনলোড করুন (.docx)")').count();
const zipBtn2 = await page.locator('button:has-text("আলাদা আলাদা ডাউনলোড (.zip)")').count();
if (singleBtn2 !== 1 || zipBtn2 !== 0) throw new Error(`একক-ফাইল ডাউনলোড ভুল: single=${singleBtn2} zip=${zipBtn2}`);
console.log("✓ একক ফাইল → একটাই ডাউনলোড বাটন, ZIP বাটন নেই");

// ---- ১১. reload → ইনপুট রিসেট → আবার আপলোড-কার্ড থেকে শুরু ----
await page.reload({ waitUntil: "networkidle" });
await page.waitForSelector("#step-upload", { timeout: 30000 });
const tabsAfterReload = await page.locator('button[role="tab"]:has-text("MCQ শাফল")').count();
if (tabsAfterReload !== 0) throw new Error("reload-এর পরে ইনপুট ছাড়াই মোড-ট্যাব দেখা যাচ্ছে!");
console.log("✓ reload → ফ্রেশ শুরু: আবার আপলোড-কার্ড (মোড-ট্যাব লুকানো)");

await page.screenshot({ path: "scripts/e2e-mode-tabs.png", fullPage: false });
console.log("\nJS errors:", errors.length ? errors : "শূন্য ✓");
await browser.close();
