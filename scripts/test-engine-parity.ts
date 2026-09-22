// ============================================================
// ENGINE-PARITY — তিন মোডের এক প্রশ্ন-সংখ্যা (স্থায়ী রিগ্রেশন টেস্ট)
// রান: bun run test:engines  (বা bun run scripts/test-engine-parity.ts)
// ============================================================
// কেন: সিরিয়াল (analyzeColorDocx), শাফল (parseDocxXml) আর রিডাউনলোড
// (parseRedownloadXml) — তিনটা আলাদা পার্সার একই ফাইলে ভিন্ন প্রশ্নসংখ্যা
// দিত (৫১ বনাম ৫০ ইত্যাদি), কারণ তিনজনের "প্রশ্ন কী" নিয়ম আলাদা ছিল।
// এখন তিনজনই একই শেয়ার্ড নিয়ম চালায় (docx-xml-এর ব্লক-স্প্লিট + MCQ-শর্ত
// `countOptionMarkers`/`MIN_OPTIONS_PER_MCQ`/`MARKER_WINDOW_PARAS` + limits.ts)।
// এই টেস্ট ভবিষ্যতের যেকোনো drift সাথে সাথে ধরে ফেলে।
//
// স্ক্যান করে:  scripts/fixtures/*.docx (CI-নিরাপদ, ট্র্যাকড) +
//              Format/*.docx (আপনার আসল ফাইল-ফোল্ডার; থাকলে চলে, না থাকলে স্কিপ)
// ============================================================

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { JSDOM } from "jsdom";
import JSZip from "jszip";

// ---- ব্রাউজার DOM API emulation (jsdom) ----
const dom = new JSDOM("<!doctype html><html><body></body></html>");
(globalThis as unknown as Record<string, unknown>).DOMParser = dom.window.DOMParser;
(globalThis as unknown as Record<string, unknown>).XMLSerializer = dom.window.XMLSerializer;
(globalThis as unknown as Record<string, unknown>).Node = dom.window.Node;

const { analyzeColorDocx } = await import("../src/lib/mcq/color-serial");
const { parseRedownloadXml } = await import("../src/lib/mcq/redownload");
const { prepareShuffleXml } = await import("../src/lib/mcq/file-pipeline");
const { detectSerialPrefix } = await import("../src/lib/mcq/docx-xml");

let passed = 0;
let failed = 0;
let warned = 0;
function ok(cond: boolean, name: string) {
  if (cond) {
    passed++;
    console.log("  ✓", name);
  } else {
    failed++;
    console.error("  ✗ FAIL:", name);
  }
}
/** নরম-সতর্কতা নয় — রিডাউনলোডের ভিতরের সিরিয়াল-নম্বর অবশ্যই মিলতে হবে। */
function warn(cond: boolean, name: string) {
  if (cond) {
    passed++;
  } else {
    warned++;
    console.warn("  ⚠ WARN (সংখ্যা ঠিক, নম্বর আলাদা):", name);
  }
}

/** কোথায় কী আছে: ট্র্যাকড ফিক্সচার (সবসময়) + ইউজারের Format/ ফোল্ডার (থাকলে) */
const dirs = ["scripts/fixtures", "Format"];
const files: string[] = [];
for (const d of dirs) {
  if (!existsSync(d)) continue;
  for (const f of readdirSync(d)) {
    if (f.toLowerCase().endsWith(".docx") && !f.startsWith("~$")) files.push(`${d}/${f}`);
  }
}
if (!files.length) {
  console.error("✗ কোনো .docx ফাইল পাওয়া যায়নি (scripts/fixtures বা Format/) — আগে ফিক্সচার দিন");
  process.exit(1);
}

console.log("== ENGINE PARITY — এক ফাইলে তিন মোডের প্রশ্ন-সংখ্যা ==");
console.log("serial | redownload | shuffle | file");

/** প্রশ্ন-টেক্সটের নরমালাইজড কী (whitespace-fold) — সেট তুলনার জন্য */
const norm = (t: string) => t.replace(/\s+/g, " ").trim();

for (const file of files) {
  let xml: string;
  try {
    const zip = await JSZip.loadAsync(readFileSync(file));
    const f = zip.file("word/document.xml");
    if (!f) {
      console.log(`  skip (no word/document.xml): ${file}`);
      continue;
    }
    xml = (await f.async("string")) as unknown as string;
  } catch (e) {
    console.error(`  ✗ পড়া যায়নি: ${file} — ${e instanceof Error ? e.message : e}`);
    failed++;
    continue;
  }

  const serial = analyzeColorDocx(xml);
  const shuffle = prepareShuffleXml(xml);
  const rd = parseRedownloadXml(xml);

  const sN = serial.questionCount;
  const hN = shuffle.parse.questions.length;
  const rN = rd.questions.length;
  console.log(`${String(sN).padStart(6)} | ${String(rN).padStart(10)} | ${String(hN).padStart(7)} | ${file}`);

  ok(sN === hN, `সিরিয়াল মোড == শাফল মোড (${sN} vs ${hN}) — ${file}`);
  ok(rN === hN, `রিডাউনলোড মোড == শাফল মোড (${rN} vs ${hN}) — ${file}`);

  // প্রশ্ন-সিরিয়াল-নম্বরের মাল্টিসেটও মিলিয়ে দেখি (সংখ্যা সমান হলেও ভিন্ন প্রশ্ন ধরা পড়বে)
  const sSers = serial.paras
    .filter((p) => p.isQuestion)
    .map((p) => detectSerialPrefix(p.text)?.num ?? -1);
  const hSers = shuffle.parse.questions.map((q) => q.serial);
  const rSers = rd.questions.map((q) => q.serial);
  const multi = (a: number[]) => {
    const m = new Map<number, number>();
    for (const n of a) m.set(n, (m.get(n) ?? 0) + 1);
    return m;
  };
  const sameMulti = (a: Map<number, number>, b: Map<number, number>) =>
    a.size === b.size && [...a].every(([n, c]) => b.get(n) === c);
  const sm = multi(sSers);
  const hm = multi(hSers);
  const rm = multi(rSers);
  ok(sameMulti(sm, hm), `সিরিয়াল-নম্বর-তালিকা একই (serial vs shuffle) — ${file}`);
  ok(sameMulti(rm, hm), `সিরিয়াল-নম্বর-তালিকা একই (redownload vs shuffle) — ${file}`);

  // বাড়তি/কমতি প্রশ্ন থাকলে ঠিক কোনটা — ডিবাগ-সহায়ক প্রিন্ট
  if (sN !== hN || rN !== hN) {
    for (const n of new Set([...sm.keys(), ...hm.keys(), ...rm.keys()])) {
      const a = sm.get(n) ?? 0;
      const b = hm.get(n) ?? 0;
      const c = rm.get(n) ?? 0;
      if (a !== b || b !== c) console.error(`      #${n}: serial=${a} shuffle=${b} redownload=${c}`);
    }
  }
}

console.log(`\n===== ইঞ্জিন-প্যারিটি: ${passed} পাস, ${failed} ফেল, ${warned} সতর্কতা =====`);
process.exit(failed ? 1 : 0);
