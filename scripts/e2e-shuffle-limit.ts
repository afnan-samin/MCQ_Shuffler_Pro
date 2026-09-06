// Browser E2E: শাফল মোডে max ১০ ফাইল এনফোর্সমেন্ট — ১১টা দিলে প্রথম ১০টা + ওয়ার্নিং + যোগ-বাটন বন্ধ
// রান: bun run scripts/e2e-shuffle-limit.ts
import { chromium } from "playwright";
import { readdirSync } from "node:fs";

const files = readdirSync("/home/z/my-project/upload")
  .filter((f) => f.endsWith(".docx"))
  .slice(0, 11)
  .map((f) => `/home/z/my-project/upload/${f}`);
if (files.length < 11) throw new Error("১১টা ফাইল দরকার");

const browser = await chromium.launch();
const page = await browser.newPage();
const errors: string[] = [];
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
page.on("console", (m) => {
  if (m.type() === "error") errors.push("console: " + m.text());
});

await page.goto("http://localhost:3000", { waitUntil: "networkidle" });

// ধাপ ১: ১১টা ফাইল আপলোড → স্টেজ
await page.waitForSelector("#step-upload", { timeout: 30000 });
await page.setInputFiles("#step-upload input[type='file']", files);
await page.waitForSelector("text=ফাইল প্রস্তুত", { timeout: 30000 });
console.log("✓ ১১টা ফাইল স্টেজ হলো");

// ধাপ ২: শাফল মোডে ঢোকা → ১০টাই লোড হবে, ওয়ার্নিং টোস্ট আসবে
await page.click('button[role="tab"]:has-text("MCQ শাফল")');
await page.waitForSelector("text=⚠️ শাফল মোডে সর্বোচ্চ ১০ টি ফাইল", { timeout: 180000 });
console.log("✓ ১১ দিলে ওয়ার্নিং টোস্ট: 'সর্বোচ্চ ১০ টি ফাইল'");
await page.waitForSelector("text=আপলোড হওয়া ফাইল (10 টি)", { timeout: 120000 });
await page.waitForSelector("text=১০/১০ ফাইল", { timeout: 15000 });
console.log("✓ লিস্টে ১০টা ফাইল + কাউন্ট চিপ ১০/১০");

// ধাপ ৩: পূর্ণ হলে 'আরও ফাইল' বাটন বন্ধ
const disabled = await page.getAttribute('button:has-text("আরও ফাইল")', "disabled");
if (disabled === null) throw new Error("১০/১০ তে 'আরও ফাইল' বাটন এখনো চালু!");
console.log("✓ ১০/১০ → 'আরও ফাইল' বাটন ডিজেবলড");

// ধাপ ৪: ১টা বাদ দিলে আবার চালু (min/max স্পেস কাজ করছে)
await page.locator('button[aria-label="তালিকা থেকে বাদ দিন"]').nth(0).click();
await page.waitForSelector("text=৯/১০ ফাইল", { timeout: 15000 });
const disabled2 = await page.getAttribute('button:has-text("আরও ফাইল")', "disabled");
if (disabled2 !== null) throw new Error("৯/১০ তে 'আরও ফাইল' বাটন বন্ধ আছে!");
console.log("✓ ১টা বাদ → ৯/১০ → যোগ-বাটন আবার চালু");

console.log("\nJS errors:", errors.length ? errors : "শূন্য ✓");
await browser.close();
console.log("✅ শাফল max-10 এনফোর্সমেন্ট E2E পাস");
