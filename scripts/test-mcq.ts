// পার্সার + সেট ইঞ্জিন কুইক টেস্ট
import { parseMcq, autoFixNumbering } from "../src/lib/mcq/parser";
import { buildSets, getSetName } from "../src/lib/mcq/set-engine";
import { SAMPLE_MCQ } from "../src/lib/mcq/sample";

let pass = 0, fail = 0;
function check(name: string, cond: boolean, extra?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ FAIL: ${name} ${extra ?? ""}`); }
}

console.log("— টেস্ট ১: নমুনা বাংলা+English মিক্স পার্স —");
const p1 = parseMcq(SAMPLE_MCQ);
check("১২টি প্রশ্ন ডিটেক্ট", p1.questions.length === 12, `got ${p1.questions.length}`);
check("সিরিয়াল OK", p1.serial?.status === "ok");
check("বাংলা স্ক্রিপ্ট (নমুনা সব বাংলা সংখ্যা)", p1.numberScript === "bn");
check("প্রথম প্রশ্নে ৪ অপশন", p1.questions[0].options.length === 4, `got ${p1.questions[0].options.length}`);
check("প্রিঅ্যাম্বল ২ লাইন", p1.preamble.length === 2, `got ${JSON.stringify(p1.preamble)}`);

console.log("— টেস্ট ১b: সত্যিকারের মিক্সড (English digit) —");
const mixedText = `১. বাংলা প্রশ্ন?\nক) অ খ) আ\n3. English question?\na) X\nb) Y`;
const p1b = parseMcq(mixedText);
check("২টি প্রশ্ন", p1b.questions.length === 2, `got ${p1b.questions.length}`);
check("মিক্সড স্ক্রিপ্ট", p1b.numberScript === "mixed", `got ${p1b.numberScript}`);

console.log("— টেস্ট ২: ভাঙা সিরিয়াল ডিটেক্ট —");
const brokenText = `1. Question one
a) A
b) B
2. Question two
3. Question three
5. Question five
1. Restart section
2. Next`;
const p2 = parseMcq(brokenText);
check("৬টি প্রশ্ন ডিটেক্ট", p2.questions.length === 6, `got ${p2.questions.length}`);
check("সিরিয়াল ভাঙা ধরা পড়েছে", p2.serial?.status === "broken");
check("২টি ইস্যু (3→5 আর 5→1)", p2.serial?.issues.length === 2, `got ${p2.serial?.issues.length}`);

console.log("— টেস্ট ৩: অটো-ফিক্স —");
const fixed = autoFixNumbering(brokenText, 1);
const p3 = parseMcq(fixed);
check("ফিক্সের পরে সিরিয়াল OK", p3.serial?.status === "ok");
check("৬টি প্রশ্ন অক্ষত", p3.questions.length === 6, `got ${p3.questions.length}`);
check("প্রথম নম্বর 1", p3.questions[0].originalNumber === 1);
check("শেষ নম্বর 6", p3.questions[5].originalNumber === 6);
check("অপশন লাইন অক্ষত", p3.questions[0].options.length === 2);

console.log("— টেস্ট ৪: বাংলা সংখ্যা অটো-ফিক্স প্রিজার্ভ —");
const bnFixed = autoFixNumbering("৩. প্রশ্ন তিন\n৪. প্রশ্ন চার\n৬. প্রশ্ন ছয়", 1);
check("বাংলা সংখ্যা প্রিজার্ভড", bnFixed.includes("১. প্রশ্ন তিন") && bnFixed.includes("২. প্রশ্ন চার") && bnFixed.includes("৩. প্রশ্ন ছয়"), bnFixed);

console.log("— টেস্ট ৫: সেট বিল্ড (interleaved) —");
const pool = p1.questions;
const sets = buildSets(pool, { setCount: 4, distribution: "interleaved", shuffleWithin: false });
check("৪টি সেট", sets.length === 4);
check("মোট ১২ প্রশ্ন অক্ষত", sets.reduce((a, s) => a + s.length, 0) === 12);
check("interleaved: সেট0 = q0,q4,q8", sets[0].map(q => q.id).join(",") === "0,4,8", sets[0].map(q => q.id).join(","));
check("interleaved অর্ডার প্রিজার্ভড", sets[0][0].id < sets[0][1].id);

console.log("— টেস্ট ৬: chunk মোড —");
const chunkSets = buildSets(pool, { setCount: 3, distribution: "chunk", shuffleWithin: false });
check("মোট ১২ অক্ষত", chunkSets.reduce((a, s) => a + s.length, 0) === 12);
check("সেট0 = প্রথম ৪টি", chunkSets[0].map(q => q.id).join(",") === "0,1,2,3");
check("সিরিয়াল অর্ডার থাকে", chunkSets[1][0].id < chunkSets[1][1].id);

console.log("— টেস্ট ৭: shuffleWithin —");
const shufSets = buildSets(pool, { setCount: 1, distribution: "interleaved", shuffleWithin: true });
const same = shufSets[0].every((q, i) => q.id === i);
// 1/12! চান্স একই থাকার — practically never
check("শাফল হয়েছে", !same);

console.log("— টেস্ট ৮: বড় পুল (১০০০ প্রশ্ন, ১০ সেট) —");
const bigPool = Array.from({ length: 1000 }, (_, i) => ({
  id: i, originalNumber: i + 1, numberScript: "en" as const,
  rawPrefix: `${i + 1}. `, separator: ".", lines: [`${i + 1}. Q${i}`], options: [],
}));
const bigSets = buildSets(bigPool, { setCount: 10, distribution: "interleaved", shuffleWithin: false });
check("প্রতি সেটে ১০০", bigSets.every(s => s.length === 100), bigSets.map(s => s.length).join(","));

console.log("— টেস্ট ৯: সেট নাম —");
check("getSetName(0,'letter') = সেট A", getSetName(0, "letter") === "সেট A");
check("getSetName(1,'bangla') = সেট খ", getSetName(1, "bangla") === "সেট খ");
check("getSetName(2,'number') = সেট ৩", getSetName(2, "number") === "সেট ৩");
check("getSetName(0,'setn') = Set 1", getSetName(0, "setn") === "Set 1");

console.log("— টেস্ট ১০: ২০০০ প্রশ্ন পারফরম্যান্স —");
const big2000 = Array.from({ length: 2000 }, (_, i) => `${i + 1}. Question number ${i + 1}?\na) opt\nb) opt`).join("\n");
const t0 = performance.now();
const p2000 = parseMcq(big2000);
const dt = performance.now() - t0;
check("২০০০ প্রশ্ন ডিটেক্ট", p2000.questions.length === 2000, `got ${p2000.questions.length}`);
check("৪০০০ অপশন ডিটেক্ট", p2000.questions.every(q => q.options.length === 2));
console.log(`  ⏱ পার্স টাইম: ${dt.toFixed(1)}ms ${dt < 500 ? "(দ্রুত ✓)" : "(স্লো!)"}`);

console.log(`\n==== রেজাল্ট: ${pass} পাস, ${fail} ফেল ====`);
process.exit(fail ? 1 : 0);
