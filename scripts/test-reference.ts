// ============================================================
// রেফারেন্স-ট্যাগ ডিটেকশন ও বিচ্ছিন্নকরণ টেস্ট
// আসল আপলোড করা Physics/Chemistry (Raw) ফাইল দিয়েই যাচাই
// রান: bun run scripts/test-reference.ts
// ============================================================
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { JSDOM } from "jsdom";
import JSZip from "jszip";

const dom = new JSDOM("<!doctype html><html><body></body></html>");
(globalThis as unknown as Record<string, unknown>).DOMParser = dom.window.DOMParser;
(globalThis as unknown as Record<string, unknown>).XMLSerializer = dom.window.XMLSerializer;
(globalThis as unknown as Record<string, unknown>).Node = dom.window.Node;

const { findRefTokens, analyzeQRefs, analyzeRefReport } = await import(
  "../src/lib/mcq/reference"
);
const { parseDocxXml, extractParaText, W_NS } = await import("../src/lib/mcq/docx-xml");
const { buildShuffledXml } = await import("../src/lib/mcq/docx-exporter");

let passed = 0;
let failed = 0;
function ok(cond: boolean, name: string) {
  if (cond) {
    passed++;
    console.log("  ✓", name);
  } else {
    failed++;
    console.error("  ✗ FAIL:", name);
  }
}

// ---------- ১. ডিটেকশন ইউনিট-টেস্ট ----------

console.log("\n── ডিটেকশন ইউনিট-টেস্ট ──");

// পজিটিভ — ফাইলে পাওয়া আসল বৈচিত্র্য
const positives: Array<[string, string]> = [
  ["1. প্রশ্ন এখানে? [DU-Projukti: 24-25]", "[DU-Projukti: 24-25]"],
  ["প্রশ্ন? [Xvwe (cÖhyw³): 21-22]", "[Xvwe (cÖhyw³): 21-22]"],
  ["প্রশ্ন? [JU-A : 20-21]", "[JU-A : 20-21]"],
  ["প্রশ্ন? (DU-cÖhyw³: 21-22, DU-16-17)", "(DU-cÖhyw³: 21-22, DU-16-17)"],
  ["প্রশ্ন? [BAU-03-04]", "[BAU-03-04]"],
  ["প্রশ্ন? [BRUR; 16-17]", "[BRUR; 16-17]"],
  ["প্রশ্ন? [CU:A20-21]", "[CU:A20-21]"],
  ["প্রশ্ন? [CU-A: 22-23; CoU: 19-20, 15-16]", "[CU-A: 22-23; CoU: 19-20, 15-16]"],
  ["প্রশ্ন? [DU 7 college:21-22]", "[DU 7 college:21-22]"],
  ["প্রশ্ন? [CU-A: 24-25; RU-C: 23-24]।", "[CU-A: 24-25; RU-C: 23-24]"],
  ["প্রশ্ন? (বরিশাল বোর্ড-২০১৯)", "(বরিশাল বোর্ড-২০১৯)"],
  ["[Bwe: 17-18; 12-13]", "[Bwe: 17-18; 12-13]"],
];
for (const [line, expected] of positives) {
  const toks = findRefTokens(line);
  ok(toks.length === 1 && toks[0].text === expected, `পজিটিভ: ${expected}`);
}

// চেইন — পাশাপাশি দুই টোকেন
{
  const toks = findRefTokens("প্রশ্ন? [Xvwe: 19-20] [JU: 20-21]");
  ok(toks.length === 2, "চেইন: পাশাপাশি ২ টোকেন ধরা হয়");
}

// নেগেটিভ — রেফারেন্স নয়
const negatives = [
  "অপশন (NH4)2HPO4 ধরনের রাসায়নিক",
  "তাপমাত্রা (273-373) K রেঞ্জে",
  "উত্তর (a) হবে",
  "রোমান সংখ্যা (ii) মাঝে",
  "সংখ্যা (0-5) রেঞ্জ",
  "মাঝ-লাইনের [CU-A: 22-23] টোকেন লাইনের শেষে নেই",
  "ব্র্যাকেট ছাড়া সাধারণ প্রশ্ন?",
];
let negOk = true;
for (const n of negatives) {
  if (findRefTokens(n).length !== 0) {
    negOk = false;
    console.error("    ভুল ধরা পড়েছে:", n);
  }
}
ok(negOk, "নেগেটিভ: গণিত/রাসায়নিক/মাঝ-লাইন ব্র্যাকেট অস্পৃশ্য");

// ---------- ২. আসল ফাইলে ইন্টিগ্রেশন ----------

const UP = "/home/z/my-project/upload";
const files = existsSync(UP)
  ? readdirSync(UP).filter((f) => f.includes("(Raw)")).sort()
  : [];
if (!files.length) {
  console.log("  (স্কিপ: upload/-এ (Raw) ফিক্সচার নেই — প্রাইভেসি-আনট্র্যাকে সরানো হয়েছে)");
}

interface Loaded {
  name: string;
  file: Buffer;
  xml: string;
  parse: ReturnType<typeof parseDocxXml>;
}
const loaded: Loaded[] = [];
for (const name of files) {
  try {
    const file = readFileSync(`${UP}/${name}`);
    const zip = await JSZip.loadAsync(file);
    const xml = await zip.file("word/document.xml")!.async("string");
    loaded.push({ name, file, xml, parse: parseDocxXml(xml) });
  } catch {
    console.log(`  (স্কিপ: ${name} পড়া যায়নি)`);
  }
}

console.log("\n── আসল ফাইলে ডিটেকশন ──");
let totalQ = 0;
let totalRefQ = 0;
for (const L of loaded) {
  const rep = analyzeRefReport(L.parse.questions);
  totalQ += L.parse.questions.length;
  totalRefQ += rep?.questionCount ?? 0;
  ok(
    !!rep && rep.questionCount >= 10,
    `${L.name}: ${rep?.questionCount ?? 0}/${L.parse.questions.length} প্রশ্নে রেফারেন্স`
  );
}
console.log(`  মোট: ${totalRefQ}/${totalQ} প্রশ্নে রেফারেন্স`);

// মোট প্রশ্ন অপরিবর্তিত থাকার কথা (আগের probe-এর সাথে মিল)
if (loaded.length) ok(totalQ >= 500, "মোট প্রশ্ন ৫০০+ (পার্স অক্ষত)");

// ---------- ৩. এক্সপোর্ট: keep / strip / endline ----------

console.log("\n── এক্সপোর্ট মোড টেস্ট (Physics Chapter-10) ──");
const base = loaded.find((L) => L.name.includes("Physics 1st Paper Chapter-10"));

function buildXml(mode: "keep" | "strip" | "endline"): string {
  return buildShuffledXml(
    base!.xml,
    base!.parse.questions,
    [base!.parse.questions.map((q) => q.id)],
    { renumber: true, includeSetHeader: false, refMode: mode }
  );
}

function bodyTexts(xml: string): string[] {
  const doc = new dom.window.DOMParser().parseFromString(xml, "application/xml");
  const body = doc.getElementsByTagNameNS(W_NS, "body")[0];
  return Array.from(body.children as unknown as Element[])
    .filter((e) => e.localName === "p")
    .map((e) => extractParaText(e));
}

// ৩ক. keep — ব্র্যাকেট আগের মতই আছে
if (base) {
  const texts = bodyTexts(buildXml("keep"));
  const hasRef = texts.some((t) => /\[[A-Za-z]+[^[\]]*\d{2}\s*[-–]\s*\d{2}\]/.test(t));
  ok(hasRef, "keep: রেফারেন্স আউটপুটেই থাকে (আগের আচরণ)");
  ok(texts.some((t) => t.includes("Dt ")), "keep: উত্তর-মার্কার অক্ষত");
}

// ৩খ. strip — কোনো ব্র্যাকেট-ট্যাগ নেই, প্রশ্ন-অপশন অক্ষত
if (base) {
  const texts = bodyTexts(buildXml("strip"));
  const refTokens = texts.flatMap((t) => findRefTokens(t));
  ok(refTokens.length === 0, "strip: আউটপুটে শূন্য রেফারেন্স-টোকেন");
  // প্রশ্ন-টেক্সট অক্ষত? প্রথম প্রশ্নের শুরু "1." আছে, অপশন K/L/M/N আছে
  const q1 = texts.find((t) => /^\s*1\s*[.।|]/.test(t));
  ok(!!q1, "strip: রিনাম্বার-করা প্রথম প্রশ্ন আছে");
  ok(texts.some((t) => /^\s*[KLMN]\s*[.।)]/.test(t)), "strip: অপশন-রো অক্ষত");
  ok(texts.some((t) => /Dt\s+[KLMN]/.test(t)), "strip: উত্তর-মার্কার অক্ষত");
  // খালি প্যারা: strip নতুন কোনো খালি প্যারা বানায় না (প্রি-একজিস্টিং থাকতে পারে)
  {
    const keepTexts = bodyTexts(buildXml("keep"));
    const keepEmpty = keepTexts.filter((t) => !t.trim()).length;
    const empty = texts.filter((t) => !t.trim()).length;
    ok(empty <= keepEmpty, `strip: নতুন খালি প্যারা নেই (keep ${keepEmpty} ≈ strip ${empty})`);
  }
}

// ৩গ. endline — প্রতি প্রশ্নের শেষে ট্যাগ, ব্লকের ভেতরে আর নেই
if (base) {
  const xml = buildXml("endline");
  const texts = bodyTexts(xml);
  // মোট টোকেন সংখ্যা সংরক্ষিত — সব প্রশ্নের শেষ-লাইনে সরেছে
  const endLines = texts.filter((t) => /^\s*[\[\(][^\[\]]*[\]\)]\s*$/.test(t));
  ok(endLines.length > 20, `endline: ${endLines.length} টা রেফারেন্স-লাইন ব্লক-শেষে`);
  const endOk = endLines.every((t) => findRefTokens(t).length >= 1);
  ok(endOk, "endline: সরানো লাইনগুলো আবার ডিটেক্টযোগ্য (ফন্টসহ প্রিজার্ভ)");
  // প্রশ্নের ভেতরে (অপশন-রো-র আগে) ট্যাগ আর নেই — কোনো প্রশ্ন-প্যারায় টোকেন নেই
  const inQuestion = texts.filter((t) => !/^\s*[\[\(]/.test(t)).flatMap((t) => findRefTokens(t));
  ok(inQuestion.length === 0, "endline: প্রশ্ন/অপশন-লাইনে টোকেন অবশিষ্ট নেই");
}

// ৩ঘ. মাল্টি-সেট: প্রতি সেটে strip ঠিকমতো (২ সেট)
if (base) {
  const qs = base.parse.questions.map((q) => q.id);
  const half = Math.floor(qs.length / 2);
  const xml = buildShuffledXml(base.xml, base.parse.questions, [qs.slice(0, half), qs.slice(half)], {
    renumber: true,
    includeSetHeader: true,
    refMode: "strip",
  });
  const texts = bodyTexts(xml);
  ok(texts.some((t) => t.trim() === "Set A"), "strip+multi: Set A হেডার");
  ok(texts.some((t) => t.trim() === "Set B"), "strip+multi: Set B হেডার");
  ok(texts.flatMap((t) => findRefTokens(t)).length === 0, "strip+multi: দুই সেটেই শূন্য টোকেন");
}

// ৩ঙ. রেফারেন্স-শূন্য ফাইলে strip = keep-এর সমান (নিরাপত্তা)
{
  // সিনথেটিক: রেফারেন্স ছাড়া মিনি XML
  const mini = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="${W_NS}"><w:body>
<w:p><w:r><w:t>1. বিশুদ্ধ উত্তর কোনটি?</w:t></w:r></w:p>
<w:p><w:r><w:t>K. 250 K</w:t></w:r></w:p>
<w:p><w:r><w:t>L. 0 K</w:t></w:r></w:p>
<w:p><w:r><w:t>M. 100 K</w:t></w:r></w:p>
<w:p><w:r><w:t>N. 373 K</w:t></w:r></w:p>
<w:p><w:r><w:t>Dt K</w:t></w:r></w:p>
<w:sectPr/>
</w:body></w:document>`;
  const parse = parseDocxXml(mini);
  ok(analyzeRefReport(parse.questions) === null, "সিনথেটিক: রেফারেন্স-শূন্য ফাইলে রিপোর্ট null");
  const keepXml = buildShuffledXml(mini, parse.questions, [[0]], { renumber: true, includeSetHeader: false, refMode: "keep" });
  const stripXml = buildShuffledXml(mini, parse.questions, [[0]], { renumber: true, includeSetHeader: false, refMode: "strip" });
  const keepT = bodyTexts(keepXml).join("|");
  const stripT = bodyTexts(stripXml).join("|");
  ok(keepT === stripT, "রেফারেন্স-শূন্য ফাইলে strip ≡ keep");
}

// ---------- ফলাফল ----------
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
