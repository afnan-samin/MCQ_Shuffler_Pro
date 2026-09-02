// ওভারফ্লো-কারণ প্রোব — কোন এলিমেন্ট ভিউপোর্টের বাইরে
import { chromium } from "playwright";

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
await page.goto("http://localhost:3000", { waitUntil: "networkidle" });
await page.waitForSelector('[role="tablist"]');
await page.click('button[role="tab"]:has-text("MCQ সিরিয়াল")');
await page.waitForSelector("text=MCQ সিরিয়াল — ফাইল আপলোড");
await page.waitForTimeout(300);

const bad = await page.evaluate(() => {
  const out: string[] = [];
  document.querySelectorAll("*").forEach((el) => {
    const r = el.getBoundingClientRect();
    if (r.right > 395 && r.width > 50) {
      out.push(
        `${el.tagName}.${String(el.className).slice(0, 80)} right=${Math.round(r.right)} w=${Math.round(r.width)}`
      );
    }
  });
  return out.slice(0, 25);
});
console.log(bad.join("\n"));
await browser.close();
