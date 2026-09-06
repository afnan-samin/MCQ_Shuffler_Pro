// ============================================================
// রেফারেন্স-সেকশন E2E — আসল Physics ফাইল আপলোড → সেকশন দেখা যায়
// → "বাদ দিন" সিলেক্ট → শাফল → ডাউনলোড ফাইলে ট্যাগ নেই
// রান: bun run scripts/e2e-reference.ts
// ============================================================
import { chromium } from "playwright";
import { readFileSync, writeFileSync, unlinkSync } from "node:fs";

const FILE = "/home/z/my-project/upload/Physics 1st Paper Chapter-10 (Raw).docx";
let passed = 0;
let failed = 0;
const ok = (c: boolean, n: string) => {
  if (c) { passed++; console.log("  ✓", n); }
  else { failed++; console.error("  ✗ FAIL:", n); }
};

const browser = await chromium.launch();
const page = await browser.newPage();
const jsErrors: string[] = [];
page.on("pageerror", (e) => jsErrors.push(String(e)));
page.on("console", (m) => { if (m.type() === "error") jsErrors.push(m.text()); });

try {
  await page.goto("http://localhost:3000", { waitUntil: "networkidle" });

  // ফাইল আপলোড (স্টেজ) → শাফল-মোডে ঢোকা
  await page.setInputFiles("#step-upload input[type='file']", FILE);
  await page.waitForSelector('button[role="tab"]:has-text("MCQ শাফল")', { timeout: 15000 });
  await page.click('button[role="tab"]:has-text("MCQ শাফল")');
  await page.waitForTimeout(800);

  // রেফারেন্স-সেকশন দেখা যাচ্ছে?
  const section = page.locator('[data-testid="ref-mode-group"]');
  ok(await section.isVisible(), "রেফারেন্স-সেকশন দৃশ্যমান (ডিটেকশন কাজ করেছে)");

  // রিপোর্ট লাইনে প্রশ্ন-সংখ্যা আছে (৪৮/৫০ প্রশ্নে ট্যাগ)
  const bodyText = await page.locator("body").innerText();
  ok(/৪[০-৯]?\s*টি প্রশ্নে|48|৪৮/.test(bodyText.replace(/\s+/g, " ")), "রিপোর্টে প্রশ্ন-কাউন্ট দেখা যাচ্ছে");

  // "বাদ দিন" সিলেক্ট
  await page.click('label[for="ref-strip"]');
  await page.waitForTimeout(200);

  // শাফল চালু (ডিফল্ট সেটিংসেই) → সম্পন্ন-নোটিশের অপেক্ষা
  await page.click('button:has-text("শাফল করুন ও সেট তৈরি করুন")');
  await page.waitForSelector("text=শাফল সম্পন্ন", { timeout: 120000 });

  // ডাউনলোড — ডাউনলোড ইভেন্ট ধরে ফাইল সেভ (সিঙ্গেল-ফাইল ফ্লোর রিনাম্বার-বাটন)
  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: 60000 }),
    page.click('button:has-text("রিনাম্বার সিরিয়াল")'),
  ]);
  const outPath = "/tmp/ref-e2e-out.docx";
  await download.saveAs(outPath);

  // ডাউনলোড-করা ফাইল যাচাই — jsdom পাইপলাইনে প্রশ্নগুলো পড়ে ট্যাগ-স্ক্যান
  const { JSDOM } = await import("jsdom");
  const dom = new JSDOM("<!doctype html>");
  (globalThis as unknown as Record<string, unknown>).DOMParser = dom.window.DOMParser;
  (globalThis as unknown as Record<string, unknown>).XMLSerializer = dom.window.XMLSerializer;
  (globalThis as unknown as Record<string, unknown>).Node = dom.window.Node;
  const JSZip = (await import("jszip")).default;
  const { parseDocxXml } = await import("../src/lib/mcq/docx-xml");
  const { findRefTokens } = await import("../src/lib/mcq/reference");

  const zip = await JSZip.loadAsync(readFileSync(outPath));
  const xml = await zip.file("word/document.xml")!.async("string");
  const parse = parseDocxXml(xml);
  ok(parse.questions.length === 50, `আউটপুটে ৫০ প্রশ্ন (পেলো ${parse.questions.length})`);
  const tokens = parse.questions.flatMap((q) => q.paras.flatMap((p) => findRefTokens(p)));
  ok(tokens.length === 0, "ডাউনলোড-করা ফাইলে শূন্য রেফারেন্স-ট্যাগ (strip কাজ করেছে)");
  const hasAnswer = parse.questions.filter((q) => q.answer).length;
  ok(hasAnswer >= 45, `উত্তর-মার্কার অক্ষত (${hasAnswer}/50)`);
  unlinkSync(outPath);
} finally {
  ok(jsErrors.length === 0, `কনসোল-এরর শূন্য (${jsErrors.length})`);
  await browser.close();
}
writeFileSync("/tmp/e2e-ref-marker", String(failed));
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
