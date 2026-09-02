// মোবাইল ভিউ চেক — মোড-ট্যাব 390px
import { chromium } from "playwright";

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors: string[] = [];
page.on("pageerror", (e) => errors.push(e.message));

await page.goto("http://localhost:3000", { waitUntil: "networkidle" });
await page.waitForSelector('[role="tablist"]');
await page.click('button[role="tab"]:has-text("MCQ সিরিয়াল")');
await page.waitForSelector("text=MCQ সিরিয়াল — ফাইল আপলোড");
await page.screenshot({ path: "scripts/e2e-mode-tabs-mobile.png", fullPage: false });

// ওভারফ্লো চেক — হরিজন্টাল স্ক্রল আছে কিনা
const overflow = await page.evaluate(
  () => document.documentElement.scrollWidth - document.documentElement.clientWidth
);
console.log("horizontal overflow px:", overflow);
console.log("JS errors:", errors.length ? errors : "শূন্য ✓");
await browser.close();
