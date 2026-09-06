// ============================================================
// E2E — সব মোড × সব অপশন-পাথ (Task 34-b modes-ui-e2e)
// শাফল: সেট-কাউন্ট ১/৩/১০ + ক্ল্যাম্প + ৪ ডিস্ট্রিবিউশন + shuffleWithin + রিনাম্বার + ডাউনলোড
// সিরিয়াল: ১ ফাইল (রঙ) → ৩ ফাইল (স্কিম/রিঅর্ডার/রিমুভ + মার্জ/ZIP) → পেস্ট-পাথ
// রিডাউনলোড: ৬ অংশ-টগল + রিনাম্বার + সিলেকশন (none/range) + একক/মার্জ/ZIP
// ফ্লো: পেছনে-বাটন, carry-over, আরও-ফাইল ক্যাপ (১০), staged clear, localStorage, টেক্সট-পেস্ট ফ্লো
// রান: bun run scripts/e2e-modes.ts   (dev server চালু থাকতে হবে)
// ============================================================
import { chromium } from "playwright";

const HSC = "/home/z/my-project/scripts/fixtures/hsc27-physics-bijoy.docx"; // রঙ-ফাইল, ৬০ প্রশ্ন (৬ হেডার বাদ)
const RAW10 = "/home/z/my-project/upload/Physics 1st Paper Chapter-10 (Raw).docx"; // রেফারেন্স-ট্যাগ আছে
const RAW11 = "/home/z/my-project/upload/Physics 1st Paper Chapter-09 (Raw).docx";
const CHEM = "/home/z/my-project/upload/Final Chemistry 1st paper only varsity Question (1-5).docx"; // রঙ-চিপ A3/A4/B1/B6
const NOCOLOR = "/home/z/my-project/upload/color-free-test.docx"; // রঙহীন

let passed = 0;
let failed = 0;
const ok = (cond: boolean, name: string, extra = "") => {
  if (cond) { passed++; console.log("  ✓", name, extra); }
  else { failed++; console.error("  ✗ FAIL:", name, extra); }
};

const browser = await chromium.launch();
const page = await browser.newPage();
const errors: string[] = [];
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
page.on("console", (m) => { if (m.type() === "error") errors.push("console: " + m.text()); });

const fresh = async () => {
  await page.goto("http://localhost:3000", { waitUntil: "networkidle" });
  await page.evaluate(() => { try { localStorage.clear(); } catch {} });
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForSelector("#step-upload", { timeout: 60000 });
};
const stage = async (files: string | string[]) => {
  await page.setInputFiles("#step-upload input[type='file']", files);
  await page.waitForSelector("text=ফাইল প্রস্তুত — এখন মোড বেছে নিন", { timeout: 60000 });
};
const openMode = async (label: string) => {
  await page.click(`button[role="tab"]:has-text("${label}")`);
};
const toastSeen = async (text: string, timeout = 15000) => {
  try {
    await page.waitForSelector(`text=${text}`, { timeout });
    return true;
  } catch { return false; }
};

// ============================================================
// A. শাফল মোড — একক docx: সেট-কাউন্ট + ডিস্ট্রিবিউশন + রিনাম্বার + ডাউনলোড
// ============================================================
console.log("\n== A. শাফল মোড (একক docx) ==");
await fresh();
await stage(HSC);
ok(true, "আপলোড → স্টেজ-কার্ড");
await openMode("MCQ শাফল");
await page.waitForSelector("text=60 প্রশ্ন শাফল হবে", { timeout: 120000 });
ok(true, "শাফল-মোডে ঢোকা → রঙ-ইনফো (৬০ প্রশ্ন)");
await page.waitForSelector('[data-testid="mode-work-bar"]', { timeout: 30000 });
ok((await page.locator("text=১/৫০ ফাইল").count()) === 1, "ফাইল-চিপ ১/৫০ (SHUFFLE_MAX_FILES কপি ঠিক)");

const shuffleBtn = 'button:has-text("শাফল করুন ও সেট তৈরি করুন")';
await page.waitForSelector(shuffleBtn, { timeout: 60000 });

// A1. সেট কাউন্ট ১ — নতুন গেট (min ১) — এটাই ইউজারের মূল কমপ্লেইন
await page.fill("#set-count", "1");
await page.click(shuffleBtn);
await page.waitForSelector("#step-result", { timeout: 60000 });
ok((await page.locator('#step-result :text("1 টি সেট")').count()) >= 1, "সেট-কাউন্ট ১ → ১ টি সেট তৈরি");
ok((await page.locator('#step-result :text("60 প্রশ্ন")').count()) >= 1, "১ সেটেই সব ৬০ প্রশ্ন (ব্যাজ)");

// A2. কুইক ৩ → ৩ সেট × ২০
await page.locator('#step-shuffle').getByRole("button", { name: "3", exact: true }).click(); // QUICK_SETS চিপ "3" (রেজাল্ট-কার্ডের "3" নম্বর-টগলের সাথে না মেশাতে স্কোপ করা)
await page.waitForTimeout(300);
const quickVal = await page.inputValue("#set-count");
ok(quickVal === "3", "কুইক-চিপ 3 → ইনপুটে 3", `(মান=${quickVal})`);
await page.click(shuffleBtn);
await page.waitForSelector('#step-result :text("3 টি সেট")', { timeout: 60000 });
ok((await page.locator('#step-result :text("20 প্রশ্ন")').count()) === 3, "৩ সেট × ২০ প্রশ্ন");

// A3. কুইক ১০ → ১০ সেট × ৬
await page.fill("#set-count", "10");
await page.click(shuffleBtn);
await page.waitForSelector('#step-result :text("10 টি সেট")', { timeout: 60000 });
ok((await page.locator('#step-result :text("6 প্রশ্ন")').count()) === 10, "১০ সেট × ৬ প্রশ্ন");

// A4. ক্ল্যাম্প: ১১ লিখলে ১০-এ নামে; ০ লিখলে ১-এ ধরে
await page.fill("#set-count", "11");
ok((await page.inputValue("#set-count")) === "10", "১১ ইনপুট → ক্ল্যাম্প ১০");
ok((await page.locator("text=১ থেকে ১০ এর মধ্যে দিন").count()) === 0, "১০-এ এরর-মেসেজ নেই");
await page.fill("#set-count", "0");
ok((await page.inputValue("#set-count")) === "1", "০ ইনপুট → ফলব্যাক ১ (min ১)");
ok((await page.locator("text=১ থেকে ১০ এর মধ্যে দিন").count()) === 0, "১-এও এরর-মেসেজ নেই");
await page.fill("#set-count", "3");

// A5. ডিস্ট্রিবিউশন — chunk (শাফল-ভিতরে বন্ধ → সিরিয়াল ব্লক)
await page.click('label[for="dist-chunk"]');
await page.click('#shuffle-within'); // OFF — এর সাথে shuffleWithin=off পাথও যাচাই হলো
await page.click(shuffleBtn);
await page.waitForSelector('#step-result :text("3 টি সেট")', { timeout: 60000 });
ok(true, "chunk + shuffleWithin OFF → ৩ সেট রেন্ডার");
await page.click('#shuffle-within'); // আবার ON

// A6. random
await page.click('label[for="dist-random"]');
await page.click(shuffleBtn);
await page.waitForSelector('#step-result :text("3 টি সেট")', { timeout: 60000 });
ok(true, "random ডিস্ট্রিবিউশন → ৩ সেট রেন্ডার");

// A7. original — প্রতি সেটে সব ৬০
await page.click('label[for="dist-original"]');
await page.click(shuffleBtn);
await page.waitForSelector('#step-result :text("3 টি সেট")', { timeout: 60000 });
ok((await page.locator('#step-result :text("60 প্রশ্ন")').count()) === 3, "original → ৩ সেটেই সব ৬০ প্রশ্ন");

// A8. interleaved-এ ফেরা + রিনাম্বার টগল
await page.click('label[for="dist-inter"]');
await page.click(shuffleBtn);
await page.waitForSelector('#step-result :text("3 টি সেট")', { timeout: 60000 });
ok((await page.locator('text=সিরিয়াল: ১,২,৩…').count()) >= 1, "রিনাম্বার ON ডিফল্ট ব্যাজ");
await page.click("#renumber-switch");
await page.waitForTimeout(300);
ok((await page.locator('text=সিরিয়াল: আসল').count()) >= 1, "রিনাম্বার টগল → আসল-নম্বর ব্যাজ");

// A9. দুই ডাউনলোডই ফায়ার + ফাইলনেম
const [dlR] = await Promise.all([
  page.waitForEvent("download", { timeout: 120000 }),
  page.click('button:has-text("রিনাম্বার সিরিয়াল")'),
]);
ok(dlR.suggestedFilename() === "hsc27-physics-bijoy (shuffled, renumbered).docx", "রিনাম্বারড ডাউনলোড নাম", dlR.suggestedFilename());
ok(await toastSeen("Word ফাইল ডাউনলোড হয়েছে"), "ডাউনলোড-টোস্ট");
const [dlO] = await Promise.all([
  page.waitForEvent("download", { timeout: 120000 }),
  page.click('button:has-text("আসল নম্বরসহ")'),
]);
ok(dlO.suggestedFilename() === "hsc27-physics-bijoy (shuffled, original serial).docx", "আসল-নম্বর ডাউনলোড নাম", dlO.suggestedFilename());

// A10. পেছনে → মোড-বাছাই
await page.click('button[aria-label="পেছনে — মোড বাছাই"]');
await page.waitForSelector('button[role="tab"]:has-text("MCQ সিরিয়াল")', { timeout: 30000 });
ok(true, "পেছনে → ৩ মোড-বাটন আবার দেখা যায়");

// ============================================================
// B. সিরিয়াল মোড — carry-over (শাফলের ফাইল) → ১ ফাইল রঙ → মাল্টি → পেস্ট
// ============================================================
console.log("\n== B. সিরিয়াল মোড ==");
await openMode("MCQ সিরিয়াল");
await page.waitForSelector("text=রঙ-ভিত্তিক সিরিয়াল", { timeout: 120000 });
ok((await page.locator("text=১/৫০").count()) >= 0, "সিরিয়াল মোডে ঢোকা (শাফলের ফাইল carry-over)");
// ১ ফাইল + রঙ → চিপ সিলেক্ট → B1 ডাউনলোড
await page.click('button:has-text("B1")');
const [dlB1] = await Promise.all([
  page.waitForEvent("download", { timeout: 180000 }),
  page.click('button:has-text("সিরিয়াল করে .docx ডাউনলোড")'),
]);
ok(dlB1.suggestedFilename().includes("color serial - B1"), "১-ফাইল রঙ-সিরিয়াল B1 ডাউনলোড", dlB1.suggestedFilename());

// B1. আরও ফাইল (ওয়ার্ক-বার) → ৩ ফাইল → স্কিম-কার্ড + মার্জ/ZIP
await page.setInputFiles('[data-testid="mode-work-bar-input"]', [NOCOLOR, CHEM]);
await page.waitForSelector("text=প্রতি ফাইলের সিরিয়াল-স্কিম", { timeout: 120000 });
ok((await page.locator('button:has-text("এক ফাইলে ডাউনলোড (.docx)")').count()) === 1, "৩ ফাইল → মার্জ বাটন");
ok((await page.locator('button:has-text("আলাদা আলাদা ডাউনলোড (.zip)")').count()) === 1, "৩ ফাইল → ZIP বাটন");

// B2. প্রতি-ফাইল স্কিম বদল — রঙ-ফাইলের রো-তে B1 চিপ
const schemeRows = page.locator('button:has-text("B1")');
const beforeChip = await schemeRows.count();
await schemeRows.last().click();
await page.waitForTimeout(300);
ok((await schemeRows.count()) >= beforeChip, "প্রতি-ফাইল স্কিম চিপ ক্লিক (B1 → রিস্টার্ট স্কিম)");

// B3. রিঅর্ডার (তীর-বাটন) — লিস্টের ২য় ফাইল উপরে (নাম-স্প্যান: span.truncate.text-sm — লিস্ট আগে, স্কিম-কার্ড পরে)
const nameSpans = page.locator('span.truncate.text-sm');
const secondName = await nameSpans.nth(1).textContent();
await page.locator('button[aria-label="উপরে তুলুন"]').nth(1).click();
await page.waitForTimeout(400);
const firstNameAfter = await nameSpans.nth(0).textContent();
ok(firstNameAfter === secondName?.trim(), "রিঅর্ডার: ২য় ফাইল ১ম-এ উঠল", `${secondName?.trim()} → ১ম`);

// B4. মার্জ + ZIP ডাউনলোড
const [dlMerge] = await Promise.all([
  page.waitForEvent("download", { timeout: 180000 }),
  page.click('button:has-text("এক ফাইলে ডাউনলোড (.docx)")'),
]);
ok(dlMerge.suggestedFilename().includes("(merged serial).docx"), "মার্জ সিরিয়াল ডাউনলোড নাম", dlMerge.suggestedFilename());
const [dlZip] = await Promise.all([
  page.waitForEvent("download", { timeout: 180000 }),
  page.click('button:has-text("আলাদা আলাদা ডাউনলোড (.zip)")'),
]);
ok(dlZip.suggestedFilename() === "MCQ-serial-files.zip", "সিরিয়াল ZIP নাম", dlZip.suggestedFilename());

// B5. একটা ফাইল বাদ → ২ ফাইল → আবার ZIP চলে
await page.locator('button[aria-label="তালিকা থেকে বাদ দিন"]').nth(0).click();
await page.waitForTimeout(600);
await page.waitForSelector('button:has-text("আলাদা আলাদা ডাউনলোড (.zip)")', { timeout: 30000 });
ok(true, "ফাইল বাদ দিয়েও মাল্টি-কার্ড স্থিতিশীল");
const [dlZip2] = await Promise.all([
  page.waitForEvent("download", { timeout: 180000 }),
  page.click('button:has-text("আলাদা আলাদা ডাউনলোড (.zip)")'),
]);
ok(dlZip2.suggestedFilename() === "MCQ-serial-files.zip", "২-ফাইল ZIP আবারও চলে");

// B6. সিরিয়াল পেস্ট-পাথ — ফাইল বাদ দিয়ে পেস্ট → ডিটেক্ট → ফিক্স → ডাউনলোড
while (await page.locator('button[aria-label="তালিকা থেকে বাদ দিন"]').count() > 0) {
  await page.locator('button[aria-label="তালিকা থেকে বাদ দিন"]').first().click();
  await page.waitForTimeout(400);
}
await page.click('button[role="tab"]:has-text("পেস্ট করুন")');
await page.fill("textarea", "1. পানির সংকেত কী?\nক) H2O খ) CO2 গ) O2 ঘ) NaCl\n2. বাতাসে সবচেয়ে বেশি কী আছে?\nক) অক্সিজেন খ) নাইট্রোজেন গ) হিলিয়াম ঘ) হাইড্রোজেন\n5. লোহার প্রতীক?\nক) Fe খ) Au গ) Ag ঘ) Cu");
await page.click('button:has-text("🔍 প্রশ্ন ডিটেক্ট করুন")');
await page.waitForSelector("#serial-paste-result", { timeout: 30000 });
ok(await toastSeen("সিরিয়ালে সমস্যা আছে"), "ভাঙা সিরিয়াল ডিটেক্ট (৩,৪ লাফ)");
await page.click('button:has-text("অটো নম্বরিং ঠিক করুন")');
await page.waitForSelector("text=সিরিয়াল ঠিক আছে — ডাউনলোড বাটন চালু!", { timeout: 30000 });
ok(true, "অটো-ফিক্স → সিরিয়াল ঠিক");
const [dlPaste] = await Promise.all([
  page.waitForEvent("download", { timeout: 120000 }),
  page.click('button:has-text("সিরিয়াল করে .docx ডাউনলোড (১..N)")'),
]);
ok(dlPaste.suggestedFilename().startsWith("MCQ-Serial-3q.docx"), "পেস্ট সিরিয়াল ডাউনলোড নাম", dlPaste.suggestedFilename());

// ============================================================
// C. রিডাউনলোড মোড — অংশ/রিনাম্বার/সিলেকশন + মার্জ/ZIP
// ============================================================
console.log("\n== C. রিডাউনলোড মোড ==");
await fresh();
await stage(RAW10);
await openMode("MCQ রিডাউনলোড");
await page.waitForSelector("text=নতুন ফাইলে কী কী থাকবে", { timeout: 120000 });
ok(true, "রিডাউনলোড মোডে ঢোকা → অংশ-বাছাই কার্ড");
const rdSingle = 'button:has-text("ডাউনলোড করুন (.docx)")';
await page.waitForSelector(rdSingle, { timeout: 30000 });
ok((await page.locator('button:has-text("আলাদা আলাদা ডাউনলোড (.zip)")').count()) === 0, "১ ফাইল → ZIP বাটন নেই");

// C1. ৬ অংশ-চেকবক্স টগল (সব বন্ধ → আবার ডিফল্ট serial+question)
// ৬ অংশ-চেকবক্স aria-label-এ শনাক্ত (প্রশ্ন-রো-চেকবক্সে aria-label নেই — কনফ্লিক্ট নেই)
const partBoxes = page.locator('button[role="checkbox"][aria-label]');
const nBoxes = await partBoxes.count();
ok(nBoxes === 6, "৬টি অংশ-অপশন রেন্ডার", `(${nBoxes})`);
for (let i = 0; i < nBoxes; i++) {
  const st = await partBoxes.nth(i).getAttribute("data-state");
  if (st === "checked") await partBoxes.nth(i).click();
}
ok((await page.locator("text=উত্তর-বিস্তার").count()) === 0, "সব অংশ বন্ধ → উত্তর-বিস্তার হিন্টও নেই");
// রিনাম্বার OFF পাথ
await page.click('button[aria-label="সিরিয়াল রিনাম্বার টগল"]');
await page.waitForTimeout(300);
// সব প্রশ্ন ডিফল্ট সিলেক্টেড — একক ডাউনলোড ফায়ার (অংশ-কম্বো: সব বন্ধ)
const [dlRd1] = await Promise.all([
  page.waitForEvent("download", { timeout: 180000 }),
  page.click(rdSingle),
]);
ok(dlRd1.suggestedFilename().endsWith("(redownload).docx"), "একক রিডাউনলোড ডাউনলোড নাম", dlRd1.suggestedFilename());
ok(await toastSeen("রিডাউনলোড ফাইল তৈরি"), "রিডাউনলোড টোস্ট");

// C2. প্রতিটি অংশ আবার চালু (all-on কম্বো) + রিনাম্বার আবার ON
for (let i = 0; i < nBoxes; i++) {
  const st = await partBoxes.nth(i).getAttribute("data-state");
  if (st !== "checked") await partBoxes.nth(i).click();
}
await page.waitForSelector("text=উত্তর-বিস্তার চালু", { timeout: 10000 }).catch(() => {});
await page.click('button[aria-label="সিরিয়াল রিনাম্বার টগল"]');
await page.waitForTimeout(300);
ok(true, "৬ অংশ all-ON + রিনাম্বার ON টগল স্থিতিশীল");

// C3. সিলেকশন — সব বাদ → ডাউনলোড ব্লক-টোস্ট; রেঞ্জ ১–৫ → ডাউনলোড
const rdCard = page.locator("#step-rd-questions");
await rdCard.locator('button:has-text("সব বাদ")').click();
await page.waitForTimeout(300);
await page.click(rdSingle);
ok(await toastSeen("প্রশ্ন সিলেক্ট করুন"), "সিলেকশন শূন্য → ব্লকিং-টোস্ট");
await rdCard.locator('button:has-text("সব সিলেক্ট")').click();
await rdCard.locator('input[placeholder="থেকে"]').fill("1");
await rdCard.locator('input[placeholder="পর্যন্ত"]').fill("5");
await rdCard.locator('button:has-text("রেঞ্জ সিলেক্ট")').click();
await page.waitForTimeout(300);
const selText = await rdCard.locator("text=/সিলেক্টেড 5\\//").count();
ok(selText >= 1, "রেঞ্জ ১–৫ → সিলেক্টেড 5/N");
const [dlRd2] = await Promise.all([
  page.waitForEvent("download", { timeout: 180000 }),
  page.click(rdSingle),
]);
ok(dlRd2.suggestedFilename().endsWith("(redownload).docx"), "রেঞ্জ-সিলেকশন ডাউনলোড", dlRd2.suggestedFilename());

// C4. ২ ফাইল → মার্জ + ZIP
await page.setInputFiles('[data-testid="mode-work-bar-input"]', RAW11);
await page.waitForSelector('button:has-text("এক ফাইলে ডাউনলোড (.docx)")', { timeout: 120000 });
const [dlRdM] = await Promise.all([
  page.waitForEvent("download", { timeout: 240000 }),
  page.click('button:has-text("এক ফাইলে ডাউনলোড (.docx)")'),
]);
ok(dlRdM.suggestedFilename() === "MCQ-Redownload-merged.docx", "রিডাউনলোড মার্জ নাম", dlRdM.suggestedFilename());
const [dlRdZ] = await Promise.all([
  page.waitForEvent("download", { timeout: 240000 }),
  page.click('button:has-text("আলাদা আলাদা ডাউনলোড (.zip)")'),
]);
ok(dlRdZ.suggestedFilename() === "MCQ-Redownload.zip", "রিডাউনলোড ZIP নাম", dlRdZ.suggestedFilename());

// ============================================================
// D. শাফল মাল্টি-ফাইল — সাব-ক্যাপ ফ্লো (১০ < ৫০ ক্যাপ) — ওয়ার্ক-বার
// ============================================================
console.log("\n== D. শাফল ফাইল-চিপ (১০/৫০, সাব-ক্যাপ) ==");
await fresh();
const tenFiles = Array(10).fill(NOCOLOR);
await stage(tenFiles);
await openMode("MCQ শাফল");
await page.waitForSelector("text=আপলোড হওয়া ফাইল (10 টি)", { timeout: 180000 });
ok(true, "১০ ফাইল স্টেজ → শাফলে ১০টাই লোড (ক্যাপের নিচে)");
await page.waitForSelector("text=১০/৫০ ফাইল", { timeout: 30000 });
const addDisabled = (await page.locator('button:has-text("আরও ফাইল")').getAttribute("disabled")) !== null;
ok(!addDisabled, "১০/৫০ → 'আরও ফাইল' চালু (ক্যাপ ৫০)");
// মাল্টি-শাফল রান (১০ ফাইল × setCount ডিফল্ট ৪)
await page.waitForSelector(shuffleBtn, { timeout: 60000 });
await page.click(shuffleBtn);
await page.waitForSelector("text=শাফল সম্পন্ন — এখন ডাউনলোড করুন", { timeout: 180000 });
ok(true, "১০-ফাইল মাল্টি-শাফল → মার্জ/ZIP কার্ড");
const [dlMZip] = await Promise.all([
  page.waitForEvent("download", { timeout: 240000 }),
  page.click('button:has-text("আলাদা আলাদা ডাউনলোড (.zip)")'),
]);
ok(dlMZip.suggestedFilename() === "MCQ-shuffled-files.zip", "মাল্টি-শাফল ZIP নাম", dlMZip.suggestedFilename());

// ============================================================
// E. টেক্সট-পেস্ট ফ্লো + staged clear + localStorage মোড-মনে রাখা
// ============================================================
console.log("\n== E. টেক্সট-ফ্লো + মোড-মনে রাখা + staged clear ==");
await fresh();
// E1. localStorage — সিরিয়াল মোডে ঢুকে reload → নতুন স্টেজে সিরিয়ালই selected
await stage(NOCOLOR);
await openMode("MCQ সিরিয়াল");
// NOCOLOR রঙহীন — ColorSerialCard না, SerialInputCard-ই লোড-প্রমাণ (রঙ-ফাইল হলে "রঙ-ভিত্তিক সিরিয়াল" কার্ড আসত)
await page.waitForSelector("text=MCQ সিরিয়াল — ফাইল আপলোড", { timeout: 120000 });
await page.reload({ waitUntil: "networkidle" });
await page.waitForSelector("#step-upload", { timeout: 30000 });
await stage(NOCOLOR);
const selTab = await page.locator('button[role="tab"][aria-selected="true"]').textContent();
ok(selTab?.includes("সিরিয়াল") ?? false, "reload → localStorage-এ শেষ মোড (সিরিয়াল) selected", selTab ?? "");

// E2. staged clear — বাতিল চাপলে আবার আপলোড-কার্ড
await page.click('button[aria-label="ফাইল বাতিল"]');
await page.waitForSelector("#step-upload", { timeout: 30000 });
ok((await page.locator('button[role="tab"]:has-text("MCQ শাফল")').count()) === 0, "staged clear → মোড-ট্যাবও লুকানো");

// E3. পেস্ট-টেক্সট ফ্লো — ১২ প্রশ্ন → সরাসরি শাফল-ওয়ার্ক → সেট ১/৩
const pasteQs = Array.from({ length: 12 }, (_, i) =>
  `${i + 1}. ${i + 1} নম্বর প্রশ্ন — পানির সংকেত কী?\nক) H2O খ) CO2 গ) O2 ঘ) NaCl`
).join("\n");
await page.click('button[role="tab"]:has-text("টেক্সট পেস্ট")');
await page.fill("textarea", pasteQs);
await page.click('button:has-text("🔍 প্রশ্ন ডিটেক্ট করুন (পেস্ট মোড)")');
await page.waitForSelector(shuffleBtn, { timeout: 60000 });
ok(true, "পেস্ট → ডিটেক্ট → সরাসরি শাফল-ওয়ার্ক (১২ প্রশ্ন)");
await page.fill("#set-count", "1");
await page.click(shuffleBtn);
await page.waitForSelector('#step-result :text("1 টি সেট")', { timeout: 60000 });
ok(true, "টেক্সট-ফ্লোতেও সেট-কাউন্ট ১ কাজ করে");
const [dlTxt] = await Promise.all([
  page.waitForEvent("download", { timeout: 120000 }),
  page.locator('#step-result button:has-text("Word (.docx)")').first().click(),
]);
ok(!!dlTxt, "টেক্সট-ফ্লো .docx ডাউনলোড ফায়ার", dlTxt.suggestedFilename());

// ============================================================
// ফলাফল
// ============================================================
console.log(`\nপাস: ${passed}  ফেল: ${failed}`);
console.log("JS/console errors:", errors.length ? errors : "শূন্য ✓");
await page.screenshot({ path: "scripts/e2e-modes.png", fullPage: false });
await browser.close();
if (failed > 0 || errors.length > 0) process.exit(1);
console.log("✅ e2e-modes সব-পাস");
