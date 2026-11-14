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

const { parseRedownloadXml, buildRedownloadXml, extractWatermark, DEFAULT_PART_SELECTION, collectHeaderEntries } =
  await import("../src/lib/mcq/redownload");
const { parseDocxXml, runsText } = await import("../src/lib/mcq/docx-xml");

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

console.log("\n== ২) ডিফল্ট অংশ (সব অংশ ON) — সম্পূর্ণ নতুন ফাইল ==");
const outDefault = buildRedownloadXml(SYNTH, parse, [0, 1], {
  partSel: DEFAULT_PART_SELECTION,
  renumber: true,
  expandAnswer: true,
});
ok(outDefault.includes("পানির রাসায়নিক সংকেত"), "প্রশ্ন আছে");
ok(outDefault.includes("বাংলাদেশের রাজধানী"), "২য় প্রশ্ন আছে");
ok(outDefault.includes("H2O"), "অপশন আছে (ডিফল্ট: সব ON)");
ok(outDefault.includes("উত্তর:"), "উত্তর আছে (ডিফল্ট: সব ON)");
ok(outDefault.includes("উত্তরমালা"), "উত্তরমালা সেকশন আছে (ডিফল্ট: সব ON)");
ok(outDefault.includes("পরমাণুর সমন্বয়ে"), "ব্যাখ্যা আছে (ডিফল্ট: সব ON)");
ok(outDefault.includes("বোর্ড প্রশ্ন ২০২৩"), "রেফারেন্স আছে (ডিফল্ট: সব ON)");
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
ok(outPractice.includes("১. ক"), "answer-key list stays — Header defaults on, the answer part no longer drops it");
ok(outPractice.includes("উত্তরমালা"), "answer-key section header stays (Header on)");
const pracParas = parasOf(outPractice);
ok(pracParas.some((t) => t.startsWith("১.") && t.includes("পানির")), "আসল নম্বরসহ (renumber off)");

console.log("\n== ৪) উত্তর-বিস্তার: অপশন বাদ + উত্তর আছে → অক্ষরের জায়গায় অপশনের পুরো লেখা ==");
const outExpand = buildRedownloadXml(SYNTH, parse, [0, 1], {
  partSel: { serial: true, question: true, reference: false, options: false, answer: true, bekkha: false, header: false },
  renumber: true,
  expandAnswer: true,
});
const expParas = parasOf(outExpand);
ok(expParas.some((t) => t === "Ans: ক) H2O"), `block answer rewritten as "Ans: ক) H2O" (file label + verbatim runs)`);
ok(!outExpand.includes("১. ক") && !outExpand.includes("২. খ"), "answer-key list gone (header off) — no longer expanded from");
ok(!outExpand.includes("উত্তরমালা"), "answer-key section header gone (header off)");
ok(!expParas.some((t) => t.trim() === "ক) H2O"), "মূল অপশন-প্যারা একা নেই");
ok(!outExpand.includes("পরমাণুর সমন্বয়ে"), "ব্যাখ্যা নেই (header off — ব্লকের বাইরের লাইন)");
// Header ON: the answer-key list is header now — kept verbatim, never expanded
const outKeyKeep = buildRedownloadXml(SYNTH, parse, [0, 1], {
  partSel: { serial: true, question: true, reference: false, options: false, answer: true, bekkha: false, header: true },
  renumber: true,
  expandAnswer: true,
});
const keyKeepParas = parasOf(outKeyKeep);
ok(keyKeepParas.some((t) => t === "Ans: ক) H2O"), "header ON: block answer still rewritten \"Ans: ক) H2O\"");
ok(keyKeepParas.some((t) => t === "১. ক") && keyKeepParas.some((t) => t === "২. খ"), "header ON: answer-key list kept verbatim (no expansion)");
ok(!keyKeepParas.some((t) => t === "১. H2O"), 'key line not expanded into "১. H2O"');
ok(!keyKeepParas.some((t) => t === "২. ঢাকা"), 'key line not expanded into "২. ঢাকা"');

console.log("\n== ৫) সিরিয়াল বাদ (নম্বর ছাড়া প্রশ্ন) ==");
const outNoSerial = buildRedownloadXml(SYNTH, parse, [0, 1], {
  partSel: { serial: false, question: true, reference: false, options: false, answer: false, bekkha: false, header: false },
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
ok(reparsedDefault.questions.length === 60, "ডিফল্ট-অংশ আউটপুট আবার পার্স → ৬০ প্রশ্ন (সব অংশ ON)");

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

console.log("\n== ৯) লেবেল-টাইপো ডিটেকশন + fixLabels ডাউনলোড ==");
// অপশনে ৩য় লেবেল ভুলে "খ" রিপিট (ক, খ, খ, ঘ → ৩য়টি গ হওয়ার কথা)
const TYPO_DOC = [
  W_DOC_OPEN,
  p("টেস্ট প্রশ্নপত্র"),
  p("১. সিনথেটিক প্রশ্নের লেখা যথেষ্ট?"),
  p("ক) এক"),
  p("খ) দুই"),
  p("খ) তিন"),
  p("ঘ) চার"),
  p("উত্তর: ক"),
  W_DOC_CLOSE,
].join("");
const typoParse = parseRedownloadXml(TYPO_DOC);
ok(typoParse.labelTypos.length === 1, `রিপিট-লেবেল টাইপো ১ ধরা পড়ে (আসলে ${typoParse.labelTypos.length})`);
const t0 = typoParse.labelTypos[0];
ok(!!t0 && t0.actual.join("") === "কখখঘ", `actual কখখঘ (আসলে ${t0?.actual.join("")})`);
ok(!!t0 && t0.expected.join("") === "কখগঘ", `expected কখগঘ (আসলে ${t0?.expected.join("")})`);
ok(!!t0 && t0.fixes.length === 1, `fixes ১ (আসলে ${t0?.fixes.length})`);
const typoAllParts = {
  partSel: { serial: true, question: true, reference: true, options: true, answer: true, bekkha: true },
  renumber: false,
  expandAnswer: false,
};
const outTypoOff = buildRedownloadXml(TYPO_DOC, typoParse, [0], typoAllParts);
ok(outTypoOff.includes("খ) তিন"), "fixLabels OFF → লেবেল হুবহু (খ) তিন থাকে)");
ok(parseRedownloadXml(outTypoOff).labelTypos.length === 1, "OFF আউটপুট রিপার্স → টাইপো থাকে");
const outTypoOn = buildRedownloadXml(TYPO_DOC, typoParse, [0], { ...typoAllParts, fixLabels: true });
ok(/গ\) তিন/.test(outTypoOn), "fixLabels ON → খ) তিন গ) তিন হয়");
ok(!outTypoOn.includes("খ) তিন"), "ON আউটপুটে ভুল লেবেল নেই");
ok(parseRedownloadXml(outTypoOn).labelTypos.length === 0, "ON আউটপুট রিপার্স → টাইপো ০");

console.log("\n== ১০) কেস-ফোল্ড ডিসিশন + B-টাইমার `*` + টাইপো-কম্বো (এক প্যারায়) ==");
// কেস-মাত্র পার্থক্য টাইপো নয়: K, L, m, N → fold-তুলনায় ০ টাইপো
const CASE_DOC = [
  W_DOC_OPEN,
  p("টেস্ট প্রশ্নপত্র"),
  p("১. সিনথেটিক প্রশ্নের লেখা যথেষ্ট?"),
  p("K) এক"),
  p("L) দুই"),
  p("m) তিন"),
  p("N) চার"),
  p("উত্তর: K"),
  W_DOC_CLOSE,
].join("");
ok(parseRedownloadXml(CASE_DOC).labelTypos.length === 0, "কেস-মাত্র পার্থক্য (m vs M) টাইপো ফ্ল্যাগ হয় না");

// ছোটহাতের ফাইলে রিপিট (k,l,l,n) — ফিক্সও ছোটহাতের (m)
const LOWER_DOC = [
  W_DOC_OPEN,
  p("টেস্ট প্রশ্নপত্র"),
  p("১. সিনথেটিক প্রশ্নের লেখা যথেষ্ট?"),
  p("k) এক"),
  p("l) দুই"),
  p("l) তিন"),
  p("n) চার"),
  p("উত্তর: k"),
  W_DOC_CLOSE,
].join("");
const lowerParse = parseRedownloadXml(LOWER_DOC);
ok(lowerParse.labelTypos.length === 1, `ছোটহাতের রিপিট-টাইপো ১ (আসলে ${lowerParse.labelTypos.length})`);
ok(lowerParse.labelTypos[0]?.fixes[0]?.text === "m", `ফিক্স ছোটহাতের m (আসলে ${lowerParse.labelTypos[0]?.fixes[0]?.text})`);
const outLowerOn = buildRedownloadXml(LOWER_DOC, lowerParse, [0], { ...typoAllParts, fixLabels: true });
ok(/m\) তিন/.test(outLowerOn), "fixLabels ON → l) তিন m) তিন হয় (ছোটহাতেরই)");
ok(!/l\) তিন/.test(outLowerOn), "ভুল ছোটহাতের লেবেল নেই");

// B-টাইমার `*` + রিপিট-টাইপো একই অপশন-প্যারায় — স্টার-রিমুভে অফসেট সরলে
// ফিক্স ভুল জায়গায় বসত; এক replaceSpansLocal-এ দুটোই অরিজিনাল অফসেটে
const STAR_DOC = [
  W_DOC_OPEN,
  p("টেস্ট প্রশ্নপত্র"),
  p("৯. সিনথেটিক প্রশ্নের লেখা যথেষ্ট?"),
  p("ক. এক\t*খ. দুই\tখ. তিন\tঘ. চার"),
  p("উত্তর: খ"),
  W_DOC_CLOSE,
].join("");
const starParse = parseRedownloadXml(STAR_DOC);
ok(starParse.labelTypos.length === 1, `স্টার+টাইপো একসাথে ধরা পড়ে (আসলে ${starParse.labelTypos.length})`);
const outStarOn = buildRedownloadXml(STAR_DOC, starParse, [0], {
  ...typoAllParts,
  renumber: true,
  fixLabels: true,
});
const starOpt = parasOf(outStarOn).find((t) => t.includes("দুই")) ?? "";
ok(starOpt.length > 0, "অপশন-প্যারা আউটপুটে আছে");
ok(starOpt.includes("*"), "স্টার-মার্কার রাখা হয়েছে (অপশন+উত্তর দুটোই ON)");
ok(starOpt.includes("গ. তিন"), "স্টার থাকলেও ফিক্স সঠিক জায়গায় (খ. তিন → গ. তিন)");
ok(!starOpt.includes("খ. তিন"), "ভুল লেবেল আর নেই (অফসেট-শিফট নেই)");
ok(starOpt.includes("ঘ. চার"), "পরের অপশন অক্ষত");
ok(parseRedownloadXml(outStarOn).labelTypos.length === 0, "স্টার-আউটপুট রিপার্স → টাইপো ০");

// ---- Header/Topic switches: everything outside any MCQ block is Header;
// "Topic:" lines inside a block are Topic ----
const tbl = (a: string, b: string) =>
  `<w:tbl><w:tr><w:tc><w:p><w:r><w:t xml:space="preserve">${a}</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t xml:space="preserve">${b}</w:t></w:r></w:p></w:tc></w:tr></w:tbl>`;
const HD = [
  W_DOC_OPEN,
  p("Annual Examination 2024", "FFF2CC"), // shaded title
  p("Model Test"), // plain title
  p(""), // blank line
  p("Sub: Botany  Topic: Chapter-1"), // stray plain line
  p("1.প্রশ্নের লেখা যথেষ্ট লম্বা?"),
  p("ক) এক"),
  p("খ) দুই"),
  p("গ) তিন"),
  p("ঘ) চার"),
  p("উত্তর: ক"),
  p("Topic: Chapter-1"), // "Topic:" line inside the block
  p("ব্যাখ্যা: এর ব্যাখ্যা এখানে"), // explanation inside the block
  p("উত্তরমালা", "D9EAD3"), // shaded answer-key header (breaks the block)
  p("১. ক"), // answer-key list
  tbl("Cell one", "Cell two"), // table outside any MCQ
  "<w:sectPr/>", // section properties — always kept
  W_DOC_CLOSE,
].join("");
const hdParse = parseRedownloadXml(HD);
const HD_ALL = { serial: true, question: true, reference: true, options: true, answer: true, bekkha: true, header: true, topic: true };

/** body children as localName|text pairs — order and position checks */
function bodyKids(xml: string): string[] {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  const body = doc.getElementsByTagNameNS("http://schemas.openxmlformats.org/wordprocessingml/2006/main", "body")[0];
  return Array.from(body.children).map((el) => `${el.localName}|${(el.textContent ?? "").trim()}`);
}

console.log("\n== 11) Header switch: everything outside any MCQ block ==");
ok(hdParse.questions.length === 1, `one MCQ parsed (got ${hdParse.questions.length})`);
ok(hdParse.headerCount === 7, `header element count 7 (got ${hdParse.headerCount})`);
const outHdOff = buildRedownloadXml(HD, hdParse, [0], { partSel: { ...HD_ALL, header: false }, renumber: false, expandAnswer: false });
ok(!outHdOff.includes("Annual Examination 2024"), "header OFF: shaded title removed");
ok(!outHdOff.includes("Model Test"), "header OFF: plain title removed");
ok(!outHdOff.includes("Sub: Botany"), "header OFF: stray plain line removed");
ok(!outHdOff.includes("<w:tbl"), "header OFF: table outside any MCQ removed");
ok(!outHdOff.includes("উত্তরমালা"), "header OFF: answer-key section header removed");
ok(!outHdOff.includes("১. ক"), "header OFF: answer-key list removed");
ok(!parasOf(outHdOff).some((t) => t === ""), "header OFF: blank line removed");
ok(outHdOff.includes("<w:sectPr"), "header OFF: sectPr still kept");
ok(outHdOff.includes("প্রশ্নের লেখা") && outHdOff.includes("ক) এক"), "header OFF: question and options kept");
ok(outHdOff.includes("উত্তর: ক"), "header OFF: in-block answer kept");
ok(outHdOff.includes("এর ব্যাখ্যা"), "header OFF: in-block explanation kept");
ok(outHdOff.includes("Topic: Chapter-1"), "header OFF: in-block topic line kept (topic part on)");
const outHdOn = buildRedownloadXml(HD, hdParse, [0], { partSel: HD_ALL, renumber: false, expandAnswer: false });
ok(
  JSON.stringify(bodyKids(outHdOn)) === JSON.stringify(bodyKids(HD)),
  "header ON: every body element kept in the original order and position"
);

console.log("\n== 12) Topic switch: \"Topic:\" lines inside a block ==");
const outTopicOff = buildRedownloadXml(HD, hdParse, [0], { partSel: { ...HD_ALL, topic: false }, renumber: false, expandAnswer: false });
ok(!parasOf(outTopicOff).some((t) => t === "Topic: Chapter-1"), "topic OFF: in-block topic line removed");
ok(outTopicOff.includes("Annual Examination 2024"), "topic OFF: shaded heading outside blocks stays (header on)");
ok(outTopicOff.includes("Sub: Botany"), "topic OFF: plain line with a Topic mention stays (header on)");
ok(outTopicOff.includes("উত্তর: ক") && outTopicOff.includes("এর ব্যাখ্যা"), "topic OFF: answer and explanation unchanged");
{
  const onKids = bodyKids(outHdOn);
  const offKids = bodyKids(outTopicOff);
  const topicIdx = onKids.indexOf("p|Topic: Chapter-1");
  ok(
    topicIdx > 0 &&
      offKids.length === onKids.length - 1 &&
      offKids.every((t, i) => t === onKids[i < topicIdx ? i : i + 1]),
    "topic OFF: only the topic line is missing, everything else in its original position"
  );
}

console.log("\n== 13) preset part formats: old 6-key loads, new 8-key round-trips ==");
// old preset shape: only the six part keys, exactly as saved by the previous version
const oldPresetParts = { serial: true, question: true, reference: true, options: true, answer: true, bekkha: true };
const outOldPreset = buildRedownloadXml(HD, hdParse, [0], { partSel: oldPresetParts, renumber: false, expandAnswer: false });
ok(
  outOldPreset.includes("Annual Examination 2024") && outOldPreset.includes("Topic: Chapter-1"),
  "old 6-key preset: missing header/topic default to on"
);
ok(
  JSON.stringify(bodyKids(outOldPreset)) === JSON.stringify(bodyKids(outHdOn)),
  "old 6-key preset output equals the new all-on 8-key output"
);
// new preset shape: all eight keys — unticked header/topic survive a save+apply round-trip
const savedPresetParts = { ...HD_ALL, header: false, topic: false };
const outNewPreset = buildRedownloadXml(HD, hdParse, [0], { partSel: savedPresetParts, renumber: false, expandAnswer: false });
ok(!outNewPreset.includes("Annual Examination 2024"), "new preset round-trip: header off is respected");
ok(!outNewPreset.includes("Topic: Chapter-1"), "new preset round-trip: topic off is respected");
ok(outNewPreset.includes("প্রশ্নের লেখা") && outNewPreset.includes("ক) এক"), "new preset round-trip: question parts still on");

console.log("\n== 14) removed-headers helper: the card list equals what Header OFF removes ==");
const hdEntries = collectHeaderEntries(HD, hdParse);
ok(
  hdEntries.length === hdParse.headerCount,
  `helper lists every header element (${hdEntries.length} vs headerCount ${hdParse.headerCount})`
);
const helperKids = hdEntries.map((e) =>
  e.kind === "table" ? `tbl|${e.rows.map((row) => row.map((c) => c.text).join("")).join("")}` : `p|${runsText(e.runs).trim()}`
);
ok(
  helperKids.filter((k) => k.startsWith("tbl")).length === 1,
  "helper marks the header table as one table entry"
);
ok(
  helperKids.some((k) => k === "p|"),
  "helper keeps blank paragraphs as entries (the card collapses them into a count)"
);
const hdKidsAll = bodyKids(HD);
const hdOffKids = bodyKids(outHdOff);
const removedKids = hdKidsAll.filter((k) => k !== "sectPr|" && !hdOffKids.includes(k));
ok(
  JSON.stringify(helperKids) === JSON.stringify(removedKids),
  "helper list equals the removed body elements, in document order"
);
ok(
  helperKids.every((k) => !hdOffKids.includes(k)),
  "every listed element is absent from the header-OFF output"
);

// rich header fixture: formatting the card must mirror
const rRun = (text: string, rPr = "") =>
  `<w:r>${rPr ? `<w:rPr>${rPr}</w:rPr>` : ""}<w:t xml:space="preserve">${text}</w:t></w:r>`;
const rTbl = (a: string, b: string) =>
  `<w:tbl><w:tr><w:tc><w:tcPr><w:shd w:val="clear" w:fill="D9EAD3"/></w:tcPr><w:p>${rRun(a, "<w:b/>")}</w:p></w:tc><w:tc><w:p>${rRun(b)}</w:p></w:tc></w:tr></w:tbl>`;
const RHD = [
  W_DOC_OPEN,
  p("Plain header line"),
  `<w:p><w:pPr><w:jc w:val="center"/><w:shd w:val="clear" w:fill="FFF2CC"/></w:pPr>${rRun("Shaded title", "<w:b/><w:color w:val=\"FF0000\"/><w:sz w:val=\"40\"/>")}${rRun("2", "<w:vertAlign w:val=\"superscript\"/>")}</w:p>`,
  `<w:p>${rRun("Inline image ahead")}<w:r><w:drawing/></w:r></w:p>`,
  `<w:p xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math"><m:oMath><m:r><m:t>x</m:t></m:r></m:oMath></w:p>`,
  rTbl("Cell one", "Cell two"),
  p("1. Question with enough text?"),
  p("a) one"),
  p("b) two"),
  p("c) three"),
  p("d) four"),
  p("Ans: a"),
  "<w:sectPr/>",
  W_DOC_CLOSE,
].join("");
const rhdParse = parseRedownloadXml(RHD);
const rEntries = collectHeaderEntries(RHD, rhdParse);
ok(rEntries.length === 5 && rhdParse.headerCount === 5, `rich fixture: 5 header entries (${rEntries.length} vs headerCount ${rhdParse.headerCount})`);
const [r0, r1, r2, r3, r4] = rEntries;
ok(r0.kind === "para" && runsText(r0.runs) === "Plain header line", "rich fixture: plain para entry in document order");
ok(
  r1.kind === "para" && r1.align === "center" && r1.shading === "FFF2CC",
  "rich fixture: alignment and paragraph shading extracted"
);
ok(
  r1.kind === "para" && r1.runs[0].bold === 1 && r1.runs[0].color === "FF0000" && r1.runs[0].size === 40,
  "rich fixture: header runs carry bold, colour and size"
);
ok(r1.kind === "para" && r1.runs[1].sup === 1, "rich fixture: header runs carry superscript");
ok(r2.kind === "para" && r2.hasImage && !r2.hasEquation, "rich fixture: image badge flag detected");
ok(r3.kind === "para" && r3.hasEquation && !r3.hasImage, "rich fixture: equation badge flag detected");
ok(
  r4.kind === "table" && r4.rows.length === 1 && r4.rows[0][0].text === "Cell one" && r4.rows[0][1].text === "Cell two",
  "rich fixture: table entry with cell texts"
);
ok(
  r4.kind === "table" && r4.rows[0][0].runs?.[0].bold === 1 && r4.rows[0][0].shading === "D9EAD3" && !r4.rows[0][1].runs?.[0].bold,
  "rich fixture: cell runs and cell shading extracted"
);
const outRhdOff = buildRedownloadXml(RHD, rhdParse, [0], { partSel: { ...HD_ALL, header: false }, renumber: false, expandAnswer: false });
ok(
  !outRhdOff.includes("Plain header line") && !outRhdOff.includes("Cell one") && !outRhdOff.includes("Inline image ahead") && !outRhdOff.includes("oMath"),
  "rich fixture: header OFF removes exactly the listed elements"
);
ok(
  outRhdOff.includes("Question with enough text") && outRhdOff.includes("Ans: a"),
  "rich fixture: header OFF keeps the question block"
);

console.log(`\n=== ফলাফল: ${passed} পাস, ${failed} ফেল ===`);
process.exit(failed ? 1 : 0);
