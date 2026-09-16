// ============================================================
// লাইভ E2E — ব্র্যাকেট-ছাড়া রেফারেন্সসহ সিনথেটিক docx
// আপলোড → শাফল-ট্যাব → রেফারেন্স-সেকশন + কাউন্ট যাচাই
// NOTE: URL এখন localhost:3000 — লাইভ GitHub Pages ডেপ্লয়মেন্ট এখনো পুরনো
// (বাংলা) বিল্ড চালায়; ইংরেজি UI ডেপ্লয় হলে আবার লাইভ URL-এ ফেরানো যাবে।
// রান: dev-server চালু (localhost:3000) থাকতে হবে → bun run scripts/e2e-live-bare-ref.ts
// ============================================================
import { writeFileSync } from "node:fs";
import JSZip from "jszip";

const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const p = (text: string) =>
  `<w:p xmlns:w="${W}"><w:r><w:t xml:space="preserve">${text}</w:t></w:r></w:p>`;

// ৮ প্রশ্ন — মিশ্র রেফারেন্স-ফরম্যাট: ব্র্যাকেটযুক্ত + ব্র্যাকেটবিহীন (ঝুলন্ত + একক লাইন)
const body =
  p("১. বাংলাদেশের রাজধানী কোথায়? ঢাকা বোর্ড ২০১৭") +
  p("ক. চট্টগ্রাম") + p("খ. ঢাকা") + p("গ. খুলনা") + p("ঘ. রাজশাহী") +
  p("উত্তর: খ") +
  p("ঢাবি ১৯-২০, জাবি ২০-২১") +
  p("২. পানির সংকেত কোনটি? [CU-A: 22-23]") +
  p("ক. H2O") + p("খ. CO2") + p("গ. NaCl") + p("ঘ. O2") +
  p("উত্তর: ক") +
  p("৩. আলোর বেগ কত? DU '21-22") +
  p("ক. 3×10^8 m/s") + p("খ. 3×10^6 m/s") + p("গ. 3×10^5 m/s") + p("ঘ. 3×10^2 m/s") +
  p("উত্তর: ক") +
  p("BUET 19-20") +
  p("৪. মানবদেহের সবচেয়ে বড় অঙ্গ কোনটি?") +
  p("ক. হৃদয়") + p("খ. যকৃত") + p("গ. ত্বক") + p("ঘ. ফুসফুস") +
  p("উত্তর: গ") +
  p("রেফারেন্স: মেডিকেল ২০২০") +
  p("৫. বাংলাদেশের স্বাধীনতা যুদ্ধ শুরু হয় কোন সালে?") +
  p("ক. ১৯৭০") + p("খ. ১৯৭১") + p("গ. ১৯৭২") + p("ঘ. ১৯৫২") +
  p("উত্তর: খ") +
  p("৬. সূর্যের নিকটতম গ্রহ কোনটি?") +
  p("ক. শুক্র") + p("খ. পৃথিবী") + p("গ. বুধ") + p("ঘ. মঙ্গল") +
  p("উত্তর: গ") +
  p("৭. কবি রবীন্দ্রনাথ ঠাকুরের জন্মসাল কোনটি?") +
  p("ক. ১৮৬১") + p("খ. ১৮৬২") + p("গ. ১৯৪১") + p("ঘ. ১৯০১") +
  p("উত্তর: ক") +
  p("৮. বাংলা ভাষা আন্দোলনের চূড়ান্ত পর্যায় কোনটি? জাবি ২০-২১।") +
  p("ক. ১৯৪৭") + p("খ. ১৯৫২") + p("গ. ১৯৬৯") + p("ঘ. ১৯৭১") +
  p("উত্তর: খ");

const docXml =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="${W}"><w:body>${body}<w:sectPr/></w:body></w:document>`;

const ctXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`;

const relsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`;

const zip = new JSZip();
zip.file("[Content_Types].xml", ctXml);
zip.folder("_rels")!.file(".rels", relsXml);
zip.folder("word")!.file("document.xml", docXml);
const buf = await zip.generateAsync({ type: "nodebuffer" });
writeFileSync("/tmp/bare-ref-test.docx", buf);
console.log("সিনথেটিক docx তৈরি: /tmp/bare-ref-test.docx (", buf.length, "bytes )");

// ---- লাইভ সাইটে আপলোড-যাচাই ----
const { chromium } = await import("playwright");
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
  await page.goto("http://localhost:3000", { waitUntil: "networkidle", timeout: 60000 });
  ok(true, "লাইভ সাইট লোড");

  await page.setInputFiles("#step-upload input[type='file']", "/tmp/bare-ref-test.docx");
  await page.waitForSelector('button[role="tab"]:has-text("MCQ Shuffle")', { timeout: 30000 });
  await page.click('button[role="tab"]:has-text("MCQ Shuffle")');
  await page.waitForTimeout(1500);

  // ডিটেক্ট-স্ক্রিনে প্রশ্ন-সংখ্যা
  const bodyText = (await page.locator("body").innerText()).replace(/\s+/g, " ");
  ok(/8\s*question/.test(bodyText), "৮টি প্রশ্ন ডিটেক্ট");

  // রেফারেন্স-সেকশন দেখা যাচ্ছে? (ব্র্যাকেট-ছাড়া সহ)
  const section = page.locator('[data-testid="ref-mode-group"]');
  ok(await section.isVisible(), "রেফারেন্স-সেকশন দৃশ্যমান (ব্র্যাকেট-ছাড়া ডিটেকশন লাইভ)");

  const secText = (await section.innerText()).replace(/\s+/g, " ");
  console.log("  সেকশন:", secText.slice(0, 140));
  // কাউন্ট-লাইন সেকশনের বাইরে রেন্ডার হয় — পুরো পেজ-টেক্সটে দেখা হয়
  const bodyText2 = (await page.locator("body").innerText()).replace(/\s+/g, " ");
  ok(/question\(s\)\s+have\s+source/.test(bodyText2), "রিপোর্টে প্রশ্ন-কাউন্ট লাইন (question(s) have source tags)");

  // "বাদ দিন" সিলেক্ট করে শাফল-পর্যন্ত যাওয়া
  await page.click('label[for="ref-strip"]');
  await page.waitForTimeout(300);
  await page.click('button:has-text("Shuffle & build sets")');
  await page.waitForSelector("text=Shuffle complete", { timeout: 60000 });
  ok(true, "শাফল সম্পন্ন (strip-মোডে)");

  // ডাউনলোড-করা ফাইলে রেফ-ট্যাগ শূন্য কি না
  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: 60000 }),
    page.click('button:has-text("renumbered serials")'),
  ]);
  const outPath = "/tmp/bare-ref-out.docx";
  await download.saveAs(outPath);

  const JSZip2 = (await import("jszip")).default;
  const dom = new (await import("jsdom")).JSDOM("<!doctype html>");
  (globalThis as unknown as Record<string, unknown>).DOMParser = dom.window.DOMParser;
  (globalThis as unknown as Record<string, unknown>).XMLSerializer = dom.window.XMLSerializer;
  (globalThis as unknown as Record<string, unknown>).Node = dom.window.Node;
  const { parseDocxXml } = await import("../src/lib/mcq/docx-xml");
  const { findRefTokens } = await import("../src/lib/mcq/reference");

  const zip2 = await JSZip2.loadAsync(await (await import("node:fs")).readFileSync(outPath));
  const xml2 = await zip2.file("word/document.xml")!.async("string");
  const parse = parseDocxXml(xml2);
  ok(parse.questions.length === 8, `আউটপুটে ৮ প্রশ্ন (পেলো ${parse.questions.length})`);
  const tokens = parse.questions.flatMap((q) => q.paras.flatMap((t) => findRefTokens(t)));
  ok(tokens.length === 0, "ডাউনলোড-করা ফাইলে শূন্য রেফারেন্স-টোকেন (strip লাইভ কাজ করেছে)");
  const joined = parse.questions.map((q) => q.text).join(" ");
  ok(!joined.includes("ঢাকা বোর্ড ২০১৭"), "ঝোলা ট্যাগ আউটপুটে নেই");
  ok(joined.includes("রাজধানী"), "প্রশ্ন-টেক্সট অক্ষত");
} finally {
  ok(jsErrors.length === 0, `কনসোল-এরর শূন্য (${jsErrors.length})${jsErrors.length ? " → " + jsErrors[0].slice(0, 120) : ""}`);
  await browser.close();
}
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
