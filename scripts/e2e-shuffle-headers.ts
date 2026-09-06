// Browser E2E: শাফল মোডে রঙ-হেডার ফাইল → হেডার বাদ দিয়ে সব প্রশ্ন এক সিরিয়ালে শাফল
// + সিরিয়াল মোডে রঙহীন ফাইল → অটো একটানা ১..N
// রান: bun run scripts/e2e-shuffle-headers.ts   (dev server চালু থাকতে হবে)
import { chromium } from "playwright";
import JSZip from "jszip";
import { readFileSync, mkdirSync } from "node:fs";

const HSC = "/home/z/my-project/scripts/fixtures/hsc27-physics-bijoy.docx";
const NOCOLOR = "/home/z/my-project/upload/color-free-test.docx";
const OUT_DIR = "/home/z/my-project/scripts/tmp-e2e";
mkdirSync(OUT_DIR, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage();
const errors: string[] = [];
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
page.on("console", (m) => {
  if (m.type() === "error") errors.push("console: " + m.text());
});

await page.goto("http://localhost:3000", { waitUntil: "networkidle" });

// ---- ১. আগে আপলোড (নতুন ফ্লো) → শাফল মোডে বহন → রঙ-ফাইল (HSC নমুনা, ৬টা B1 হেডার, ৬০ প্রশ্ন) ----
await page.waitForSelector("#step-upload", { timeout: 30000 });
await page.setInputFiles("#step-upload input[type='file']", HSC);
await page.waitForSelector('[role="tablist"]', { timeout: 30000 });
await page.click('button[role="tab"]:has-text("MCQ শাফল")');
await page.waitForSelector("text=শাফলে হেডার বাদ যাবে", { timeout: 60000 });
const blockedCount = await page.locator("text=শাফল মোডে করা যাবে না").count();
if (blockedCount !== 0) throw new Error("পুরনো ব্লকিং-নোটিস এখনো আসছে!");
await page.waitForSelector("text=6 হেডার বাদ যাবে", { timeout: 15000 });
await page.waitForSelector("text=60 প্রশ্ন শাফল হবে", { timeout: 15000 });
console.log("✓ শাফল মোডে রঙ-ফাইল → ইনফো কার্ড (৬ হেডার বাদ, ৬০ প্রশ্ন এক সিরিয়ালে) — শাফল ব্লক হয়নি");

// ---- ২. শাফল চালু (ডিফল্ট ৪ সেট × ১৫) ----
await page.waitForSelector('button:has-text("শাফল করুন ও সেট তৈরি করুন")', { timeout: 60000 });
await page.click('button:has-text("শাফল করুন ও সেট তৈরি করুন")');
await page.waitForSelector("text=টি সেট তৈরি হয়েছে", { timeout: 60000 });
console.log("✓ শাফল হয়ে ৪ সেট তৈরি");

// ---- ৩. রিনাম্বার ডাউনলোড ----
const [dl] = await Promise.all([
  page.waitForEvent("download", { timeout: 180000 }),
  page.click('button:has-text("রিনাম্বার সিরিয়াল")'),
]);
await page.waitForSelector("text=Word ফাইল ডাউনলোড হয়েছে", { timeout: 60000 });
const outPath = `${OUT_DIR}/hsc-shuffled-renumbered.docx`;
await dl.saveAs(outPath);
console.log("✓ ডাউনলোড:", dl.suggestedFilename());

// ---- ৪. আউটপুট যাচাই (কঠোর) ----
const origZip = await JSZip.loadAsync(readFileSync(HSC));
const origXml = await origZip.file("word/document.xml")!.async("string");
const origShd = (origXml.match(/w:fill="000000"/g) ?? []).length;

const zip = await JSZip.loadAsync(readFileSync(outPath));
const xml = await zip.file("word/document.xml")!.async("string");
const outShd = (xml.match(/w:fill="000000"/g) ?? []).length;
if (origShd !== 6 || outShd !== 0) throw new Error(`হেডার-শেড: অরিজিনাল ${origShd} (৬ হওয়ার কথা), আউটপুট ${outShd} (০ হওয়ার কথা)`);
console.log(`✓ আউটপুটে B1-হেডার শেড শূন্য (অরিজিনালে ${origShd} ছিল) — হেডার কোথাও যায়নি`);

for (const s of ["Set A", "Set B", "Set C", "Set D"]) {
  if (!xml.includes(s)) throw new Error(`${s} হেডার নেই`);
}
const pageBreaks = (xml.match(/<w:br w:type="page"\/>/g) ?? []).length;
if (pageBreaks !== 3) throw new Error(`পেজ-ব্রেক ${pageBreaks} (৩ হওয়ার কথা)`);
console.log("✓ Set A–D হেডার + ৩ পেজ-ব্রেক");

// পার্স করে যাচাই: ৬০ প্রশ্ন, প্রতি সেটে সিরিয়াল ১..১৫, কনটেন্ট প্রিজার্ভ
const dom = await import("jsdom");
const g = globalThis as unknown as Record<string, unknown>;
g.DOMParser = new dom.JSDOM("").window.DOMParser;
g.XMLSerializer = new dom.JSDOM("").window.XMLSerializer;
const { parseDocxXml } = await import("../src/lib/mcq/docx-xml");
const outParse = parseDocxXml(xml);
if (outParse.questions.length !== 60) throw new Error(`আউটপুটে ${outParse.questions.length} প্রশ্ন (৬০ হওয়ার কথা)`);
for (let s = 0; s < 4; s++) {
  for (let i = 0; i < 15; i++) {
    const q = outParse.questions[s * 15 + i];
    if (q.serial !== i + 1) throw new Error(`সেট-${s + 1} প্রশ্ন-${i + 1}: সিরিয়াল ${q.serial} (কাঙ্ক্ষিত ${i + 1})`);
  }
}
console.log("✓ ৬০ প্রশ্ন — প্রতি সেটে সিরিয়াল ১..১৫ (এক সিরিয়ালে শাফল + রিনাম্বার)");

// কনটেন্ট প্রিজার্ভ: সিরিয়াল-পরবর্তী টেক্সটের মাল্টিসেট অরিজিনালের সাথে হুবহু মিলবে
// (নোট: আউটপুট-পার্সে প্রতি সেটের শেষ প্রশ্নের ব্লকে পেজ-ব্রেক ও "Set B" প্যারার
//  টেক্সট জুড়ে যায় — Word-এ ওগুলো নিজের প্যারা; তুলনায় সেই ট্রেইলিং গ্লু বাদ)
const stripSerial = (t: string) =>
  t.replace(/^[\s]*[0-9ø«ˆµ∏Ï¾˜Ùœ০-৯]{1,4}[\s]*[.।):|\-–—:]?[\s]*/, "");
const norm = (t: string) => stripSerial(t).replace(/\s*\n?\s*Set [A-Z][0-9]*$/u, "").trim();
const { stripShadedParasXml } = await import("../src/lib/mcq/color-serial");
const origClean = stripShadedParasXml(origXml).xml; // শাফল-পুলও এই স্ট্রিপ-করা xml থেকেই এসেছে
const origStripped = parseDocxXml(origClean).questions.map((q) => norm(q.text)).sort();
const outStripped = outParse.questions.map((q) => norm(q.text)).sort();
if (origStripped.join("\u0000") !== outStripped.join("\u0000")) throw new Error("প্রশ্ন-কনটেন্ট অরিজিনালের সাথে মেলেনি!");
console.log("✓ ৬০ প্রশ্নের কনটেন্ট (সিরিয়াল-পরবর্তী) হুবহু প্রিজার্ভ");

// ---- ৫. ইনফো-কার্ডের হাত-অফ: সিরিয়াল মোডে খুলুন ----
await page.click('button:has-text("সিরিয়াল মোডে খুলুন")');
await page.waitForSelector("text=রঙ-ভিত্তিক সিরিয়াল", { timeout: 20000 });
await page.waitForSelector('button:has-text("B1")', { timeout: 30000 });
const serialSel = await page.locator('[data-testid="mode-work-bar"]:has-text("MCQ সিরিয়াল")').count();
if (serialSel !== 1) throw new Error("হাত-অফে সিরিয়াল মোডে যায়নি (ওয়ার্ক-বারে মোড-নাম নেই)");
console.log("✓ ইনফো-কার্ড হাত-অফ: ফাইলসহ সিরিয়াল মোডে গেছে (B1 চিপ দৃশ্যমান)");

// ---- ৬. সিরিয়াল মোডে রঙহীন ফাইল → অটো নো-কালার কার্ড + একটানা ১..N ----
// (সিরিয়াল কার্ডের নিজের ইনপুট — ওয়ার্ক-বারের ইনপুট নয়, ওটা append করে)
await page.setInputFiles('input[data-testid="serial-file-input"]', NOCOLOR);
await page.waitForSelector("text=এই ফাইলে রঙ-হেডার পাওয়া যায়নি", { timeout: 60000 });
const [dl2] = await Promise.all([
  page.waitForEvent("download", { timeout: 120000 }),
  page.click('button:has-text("একটানা ১..N সিরিয়াল করে .docx ডাউনলোড")'),
]);
await page.waitForSelector("text=রঙ-অনুযায়ী সিরিয়াল করা .docx ডাউনলোড হয়েছে", { timeout: 60000 });
if (!dl2.suggestedFilename().includes("continuous")) throw new Error("continuous ফাইলনাম ভুল: " + dl2.suggestedFilename());
console.log("✓ সিরিয়াল মোডে রঙহীন ফাইল → অটো একটানা ১..N ডাউনলোড:", dl2.suggestedFilename());

// ---- ৭. নন-MCQ টেক্সট-প্যাটার্ন ফিচার (Agri ফাইল: ১৩৫ রঙ-হেডার + রঙহীন "Aa¨vq-8") ----
// ইউজারের নিয়ম: "jeta mcq noi seta jate bad dey" + বাদ-পড়া লাইনের আলাদা লিস্ট
const AGRI = "/home/z/my-project/upload/Agri MCQ Botany 997 mcq - Copy - type serial.docx";
// নতুন ফ্লো: কাজের ভিউতে ট্যাব নেই — পেছনে → শাফল ট্যাব
await page.click('button[aria-label="পেছনে — মোড বাছাই"]');
await page.waitForSelector('button[role="tab"]:has-text("MCQ শাফল")', { timeout: 15000 });
await page.click('button[role="tab"]:has-text("MCQ শাফল")');
// ইনপুট-কার্ডের নিজের ইনপুট (replace) — ওয়ার্ক-বারের ইনপুট নয় (append)
await page.setInputFiles('#step-input input[type="file"]', AGRI);
await page.waitForSelector("text=বাদ পড়া লাইনসমূহ", { timeout: 120000 });
await page.waitForSelector("text=136 টি (শাফলে যাবে না)", { timeout: 20000 });
await page.waitForSelector("text=135 রঙ-হেডার", { timeout: 15000 });
await page.waitForSelector("text=1 নন-MCQ (টেক্সট-প্যাটার্ন)", { timeout: 15000 });
console.log("✓ Agri: ব্লকড-লিস্ট কার্ড — ১৩৬ লাইন (১৩৫ রঙ-হেডার + ১ নন-MCQ)");

// রঙহীন "Aa¨vq-8" লাইনটা লিস্টে দেখা যায় (প্রথম ৮টার প্রিভিউতে নেই → expand লাগবে)
await page.click('button:has-text("আরও 128 টি লাইন দেখুন")');
await page.waitForSelector("text=Aa¨vq-8", { timeout: 15000 });
console.log("✓ রঙহীন 'Aa¨vq-8' লাইন ব্লকড-লিস্টে দেখা যাচ্ছে (expand করে)");

// 435 প্রশ্ন শাফল হবে (info-কার্ড ব্যাজ)
await page.waitForSelector("text=435 প্রশ্ন শাফল হবে", { timeout: 15000 });
await page.waitForSelector('button:has-text("শাফল করুন ও সেট তৈরি করুন")', { timeout: 60000 });
console.log("✓ Agri: ৪৩৫ প্রশ্ন এক সিরিয়ালে — শাফল-ফ্লো চালু");

await page.screenshot({ path: "scripts/e2e-shuffle-headers.png", fullPage: false });
console.log("\nJS errors:", errors.length ? errors : "শূন্য ✓");
await browser.close();
