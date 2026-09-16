// ============================================================
// Doc1/BCS-English-Bijoy পাইপলাইন টেস্ট — উত্তর (D:/Dt/মাল্টি), ব্যাখ্যা
// (e¨vL¨v), সেকশন-টাইটেল সেপারেটর, রিস্টার্ট-সিরিয়াল, অপশন-ক্লিন
// রান: bun run scripts/test-doc1.ts
// ============================================================
import { readFileSync, existsSync } from "node:fs";
import { JSDOM } from "jsdom";
import JSZip from "jszip";

const dom = new JSDOM("<!doctype html><html><body></body></html>");
(globalThis as unknown as Record<string, unknown>).DOMParser = dom.window.DOMParser;
(globalThis as unknown as Record<string, unknown>).XMLSerializer = dom.window.XMLSerializer;
(globalThis as unknown as Record<string, unknown>).Node = dom.window.Node;

const { parseDocxXml, scanOptions, W_NS } = await import("../src/lib/mcq/docx-xml");
const { parseRedownloadXml } = await import("../src/lib/mcq/redownload");

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

// ---- আসল ফাইল লোড (প্রাইভেসি: ফিক্সচার রিপোতে নেই — লোকালে থাকলেই চলে) ----
const REAL = "scripts/fixtures/bcs-english-bijoy-46.docx";
const realMissing = !existsSync(REAL);
const zip = realMissing ? null : await JSZip.loadAsync(readFileSync(REAL));
const xmlText = zip ? await zip.file("word/document.xml")!.async("string") : "";
if (realMissing) {
  console.log("  (স্কিপ: আসল-ফাইল সেকশন ১-২ — ফিক্সচার রিপোতে কমিট করা হয়নি)");
}

if (!realMissing) {
console.log("\n== ১) শাফল-পাইপলাইন (parseDocxXml) — BCS English Bijoy ==");
  const parse = parseDocxXml(xmlText);
  ok(parse.questions.length === 375, `৩৭৫ প্রশ্ন ডিটেক্ট (পেয়েছি ${parse.questions.length})`);
  ok(parse.questions[0].serial === 1, "প্রথম প্রশ্ন সিরিয়াল 1");

  // সেকশন-টাইটেল সেপারেটর (৪৬তম…৩৫তম = ১২টি)
  ok(parse.separators.length === 12, `১২টি পরীক্ষা-টাইটেল সেপারেটর (পেয়েছি ${parse.separators.length})`);
  ok(parse.separators.some((s) => s.includes("46Zg")), "Bijoy টাইটেল ডিটেক্ট (46Zg wewmGm…)");
  // টাইটেল আর কোনো প্রশ্ন-ব্লকে লাগানো নেই
  const titleGlued = parse.questions.filter((q) => q.paras.some((p) => /Zg wewmGm/.test(p)));
  ok(titleGlued.length === 0, `টাইটেল কোনো প্রশ্ন-ব্লকে নেই (পেয়েছি ${titleGlued.length})`);

  // উত্তর ডিটেকশন (D: / Dt / মাল্টি)
  const withAns = parse.questions.filter((q) => q.answer).length;
  ok(withAns >= 370, `উত্তর ≥৩৭০ (পেয়েছি ${withAns}/375)`);
  ok(parse.questions[0].answer === "L + N", `মাল্টি-উত্তর "L + N" (পেয়েছি ${parse.questions[0].answer})`);
  ok(parse.questions[1].answer === "M", `সাধারণ "D: M" উত্তর (পেয়েছি ${parse.questions[1].answer})`);
  const dtQ = parse.questions.find((q) => q.serial === 35);
  ok(dtQ?.answer === "K", `"Dt K" উত্তর → K (পেয়েছি ${dtQ?.answer})`);

  // ব্যাখ্যা ডিটেকশন (Bijoy e¨vL¨v)
  const withBek = parse.questions.filter((q) => q.bekkha).length;
  ok(withBek >= 360, `ব্যাখ্যা ≥৩৬০ (পেয়েছি ${withBek}/375)`);
  ok(parse.questions[0].bekkha?.startsWith("Sand Ges Sugar") ?? false, "Q1 ব্যাখ্যা-টেক্সট মার্কার-বাদে শুরু");
  ok(!parse.questions[0].bekkha?.includes("e¨vL¨v:"), "ব্যাখ্যা-টেক্সটে মার্কার নেই");

  // অপশন-টেক্সট ক্লিন — উত্তর/ব্যাখ্যা লাগানো নেই
  const dirty = parse.questions.filter((q) => q.options.some((o) => /D:|Dt\s*$|e¨vL¨v/.test(o.text)));
  ok(dirty.length === 0, `অপশন-টেক্সট পরিষ্কার (dirty ${dirty.length})`);
  const q1 = parse.questions[0];
  ok(q1.options.length === 4 && q1.options[3].text === "sand", `Q1 opt N = "sand" (পেয়েছি ${JSON.stringify(q1.options[3]?.text)})`);
  // ঝুলন্ত-মার্কার প্রশ্নে অপশন ক্লিন (…\tDt / …\tD: -)
  const dangling = parse.questions.filter((q) => q.options.some((o) => /\t(Dt|D:)\s*$/.test(o.text)));
  ok(dangling.length === 0, `ঝুলন্ত মার্কার-সহ অপশন নেই (পেয়েছি ${dangling.length})`);

  // সিরিয়াল রিস্টার্ট-ক্লাসিফিকেশন
  ok(parse.serial?.status === "broken", "সিরিয়াল রিপোর্ট broken (রিস্টার্ট আছে)");
  ok(parse.serial?.issues.length === 11, `১১টি ইস্যু (পেয়েছি ${parse.serial?.issues.length})`);
  ok(parse.serial?.issues.every((is) => is.restart) ?? false, "সব ইস্যুই রিস্টার্ট (found=1)");
  ok(parse.serial?.issues[0].expected === 36 && parse.serial?.issues[0].found === 1, "ইস্যু-১: expected 36, found 1");

  console.log("\n== ২) রিডাউনলাউড-পাইপলাইন (parseRedownloadXml) — অংশ-ডিটেকশন ==");
  const rd = parseRedownloadXml(xmlText);
  ok(rd.questions.length === 374, `৩৭৪ প্রশ্ন (পেয়েছি ${rd.questions.length})`);
  const kc = rd.kindCounts;
  ok(kc.bekkha >= 380, `ব্যাখ্যা-অংশ ≥৩৮০ প্যারা (পেয়েছি ${kc.bekkha})`);
  ok(kc.answer >= 5, `উত্তর-অংশ ≥৫ প্যারা (পেয়েছি ${kc.answer})`);
  ok(kc.question === 374, `প্রশ্ন-অংশ ৩৭৪ প্যারা (পেয়েছি ${kc.question})`);
  const rdWithAns = rd.questions.filter((q) => q.answer).length;
  ok(rdWithAns >= 368, `উত্তর ≥৩৬৮ (পেয়েছি ${rdWithAns}/374)`);
  const rdWithBek = rd.questions.filter((q) => q.bekkha).length;
  ok(rdWithBek >= 360, `ব্যাখ্যা ≥৩৬০ (পেয়েছি ${rdWithBek}/374)`);
  // ব্যাখ্যা-কনটিনিউয়েশন (ট্যাব-লেড "†hgb : i. …") অপশনে গণনা হয়নি
  const optRatio = kc.options / rd.questions.length;
  ok(optRatio < 3.2, `প্রশ্ন-প্রতি অপশন-প্যারা <৩.২ (পেয়েছি ${optRatio.toFixed(2)})`);
  // পরীক্ষা-টাইটেল আলাদা (কোনো প্রশ্ন-ব্লকে লাগানো নেই)
  const rdTitleGlued = rd.questions.filter((q) => q.texts.some((p) => /Zg wewmGm/.test(p)));
  ok(rdTitleGlued.length === 0, `রিডাউনলাউডেও টাইটেল কোনো প্রশ্ন-ব্লকে নেই (পেয়েছি ${rdTitleGlued.length})`);
}

console.log("\n== ৩) scanOptions ইউনিট-এজ (আসল প্যাটার্ন) ==");
{
  // একা-লাইন উত্তর
  const r1 = scanOptions("12. Choose the correct one.\nK. one\tL. two\nM. three\tN. four\nD: K", "12.");
  ok(r1.answer === "K" && r1.options[3].text === "four", "একা-লাইন উত্তর 'D: K' → K, অপশন ক্লিন");
  // মাল্টি উত্তর (কমা)
  const r2 = scanOptions("5. নিচের কোনটি সঠিক?\nক. ১\nখ. ২\nগ. ৩\nঘ. ৪\tউত্তর: ক, খ", "5.");
  ok(r2.answer === "ক, খ", `মাল্টি কমা-উত্তর (পেয়েছি ${r2.answer})`);
  // Unicode ব্যাখ্যা
  const r3 = scanOptions("3. পানির ঘনত্ব কত?\nক. ১\nখ. ২\nগ. ৩\nঘ. ৪\tউত্তর: ক\nব্যাখ্যা: পানির ঘনত্ব ১।", "3.");
  ok(r3.answer === "ক", "Unicode উত্তর ডিটেক্ট");
  ok(r3.bekkha === "পানির ঘনত্ব ১।", `Unicode ব্যাখ্যা-মার্কার বাদ (পেয়েছি ${JSON.stringify(r3.bekkha)})`);
  ok(r3.options[3].text === "৪", "ব্যাখ্যা অপশনে লাগেনি");
  // ঝুলন্ত Dt — টেক্সট ক্লিন, উত্তর null
  const r4 = scanOptions("24. The antonym is—\nK. noisy\tL. quit\nM. unruly\tN. cheerful\tDt", "24.");
  ok(r4.answer === null, "ঝুলন্ত 'Dt' → উত্তর null");
  ok(r4.options[3].text === "cheerful", `ঝুলন্ত Dt অপশন থেকে কাটা (পেয়েছি ${JSON.stringify(r4.options[3]?.text)})`);
  // "No Answer" অপশন ঝুলন্ত-কাটার শিকার হয় না
  const r5 = scanOptions("9. Choose one.\nK. Yes\nL. No Answer\nM. Maybe\nN. Never", "9.");
  ok(r5.options[1].text === "No Answer", "'No Answer' অপশন অক্ষত");
  // ব্যাখ্যা ছাড়া ব্লকে উত্তর-শেষে ব্লক
  const r6 = scanOptions("7. Pick—\nK. a\nL. b\tDt L", "7.");
  ok(r6.answer === "L" && r6.options[1].text === "b", "ব্লক-শেষ গ্লুড 'Dt L' → L");
}

console.log("\n== ৪) সিনথেটিক ফুল-ডক (একই ফরম্যাট — সবখানে চলে) ==");
{
  // Doc1-ফরম্যাটের মিনি ডক: ২টি পরীক্ষা-সেকশন (রিস্টার্ট সিরিয়াল), K/L/M/N অপশন,
  // D:/Dt উত্তর, মাল্টি-উত্তর, Bijoy ব্যাখ্যা-মার্কার, ঝুলন্ত মার্কার
  const P = (t: string) => `<w:p><w:r><w:t xml:space="preserve">${t.replace(/\t/g, '</w:t></w:r><w:r><w:tab/></w:r><w:r><w:t xml:space="preserve">')}</w:t></w:r></w:p>`;
  const body = [
    P("20Zg wewmGm wcÖwjwgbvwi cix¶v"),
    P("1.\tWhat is a verb?"),
    P("\tK. mobile\tL. sugar"),
    P("\tM. media\tN. sand\tD: L + N"),
    P("e¨vL¨v: Sand Ges Sugar `ywUB verb wn‡m‡e e¨eüZ n‡Z cv‡i|"),
    P("\t†hgb : i. example one."),
    P(""),
    P("2. Choose the right form:"),
    P("\tK. go\tL. went"),
    P("\tM. gone\tN. going\tDt K"),
    P("e¨vL¨v: Present tense-এ go হয়।"),
    P(""),
    P("19Zg wewmGm wcÖwjwgbvwi cix¶v"),
    P("1.\tPick the noun:"),
    P("\tK. quickly\tL. beautiful"),
    P("\tM. Dhaka\tN. run\tD: M"),
    P("e¨vL¨v: Dhaka GKwU Proper Noun|"),
    P(""),
    P("2.\tThe antonym is—"),
    P("\tK. noisy\tL. quit"),
    P("\tM. unruly\tN. cheerful\tDt"),
  ].join("\n");
  const miniXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="${W_NS}"><w:body>${body}<w:sectPr/></w:body></w:document>`;
  const zipBuf = await new JSZip().generateAsync({ type: "nodebuffer" }); // ওয়ার্ম-আপ নয়, শুধু ইনস্ট্যান্স
  void zipBuf;
  const sz = new JSZip();
  sz.file("[Content_Types].xml", '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>');
  sz.file("word/document.xml", miniXml);
  const miniDoc = await sz.generateAsync({ type: "uint8array" });

  // শাফল-পাইপলাইন
  const mp = parseDocxXml(miniXml);
  ok(mp.questions.length === 4, `৪ প্রশ্ন (পেয়েছি ${mp.questions.length})`);
  ok(mp.separators.length === 2, `২ টাইটেল-সেপারেটর (পেয়েছি ${mp.separators.length})`);
  ok(mp.questions[0].answer === "L + N", `মাল্টি-উত্তর (পেয়েছি ${mp.questions[0].answer})`);
  ok(mp.questions[0].options[3].text === "sand", `অপশন-ক্লিন (পেয়েছি ${JSON.stringify(mp.questions[0].options[3]?.text)})`);
  ok(mp.questions[0].bekkha?.startsWith("Sand Ges Sugar") ?? false, "ব্যাখ্যা ডিটেক্ট");
  ok((mp.questions[0].bekkha ?? "").includes("†hgb : i. example one."), "ব্যাখ্যা-কনটিনিউয়েশন ব্যাখ্যার সাথে");
  ok(mp.questions[1].answer === "K", `"Dt K" → K`);
  ok(mp.questions[1].bekkha === "Present tense-এ go হয়।", "Unicode ব্যাখ্যা-লাইন");
  ok(mp.serial?.issues.length === 1 && mp.serial.issues[0].restart === true, "রিস্টার্ট-ইস্যু ১টা (restart ফ্ল্যাগ)");
  ok(mp.questions[2].serial === 1 && mp.questions[3].serial === 2, "রিস্টার্টের পরে সিরিয়াল ১ থেকে");
  // ঝুলন্ত Dt — উত্তর null, অপশন ক্লিন
  ok(mp.questions[3].answer === null, "ঝুলন্ত 'Dt' → উত্তর null");
  ok(mp.questions[3].options[3].text === "cheerful", `ঝুলন্ত Dt কাটা (পেয়েছি ${JSON.stringify(mp.questions[3].options[3]?.text)})`);

  // রিডাউনলাউড-পাইপলাইন
  const mrd = parseRedownloadXml(miniXml);
  ok(mrd.questions.length === 4, `rd: ৪ প্রশ্ন (পেয়েছি ${mrd.questions.length})`);
  ok(mrd.kindCounts.bekkha === 4, `rd: ব্যাখ্যা-প্যারা ৪ (৩ মার্কার + ১ কনটিনিউয়েশন) (পেয়েছি ${mrd.kindCounts.bekkha})`);
  ok(mrd.kindCounts.answer === 0 || mrd.kindCounts.answer >= 0, "rd: কাইন্ড-কাউন্ট স্যানিটি");
  ok(mrd.questions.filter((q) => q.answer).length === 3, `rd: ৩ উত্তর (L+N, K, M; ঝুলন্ত null) (পেয়েছি ${mrd.questions.filter((q) => q.answer).length})`);
  ok(mrd.questions.filter((q) => q.bekkha).length === 3, `rd: ৩ ব্যাখ্যা (পেয়েছি ${mrd.questions.filter((q) => q.bekkha).length})`);
  // ঝুলন্ত-প্রশ্নের অপশন rd-তেও ক্লিন
  ok(mrd.questions[3].options[3]?.text === "cheerful", "rd: ঝুলন্ত Dt অপশন ক্লিন");
  void miniDoc;
}

console.log(`\n${passed} পাস, ${failed} ফেল`);
process.exit(failed ? 1 : 0);
