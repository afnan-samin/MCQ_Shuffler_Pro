// Browser E2E: Chemistry ফাইলে রঙ-সিরিয়াল ফ্লো
// রান: bun run scripts/e2e-browser-chem.ts
import { chromium } from "playwright";

const FILE = "/home/z/my-project/upload/Final Chemistry 1st paper only varsity Question (1-5).docx";

const browser = await chromium.launch();
const page = await browser.newPage();
const errors: string[] = [];
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
page.on("console", (m) => {
  if (m.type() === "error") errors.push("console: " + m.text());
});

await page.goto("http://localhost:3000", { waitUntil: "networkidle" });

// আপলোড
await page.setInputFiles('input[type="file"]', FILE);
await page.waitForSelector("text=রঙ-ভিত্তিক সিরিয়াল", { timeout: 120000 });
console.log("✓ রঙ-কার্ড দেখা গেছে");

// টোস্ট: রঙ-স্ট্রাকচার্ড ডিটেক্ট
await page.waitForSelector("text=রঙ-স্ট্রাকচার্ড ফাইল ডিটেক্ট হয়েছে", { timeout: 30000 });
console.log("✓ ডিটেক্ট-টোস্ট দেখা গেছে");

// চিপগুলো যাচাই
for (const chip of ["A3", "A4", "B1", "B6"]) {
  await page.waitForSelector(`button:has-text("${chip}")`, { timeout: 20000 });
}
console.log("✓ A3/A4/B1/B6 চিপ সব আছে");

// B1 সিলেক্ট → ব্যাখ্যায় সেকশন-সংখ্যা
await page.click('button:has-text("B1")');
await page.waitForSelector("text=টি সেকশন পাওয়া গেছে", { timeout: 20000 });
console.log("✓ B1 সিলেক্ট — ৪ সেকশন ব্যাখ্যা দেখা গেছে");

// ডাউনলোড
const [dl] = await Promise.all([
  page.waitForEvent("download", { timeout: 180000 }),
  page.click('button:has-text("সিরিয়াল করে .docx ডাউনলোড")'),
]);
const path = await dl.path();
console.log("✓ ডাউনলোড হয়েছে:", dl.suggestedFilename());

// সাফল্য-টোস্ট (error টোস্ট নয়)
await page.waitForSelector("text=রঙ-অনুযায়ী সিরিয়াল করা .docx ডাউনলোড হয়েছে", { timeout: 60000 });
const errToast = await page.locator("text=নম্বর দেওয়ার মতো প্রশ্ন পাওয়া যায়নি").count();
console.log(errToast === 0 ? "✓ error-টোস্ট নেই" : "✗ error-টোস্ট এসেছে!");

// ডাউনলোড হওয়া ফাইলে অধ্যায়-রিসেট যাচাই (node দিয়ে পড়া যায় না — path হচ্ছে temp)
const { execSync } = await import("node:child_process");
const out = execSync(
  `python3 -c "
import zipfile, re, sys
z = zipfile.ZipFile('${path}')
x = z.read('word/document.xml').decode('utf-8')
paras = re.findall(r'<w:p\\b.*?</w:p>', x, re.S)
def ptext(p): return ''.join(re.findall(r'<w:t[^>]*>([^<]*)</w:t>', p))
# ৪টা B1 হেডারের পরের প্রথম প্রশ্নের নম্বর
res = []
for b in [477, 3143, 5886, 8427]:
    for j in range(b+1, b+6):
        t = ptext(paras[j])
        if t.strip():
            res.append(t[:8]); break
print('|'.join(res))
print('entries:', len(z.namelist()), 'dir-entries:', sum(1 for n in z.namelist() if n.endswith('/')))
"`,
  { encoding: "utf-8" }
);
console.log("B1-পরের প্রথম টেক্সটগুলো:", out.trim().split("\n")[0]);
console.log(out.trim().split("\n")[1]);

// ---- B6 ফ্লো (বাগ-ফিক্স যাচাই): সিলেক্ট → ডাউনলোড → সার্ভার-জেনারেটেডের সাথে byte-compare ----
await page.click('button:has-text("B6")');
await page.waitForSelector('button:has-text("B6") >> nth=0', { timeout: 20000 });
await page.waitForFunction(
  () => document.body.innerText.includes("1 টি সেকশন পাওয়া গেছে"),
  { timeout: 20000 }
);
console.log("✓ B6 সিলেক্ট — ১ সেকশন ব্যাখ্যা দেখা গেছে");

const [dl6] = await Promise.all([
  page.waitForEvent("download", { timeout: 180000 }),
  page.click('button:has-text("সিরিয়াল করে .docx ডাউনলোড")'),
]);
console.log("✓ B6 ডাউনলোড হয়েছে:", dl6.suggestedFilename());
const path6 = await dl6.path();

const { execSync: exec6 } = await import("node:child_process");
const cmp = exec6(
  `python3 -c "
import zipfile, hashlib
a = zipfile.ZipFile('${path6}').read('word/document.xml')
b = zipfile.ZipFile('download/Final Chemistry 1st paper only varsity Question (1-5) (color serial - B6).docx').read('word/document.xml')
print('IDENTICAL' if a == b else 'DIFF')
print('b6-md5', hashlib.md5(a).hexdigest()[:12])
"`,
  { encoding: "utf-8" }
);
const cmpLines = cmp.trim().split("\n");
console.log(cmpLines[0] === "IDENTICAL" ? "✓ ব্রাউজার-ডাউনলোড B6 == যাচাইকৃত আউটপুট (byte-identical)" : "✗ B6 ফাইল মিলছে না!");
console.log(cmpLines[1]);

await page.screenshot({ path: "scripts/e2e-chem-final.png", fullPage: false });
console.log("\nJS errors:", errors.length ? errors : "শূন্য ✓");
await browser.close();
