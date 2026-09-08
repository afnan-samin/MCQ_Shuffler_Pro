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
ok(allParas.some((t) => t.trim() === "Dt M"), "টেইল-উত্তর নিজস্ব প্যারায় ('Dt M')");
ok(allParas.some((t) => t.trim() === "(Ju: 21-22)"), "টেইল-রেফারেন্স নিজস্ব প্যারায়");
ok(allParas.some((t) => t.trim() === "(নমুনা - 93)"), "রেফ-অনলি প্যারা আছে");
ok(
  allParas.some((t) => t.includes("M. দূরত্ব") && !t.includes("Dt")),
  "অপশন-হেড পরিষ্কার (উত্তর ছাড়া)"
);
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
ok(outStarOn.includes("Dt C") && outStarOn.includes("Dt A"), "`*`-উত্তর লাইন জেনারেট");
ok(!outStarOn.includes("*"), "জেনারেটেও `*` নেই");

// ---- ফিক্সচার ৩: DËit (Chemistry Set-C) + D: L + N (multipart) ----
const F3 = [
  W_DOC_OPEN,
  p("1.প্রশ্ন এক?"),
  p("K. aa L. bb"),
  p("M. cc N. ddDËit K"),
  p("2.English question?"),
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
ok(outExp.includes("Dt") && outExp.includes("দূরত্ব"), "টেইল-উত্তরেও বিস্তার কাজ করে");
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
  renParas.some((t) => t.startsWith("1.") && t.includes("আলোর বেগ") && !t.includes("(Ju")),
  "রিনাম্বার ১ + প্রশ্ন (রেফ ছাড়া) — স্প্লিট-অফসেট নিরাপদ"
);
ok(renParas.some((t) => t.startsWith("2.") && t.includes("বল")), "রিনাম্বার ২ + প্রশ্ন");

// ---- ফলাফল ----
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);