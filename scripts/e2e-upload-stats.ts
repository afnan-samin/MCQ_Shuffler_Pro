// Browser E2E: (১) আপলোড-কার্ডের প্রতি-ফাইল ডিটেকশন-টেবিল (File | Total MCQ | Question |
// Reference | Options | Answer | Expl. | ×), (২) প্রতি-সারির ক্রস → কনফার্ম পপআপ →
// বাতিলে ফাইল থাকে / সম্মতিতে বাদ পড়ে, (৩) রিডাউনলোডে রিনাম্বার-টগল ডিফল্ট OFF,
// (৪) Pick-parts-এ ৬টা অংশ সব ডিফল্ট-সিলেক্ট।
// রান: সার্ভার চালু (localhost:3000) থাকতে হবে → bun run scripts/e2e-upload-stats.ts
import { chromium } from "playwright";

const FILE = "upload/Physics 1st Paper Chapter-01 (Raw).docx";
const FILE2 = "upload/Physics 1st Paper Chapter-02 (Raw).docx";

let passed = 0;
let failed = 0;
const ok = (cond: boolean, label: string) => {
  if (cond) {
    passed++;
    console.log("  ✓ " + label);
  } else {
    failed++;
    console.log("  ✗ " + label);
  }
};

const browser = await chromium.launch();
const page = await browser.newPage();
const errors: string[] = [];
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
page.on("console", (m) => {
  if (m.type() === "error") errors.push("console: " + m.text());
});

try {
  await page.goto("http://localhost:3000", { waitUntil: "networkidle" });
  await page.waitForSelector("#step-upload", { timeout: 30000 });

  // ---- ১) ফাইল স্টেজ → টেবিলে প্রতি-ফাইলের সংখ্যা ----
  console.log("\n== ১) আপলোড-কার্ডের ডিটেকশন-টেবিল ==");
  await page.setInputFiles("#step-upload input[type='file']", [FILE]);
  await page.waitForSelector("text=files ready", { timeout: 30000 });
  await page.waitForSelector("table th:text-is('Total MCQ')", { timeout: 15000 });
  // "Detecting…" চলে গিয়ে সংখ্যা বসার অপেক্ষা
  await page.waitForSelector("table tbody tr td.font-bold", { timeout: 30000 });
  const headers = (await page.locator("table thead th").allTextContents()).map((h) => h.trim());
  const cells = (await page.locator("table tbody tr").first().locator("td").allTextContents()).map((c) => c.trim());
  console.log("  ℹ header:", JSON.stringify(headers));
  console.log("  ℹ row   :", JSON.stringify(cells));
  ok(headers.includes("Total MCQ"), "হেডারে 'Total MCQ' আছে (Questions রিনেম)");
  ok(!headers.includes("Questions"), "পুরনো 'Questions' হেডার আর নেই");
  ok(!headers.includes("Serial"), "Serial কলাম বাদ পড়েছে");
  ok(headers.includes("Remove"), "শেষে ক্রস-কলাম আছে");
  ok(cells.length === 8, `রো-তে ৮ কলাম (File + ৬ সংখ্যা + ক্রস) — পেলাম ${cells.length}`);
  const questions = parseInt(cells[1] ?? "", 10);
  ok(Number.isFinite(questions) && questions > 0, `Total MCQ কলামে সংখ্যা বসেছে (${cells[1]})`);
  const filename = cells[0] ?? "";
  ok(filename.includes(".docx"), `ফাইলনাম দেখাচ্ছে (${filename.slice(0, 40)}…)`);
  ok(!cells.join(" ").includes("Detecting"), "স্ট্যাটাস ready — Detecting চলে গেছে");

  // ---- ২) প্রতি-সারির ক্রস + কনফার্ম পপআপ ----
  console.log("\n== ২) সারির ক্রস → কনফার্ম পপআপ ==");
  const cross = page.locator("table tbody tr button[aria-label^='Remove ']");
  ok((await cross.count()) === 1, "প্রতি-সারিতে একটা ক্রস-বাটন আছে");
  const rowCount = async () => page.locator("table tbody tr").count();

  // (ক) পপআপ বাতিল → ফাইল তালিকায় থেকেই যায়
  let firstMsg = "";
  page.once("dialog", async (d) => {
    firstMsg = d.message();
    await d.dismiss();
  });
  await cross.first().click();
  await page.waitForTimeout(600);
  console.log("  ℹ dialog:", JSON.stringify(firstMsg.replace(/\s+/g, " ").slice(0, 80)));
  ok(/Remove this file/i.test(firstMsg), "কনফার্ম পপআপ এসেছে");
  ok(firstMsg.includes(".docx"), "পপআপে ফাইলনাম দেখাচ্ছে");
  ok((await rowCount()) === 1, "বাতিল করলে ফাইল তালিকায় থাকে");

  // (খ) পপআপে সম্মতি → ফাইল বাদ, শেষ ফাইল হলে আপলোড-কার্ডে ফিরে যায়
  let secondMsg = "";
  page.once("dialog", async (d) => {
    secondMsg = d.message();
    await d.accept();
  });
  await cross.first().click();
  await page.waitForSelector("#step-upload", { timeout: 20000 });
  ok(/Remove this file/i.test(secondMsg), "দ্বিতীয়বারও কনফার্ম পপআপ এসেছে");
  ok(await page.isVisible("#step-upload"), "সম্মতি দিলে ফাইল বাদ → আপলোড-কার্ডে ফিরে গেছে");
  ok((await page.locator("text=files ready").count()) === 0, "স্টেজড-তালিকা আর নেই (ফাইল সত্যিই বাদ)");

  // ---- ৩) নতুন করে আপলোড → আবার ফাইল তালিকা ----
  console.log("\n== ৩) আবার আপলোড (আগের অবস্থা নষ্ট হয়নি) ==");
  await page.setInputFiles("#step-upload input[type='file']", [FILE]);
  await page.waitForSelector("text=files ready", { timeout: 30000 });
  await page.waitForSelector("table tbody tr td.font-bold", { timeout: 30000 });
  ok((await rowCount()) === 1, "আবার আপলোডে ফাইল ফিরে এসেছে");

  // ---- ৪) মাল্টি-ফাইল: সব ফাইলের সারি + একটা বাদ দিলে বাকিগুলো থাকে ----
  console.log("\n== ৪) একাধিক ফাইল — লিস্ট + একটা বাদ ==");
  const before = await rowCount();
  // "Add files" ড্রপজোনের লুকানো ইনপুট (এই ধাপে একমাত্র file-input)
  await page.locator('input[type="file"]').last().setInputFiles([FILE2]);
  await page.waitForFunction(
    (n) => document.querySelectorAll("table tbody tr").length > n,
    before,
    { timeout: 30000 }
  );
  const rows2 = await rowCount();
  ok(rows2 === before + 1, `নতুন ফাইল লিস্টে যোগ হয়েছে (${before} → ${rows2})`);

  // প্রথম ফাইল বাদ → তালিকা থাকেই (হোমে রিসেট হয় না), বাকিগুলো টিকে থাকে
  let thirdMsg = "";
  page.once("dialog", async (d) => {
    thirdMsg = d.message();
    await d.accept();
  });
  await page.locator("table tbody tr button[aria-label^='Remove ']").first().click();
  await page.waitForFunction(
    (n) => document.querySelectorAll("table tbody tr").length < n,
    rows2,
    { timeout: 20000 }
  );
  const rows3 = await rowCount();
  ok(/Remove this file/i.test(thirdMsg), "মাল্টি-ফাইলে কনফার্ম পপআপও এসেছে");
  ok(rows3 === rows2 - 1, `একটা বাদ → বাকিগুলো তালিকায় রইল (${rows2} → ${rows3})`);
  ok((await page.locator("text=files ready").count()) > 0, "তালিকা এখনো দৃশ্যমান (হোমে রিসেট হয়নি)");
  const leftName = (await page.locator("table tbody tr").first().locator("td").first().textContent()) ?? "";
  ok(leftName.includes("Chapter-02"), `যে ফাইল বাদ দিয়েছি সেটাই গেছে, বাকিটা আছে (${leftName.trim().slice(0, 40)})`);

  // ---- ৫) রিডাউনলোড মোড: ৬ অংশ সব ON + রিনাম্বার টগল OFF ----
  console.log("\n== ৫) রিডাউনলোড — Pick parts + রিনাম্বার টগল ==");
  await page.click('button[role="tab"]:has-text("Redownload")');
  await page.waitForSelector('div[role="checkbox"][aria-label]', { timeout: 30000 });
  const boxes = page.locator('div[role="checkbox"][aria-label]');
  const n = await boxes.count();
  ok(n === 6, `Pick-parts-এ ৬টা অংশ-চেকবক্স (${n})`);
  const checked = await boxes.evaluateAll((els) => els.map((e) => e.getAttribute("aria-checked")));
  ok(
    n === 6 && checked.every((c) => c === "true"),
    `সব ৬টা ডিফল্ট-সিলেক্ট (aria-checked: ${checked.join(",")})`
  );
  const sw = page.locator('button[role="switch"][aria-label="Serial renumber toggle"]');
  ok((await sw.count()) === 1, "রিনাম্বার-টগল আছে");
  const state = await sw.getAttribute("data-state");
  const aria = await sw.getAttribute("aria-checked");
  ok(
    (state === "unchecked" || state === "off") && aria === "false",
    `রিনাম্বার টগল ডিফল্ট OFF (data-state=${state}, aria-checked=${aria})`
  );

  // ---- JS errors ----
  console.log("\nJS errors:", errors.length ? errors : "শূন্য ✓");
  if (errors.length) failed++;
} finally {
  await browser.close();
}

console.log(`\n===== ফলাফল: ${passed} পাস, ${failed} ফেল =====`);
if (failed > 0) process.exit(1);
console.log("✅ আপলোড-টেবিল + টগল-OFF + অংশ-ডিফল্ট E2E পাস");
