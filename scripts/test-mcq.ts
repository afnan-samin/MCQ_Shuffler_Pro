// পার্সার + সেট ইঞ্জিন কুইক টেস্ট
import { parseMcq, autoFixNumbering } from "../src/lib/mcq/parser";
import { buildSets, getSetName } from "../src/lib/mcq/set-engine";
import { classifyWord, analyzeText, splitLineSegments } from "../src/lib/mcq/encoding";
import { runsForLine, DEFAULT_EXPORT_OPTIONS } from "../src/lib/mcq/exporter";
import { SAMPLE_MCQ } from "./fixtures/sample-mcq";

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

console.log("— টেস্ট ১১: Original Shuffle (প্রতি সেটে সব প্রশ্ন, ক্রম আলাদা) —");
const oSets = buildSets(pool, { setCount: 3, distribution: "original", shuffleWithin: true });
check("৩টি সেট", oSets.length === 3);
check("প্রতি সেটে সবগুলো ১২ প্রশ্ন", oSets.every(s => s.length === 12), oSets.map(s => s.length).join(","));
check("প্রতি সেটে সব প্রশ্ন থাকে (id সেট সমান)", oSets.every(s => new Set(s.map(q => q.id)).size === 12));
check("কোনো সেট অরিজিনাল ক্রমে নেই", oSets.every(s => s.some((q, i) => q.id !== i)));
const oKeys = oSets.map(s => s.map(q => q.id).join(","));
check("সেটগুলোর ক্রম পরস্পর আলাদা", new Set(oKeys).size === 3);
const bigOrig = buildSets(bigPool, { setCount: 5, distribution: "original", shuffleWithin: true });
check("১০০০ প্রশ্ন × ৫ সেট: প্রতিটিতে ১০০০", bigOrig.every(s => s.length === 1000));
check("১০০০ প্রশ্ন: ক্রমগুলো আলাদা", new Set(bigOrig.map(s => s.map(q => q.id).join(","))).size === 5);

console.log("— টেস্ট ১২: এনকোডিং ডিটেক্টর (শব্দ ধরে) —");
check("ইউনিকোড বাংলা", classifyWord("বাংলাদেশ", null) === "unicode");
check("English কমন শব্দ", classifyWord("capital", null) === "english");
check("ASCII সংখ্যা = neutral", classifyWord("1971", null) === "neutral");
check("বাংলা সংখ্যা = unicode", classifyWord("১৯৭১", null) === "unicode");
check("Bijoy strong মার্কার (†)", classifyWord("Av‡i", null) === "bijoy");
check("Bijoy strong মার্কার (µ)", classifyWord("Pµ", null) === "bijoy");
check("Bijoy ASCII + bijoy কনটেক্সট", classifyWord("evsjv", "bijoy") === "bijoy");
check("ASCII + কনটেক্সট নেই = english", classifyWord("evsjv", null) === "english");

const encBn = analyzeText("১. বাংলাদেশের রাজধানী কোনটি?");
check("ইউনিকোড ডক: dominant=unicode", encBn.dominant === "unicode");
check("ইউনিকোড ডক: সব শব্দ unicode", encBn.unicode === encBn.total, JSON.stringify(encBn));

const encBijoy = analyzeText("1. evsjv Av‡i Pµ? wKQz");
check("Bijoy ডক: dominant=bijoy", encBijoy.dominant === "bijoy");
check("Bijoy ডক: bijoy শব্দ ধরা পড়েছে", encBijoy.bijoy === 4, JSON.stringify(encBijoy));

const encMix = analyzeText("১. বাংলা প্রশ্ন?\n2. evsjv Av‡i?\n3. What is capital?");
check("মিক্সড নমুনা: তিন ধরনই আছে", encMix.bijoy > 0 && encMix.unicode > 0 && encMix.english > 0, JSON.stringify(encMix));

console.log("— টেস্ট ১৩: এক্সপোর্ট ফন্ট-রান (শব্দ ধরে) —");
const bijoyLine = "1. evsjv Av‡i Pµ?";
const bijoyRuns = runsForLine(bijoyLine, DEFAULT_EXPORT_OPTIONS);
check("Bijoy লাইন → SutonnyMJ ফন্ট", bijoyRuns.every(r => r.font === "SutonnyMJ"), JSON.stringify(bijoyRuns));
check("Bijoy লাইন: টেক্সট অক্ষত", bijoyRuns.map(r => r.text).join("") === bijoyLine);

const mixLine = "১. বাংলা question কোনটি?";
const mixRuns = runsForLine(mixLine, DEFAULT_EXPORT_OPTIONS);
check("মিক্সড লাইন: টেক্সট অক্ষত", mixRuns.map(r => r.text).join("") === mixLine);
check("মিক্সড লাইন: English শব্দে Times", mixRuns.some(r => r.enc === "english" && r.font === "Times New Roman"), JSON.stringify(mixRuns));
check("মিক্সড লাইন: বাংলায় Unicode ফন্ট", mixRuns.some(r => r.enc === "unicode" && r.font === "Nirmala UI"));
const segs = splitLineSegments(mixLine);
check("splitLineSegments: ১+ সেগমেন্ট", segs.length >= 2 && segs.map(s => s.text).join("") === mixLine);

console.log("— টেস্ট ১৪: প্লেইন টেক্সট সিরিয়াল (কোনো বুলেট নেই) —");
const p14 = parseMcq("১. প্রশ্ন?\nক) উত্তর\n2. প্রশ্ন দুই?\na) X");
check("২টি প্রশ্ন", p14.questions.length === 2, `got ${p14.questions.length}`);
check("লাইনে নম্বর টেক্সট থাকে (প্লেইন)", p14.questions[0].lines[0] === "১. প্রশ্ন?", p14.questions[0].lines[0]);
check("rawPrefix সাধারণ টেক্সট", p14.questions[0].rawPrefix.trim() === "১.", JSON.stringify(p14.questions[0].rawPrefix));
check("সেট টেক্সটে বুলেট চিহ্ন যোগ হয় না", !"•‣◦·-–".split("").some(b => getSetName(0, "letter").startsWith(b)));

console.log("— টেস্ট ১৫: সিরিয়াল-সিলিং ইউনিফাই (MAX_SERIAL_NUMBER=9999) —");
// আগে টেক্সট-পার্সে সিলিং 2000 ছিল — ২৫০০/৬০০০-জাতীয় সিরিয়ালের প্রশ্ন ধরা পড়ত না (Task 21-a)
const big15 = parseMcq(
  "2500. সিরিয়াল ২৫০০-এর প্রশ্ন?\nক) উত্তর-১\nখ) উত্তর-২\n6000. সিরিয়াল ৬০০০-এর প্রশ্ন?\na) X\nb) Y"
);
check("সিরিয়াল 2500 প্রশ্ন ডিটেক্ট", big15.questions.length === 2 && big15.questions[0].originalNumber === 2500, `got ${JSON.stringify(big15.questions.map(q => q.originalNumber))}`);
check("সিরিয়াল 6000 প্রশ্ন ডিটেক্ট", big15.questions[1]?.originalNumber === 6000);
check("দুই প্রশ্নেই ২টা করে অপশন অক্ষত", big15.questions.every(q => q.options.length === 2));
// সিলিং-বাউন্ডারি: ৪-ডিজিট রেঞ্জের শেষ মান 9999-ও প্রশ্ন হয়
const b9999 = parseMcq("9999. শেষ সিরিয়ালের প্রশ্ন?\nক) উত্তর");
check("সিলিং-বাউন্ডারি 9999 প্রশ্ন ডিটেক্ট", b9999.questions.length === 1 && b9999.questions[0].originalNumber === 9999, `got ${JSON.stringify(b9999.questions.map(q => q.originalNumber))}`);

console.log("— টেস্ট ১৬: বছর-গার্ড (1900..2100 + 'সাল'/'year' = প্রশ্ন নয়) —");
// "2024. সালের ফলাফল…" — সেপারেটর-সহ লাইন; গার্ড ছাড়া ভুল করে প্রশ্ন-শুরু হত (Task 21-a)
const yg1 = parseMcq("5. আসল প্রশ্ন?\nক) উত্তর\n2024. সালের ফলাফল প্রকাশিত হয়েছে।");
check("'2024. সালের ফলাফল…' প্রশ্ন নয় (কনটিনিউয়েশন)", yg1.questions.length === 1 && yg1.questions[0].originalNumber === 5, `got ${JSON.stringify(yg1.questions.map(q => q.originalNumber))}`);
check("বছর-লাইন প্রশ্ন-৫-এর কনটিনিউয়েশন হিসেবে সংরক্ষিত", yg1.questions[0].lines.some(l => l.startsWith("2024.")));
// বাংলা ডিজিট + সেপারেটর ছাড়া লাইনও প্রশ্ন নয়
const yg2 = parseMcq("৩. ইতিহাসের প্রশ্ন?\nক) উত্তর\n২০২৫ সালে কী ঘটেছিল?");
check("'২০২৫ সালে…' প্রশ্ন নয়", yg2.questions.length === 1 && yg2.questions[0].originalNumber === 3, `got ${JSON.stringify(yg2.questions.map(q => q.originalNumber))}`);
// English "year" (case-insensitive)
const yg3 = parseMcq("4. Real question?\na) ans\n2024. Year of the war?");
check("'2024. Year of…' প্রশ্ন নয় (case-insensitive)", yg3.questions.length === 1 && yg3.questions[0].originalNumber === 4, `got ${JSON.stringify(yg3.questions.map(q => q.originalNumber))}`);
// গার্ড টাইট: 1900..2100 রেঞ্জের নম্বর হলেও "সাল"/"year" ছাড়া টেক্সট = আসল প্রশ্ন
const yg4 = parseMcq("2024. বাংলাদেশের প্রথম রাজধানী?\nক) সোনারগাঁও\n2025. বর্তমান রাজধানী?\nক) ঢাকা");
check("গার্ড-রেঞ্জের নম্বর হলেও 'সাল/year' ছাড়া প্রশ্ন হয়", yg4.questions.length === 2 && yg4.questions[0].originalNumber === 2024 && yg4.questions[1].originalNumber === 2025, `got ${JSON.stringify(yg4.questions.map(q => q.originalNumber))}`);
// প্রথম-প্রশ্ন num ≤ 50 নিয়ম অপরিবর্তিত (সেপারেটর-হীন প্রথম লাইনে বড় সংখ্যা প্রশ্ন নয়)
const firstBig = parseMcq("2024 সালের সারসংক্ষেপ\nআরও লাইন");
check("প্রথম-প্রশ্ন num ≤ 50 নিয়ম অক্ষত", firstBig.questions.length === 0, `got ${firstBig.questions.length}`);

console.log(`\n==== রেজাল্ট: ${pass} পাস, ${fail} ফেল ====`);
process.exit(fail ? 1 : 0);
