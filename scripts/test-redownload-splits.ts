// ============================================================
// Redownload split tests — টেইল-উত্তর / টেইল-রেফারেন্স / `*`-মার্কার
// Format ফোল্ডারের ৬ ফরম্যাট-ফ্যামিলির মিনিমাল ফিক্সচার
// রান: bun run scripts/test-redownload-splits.ts
// ============================================================

import { JSDOM } from "jsdom";

// ---- ব্রাউজার DOM API emulation (jsdom) ----
const dom = new JSDOM("<!doctype html><html><body></body></html>");
(globalThis as unknown as Record<string, unknown>).DOMParser = dom.window.DOMParser;
(globalThis as unknown as Record<string, unknown>).XMLSerializer = dom.window.XMLSerializer;
(globalThis as unknown as Record<string, unknown>).Node = dom.window.Node;

const { parseRedownloadXml, buildRedownloadXml } = await import("../src/lib/mcq/redownload");

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

const W_DOC_OPEN =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>';
const W_DOC_CLOSE = "</w:body></w:document>";

const p = (text: string) =>
  `<w:p><w:r><w:t xml:space="preserve">${text}</w:t></w:r></w:p>`;

function parasOf(xml: string): string[] {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  const out: string[] = [];
  for (const el of Array.from(
    doc.getElementsByTagNameNS(
      "http://schemas.openxmlformats.org/wordprocessingml/2006/main",
      "p"
    )
  )) {
    out.push(el.textContent ?? "");
  }
  return out;
}

const PARTS_ALL = { serial: true, question: true, reference: true, options: true, answer: true, bekkha: true };
const PARTS_Q = { serial: true, question: true, reference: false, options: true, answer: false, bekkha: false };
const PARTS_QA = { serial: true, question: true, reference: false, options: false, answer: true, bekkha: false };

// ---- ফিক্সচার ১: সেট-স্টাইল (Physics/Chemistry) — ইনলাইন রেফ + টেইল-উত্তর ----
const F1 = [
  W_DOC_OPEN,
  p("পদার্থ পরীক্ষা"),
  p("1.আলোর বেগ কত?(Ju: 21-22)"),
  p("K. বেগ L. ভর"),
  p("M. দূরত্ব N. সময়Dt M"),
  p("2.বল কাকে বলে?[DU-A: 20-21]"),
  p("K. সংজ্ঞা L. সূত্র"),
  p("M. নিয়ম N. সত্যDt K"),
  p("(নমুনা - 93)"),
  W_DOC_CLOSE,
].join("");

const parse1 = parseRedownloadXml(F1);

console.log("\n== ১) সেট-স্টাইল: ডিটেকশন ==");
ok(parse1.questions.length === 2, `প্রশ্ন ২টি (আসলে ${parse1.questions.length})`);
ok(parse1.questions[0].answer === "M", `১ম প্রশ্নের উত্তর M (আসলে ${parse1.questions[0].answer})`);
ok(parse1.questions[1].answer === "K", "২য় প্রশ্নের উত্তর K");
ok(parse1.kindCounts.reference === 1, `রেফ-অনলি প্যারা ১ (আসলে ${parse1.kindCounts.reference})`);
ok(
  parse1.splits.length === 4,
  `স্প্লিট ৪ (২ টেইল-রেফ + ২ টেইল-উত্তর, আসলে ${parse1.splits.length})`
);
ok(parse1.splits.some((s) => s.para === 1 && s.kind === "reference"), "প্রশ্ন-১ টেইল-রেফারেন্স");
ok(parse1.splits.some((s) => s.para === 3 && s.kind === "answer"), "অপশন-১ টেইল-উত্তর");
ok(parse1.splits.some((s) => s.para === 4 && s.kind === "reference"), "প্রশ্ন-২ টেইল-রেফারেন্স");

console.log("\n== ২) সেট-স্টাইল: সব অংশ ON ==");
const outAll = buildRedownloadXml(F1, parse1, [0, 1], {
  partSel: PARTS_ALL,
  renumber: false,
  expandAnswer: false,
});
const allParas = parasOf(outAll);
ok(
  allParas.some((t) => t === "M. দূরত্ব N. সময়Dt M"),
  "all parts ON -> options line stays one paragraph with glued answer"
);
ok(
  allParas.some((t) => t === "1.আলোর বেগ কত?(Ju: 21-22)"),
  "all parts ON -> question line stays one paragraph with glued reference"
);
ok(
  !allParas.some((t) => t.trim() === "Dt M") && !allParas.some((t) => t.trim() === "(Ju: 21-22)"),
  "all parts ON -> no standalone tail paragraphs"
);
ok(allParas.some((t) => t.trim() === "(নমুনা - 93)"), "রেফ-অনলি প্যারা আছে");
{
  const d = new DOMParser().parseFromString(outAll, "application/xml");
  ok(d.getElementsByTagName("parsererror").length === 0, "আউটপুট XML well-formed");
}

console.log("\n== ৩) সেট-স্টাইল: প্রশ্ন+অপশন (উত্তর/রেফারেন্স বাদ) ==");
const outQ = buildRedownloadXml(F1, parse1, [0, 1], {
  partSel: PARTS_Q,
  renumber: false,
  expandAnswer: false,
});
ok(!outQ.includes("Dt M") && !outQ.includes("Dt K"), "উত্তর-টেইল বাদ");
ok(!outQ.includes("(Ju: 21-22)") && !outQ.includes("(DU-A: 20-21)"), "টেইল-রেফারেন্স বাদ");
ok(!outQ.includes("(নমুনা"), "রেফ-অনলি প্যারা বাদ");
ok(outQ.includes("আলোর বেগ কত?"), "প্রশ্ন আছে");
ok(outQ.includes("M. দূরত্ব N. সময়"), "অপশন-লাইন পরিষ্কার");

console.log("\n== ৪) সেট-স্টাইল: শুধু প্রশ্ন+উত্তর (অপশন/রেফারেন্স বাদ) ==");
const outQA = buildRedownloadXml(F1, parse1, [0, 1], {
  partSel: PARTS_QA,
  renumber: false,
  expandAnswer: false,
});
ok(outQA.includes("Dt M") && outQA.includes("Dt K"), "উত্তর-টেইল আছে (অপশন বাদ হলেও)");
ok(!outQA.includes("K. বেগ"), "অপশন নেই");
ok(!outQA.includes("(JU"), "রেফারেন্স নেই");
ok(
  parasOf(outQA).some((t) => t.includes("আলোর বেগ") && !t.includes("(Ju")),
  "প্রশ্ন-হেড রেফারেন্স-মুক্ত"
);

// ---- ফিক্সচার ২: B-টাইমার `*`-মার্কার ----
const F2 = [
  W_DOC_OPEN,
  p("2.নিচের কোনটি সঠিক নয়?"),
  p("A. কোশ"),
  p("B. ক্লোরোফিল"),
  p("C. প্লাসমডেসমা*"),
  p("D. মিউটেশন"),
  p("8.সবচেয়ে বড় কোষ?"),
  p("*A. ডিম"),
  p("B. বীজ"),
  p("C. ফল"),
  p("D. শ্যাণ"),
  W_DOC_CLOSE,
].join("");

const parse2 = parseRedownloadXml(F2);

console.log("\n== ৫) B-টাইমার: `*`-মার্কার ডিটেকশন ==");
ok(parse2.questions.length === 2, `প্রশ্ন ২টি (আসলে ${parse2.questions.length})`);
ok(
  parse2.questions[0].answer === "C" && parse2.questions[0].answerFromStar,
  "টেক্সটের পরে `*` → উত্তর C"
);
ok(
  parse2.questions[1].answer === "A" && parse2.questions[1].answerFromStar,
  "লেবেলের আগে `*` → উত্তর A"
);
ok(parse2.questions[0].options.every((o) => !o.text.includes("*")), "প্রিভিউ-অপশনে * নেই");

const outStarOff = buildRedownloadXml(F2, parse2, [0, 1], {
  partSel: PARTS_Q,
  renumber: false,
  expandAnswer: false,
});
ok(!outStarOff.includes("*"), "উত্তর বাদ → `*` সরানো");
ok(!outStarOff.includes("Dt"), "উত্তর-লাইন নেই");
ok(outStarOff.includes("প্লাসমডেসমা"), "অপশন-টেক্সট অক্ষত");

const outStarOn = buildRedownloadXml(F2, parse2, [0, 1], {
  partSel: PARTS_ALL,
  renumber: false,
  expandAnswer: false,
});
// অপশন+উত্তর দুটোই ON → সোর্সের `*`-ই উত্তর-চিহ্ন, হুবহু থাকে; আলাদা লাইন নয় (Rule #1)
ok(outStarOn.includes("*"), "অপশন+উত্তর ON → `*`-মার্কার রাখা");
ok(!outStarOn.includes("Ans: C") && !outStarOn.includes("Ans: A"), "আলাদা `Ans:` লাইন বানানো হয়নি");

// অপশন OFF + উত্তর ON → `*`-উত্তর থেকে "Ans:" লাইন জেনারেট
const outStarGen = buildRedownloadXml(F2, parse2, [0, 1], {
  partSel: PARTS_QA,
  renumber: false,
  expandAnswer: false,
});
ok(outStarGen.includes("Ans: C") && outStarGen.includes("Ans: A"), "অপশন OFF → `*`-উত্তর লাইন জেনারেট (English → Ans:)");
ok(!outStarGen.includes("*"), "জেনারেট আউটপুটে `*` নেই");

// ---- ফিক্সচার ৩: DËit (Chemistry Set-C) + D: L + N (multipart) ----
// (MCQ-শর্ত: প্রতিটা প্রশ্নে ৪ অপশন-মার্কার — নাহলে আগের MCQ-এর অংশ হয়)
const F3 = [
  W_DOC_OPEN,
  p("1.প্রশ্ন এক?"),
  p("K. aa L. bb"),
  p("M. cc N. ddDËit K"),
  p("2.English question?"),
  p("K. xx L. yy"),
  p("M. mediaN.sandD: L + N"),
  W_DOC_CLOSE,
].join("");

const parse3 = parseRedownloadXml(F3);

console.log("\n== ৬) DËit + multipart উত্তর ==");
ok(parse3.questions[0].answer === "K", `DËit উত্তর K (আসলে ${parse3.questions[0].answer})`);
ok(
  parse3.questions[1].answer === "L + N",
  `D: L + N multipart (আসলে ${parse3.questions[1].answer})`
);
const outF3 = buildRedownloadXml(F3, parse3, [0, 1], {
  partSel: PARTS_Q,
  renumber: false,
  expandAnswer: false,
});
ok(!outF3.includes("DËit") && !outF3.includes("D: L"), "উত্তর-টেইল বাদ");
ok(outF3.includes("M. cc N. dd") && outF3.includes("M. mediaN.sand"), "অপশন-হেড পরিষ্কার");

// ---- ফিক্সচার ৪: option-labels + স্প্লিট সহাবস্থান ----
console.log("\n== ৭) option-labels + স্প্লিট ==");
const outLbl = buildRedownloadXml(F1, parse1, [0], {
  partSel: PARTS_ALL,
  renumber: false,
  expandAnswer: false,
  optionLabels: { enabled: true, style: "A", separator: "." },
});
ok(outLbl.includes("A. বেগ") && outLbl.includes("B. ভর"), "লেবেল রিম্যাপ (K→A, L→B)");
ok(!outLbl.includes("K. বেগ"), "পুরনো লেবেল নেই");
ok(outLbl.includes("Dt M"), "উত্তর-লাইন অক্ষত");
ok(outLbl.includes("(Ju: 21-22)"), "রেফারেন্স-টেইল অক্ষত");

// ---- ফিক্সচার ৫: expandAnswer + টেইল-উত্তর ----
console.log("\n== ৮) উত্তর-বিস্তার + টেইল ==");
const outExp = buildRedownloadXml(F1, parse1, [0], {
  partSel: PARTS_QA,
  renumber: false,
  expandAnswer: true,
});
ok(outExp.includes("Ans:") && outExp.includes("M. দূরত্ব") && !outExp.includes("Dt"), "tail answer rewritten: tab + Ans: + label + verbatim text");
ok(!outExp.includes("K. বেগ"), "অপশন নেই");

// ---- ফিক্সচার ৬: renumber + স্প্লিট (অফসেট-নিরাপত্তা) ----
console.log("\n== ৯) renumber + টেইল-রেফারেন্স ==");
const outRen = buildRedownloadXml(F1, parse1, [0, 1], {
  partSel: PARTS_ALL,
  renumber: true,
  expandAnswer: false,
});
const renParas = parasOf(outRen);
ok(
  renParas.some((t) => t === "1.আলোর বেগ কত?(Ju: 21-22)"),
  "renumbered question keeps glued reference in one paragraph"
);
ok(renParas.some((t) => t.startsWith("2.") && t.includes("বল")), "রিনাম্বার ২ + প্রশ্ন");

// ---- ফিক্সচার ৭: উত্তর-বিস্তারে as-is ফন্ট (অপশনের নিজের ফন্ট) ----
console.log("\n== ১০) উত্তর as-is ফন্ট ==");
const pf = (text: string, font: string) =>
  `<w:p xmlns:w="${WNS}"><w:r><w:rPr><w:rFonts w:ascii="${font}" w:hAnsi="${font}" w:cs="${font}" w:eastAsia="${font}"/></w:rPr><w:t xml:space="preserve">${text}</w:t></w:r></w:p>`;
const WNS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
// প্রশ্ন SutonnyMJ-তে, অপশন-সারি Times-এ (ইনলাইন ৪ অপশন + গ্লুড উত্তর)
const F7 = [
  W_DOC_OPEN,
  pf("1.Which is correct?", "SutonnyMJ"),
  pf("A. Alpha B. Beta C. Gamma D. Delta Dt C", "Times New Roman"),
  W_DOC_CLOSE,
].join("");
const parse7 = parseRedownloadXml(F7);
ok(parse7.questions.length === 1 && parse7.questions[0].answer === "C", "ফিক্সচার পার্স (উত্তর C)");
const out7 = buildRedownloadXml(F7, parse7, [0], {
  partSel: PARTS_QA,
  renumber: false,
  expandAnswer: true,
});
const doc7 = new DOMParser().parseFromString(out7, "application/xml");
const runs7: Array<{ font: string; text: string; bold: boolean }> = [];
for (const r of Array.from(doc7.getElementsByTagNameNS(WNS, "r"))) {
  const rf = (r as Element).getElementsByTagNameNS(WNS, "rFonts")[0];
  const font = rf ? rf.getAttributeNS(WNS, "ascii") ?? "?" : "?";
  const t = Array.from((r as Element).getElementsByTagNameNS(WNS, "t"))
    .map((x) => x.textContent ?? "")
    .join("");
  const bold = (r as Element).getElementsByTagNameNS(WNS, "b").length > 0;
  if (t) runs7.push({ font: font ?? "?", text: t, bold });
}
const ansRun7 = runs7.find((x) => x.text === "Ans: ");
ok(ansRun7?.font === "Times New Roman", `"Ans: " run uses the document Latin font (got ${ansRun7?.font})`);
ok(!!ansRun7?.bold, '"Ans: " run is bold');
const gammaRun7 = runs7.find((x) => x.text.includes("Gamma"));
ok(gammaRun7?.font === "Times New Roman", "উত্তর-লেখা অপশনের নিজের ফন্টে (Times), প্রশ্নের SutonnyMJ-তে নয়");

// ---- glued-tail matrix: no cut when both the head and the tail parts are selected ----
function sameParas(actual: string[], expected: string[]): boolean {
  return actual.length === expected.length && actual.every((t, i) => t === expected[i]);
}

// fixture 8: glued answer at the end of an options line (no reference involved)
const F8 = [
  W_DOC_OPEN,
  p("1.আলোর বেগ কত?"),
  p("K. বেগ L. ভর"),
  p("M. দূরত্ব N. সময়Dt M"),
  W_DOC_CLOSE,
].join("");
const parse8 = parseRedownloadXml(F8);

console.log("\n== 11) glued answer: options x answer ==");
ok(
  sameParas(
    parasOf(buildRedownloadXml(F8, parse8, [0], { partSel: { ...PARTS_Q, answer: true }, renumber: false, expandAnswer: false })),
    ["1.আলোর বেগ কত?", "K. বেগ L. ভর", "M. দূরত্ব N. সময়Dt M"]
  ),
  "options ON + answer ON -> one unsplit paragraph, glued tail in place"
);
ok(
  sameParas(
    parasOf(buildRedownloadXml(F8, parse8, [0], { partSel: PARTS_Q, renumber: false, expandAnswer: false })),
    ["1.আলোর বেগ কত?", "K. বেগ L. ভর", "M. দূরত্ব N. সময়"]
  ),
  "options ON + answer OFF -> head only"
);
ok(
  sameParas(
    parasOf(buildRedownloadXml(F8, parse8, [0], { partSel: PARTS_QA, renumber: false, expandAnswer: false })),
    ["1.আলোর বেগ কত?", "Dt M"]
  ),
  "options OFF + answer ON -> tail as its own paragraph"
);
ok(
  sameParas(
    parasOf(buildRedownloadXml(F8, parse8, [0], { partSel: { ...PARTS_Q, options: false }, renumber: false, expandAnswer: false })),
    ["1.আলোর বেগ কত?"]
  ),
  "options OFF + answer OFF -> nothing from the options line"
);

// fixture 9: glued reference at the end of a question line (no answer involved)
const F9 = [
  W_DOC_OPEN,
  p("1.আলোর বেগ কত?(Ju: 21-22)"),
  p("K. বেগ L. ভর"),
  p("M. দূরত্ব N. সময়"),
  W_DOC_CLOSE,
].join("");
const parse9 = parseRedownloadXml(F9);

console.log("\n== 12) glued reference: question x reference ==");
ok(
  sameParas(
    parasOf(buildRedownloadXml(F9, parse9, [0], { partSel: { ...PARTS_Q, reference: true }, renumber: false, expandAnswer: false })),
    ["1.আলোর বেগ কত?(Ju: 21-22)", "K. বেগ L. ভর", "M. দূরত্ব N. সময়"]
  ),
  "question ON + reference ON -> one unsplit paragraph, glued tail in place"
);
ok(
  sameParas(
    parasOf(buildRedownloadXml(F9, parse9, [0], { partSel: PARTS_Q, renumber: false, expandAnswer: false })),
    ["1.আলোর বেগ কত?", "K. বেগ L. ভর", "M. দূরত্ব N. সময়"]
  ),
  "question ON + reference OFF -> head only"
);
ok(
  sameParas(
    parasOf(buildRedownloadXml(F9, parse9, [0], { partSel: { ...PARTS_Q, question: false, reference: true }, renumber: false, expandAnswer: false })),
    ["(Ju: 21-22)", "K. বেগ L. ভর", "M. দূরত্ব N. সময়"]
  ),
  "question OFF + reference ON -> tail as its own paragraph"
);
ok(
  sameParas(
    parasOf(buildRedownloadXml(F9, parse9, [0], { partSel: { ...PARTS_Q, question: false }, renumber: false, expandAnswer: false })),
    ["K. বেগ L. ভর", "M. দূরত্ব N. সময়"]
  ),
  "question OFF + reference OFF -> nothing from the question line"
);

console.log("\n== 13) option relabel with an unsplit tail ==");
ok(
  sameParas(
    parasOf(buildRedownloadXml(F8, parse8, [0], {
      partSel: { ...PARTS_Q, answer: true },
      renumber: false,
      expandAnswer: false,
      optionLabels: { enabled: true, style: "A", separator: "." },
    })),
    ["1.আলোর বেগ কত?", "A. বেগ B. ভর", "C. দূরত্ব D. সময়Dt M"]
  ),
  "relabel ON -> labels remapped, glued tail text untouched in one paragraph"
);

// fixture 10: renumber + both glued tail kinds (2nd question alone -> number 1)
const F10 = [
  W_DOC_OPEN,
  p("1.আলোর বেগ কত?"),
  p("K. বেগ L. ভর"),
  p("M. দূরত্ব N. সময়"),
  p("2.বল কাকে বলে?[DU-A: 20-21]"),
  p("K. সংজ্ঞা L. সূত্র"),
  p("M. নিয়ম N. সত্যDt K"),
  W_DOC_CLOSE,
].join("");
const parse10 = parseRedownloadXml(F10);

console.log("\n== 14) renumber with unsplit tails ==");
ok(
  sameParas(
    parasOf(buildRedownloadXml(F10, parse10, [1], { partSel: PARTS_ALL, renumber: true, expandAnswer: false })),
    ["1.বল কাকে বলে?[DU-A: 20-21]", "K. সংজ্ঞা L. সূত্র", "M. নিয়ম N. সত্যDt K"]
  ),
  "renumber ON -> renumbered question keeps glued reference and answer tails"
);

// fixture 11: a star-marked option plus a glued answer in the same block
const F11 = [
  W_DOC_OPEN,
  p("1.নিচের কোনটি সঠিক?"),
  p("A. কোশ"),
  p("B. ক্লোরোফিল"),
  p("C. প্লাসমডেসমা*"),
  p("D. মিউটেশনDt C"),
  W_DOC_CLOSE,
].join("");
const parse11 = parseRedownloadXml(F11);

console.log("\n== 15) star-marked option plus glued answer ==");
ok(
  sameParas(
    parasOf(buildRedownloadXml(F11, parse11, [0], { partSel: PARTS_ALL, renumber: false, expandAnswer: false })),
    ["1.নিচের কোনটি সঠিক?", "A. কোশ", "B. ক্লোরোফিল", "C. প্লাসমডেসমা*", "D. মিউটেশনDt C"]
  ),
  "all parts ON -> star marker kept, glued answer stays in the options line"
);
ok(
  sameParas(
    parasOf(buildRedownloadXml(F11, parse11, [0], { partSel: PARTS_Q, renumber: false, expandAnswer: false })),
    ["1.নিচের কোনটি সঠিক?", "A. কোশ", "B. ক্লোরোফিল", "C. প্লাসমডেসমা", "D. মিউটেশন"]
  ),
  "answer OFF -> star stripped and glued tail cut"
);

// ---- answer line format: [tab][bold "Ans: "][label token][verbatim option runs] ----
const AL_R = (txt: string, rPr = "") =>
  `<w:r>${rPr ? `<w:rPr>${rPr}</w:rPr>` : ""}<w:t xml:space="preserve">${txt}</w:t></w:r>`;
const AL_FR = (txt: string, font: string) =>
  `<w:r><w:rPr><w:rFonts w:ascii="${font}" w:hAnsi="${font}"/></w:rPr><w:t xml:space="preserve">${txt}</w:t></w:r>`;
const AL_TAB = `<w:r><w:tab/></w:r>`;
const AL_SUB = `<w:vertAlign w:val="subscript"/>`;
const AL_SUP = `<w:vertAlign w:val="superscript"/>`;

interface ALRun {
  text: string;
  font: string;
  bold: boolean;
  tab: boolean;
  va: string | null;
}
function alRunsOf(xml: string): ALRun[] {
  const d = new DOMParser().parseFromString(xml, "application/xml");
  const out: ALRun[] = [];
  for (const r of Array.from(d.getElementsByTagNameNS(WNS, "r"))) {
    const text = Array.from((r as Element).getElementsByTagNameNS(WNS, "t"))
      .map((x) => x.textContent ?? "")
      .join("");
    const rf = (r as Element).getElementsByTagNameNS(WNS, "rFonts")[0];
    const vaEl = (r as Element).getElementsByTagNameNS(WNS, "vertAlign")[0] ?? null;
    out.push({
      text,
      font: rf ? rf.getAttributeNS(WNS, "ascii") ?? "?" : "-",
      bold: (r as Element).getElementsByTagNameNS(WNS, "b").length > 0,
      tab: Array.from((r as Element).children).some((c) => c.localName === "tab"),
      va: vaEl ? vaEl.getAttributeNS(WNS, "val") ?? vaEl.getAttribute("w:val") : null,
    });
  }
  return out;
}

// fixture 12: two options per paragraph + sub/superscript option text
const F12 = [
  W_DOC_OPEN,
  p("1.Chemical formula of water?"),
  `<w:p>${AL_R("A. x ")}${AL_R("B. y")}</w:p>`,
  `<w:p>${AL_R("C. H")}${AL_R("2", AL_SUB)}${AL_R("O")}${AL_R("+", AL_SUP)}${AL_R(" D. z")}${AL_R("Dt C")}</w:p>`,
  W_DOC_CLOSE,
].join("");

console.log("\n== 16) answer line format: verbatim runs, two options in one paragraph ==");
const parse12 = parseRedownloadXml(F12);
ok(
  parse12.questions.length === 1 && parse12.questions[0].answer === "C",
  `fixture 12 parses (answer C, got ${parse12.questions[0]?.answer})`
);
const out12 = buildRedownloadXml(F12, parse12, [0], { partSel: PARTS_QA, renumber: false, expandAnswer: true });
const paras12 = parasOf(out12);
ok(paras12.some((t) => t === "Ans: C. H2O+"), `answer line text is "Ans: C. H2O+" (got ${JSON.stringify(paras12)})`);
const runs12 = alRunsOf(out12);
const pre12 = runs12.find((x) => x.text === "Ans: ");
ok(!!pre12 && pre12.tab && pre12.bold && pre12.font === "Times New Roman", `"Ans: " run: tab + bold + document Latin font`);
ok(runs12.some((x) => x.text === "2" && x.va === "subscript"), "subscript run cloned verbatim");
ok(runs12.some((x) => x.text === "+" && x.va === "superscript"), "superscript run cloned verbatim");
ok(!paras12.some((t) => t.includes("D. z") || t.includes("A. x")), "only the correct option's runs are extracted");

// relabel ON: the label token becomes the new style and separator
const out12r = buildRedownloadXml(F12, parse12, [0], {
  partSel: PARTS_QA,
  renumber: false,
  expandAnswer: true,
  optionLabels: { enabled: true, style: "i", separator: ")" },
});
ok(
  parasOf(out12r).some((t) => t === "Ans: iii) H2O+"),
  `relabel ON: label token becomes "iii)" (got ${JSON.stringify(parasOf(out12r))})`
);

// fixture 13: Bijoy label keeps its SutonnyMJ run font
const F13 = [
  W_DOC_OPEN,
  AL_FR("1.pristi?", "SutonnyMJ"),
  `<w:p>${AL_FR("K. hv", "SutonnyMJ")}${AL_FR(" L. cË", "SutonnyMJ")}${AL_FR(" M. RÛ", "SutonnyMJ")}${AL_FR(" N. µg", "SutonnyMJ")}${AL_FR("Dt K", "SutonnyMJ")}</w:p>`,
  W_DOC_CLOSE,
].join("");

console.log("\n== 17) answer line format: Bijoy label font ==");
const parse13 = parseRedownloadXml(F13);
ok(parse13.questions[0]?.answer === "K", `fixture 13 parses (answer K, got ${parse13.questions[0]?.answer})`);
const out13 = buildRedownloadXml(F13, parse13, [0], { partSel: PARTS_QA, renumber: false, expandAnswer: true });
ok(parasOf(out13).some((t) => t === "Ans: K. hv"), `answer line "Ans: K. hv" (got ${JSON.stringify(parasOf(out13))})`);
const runs13 = alRunsOf(out13);
const lbl13 = runs13.find((x) => x.text === "K. hv");
ok(lbl13?.font === "SutonnyMJ", `Bijoy label run keeps its SutonnyMJ font (got ${lbl13?.font})`);
const pre13 = runs13.find((x) => x.text === "Ans: ");
ok(
  pre13?.font === "Times New Roman",
  `"Ans: " run falls back to Times New Roman with no explicit Latin run (got ${pre13?.font})`
);

// fixture 14: multi answer — first line with "Ans: ", each further answer in its own paragraph
const F14 = [
  W_DOC_OPEN,
  p("1.Multi?"),
  p("A. one B. two"),
  p("C. three D. four"),
  p("Ans: A, C"),
  W_DOC_CLOSE,
].join("");

console.log("\n== 18) answer line format: multi answer ==");
const parse14 = parseRedownloadXml(F14);
ok(parse14.questions[0]?.answer === "A, C", `fixture 14 parses (answer A, C, got ${parse14.questions[0]?.answer})`);
const out14 = buildRedownloadXml(F14, parse14, [0], { partSel: PARTS_QA, renumber: false, expandAnswer: true });
const paras14 = parasOf(out14);
const iFirst14 = paras14.indexOf("Ans: A. one");
const iSecond14 = paras14.indexOf("C. three");
ok(iFirst14 >= 0 && iSecond14 === iFirst14 + 1, "multi answer: first line \"Ans: A. one\", second line right after it");
ok(iSecond14 >= 0 && !paras14[iSecond14]!.includes("Ans:"), "second answer paragraph carries no \"Ans:\" prefix");
ok(!paras14.some((t) => t === "Ans: A, C"), "old multi-letter answer text is replaced");
const extraRuns14 = alRunsOf(out14).filter((x) => x.tab && x.text === "");
ok(extraRuns14.length >= 1, "second answer paragraph starts with a tab");

// fixture 15: star-marked answer with expansion ON
const F15 = [
  W_DOC_OPEN,
  p("1.Which is correct?"),
  p("A. কোশ"),
  p("B. ক্লোরোফিল"),
  p("C. প্লাসমডেসমা*"),
  p("D. মিউটেশন"),
  W_DOC_CLOSE,
].join("");

console.log("\n== 19) answer line format: star-marked answer ==");
const parse15 = parseRedownloadXml(F15);
ok(
  parse15.questions[0]?.answer === "C" && parse15.questions[0]?.answerFromStar,
  "fixture 15 parses (star answer C)"
);
const out15 = buildRedownloadXml(F15, parse15, [0], { partSel: PARTS_QA, renumber: false, expandAnswer: true });
ok(
  parasOf(out15).some((t) => t === "Ans: C. প্লাসমডেসমা"),
  `star answer generates the new-format line with the marker stripped (got ${JSON.stringify(parasOf(out15))})`
);
ok(!out15.includes("*"), "star marker not carried into the answer line");

// fixture 16: fallback — the option text cannot be located (dotless labels)
const F16 = [
  W_DOC_OPEN,
  p("1.Question?"),
  `<w:p>${AL_TAB}${AL_R("A x")}${AL_TAB}${AL_R("B y")}${AL_TAB}${AL_R("C z")}${AL_TAB}${AL_R("D w")}</w:p>`,
  p("Ans: C"),
  W_DOC_CLOSE,
].join("");

console.log("\n== 20) answer line format: fallback ==");
const parse16 = parseRedownloadXml(F16);
ok(
  parse16.questions[0]?.answer === "C" && parse16.questions[0]?.options.length === 4,
  `fixture 16 parses (dotless labels, answer C, ${parse16.questions[0]?.options.length} options)`
);
const out16 = buildRedownloadXml(F16, parse16, [0], { partSel: PARTS_QA, renumber: false, expandAnswer: true });
ok(
  parasOf(out16).some((t) => t === "Ans: C"),
  `fallback: label-only answer line when the option text cannot be located (got ${JSON.stringify(parasOf(out16))})`
);

// options ON: nothing is generated or rewritten
console.log("\n== 21) answer line format: options ON ==");
const out17 = buildRedownloadXml(F12, parse12, [0], { partSel: PARTS_ALL, renumber: false, expandAnswer: true });
ok(!out17.includes("Ans: "), "options ON: no answer line generated for the glued tail");
ok(out17.includes("Dt C"), "options ON: the file's own glued answer stays in the options row");
const out18 = buildRedownloadXml(F14, parse14, [0], { partSel: PARTS_ALL, renumber: false, expandAnswer: true });
ok(
  parasOf(out18).some((t) => t === "Ans: A, C"),
  "options ON: the file's own answer paragraph stays untouched"
);

// ---- ফলাফল ----
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);