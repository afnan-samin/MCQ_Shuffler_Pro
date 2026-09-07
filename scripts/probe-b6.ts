// Probe: what happens after removing all serial files (B6 state)
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
await page.waitForSelector("#step-upload", { timeout: 30000 });
await page.setInputFiles("#step-upload input[type='file']", [NOCOLOR, CHEM]);
await page.waitForSelector('button[role="tab"]:has-text("MCQ সিরিয়াল")', { timeout: 60000 });
await page.click('button[role="tab"]:has-text("MCQ সিরিয়াল")');
await page.waitForSelector("text=সব ফাইল একসাথে সিরিয়াল করুন", { timeout: 120000 });
console.log("serial mode loaded with 2 files");

// remove all files one by one
while (await page.locator('button[aria-label="তালিকা থেকে বাদ দিন"]').count() > 0) {
  await page.locator('button[aria-label="তালিকা থেকে বাদ দিন"]').first().click();
  await page.waitForTimeout(400);
}
console.log("all files removed");
await page.waitForTimeout(1000);

// what's visible now?
const tabs = await page.locator('button[role="tab"]').allTextContents();
console.log("role=tab buttons:", JSON.stringify(tabs));
const pasteTabs = await page.locator('button[role="tab"]:has-text("পেস্ট করুন")').count();
console.log("paste-tab count:", pasteTabs);
const stepUpload = await page.locator("#step-upload").count();
console.log("#step-upload present:", stepUpload);
const bodyText = (await page.locator("body").innerText()).slice(0, 600);
console.log("BODY:", JSON.stringify(bodyText.slice(0, 500)));
console.log("ERRORS:", errors.length ? errors : "none");
await page.screenshot({ path: "/home/z/my-project/scripts/probe-b6.png", fullPage: true });
await browser.close();
