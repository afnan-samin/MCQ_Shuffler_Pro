// ============================================================
// Redownload engine unit tests — অংশ-ডিটেকশন + বিস্তার + রিনাম্বার
// রান: bun run scripts/test-redownload.ts
// ============================================================

import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";
import JSZip from "jszip";

// ---- ব্রাউজার DOM API emulation (jsdom) ----
const dom = new JSDOM("<!doctype html><html><body></body></html>");
(globalThis as unknown as Record<string, unknown>).DOMParser = dom.window.DOMParser;
(globalThis as unknown as Record<string, unknown>).XMLSerializer = dom.window.XMLSerializer;
(globalThis as unknown as Record<string, unknown>).Node = dom.window.Node;

const { parseRedownloadXml, buildRedownloadXml, extractWatermark, DEFAULT_PART_SELECTION } =
  await import("../src/lib/mcq/redownload");
const { parseDocxXml } = await import("../src/lib/mcq/docx-xml");

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

/** আউটপুট XML পার্স করে প্রতিটা w:p-এর textContent (runs জোড়া) */
function parasOf(xml: string): string[] {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  const out: string[] = [];
  for (const el of Array.from(doc.getElementsByTagNameNS("http://schemas.openxmlformats.org/wordprocessingml/2006/main", "p"))) {
    out.push(el.textContent ?? "");
  }
  return out;
}

const W_DOC_OPEN =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>';
const W_DOC_CLOSE = "</w:body></w:document>";

const p = (text: string, shd = "") =>
  `<w:p>${shd ? `<w:pPr><w:shd w:val="clear" w:fill="${shd}"/></w:pPr>` : ""}<w:r><w:t xml:space="preserve">${text}</w:t></w:r></w:p>`;

// সিনথেটিক ফাইল: টাইটেল → প্রশ্নমালা (২ প্রশ্ন+অপশন+উত্তর) → উত্তরমালা → ব্যাখ্যা → রেফারেন্স
const SYNTH = [
  W_DOC_OPEN,
  p("উচ্চ মাধ্যমিক পরীক্ষা — পদার্থবিজ্ঞান"),
  p("প্রশ্নমালা", "FFF2CC"),
  p("১. পানির রাসায়নিক সংকেত কী?"),
  p("ক) H2O"),
  p("খ) CO2"),
  p("গ) O2"),
  p("ঘ) N2"),
  p("উত্তর: ক"),
  p("২. বাংলাদেশের রাজধানী কোনটি?"),
  p("ক) চট্টগ্রাম"),
  p("খ) ঢাকা"),
  p("গ) সিলেট"),
  p("ঘ) রাজশাহী"),
  p("উত্তর: খ"),
  p("উত্তরমালা", "D9EAD3"),
  p("১. ক"),
  p("২. খ"),
  p("ব্যাখ্যা", "CFE2F3"),
  p("১. পানি দুইটি হাইড্রোজেন ও একটি অক্সিজেন পরমাণুর সমন্বয়ে গঠিত।"),
  p("২. ঢাকা বাংলাদেশের রাজধানী ও প্রধান শহর।"),
  p("রেফারেন্স: বোর্ড প্রশ্ন ২০২৩"),
  W_DOC_CLOSE,
].join("");

const parse = parseRedownloadXml(SYNTH);

console.log("\n== ১) অংশ-ডিটেকশন ==");
ok(parse.questions.length === 2, `প্রশ্ন সংখ্যা ২ (আসলে ${parse.questions.length}) — উত্তরমালার "১. ক" প্রশ্ন হিসেবে ধরা পড়েনি`);
ok(parse.kindCounts.question === 3, `প্রশ্ন-লাইন ৩ (২ প্রশ্ন + "প্রশ্নমালা" হেডার, আসলে ${parse.kindCounts.question})`);
ok(parse.kindCounts.options === 8, `অপশন-লাইন ৮ (আসলে ${parse.kindCounts.options})`);
ok(parse.kindCounts.answer === 5, `উত্তর-লাইন ৫ (২ "উত্তর: ক" + ২ উত্তরমালা + হেডার, আসলে ${parse.kindCounts.answer})`);
ok(parse.kindCounts.bekkha === 3, `ব্যাখ্যা-লাইন ৩ (২ লাইন + হেডার, আসলে ${parse.kindCounts.bekkha})`);
ok(parse.kindCounts.reference === 1, `রেফারেন্স-লাইন ১ (আসলে ${parse.kindCounts.reference})`);
ok(parse.questions[0].qText.includes("পানির রাসায়নিক সংকেত"), "১ম প্রশ্নের টেক্সট সঠিক");
ok(parse.questions[0].options.length === 4, "১ম প্রশ্নে ৪টি অপশন");
ok(parse.questions[0].answer === "ক", "১ম প্রশ্নের উত্তর ক");
ok(parse.questions[1].answer === "খ", "২য় প্রশ্নের উত্তর খ");

console.log("\n== ২) ডিফল্ট অংশ (সিরিয়াল+প্রশ্ন) — পরীক্ষার প্রশ্নপত্র ==");
const outDefault = buildRedownloadXml(SYNTH, parse, [0, 1], {
  partSel: DEFAULT_PART_SELECTION,
  renumber: true,
  expandAnswer: true,
});
ok(outDefault.includes("পানির রাসায়নিক সংকেত"), "প্রশ্ন আছে");
ok(outDefault.includes("বাংলাদেশের রাজধানী"), "২য় প্রশ্ন আছে");
ok(!outDefault.includes("H2O"), "অপশন নেই");
ok(!outDefault.includes("উত্তর:"), "উত্তর নেই");
ok(!outDefault.includes("উত্তরমালা"), "উত্তরমালা সেকশন নেই");
ok(!outDefault.includes("পরমাণুর সমন্বয়ে"), "ব্যাখ্যা নেই");
ok(!outDefault.includes("বোর্ড প্রশ্ন ২০২৩"), "রেফারেন্স নেই");
ok(outDefault.includes("উচ্চ মাধ্যমিক পরীক্ষা"), "টাইটেল আছে (ব্লকের বাইরের other)");
const defParas = parasOf(outDefault);
ok(defParas.some((t) => t.startsWith("১.") && t.includes("পানির")), "রিনাম্বার করা নম্বর ১ + প্রশ্ন একসাথে");
ok(defParas.some((t) => t.startsWith("২.") && t.includes("রাজধানী")), "রিনাম্বার করা নম্বর ২");

console.log("\n== ৩) প্রশ্ন+অপশন (উত্তরহীন প্র্যাকটিস শিট) ==");
const outPractice = buildRedownloadXml(SYNTH, parse, [0, 1], {
  partSel: { serial: true, question: true, reference: false, options: true, answer: false, bekkha: false },
  renumber: false,
  expandAnswer: true,
});
ok(outPractice.includes("H2O"), "অপশন আছে");
ok(!outPractice.includes("উত্তর:"), "উত্তর নেই");
ok(!outPractice.includes(">১. ক<"), "উত্তরমালার লাইন নেই");
const pracParas = parasOf(outPractice);
ok(pracParas.some((t) => t.startsWith("১.") && t.includes("পানির")), "আসল নম্বরসহ (renumber off)");

console.log("\n== ৪) উত্তর-বিস্তার: অপশন বাদ + উত্তর আছে → অক্ষরের জায়গায় অপশনের পুরো লেখা ==");
const outExpand = buildRedownloadXml(SYNTH, parse, [0, 1], {
  partSel: { serial: true, question: true, reference: false, options: false, answer: true, bekkha: false },
  renumber: true,
  expandAnswer: true,
});
const expParas = parasOf(outExpand);
ok(expParas.some((t) => t.includes("উত্তর:") && t.includes("H2O") && !t.includes("ক) H2O")), `ব্লক-উত্তর বিস্তৃত: "উত্তর: H2O" (লেবেল ছাড়া)`);
ok(expParas.some((t) => t.includes("১.") && t.includes("H2O") && !t.includes("ক) H2O")), 'উত্তরমালার "১. ক" বিস্তৃত → "১. H2O"');
ok(expParas.some((t) => t.includes("২.") && t.includes("ঢাকা") && !t.includes("খ) ঢাকা")), 'উত্তরমালার "২. খ" বিস্তৃত → "২. ঢাকা"');
ok(!expParas.some((t) => t.trim() === "ক) H2O"), "মূল অপশন-প্যারা একা নেই");
ok(!outExpand.includes("পরমাণুর সমন্বয়ে"), "ব্যাখ্যা নেই (bekkha off)");

console.log("\n== ৫) সিরিয়াল বাদ (নম্বর ছাড়া প্রশ্ন) ==");
const outNoSerial = buildRedownloadXml(SYNTH, parse, [0, 1], {
  partSel: { serial: false, question: true, reference: false, options: false, answer: false, bekkha: false },
  renumber: true,
  expandAnswer: true,
});
ok(!/>১\.</.test(outNoSerial), "১. প্রিফিক্স নেই");
ok(outNoSerial.includes("পানির রাসায়নিক সংকেত"), "প্রশ্নের লেখা অক্ষত");

console.log("\n== ৬) রিনাম্বার — সিলেক্টেড ক্রমে ১,২,৩ ==");
// ২য় প্রশ্ন একা সিলেক্ট → আউটপুটে নম্বর ১ হবে
const outOne = buildRedownloadXml(SYNTH, parse, [1], {
  partSel: DEFAULT_PART_SELECTION,
  renumber: true,
  expandAnswer: false,
});
ok(/>১\.<\/w:t>/.test(outOne.replace("১. পানি", "").replace("১. ক", "").replace("১. পানি দুইটি", "")) || outOne.includes("১. বাংলাদেশের রাজধানী"), "২য় প্রশ্ন একা → নম্বর ১");
ok(!outOne.includes("পানির রাসায়নিক"), "১ম প্রশ্ন বাদ");

console.log("\n== ৭) আসল ফাইল (sample Bijoy docx) — হুবহু যাচাই ==");
const FILE = "scripts/fixtures/hsc27-physics-bijoy.docx";
const buf = readFileSync(FILE);
const zip = await JSZip.loadAsync(buf);
const xmlText = await zip.file("word/document.xml")!.async("string");
const realParse = parseRedownloadXml(xmlText);
const refParse = parseDocxXml(xmlText);
ok(
  realParse.questions.length === refParse.questions.length,
  `আসল ফাইলে প্রশ্ন সংখ্যা parseDocxXml-এর সমান (${realParse.questions.length} vs ${refParse.questions.length})`
);
ok(realParse.questions.length === 60, `আসল ফাইলে ৬০ প্রশ্ন (আসলে ${realParse.questions.length})`);
const outReal = buildRedownloadXml(
  xmlText,
  realParse,
  realParse.questions.map((q) => q.id),
  {
    partSel: { serial: true, question: true, reference: true, options: true, answer: true, bekkha: true },
    renumber: false,
    expandAnswer: false,
  }
);
const reparsed = parseDocxXml(outReal);
ok(reparsed.questions.length === 60, "সব-অংশ ON আউটপুট আবার পার্স → ৬০ প্রশ্ন");
const outRealDefault = buildRedownloadXml(xmlText, realParse, realParse.questions.map((q) => q.id), {
  partSel: DEFAULT_PART_SELECTION,
  renumber: true,
  expandAnswer: true,
});
const reparsedDefault = parseDocxXml(outRealDefault);
ok(reparsedDefault.questions.length === 60, "ডিফল্ট-অংশ আউটপুট আবার পার্স → ৬০ প্রশ্ন (শুধু প্রশ্ন+সিরিয়াল)");

console.log("\n== ৮) ওয়াটারমার্ক এক্সট্র্যাকশন ==");
const wmZip = new JSZip();
wmZip.file(
  "word/document.xml",
  W_DOC_OPEN + p("১. পরীক্ষামূলক প্রশ্নের লেখা এখানে যথেষ্ট লম্বা?") + W_DOC_CLOSE
);
wmZip.file(
  "word/header1.xml",
  '<?xml version="1.0"?><w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:v="urn:schemas-microsoft-com:vml"><w:p><w:r><w:pict><v:shape style="position:absolute" fillcolor="#7f7f7f"><v:textpath style="font-size:1pt" string="LipiLab Sample"/></v:shape></w:pict></w:r></w:p></w:hdr>'
);
const wmBuf = await wmZip.generateAsync({ type: "uint8array" });
const wm = await extractWatermark(wmBuf);
ok(wm !== null, "ওয়াটারমার্ক পাওয়া গেছে");
ok(wm?.text === "LipiLab Sample", `ওয়াটারমার্ক টেক্সট সঠিক (${wm?.text})`);
ok(wm?.color === "#7f7f7f", `ওয়াটারমার্ক রং সঠিক (${wm?.color})`);
const noWm = await extractWatermark(new Uint8Array(buf));
ok(noWm === null, "ওয়াটারমার্কহীন ফাইলে null");

console.log(`\n=== ফলাফল: ${passed} পাস, ${failed} ফেল ===`);
process.exit(failed ? 1 : 0);
