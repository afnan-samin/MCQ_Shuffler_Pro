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
const tabsBefore = await page.locator('button[role="tab"]:has-text("MCQ Shuffle")').count();
if (tabsBefore !== 0) throw new Error("আপলোডের আগেই মোড-ট্যাব দেখা যাচ্ছে!");
console.log("✓ প্রথমে শুধু আপলোড-কার্ড — মোড-ট্যাব লুকানো");

// ---- ২. ফাইল আপলোড → স্টেজ-কার্ড + ৩ মোড-ট্যাব দেখা যায় ----
await page.setInputFiles("#step-upload input[type='file']", CHEM);
await page.waitForSelector("text=files ready — pick a mode now", { timeout: 30000 });
await page.waitForSelector('button[role="tab"]:has-text("MCQ Redownload")', { timeout: 15000 });
const tabCount = await page.locator('button[role="tab"]:has-text("MCQ")').count();
if (tabCount !== 3) throw new Error(`৩ মোড-বাটন নেই: ${tabCount}`);
console.log("✓ আপলোডের পরে স্টেজ-কার্ড + ৩টা মোড-বাটন");

// ---- ৩. সিরিয়াল মোডে ক্লিক → ৩ মোড-বাটন লুকানো + ওয়ার্ক-বার (পেছনে + আরও ফাইল) ----
await page.click('button[role="tab"]:has-text("MCQ Serial")');
await page.waitForSelector("text=Color-based serial", { timeout: 120000 });
const tabsInWork = await page.locator('button[role="tab"]:has-text("MCQ")').count();
if (tabsInWork !== 0) throw new Error(`কাজের ভিউতে ${tabsInWork} টা মোড-বাটন এখনো দেখা যাচ্ছে — লুকানো উচিত!`);
await page.waitForSelector('[data-testid="mode-work-bar"]', { timeout: 15000 });
await page.waitForSelector('button[aria-label="Back — return home"]', { timeout: 10000 });
const addBtn = await page.locator('button:has-text("Add files")').count();
if (addBtn < 1) throw new Error("ওয়ার্ক-বারে 'আরও ফাইল' বাটন নেই!");
for (const chip of ["A3", "A4", "B1", "B6"]) {
  await page.waitForSelector(`button:has-text("${chip}")`, { timeout: 20000 });
}
console.log("✓ মোডে ঢুকতেই ৩ মোড-বাটন লুকানো → ওয়ার্ক-বার (পেছনে + আরও ফাইল) → A3/A4/B1/B6 চিপ");

// ---- ৪. ওয়ার্ক-বারের 'আরও ফাইল' → একই মোডে ফাইল যোগ ----
await page.setInputFiles('[data-testid="mode-work-bar-input"]', NOCOLOR);
await page.waitForSelector("text=Serial all files together", { timeout: 120000 });
console.log("✓ 'আরও ফাইল' দিয়ে ২য় ফাইল সিরিয়াল মোডেই যোগ → মাল্টি-ডাউনলোড কার্ড");

// ---- ৫. ২য় ফাইল বাদ দিয়ে আগের ১-ফাইল অবস্থায় ফেরা → B1 ডাউনলোড ----
await page.locator('button[aria-label="Remove from list"]').nth(1).click();
await page.waitForSelector("text=Color-based serial", { timeout: 30000 });
await page.click('button:has-text("B1")');
const [dl1] = await Promise.all([
  page.waitForEvent("download", { timeout: 180000 }),
  page.click('button:has-text("Download serial .docx")'),
]);
await page.waitForSelector("text=Color-serial .docx downloaded", { timeout: 60000 });
if (!dl1.suggestedFilename().includes("color serial - B1")) throw new Error("B1 ফাইলনাম ভুল: " + dl1.suggestedFilename());
console.log("✓ সিরিয়াল মোড B1 ডাউনলোড OK:", dl1.suggestedFilename());

// ---- ৬. ডাউনলোড-কার্ডের পরে বাকি ২ মোড দেখা যায় ----
await page.waitForSelector("text=Keep working with these files", { timeout: 15000 });
const nextShuffle = await page.locator('button:has-text("MCQ Shuffle")').count();
const nextRd = await page.locator('button:has-text("MCQ Redownload")').count();
// ট্যাব এখন লুকানো — শুধু নেক্সট-মোড কার্ডের ২টা বাটনই থাকবে
if (nextShuffle < 1 || nextRd < 1) throw new Error(`নেক্সট-মোড বাটন নেই: shuffle=${nextShuffle} rd=${nextRd}`);
console.log("✓ ডাউনলোডের পরে বাকি ২ মোডের বাটন দেখা যাচ্ছে");

// ---- ৭. নেক্সট-মোড বাটনে ক্লিক → ফাইল শাফল মোডে বহন ----
await page.locator('button:has-text("MCQ Shuffle"):below(:text("Keep working with these files"))').first().click();
await page.waitForSelector("text=This file has colored headers", { timeout: 120000 });
await page.waitForSelector('button:has-text("Shuffle & build sets")', { timeout: 60000 });
await page.waitForSelector("text=1/50 files", { timeout: 15000 });
console.log("✓ ফাইল শাফল মোডে সরাসরি বহন → ইনফো-কার্ড + ফাইল-কাউন্ট চিপ ১/৫০");

// ---- ৮. 'আরও ফাইল' দিয়ে শাফলে ২য় ফাইল যোগ → ২/৫০ ----
await page.setInputFiles('[data-testid="mode-work-bar-input"]', NOCOLOR);
await page.waitForSelector("text=Uploaded files (2)", { timeout: 120000 });
await page.waitForSelector("text=2/50 files", { timeout: 15000 });
console.log("✓ শাফলে 'আরও ফাইল' append → ২/৫০ চিপ");

// ---- ৯. পেছনে বাটন → হোমে ফেরা (আপলোড-কার্ড; সব ফাইল/ডেটা রিসেট) ----
await page.click('button[aria-label="Back — return home"]');
await page.waitForSelector("#step-upload", { timeout: 15000 });
const tabsAfterBack = await page.locator('button[role="tab"]:has-text("MCQ")').count();
if (tabsAfterBack !== 0) throw new Error("হোমে ফেরার পরেও মোড-ট্যাব দেখা যাচ্ছে!");
console.log("✓ পেছনে → হোমে ফেরা (আপলোড-কার্ড, সব ফাইল রিসেট)");

// ---- ৯বি. নতুন করে ২ ফাইল স্টেজ → রিডাউনলোড মোড ----
await page.setInputFiles("#step-upload input[type='file']", [CHEM, NOCOLOR]);
await page.waitForSelector('button[role="tab"]:has-text("MCQ Redownload")', { timeout: 30000 });
await page.click('button[role="tab"]:has-text("MCQ Redownload")');
await page.waitForSelector("text=Pick parts", { timeout: 120000 });
console.log("✓ ২ ফাইল রিডাউনলোড মোডে লোড");

// ---- ১০. ২ ফাইল → মার্জ (.docx) + ZIP দুই বাটনই; ১ ফাইলে নামলে একটাই বাটন (ZIP নেই) ----
const mergedBtn = await page.locator('button:has-text("Download as one file (.docx)")').count();
const zipBtn = await page.locator('button:has-text("Download separately (.zip)")').count();
if (mergedBtn !== 1 || zipBtn !== 1) throw new Error(`মাল্টি-ফাইল ডাউনলোড ভুল: merged=${mergedBtn} zip=${zipBtn}`);
console.log("✓ ২ ফাইল → মার্জ .docx + ZIP দুটোই (মাল্টি = ZIP অপশন)");
await page.locator('button[aria-label="Remove from list"]').nth(1).click();
await page.waitForSelector('button:has-text("Download (.docx)")', { timeout: 30000 });
const singleBtn2 = await page.locator('button:has-text("Download (.docx)")').count();
const zipBtn2 = await page.locator('button:has-text("Download separately (.zip)")').count();
if (singleBtn2 !== 1 || zipBtn2 !== 0) throw new Error(`একক-ফাইল ডাউনলোড ভুল: single=${singleBtn2} zip=${zipBtn2}`);
console.log("✓ একক ফাইল → একটাই ডাউনলোড বাটন, ZIP বাটন নেই");

// ---- ১১. reload → ইনপুট রিসেট → আবার আপলোড-কার্ড থেকে শুরু ----
await page.reload({ waitUntil: "networkidle" });
await page.waitForSelector("#step-upload", { timeout: 30000 });
const tabsAfterReload = await page.locator('button[role="tab"]:has-text("MCQ Shuffle")').count();
if (tabsAfterReload !== 0) throw new Error("reload-এর পরে ইনপুট ছাড়াই মোড-ট্যাব দেখা যাচ্ছে!");
console.log("✓ reload → ফ্রেশ শুরু: আবার আপলোড-কার্ড (মোড-ট্যাব লুকানো)");

await page.screenshot({ path: "scripts/e2e-mode-tabs.png", fullPage: false });
console.log("\nJS errors:", errors.length ? errors : "শূন্য ✓");
await browser.close();
