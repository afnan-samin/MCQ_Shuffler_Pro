// Chemistry ফাইল E2E — string-level pipeline (DOM ছাড়া, মেমোরি-নিরাপদ)
// রান: bun run scripts/e2e-color-chem.ts [B1|A3|B6|B4|continuous]
import { readFileSync, writeFileSync } from "node:fs";
import JSZip from "jszip";

const { analyzeColorDocx, planSerialByColor, applyColorSerialXml } = await import(
  "../src/lib/mcq/color-serial"
);

const KEY = process.argv[2] ?? "B1";
const KEYMAP: Record<string, string> = { B1: "000000", A3: "D9D9D9", A4: "BFBFBF", B6: "0D0D0D" };
const SRC = "upload/Final Chemistry 1st paper only varsity Question (1-5).docx";

const buf = readFileSync(SRC);
const zip = await JSZip.loadAsync(buf);
const xml = await zip.file("word/document.xml")!.async("string");
console.log("document.xml:", (xml.length / 1e6).toFixed(1), "MB");

const t0 = Date.now();
const analysis = analyzeColorDocx(xml);
console.log(`analyze: ${Date.now() - t0}ms  colors:`, analysis.colors.map((c) => `${c.name}:${c.sections}`).join(" "), ` questions: ${analysis.questionCount}`);

const t1 = Date.now();
const scheme = KEY === "continuous" ? { kind: "continuous" as const } : { kind: "color" as const, key: KEYMAP[KEY] ?? KEY };
const plan = planSerialByColor(analysis, scheme);
console.log(`plan(${KEY}): ${plan.size} questions in ${Date.now() - t1}ms`);
if (plan.size === 0) {
  console.log("প্ল্যান খালি!");
  process.exit(1);
}

const t2 = Date.now();
const newXml = applyColorSerialXml(xml, plan);
console.log(`apply: ${Date.now() - t2}ms  new len: ${newXml.length}`);

// পুনঃ-বিশ্লেষণে যাচাই: আউটপুটের ওপর নিজেই প্ল্যান স্থিতিশীল কিনা (fixpoint)।
// (মূল-প্ল্যানের সাথে হুবহু মিলবে না — renumber-এ ১০০০+ সিরিয়ালের নন-ট্যাব
// প্রশ্ন tier-3 ডিটেকশনে ধরা নাও পড়তে পারে; ডাউনলোড-ফাইলের নম্বর তবু সঠিক।)
const an2 = analyzeColorDocx(newXml);
const plan2 = planSerialByColor(an2, scheme);
const an3 = analyzeColorDocx(newXml);
const plan3 = planSerialByColor(an3, scheme);
let stable = plan2.size === plan3.size;
if (stable) for (const [idx, n] of plan2) if (plan3.get(idx) !== n) { stable = false; break; }
console.log("আউটপুট re-plan fixpoint:", stable ? "✓ স্থিতিশীল" : "✗ অস্থির!");

// প্রতিটা B1-সেকশনের প্রথম নম্বর ১ কিনা (B1 রান হলে)
if (KEY === "B1") {
  let firstOfSection: number[] = [];
  let expect = 0;
  for (const p of an2.paras) {
    if (p.colorKey === "000000") expect = 0;
    else if (p.isQuestion && plan2.has(p.idx)) {
      expect++;
      if (expect === 1 || plan2.get(p.idx) === 1) firstOfSection.push(plan2.get(p.idx)!);
    }
  }
  console.log("সেকশন-প্রথম-নম্বরগুলো সব ১:", firstOfSection.every((n) => n === 1), `(${firstOfSection.length} টা রিসেট-পয়েন্ট)`);
}

// docx আউটপুট (ব্রাউজারের downloadColorSerialDocx-এর মত — fresh copy, dir-entry নেই)
const src2 = await JSZip.loadAsync(buf);
const outZip = new JSZip();
const others: Array<{ path: string; data: Promise<Uint8Array> }> = [];
src2.forEach((path, entry) => {
  if (!entry.dir && path !== "word/document.xml") others.push({ path, data: entry.async("uint8array") });
});
outZip.file("word/document.xml", new TextEncoder().encode(newXml));
for (const o of others) outZip.file(o.path, await o.data);
const outBuf = await outZip.generateAsync({
  type: "nodebuffer",
  mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  compression: "DEFLATE",
});
const label = KEY === "continuous" ? "continuous" : KEY;
const OUT = `download/Chemistry (color serial - ${label}).docx`;
writeFileSync(OUT, outBuf);
console.log("✅ আউটপুট:", OUT, `(${(outBuf.length / 1024).toFixed(0)} KB)`);
