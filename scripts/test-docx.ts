// ============================================================
// DOCX pipeline unit tests — আসল আপলোড করা ফাইল দিয়ে যাচাই
// রান: bun run scripts/test-docx.ts
// ============================================================

import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";
import JSZip from "jszip";

// ---- ব্রাউজার DOM API emulation (jsdom) ----
const dom = new JSDOM("<!doctype html><html><body></body></html>");
(globalThis as unknown as Record<string, unknown>).DOMParser = dom.window.DOMParser;
(globalThis as unknown as Record<string, unknown>).XMLSerializer = dom.window.XMLSerializer;
(globalThis as unknown as Record<string, unknown>).Node = dom.window.Node;

const { parseDocxXml, renumberSerialPara, extractParaText, W_NS } = await import(
  "../src/lib/mcq/docx-xml"
);
const { buildShuffledXml, englishSetName } = await import("../src/lib/mcq/docx-exporter");

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

// ---- লোড ----
const FILE = "scripts/fixtures/hsc27-physics-bijoy.docx";
const buf = readFileSync(FILE);
const zip = await JSZip.loadAsync(buf);
const xml = zip.file("word/document.xml")!.async("string") as unknown as Promise<string>;
const xmlText = await xml;

console.log("\n== ১) পার্স (আসল ফাইল) ==");
const parse = parseDocxXml(xmlText);
ok(parse.questions.length === 60, `৬০টি প্রশ্ন ডিটেক্ট (পেয়েছি ${parse.questions.length})`);
ok(parse.questions[0].serial === 32, `প্রথম প্রশ্নের সিরিয়াল 32 (পেয়েছি ${parse.questions[0].serial})`);
ok(parse.questions[9].serial === 5, "১০ম প্রশ্নের সিরিয়াল 5 (মেসি সিরিয়াল ডিটেক্ট)");
ok(parse.questions[11].serial === 13 && parse.questions[12].serial === 13, "ডুপ্লিকেট সিরিয়াল 13 দুবার ধরা হয়েছে");
ok(parse.questions[59].serial === 36, `শেষ প্রশ্নের সিরিয়াল 36 (পেয়েছি ${parse.questions[59].serial})`);
ok(parse.serial?.status === "broken", "সিরিয়াল রিপোর্ট: broken (ডুপ্লিকেট/লাফ আছে)");
ok(parse.separators.filter((s) => s === "PHYSICS").length === 6, "৬টি PHYSICS হেডিং সেপারেটর");
ok(parse.separators.includes("A"), '"A" হেডিং সেপারেটর');
ok(parse.unicodeQuestionIds.length === 0, "কোনো Unicode বাংলা নেই (pure Bijoy)");
ok(parse.questions[0].serialFontBijoy === true, "সিরিয়াল ফন্ট = SutonnyMJ (Bijoy লুক)");
ok(parse.questions[0].serialEnc === "en", "সিরিয়াল ডিজিট এনকোডিং = en (ASCII, SutonnyMJ-এ ৩২ দেখায়)");

console.log("\n== ২) অপশন ও উত্তর ডিটেকশন ==");
const q0 = parse.questions[0];
ok(q0.options.length === 4, `৪টি অপশন ডিটেক্ট (পেয়েছি ${q0.options.length})`);
ok(JSON.stringify(q0.options.map((o) => o.label)) === JSON.stringify(["K", "L", "M", "N"]), "অপশন লেবেল K L M N (= ক খ গ ঘ)");
ok(q0.answer === "K", `উত্তর ডিটেক্ট: K (= ক) [পেয়েছি ${q0.answer}]`);
ok(q0.qText.startsWith("†KvbwU"), "প্রশ্ন টেক্সট সিরিয়াল বাদ দিয়ে শুরু");
ok(q0.options.every((o) => o.text.length > 0), "সব অপশনে টেক্সট আছে");
const qWithMath = parse.questions[2]; // 34.100m ... <MATH>
ok(qWithMath.text.includes("100m"), "math-সহ প্রশ্নের টেক্সট ঠিক (linear)");

console.log("\n== ৩) রিনাম্বার ইঞ্জিন (multi-run সিরিয়াল) ==");
{
  const doc = new DOMParser().parseFromString(xmlText, "application/xml");
  const kids = Array.from(doc.getElementsByTagNameNS(W_NS, "body")[0].children) as Element[];
  const p0 = kids[parse.questions[0].blockStart];
  const c1 = p0.cloneNode(true) as Element;
  renumberSerialPara(c1, 7);
  ok(extractParaText(c1).startsWith("7.\t"), `সিরিয়াল→7: "${extractParaText(c1).slice(0, 8)}…"`);
  const c2 = p0.cloneNode(true) as Element;
  renumberSerialPara(c2, 100);
  ok(extractParaText(c2).startsWith("100.\t"), `সিরিয়াল→100 (ডিজিট বাড়ল): "${extractParaText(c2).slice(0, 10)}…"`);
  const c3 = p0.cloneNode(true) as Element;
  renumberSerialPara(c3, 3);
  ok(extractParaText(c3).startsWith("3.\t"), `সিরিয়াল→3 (ডিজিট কমল): "${extractParaText(c3).slice(0, 8)}…"`);
  ok(extractParaText(p0).startsWith("32.\t"), "অরিজিনাল অক্ষত আছে");
}

// ব্লক-ভিত্তিক সোর্স কাউন্ট (tab/math/vertAlign) — DOM-ভিত্তিক গণনা
const M_NS = "http://schemas.openxmlformats.org/officeDocument/2006/math";
function countNS(x: string, ns: string, ln: string): number {
  return new DOMParser().parseFromString(x, "application/xml").getElementsByTagNameNS(ns, ln).length;
}
function countRunTabsIn(x: string): number {
  const tabs = new DOMParser().parseFromString(x, "application/xml").getElementsByTagNameNS(W_NS, "tab");
  let n = 0;
  for (let i = 0; i < tabs.length; i++) {
    const p = tabs[i].parentNode;
    if (p && p.nodeType === 1 && (p as Element).localName === "r") n++;
  }
  return n;
}
{
  const srcTabs = countRunTabsIn(xmlText);
  const srcOMath = countNS(xmlText, M_NS, "oMath");
  const srcVert = countNS(xmlText, W_NS, "vertAlign");
  ok(srcTabs === 473 && srcOMath === 30 && srcVert === 39, `সোর্স বেঞ্চমার্ক: tab=${srcTabs}, oMath=${srcOMath}, vertAlign=${srcVert}`);

  console.log("\n== ৪) শাফল্ড এক্সপোর্ট (২ সেট — প্রতি সেটে সব ৬০ প্রশ্ন, রিনাম্বার ON) ==");
  const allIds = parse.questions.map((q) => q.id);
  const out1 = buildShuffledXml(xmlText, parse.questions, [allIds, allIds], {
    renumber: true,
    includeSetHeader: true,
  });
  const out1Parse = parseDocxXml(out1);
  ok(out1Parse.questions.length === 120, `আউটপুটে ১২০ প্রশ্ন (২×৬০) [পেয়েছি ${out1Parse.questions.length}]`);
  ok(out1Parse.questions[0].serial === 1 && out1Parse.questions[59].serial === 60, `সেট A: সিরিয়াল ১..৬০ [প্রথম=${out1Parse.questions[0].serial}, শেষ=${out1Parse.questions[59].serial}]`);
  ok(out1Parse.questions[60].serial === 1 && out1Parse.questions[119].serial === 60, "সেট B: সিরিয়াল ১..৬০ (আবার শুরু)");
  ok(out1Parse.questions[60].paras[0].startsWith("1.\t"), "সেট B প্রথম প্যারা '1.<tab>' দিয়ে শুরু");
  ok(countNS(out1, M_NS, "oMath") === srcOMath * 2, `ইকুয়েশন অক্ষত: ${srcOMath}×২ = ${countNS(out1, M_NS, "oMath")}`);
  ok(countRunTabsIn(out1) === srcTabs * 2, `ট্যাব অক্ষত: ${srcTabs}×২ = ${countRunTabsIn(out1)}`);
  ok(countNS(out1, W_NS, "vertAlign") === srcVert * 2, `sub/superscript অক্ষত: ${srcVert}×২ = ${countNS(out1, W_NS, "vertAlign")}`);
  ok((out1.match(/<w:br w:type="page"/g) || []).length === 1, "১টি পেজ-ব্রেক (সেট A ও B এর মাঝে)");
  ok(out1.includes(">Set A<") && out1.includes(">Set B<"), "সেট হেডার 'Set A' / 'Set B' (English, Latin ফন্ট)");
  ok(out1Parse.questions[0].serialFontBijoy === true, "আউটপুটেও SutonnyMJ ফন্ট বজায়");
  ok(out1.lastIndexOf("<w:sectPr") > out1.lastIndexOf(">Set B<"), "sectPr একদম শেষে আছে");

  console.log("\n== ৪b) ফরম্যাট-প্রিজার্ভেশন (প্রশ্ন-ব্লকের বাইরের কনটেন্ট) ==");
  // রিয়েল ফিক্সচার: প্রি-কনটেন্ট ("A"+"PHYSICS") একবার + সেকশন-গ্যাপ ("B".."F"+"PHYSICS") প্রশ্নের সাথে
  const physCount = (out1.match(/<w:t[^>]*>PHYSICS<\/w:t>/g) || []).length;
  ok(physCount === 11, `PHYSICS হেডার প্রিজার্ভ: প্রি-১ + গ্যাপ ৫×২ সেট = ১১ [পেয়েছি ${physCount}]`);
  ok(out1Parse.separators.includes("A") && out1Parse.separators.includes("B"), "A/B সেপারেটর-প্যারাও আউটপুটে থাকে");
  // সেট-হেডার এখন ডকুমেন্টের নিজের ফন্ট-ফ্যামিলিতে
  const srcDoc = new DOMParser().parseFromString(xmlText, "application/xml");
  let srcAscii = "";
  for (const rf of Array.from(srcDoc.getElementsByTagNameNS(W_NS, "rFonts"))) {
    const a = rf.getAttribute("w:ascii") ?? "";
    if (a) { srcAscii = a; break; }
  }
  const outDoc = new DOMParser().parseFromString(out1, "application/xml");
  let headerFontAscii = "";
  for (const t of Array.from(outDoc.getElementsByTagNameNS(W_NS, "t"))) {
    if (t.textContent === "Set A") {
      const r = t.parentNode as Element;
      const rf = r.getElementsByTagNameNS(W_NS, "rFonts");
      if (rf.length) headerFontAscii = rf[0].getAttribute("w:ascii") ?? "";
      break;
    }
  }
  ok(headerFontAscii === "Arial", `সেট-হেডার Latin ফন্টে (Arial) — "Set A" বাংলা গিববেরিশ হবে না [পেয়েছি "${headerFontAscii}"]`);

  console.log("\n== ৫) শাফল্ড এক্সপোর্ট (রিনাম্বার OFF — আসল নম্বর) ==");
  const out2 = buildShuffledXml(xmlText, parse.questions, [allIds, allIds], {
    renumber: false,
    includeSetHeader: true,
  });
  const out2Parse = parseDocxXml(out2);
  ok(out2Parse.questions[0].serial === 32 && out2Parse.questions[60].serial === 32, "আসল সিরিয়াল (32) দুই সেটেই বজায়");
  ok(out2Parse.questions[9].serial === 5, "আসল মেসি সিরিয়ালও বজায়");

  console.log("\n== ৬) সিরিয়াল-ফিক্স এক্সপোর্ট (অরিজিনাল অর্ডার, ১..N) ==");
  const out3 = buildShuffledXml(xmlText, parse.questions, [allIds], {
    renumber: true,
    includeSetHeader: false,
  });
  const out3Parse = parseDocxXml(out3);
  ok(out3Parse.questions.length === 60, "৬০ প্রশ্ন একই অর্ডারে");
  ok(out3Parse.questions.every((q, i) => q.serial === i + 1), "সিরিয়াল ১..৬০ পরপর");
  ok(!out3.includes(">Set A<") && (out3.match(/<w:br w:type="page"/g) || []).length === 0, "কোনো সেট-হেডার/পেজ-ব্রেক নেই");
  ok(!/[\u0980-\u09FF]/.test(out3), "এখানেও Unicode নেই");
  ok(
    JSON.stringify(out3Parse.separators) === JSON.stringify(parse.separators),
    "সিরিয়াল-ফিক্স: সেপারেটর-ক্রম অরিজিনাল ডকুমেন্টের হুবহু (ফরম্যাট-প্রিজার্ভ)"
  );

  console.log("\n== ৭) ZIP রাউন্ডট্রিপ (Word ফাইল হিসেবে বৈধ) ==");
  const zipOut = await JSZip.loadAsync(buf);
  zipOut.file("word/document.xml", out1);
  const blob = await zipOut.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
  const rezip = await JSZip.loadAsync(blob);
  const reXml = rezip.file("word/document.xml")!.async("string") as unknown as Promise<string>;
  const reParsed = parseDocxXml(await reXml);
  ok(reParsed.questions.length === 120, "রাউন্ডট্রিপের পরেও ১২০ প্রশ্ন");
  ok(reParsed.questions[60].paras[0].startsWith("1.\t"), "রাউন্ডট্রিপেও রিনাম্বার বজায়");
  ok(typeof englishSetName(0) === "string" && englishSetName(0) === "Set A", "সেট নেমিং: Set A");
}

console.log("\n== ৮) সিরিয়াল-সিলিং ইউনিফাই (MAX_SERIAL_NUMBER=9999) — সিনথেটিক XML ==");
{
  // সিনথেটিক docx XML ফিক্সচার (test-color-serial.ts-এর প্যাটার্নে) —
  // আগে isQuestionStart num > 5000 হলে প্রশ্ন-স্টার্ট হত না; এখন 9999 পর্যন্ত (Task 21-a)
  const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
  const p = (text: string) =>
    `<w:p xmlns:w="${W}"><w:r><w:t xml:space="preserve">${text}</w:t></w:r></w:p>`;
  const docXml = (body: string) =>
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="${W}"><w:body>${body}<w:sectPr/></w:body></w:document>`;

  // টিয়ার-২ (পরের প্যারা অপশন-লেড): সিরিয়াল ৬০০০ এখন প্রশ্ন-স্টার্ট
  const r6000 = parseDocxXml(docXml(p("6000. সিরিয়াল ৬০০০-এর প্রশ্ন") + p("ক. উত্তর-এক") + p("খ. উত্তর-দুই")));
  ok(r6000.questions.length === 1 && r6000.questions[0].serial === 6000, `সিরিয়াল 6000 প্রশ্ন-স্টার্ট ধরা হয়েছে (আগে 5000-সিলিং আটকাত) [পেয়েছি ${r6000.questions.length}]`);
  ok(r6000.questions[0].options.length === 2, "সিরিয়াল-৬০০০ প্রশ্নের অপশনও ডিটেক্ট");

  // সিলিং-বাউন্ডারি: ৪-ডিজিট রেঞ্জের শেষ মান 9999
  const r9999 = parseDocxXml(docXml(p("9999. শেষ সিরিয়ালের প্রশ্ন") + p("ক. উত্তর")));
  ok(r9999.questions.length === 1 && r9999.questions[0].serial === 9999, "সিলিং-বাউন্ডারি 9999 প্রশ্ন-স্টার্ট");

  // টিয়ার-১ (রান-ট্যাব): "6001.<tab>প্রশ্ন" — বড় সিরিয়ালেও ট্যাব-ফরম্যাট কাজ করে
  const tabP =
    `<w:p xmlns:w="${W}"><w:r><w:t xml:space="preserve">6001.</w:t></w:r>` +
    `<w:r><w:tab/></w:r><w:r><w:t xml:space="preserve">ট্যাব-সহ প্রশ্ন</w:t></w:r></w:p>`;
  const rTab = parseDocxXml(docXml(tabP));
  ok(rTab.questions.length === 1 && rTab.questions[0].serial === 6001, "টিয়ার-১ (রান-ট্যাব): সিরিয়াল 6001 প্রশ্ন-স্টার্ট");

  // টিয়ার-৩ ডেসিমাল-গার্ড অপরিবর্তিত (num ≤ 999): ট্যাব/অপশন-লেড ছাড়া 2000 প্রশ্ন নয়
  const rTier3 = parseDocxXml(docXml(p("2000. ডেসিমাল-গার্ডের শিকার") + p("সাধারণ কনটিনিউয়েশন লাইন")));
  ok(rTier3.questions.length === 0, "টিয়ার-৩ ডেসিমাল-গার্ড অপরিবর্তিত: 2000 (ট্যাব/অপশন-লেড ছাড়া, >999) প্রশ্ন নয়");
}

console.log("\n== ১০) repeat-লেবেল টাইপো (Physics Q27-কেস: K, L, L, N) — ৪ অপশনই গোনা হয় ==");
{
  const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
  const p = (text: string) =>
    `<w:p xmlns:w="${W}"><w:r><w:t xml:space="preserve">${text}</w:t></w:r></w:p>`;
  const docXml = (body: string) =>
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="${W}"><w:body>${body}<w:sectPr/></w:body></w:document>`;

  // ফাইলের টাইপো: "L. 100 mm" (৩য় অপশন) আসলে M-এর জায়গায়
  const typo = docXml(
    p("27.\tপ্রশ্ন-টেক্সট") +
      p("\tK. 0.01 mm\tL. 0.001 cm") +
      p("\tL. 100 mm\tN. A I B \tDt N")
  );
  const rTypo = parseDocxXml(typo);
  ok(rTypo.questions.length === 1, `repeat-টাইপো: ১ প্রশ্ন [পেয়েছি ${rTypo.questions.length}]`);
  ok(rTypo.questions[0].options.length === 4, `repeat-টাইপো: ৪ অপশনই গোনা [পেয়েছি ${rTypo.questions[0].options.length}]`);
  ok(rTypo.questions[0].options[2].label === "L", "৩য় অপশনের আসল লেবেল L-ই থাকে");
  ok(rTypo.questions[0].answer === "N", `উত্তর N [পেয়েছি ${rTypo.questions[0].answer}]`);
}

console.log("\n== ১১) repeat-টাইপো redownload-পার্সেও (scanOptions শেয়ার্ড) ==");
{
  const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
  const p = (text: string) =>
    `<w:p xmlns:w="${W}"><w:r><w:t xml:space="preserve">${text}</w:t></w:r></w:p>`;
  const docXml = (body: string) =>
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="${W}"><w:body>${body}<w:sectPr/></w:body></w:document>`;
  const { parseRedownloadXml } = await import("../src/lib/mcq/redownload");
  const typo = docXml(
    p("27.\tপ্রশ্ন-টেক্সট") +
      p("\tK. 0.01 mm\tL. 0.001 cm") +
      p("\tL. 100 mm\tN. A I B \tDt N")
  );
  const rTypo = parseRedownloadXml(typo);
  ok(rTypo.questions.length === 1, `RD repeat-টাইপো: ১ প্রশ্ন [পেয়েছি ${rTypo.questions.length}]`);
  ok(rTypo.questions[0].options.length === 4, `RD repeat-টাইপো: ৪ অপশন [পেয়েছি ${rTypo.questions[0].options.length}]`);
}

console.log("\n== ১২) সিনথেটিক: টাইটেল (প্রি) + সমাপ্তি-লাইন (পোস্ট) প্রিজার্ভ ==");
{
  const W12 = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
  const p12 = (text: string) =>
    `<w:p xmlns:w="${W12}"><w:r><w:t xml:space="preserve">${text}</w:t></w:r></w:p>`;
  const docXml12 = (body: string) =>
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="${W12}"><w:body>${body}<w:sectPr/></w:body></w:document>`;

  // টাইটেল (separator-শ্রেণি) + ২ প্রশ্ন (MCQ-শর্ত: ৪ অপশন-মার্কার) + শেষে "END" সমাপ্তি-লাইন (separator → ব্লক-বাইরে)
  const syn = docXml12(
    p12("MADRASAH BOARD 2024") +
      p12("১. প্রথম প্রশ্ন") + p12("ক) এক") + p12("খ) দুই") + p12("গ) তিন") + p12("ঘ) চার") +
      p12("২. দ্বিতীয় প্রশ্ন") + p12("ক) পাঁচ") + p12("খ) ছয়") + p12("গ) সাত") + p12("ঘ) আট") +
      p12("END")
  );
  const synParse = parseDocxXml(syn);
  ok(synParse.questions.length === 2, `সিনথেটিক: ২ প্রশ্ন [পেয়েছি ${synParse.questions.length}]`);
  // উল্টো ক্রমে ১ সেট — শুধু প্রশ্ন শাফল হয়, টাইটেল/সমাপ্তি জায়গায় থাকে
  const synOut = buildShuffledXml(
    syn,
    synParse.questions,
    [[synParse.questions[1].id, synParse.questions[0].id]],
    { renumber: true, includeSetHeader: false }
  );
  ok(synOut.includes(">MADRASAH BOARD 2024<"), "টাইটেল (প্রি-কনটেন্ট) আউটপুটে আছে");
  ok(synOut.includes(">END<"), "সমাপ্তি-লাইন (পোস্ট-কনটেন্ট) আউটপুটে আছে");
  const tPos = synOut.indexOf("MADRASAH BOARD 2024");
  const qPos = synOut.indexOf("দ্বিতীয় প্রশ্ন");
  const ePos = synOut.indexOf(">END<");
  ok(tPos >= 0 && tPos < qPos && qPos < ePos, "ক্রম অক্ষত: টাইটেল → প্রশ্ন → সমাপ্তি");
  const synReParse = parseDocxXml(synOut);
  ok(synReParse.questions.length === 2 && synReParse.questions[0].serial === 1, "শাফলের পরেও ২ প্রশ্ন, সিরিয়াল ১..২");
}

console.log("\n== ১৭) Shuffle: non-question paragraphs stay put (Phase 1.1 fix) ==");
{
  // উল্টো ক্রমের সেট — প্রশ্নের ক্রম সত্যিই বদলেছে, তাই গ্যাপ-কনটেন্ট পিন হবে
  const allRevIds = parse.questions.map((q) => q.id);
  const revIds = [...allRevIds].reverse();
  const outRev = buildShuffledXml(xmlText, parse.questions, [revIds], {
    renumber: false,
    includeSetHeader: false,
  });
  const revParse = parseDocxXml(outRev);
  const physRe = /<w:t[^>]*>PHYSICS<\/w:t>/g;
  let physCount = 0;
  let m: RegExpExecArray | null;
  while ((m = physRe.exec(outRev))) {
    physCount++;
  }
  ok(
    physCount === 6,
    `শাফল-অর্ডারে PHYSICS হেডার ৬ বার (প্রি-১ + পিন-৫ — প্রতি প্রশ্নে আটকে যায় না) [পেয়েছি ${physCount}]`
  );
  ok(revParse.questions.length === 60, `উল্টো ক্রমেও ৬০ প্রশ্ন [পেয়েছি ${revParse.questions.length}]`);
  ok(
    JSON.stringify(revParse.separators) === JSON.stringify(parse.separators),
    "শাফল-অর্ডারেও সেপারেটর-ক্রম ডকুমেন্টের হুবহু (হেডার নিজের ক্রমে থাকে)"
  );
  // DOM-ভিত্তিক যাচাই (স্ট্রিং-indexOf নয় — মাল্টি-রান প্যারায় টেক্সট ভাঙা থাকে)
  const revDom = new DOMParser().parseFromString(outRev, "application/xml");
  const revKids = Array.from(revDom.getElementsByTagNameNS(W_NS, "body")[0].children);
  const physIdxs: number[] = [];
  revKids.forEach((el, i) => {
    if (el.localName === "p" && (el.textContent ?? "").includes("PHYSICS")) physIdxs.push(i);
  });
  const firstQStart = Math.min(...revParse.questions.map((q) => q.blockStart));
  ok(
    physIdxs.length === 6 && physIdxs.every((i) => i < firstQStart),
    `৬টি হেডারই প্রথম প্রশ্ন-ব্লকের বাইরে, আগে [headers=${JSON.stringify(physIdxs)}, firstQ=${firstQStart}]`
  );
  // ক্রম না বদলালে (সিরিয়াল-ফিক্স পাথ) লেআউট হুবহু আগের মতোই — ৬ = প্রি-১ + গ্যাপ-৫
  const sameOrder = buildShuffledXml(xmlText, parse.questions, [allRevIds], {
    renumber: true,
    includeSetHeader: false,
  });
  const samePhys = (sameOrder.match(/<w:t[^>]*>PHYSICS<\/w:t>/g) || []).length;
  ok(samePhys === 6, `ক্রম অপরিবর্তিত থাকলে হেডার নিজের জায়গাতেই (PHYSICS ৬ বার) [পেয়েছি ${samePhys}]`);
}

console.log("\n== ১৮) Phase 1.1 repro: name-headers outside the pattern list ==");
{
  const p14 = (text: string) =>
    `<w:p xmlns:w="${W_NS}"><w:r><w:t xml:space="preserve">${text}</w:t></w:r></w:p>`;
  const doc14 = (body: string) =>
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="${W_NS}"><w:body>${body}<w:sectPr/></w:body></w:document>`;
  // প্রি-কনটেন্ট + দুই বিষয়ের দুই হেডার ("Part A/B" — NON_MCQ_RES-এর বাইরে) + ২ প্রশ্ন
  const xml14 = doc14(
    p14("INSTITUTE OF SCIENCE") +
      p14("Part A - Physics") +
      p14("১. একটি বস্তুর ভর") + p14("ক) এক") + p14("খ) দুই") + p14("গ) তিন") + p14("ঘ) চার") +
      p14(" ") + // ফাঁকা স্পেসার — প্রশ্নের সাথেই চলে
      p14("Part B - Chemistry") +
      p14("২. রাসায়নিক বিক্রিয়া") + p14("ক) পাঁচ") + p14("খ) ছয়") + p14("গ) সাত") + p14("ঘ) আট")
  );
  const parse14 = parseDocxXml(xml14);
  ok(parse14.questions.length === 2, `১৮: ২ প্রশ্ন [পেয়েছি ${parse14.questions.length}]`);
  // উল্টো ক্রম (২ আগে, ১ পরে) — শাফলের পর হেডার কার গায়ে বসে দেখার কেস
  const out14 = buildShuffledXml(xml14, parse14.questions, [[1, 0]], {
    renumber: false,
    includeSetHeader: false,
  });
  const aCount = (out14.match(/Part A - Physics/g) || []).length;
  const bCount = (out14.match(/Part B - Chemistry/g) || []).length;
  ok(aCount === 1 && bCount === 1, `১৮: হেডার ঠিক একবার করে [A=${aCount}, B=${bCount}]`);
  const posA = out14.indexOf("Part A - Physics");
  const posB = out14.indexOf("Part B - Chemistry");
  const qChem = out14.indexOf("রাসায়নিক বিক্রিয়া");
  const qPhys = out14.indexOf("একটি বস্তুর ভর");
  ok(posA >= 0 && posA < posB, "১৮: হেডারের নিজস্ব ক্রম অক্ষত (A → B)");
  ok(
    Math.max(posA, posB) < Math.min(qChem, qPhys),
    "১৪: দুই হেডারই সব প্রশ্নের আগে — কোনো প্রশ্নের গায়ে আটকায়নি (আগে 'Part A - Physics' Chemistry প্রশ্নের আগে বসত)"
  );
  ok(qChem < qPhys, "১৮: প্রশ্নের ক্রম সত্যিই বদলেছে (Chemistry আগে, Physics পরে)");
  ok(
    (out14.match(/xml:space="preserve"> <\/w:t>/g) || []).length === 1,
    "১৪: খালি স্পেসার-প্যারা অক্ষত (একবার) — শুধু স্পেসিং প্রশ্নের সাথে চলে"
  );
  ok(parseDocxXml(out14).questions.length === 2, "১৮: আউটপুট পার্সে ২ প্রশ্ন (স্ট্রাকচার বৈধ)");
  // ক্রম না বদলালে হেডার নিজের জায়গাতেই (লেআউট byte-প্রায় অভিন্ন)
  const out14b = buildShuffledXml(xml14, parse14.questions, [[0, 1]], {
    renumber: false,
    includeSetHeader: false,
  });
  const b2A = out14b.indexOf("Part A - Physics");
  const b2B = out14b.indexOf("Part B - Chemistry");
  const b2q1 = out14b.indexOf("একটি বস্তুর ভর");
  const b2q2 = out14b.indexOf("রাসায়নিক বিক্রিয়া");
  ok(
    b2A < b2q1 && b2q1 < b2B && b2B < b2q2,
    "১৮: ক্রম অপরিবর্তিত থাকলে লেআউট আগের মতোই (হেডার নিজের জায়গায়)"
  );
}
console.log("\n== ১৯) Word টেবিল (<w:tbl>) — পার্স + শাফল + রিডাউনলোডে অক্ষত (Phase 5.2) ==");
{
  const P = (t: string) => `<w:p><w:r><w:t xml:space="preserve">${t}</w:t></w:r></w:p>`;
  const TBL =
    `<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/></w:tblPr>` +
    `<w:tr><w:tc><w:p><w:r><w:t>টেবিল-ডেটা: ঘনত্ব ১.২</w:t></w:r></w:p></w:tc></w:tr></w:tbl>`;
  const doc = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>` +
    P("১. প্রথম প্রশ্ন কী?") + P("ক) এক") + P("খ) দুই") + P("গ) তিন") + P("ঘ) চার") +
    P("উত্তর: ক") + P("ব্যাখ্যা: প্রথম প্রশ্নের ব্যাখ্যা।") + TBL +
    P("২. দ্বিতীয় প্রশ্ন কী?") + P("ক) এক") + P("খ) দুই") + P("গ) তিন") + P("ঘ) চার") +
    P("উত্তর: খ") + `<w:sectPr/></w:body></w:document>`;

  // ① পার্স — টেবিল প্রশ্ন-১-এর ব্লকে থাকে
  const tp = parseDocxXml(doc);
  ok(tp.questions.length === 2, `১৯: ২ প্রশ্ন (পেয়েছি ${tp.questions.length})`);
  const tdom = new DOMParser().parseFromString(doc, "application/xml");
  const tkids = Array.from(tdom.getElementsByTagNameNS(W_NS, "body")[0].children);
  const tblIdx = tkids.findIndex((el) => el.localName === "tbl");
  const tq1 = tp.questions[0];
  ok(
    tblIdx >= 0 && tblIdx >= tq1.blockStart && tblIdx <= tq1.blockEnd,
    `১৯: পার্সে টেবিল প্রশ্ন-১-এর ব্লকে [tbl=${tblIdx}, block=${tq1.blockStart}..${tq1.blockEnd}]`
  );

  // ② শাফল (উল্টো ক্রম) — টেবিল টিকে থাকে, নিজের প্রশ্নের (রিনাম্বার-পরবর্তী ২.) সাথেই থাকে
  const outT = buildShuffledXml(doc, tp.questions, [[1, 0]], { renumber: true, includeSetHeader: false });
  const odoc = new DOMParser().parseFromString(outT, "application/xml");
  const okids = Array.from(odoc.getElementsByTagNameNS(W_NS, "body")[0].children);
  ok(
    okids.filter((el) => el.localName === "tbl").length === 1,
    "১৯: শাফলের পরেও টেবিল ঠিক ১টি"
  );
  const oTblIdx = okids.findIndex((el) => el.localName === "tbl");
  const otexts = okids.map((el) => (el.localName === "sectPr" ? "" : extractParaText(el)));
  // উল্টো ক্রমে Q1 দ্বিতীয় ("২." রিনাম্বার) — টেবিল তার নিজের ব্যাখ্যার ঠিক পরেই থাকবে
  ok(
    oTblIdx > 0 && otexts[oTblIdx - 1].includes("প্রথম প্রশ্নের ব্যাখ্যা"),
    `১৯: শাফলে টেবিল নিজের প্রশ্নের ব্যাখ্যার সাথেই আছে [tbl=${oTblIdx}, prev="${(otexts[oTblIdx - 1] || "").trim().slice(0, 30)}"]`
  );
  const rp = parseDocxXml(outT);
  ok(rp.questions.length === 2, `১৯: শাফল-আউটপুট আবার পার্সেও ২ প্রশ্ন (পেয়েছি ${rp.questions.length})`);

  // ③ রিডাউনলোড ইঞ্জিন — পার্সে টেবিল ব্লকে, বিল্ডে টেবিল অক্ষত
  const { parseRedownloadXml, buildRedownloadXml, DEFAULT_PART_SELECTION } = await import(
    "../src/lib/mcq/redownload"
  );
  const rdp = parseRedownloadXml(doc);
  ok(
    rdp.questions.length === 2 && rdp.blockIndex[tblIdx] === rdp.questions[0].id,
    `১৯: রিডাউনলোড-পার্সে টেবিল প্রশ্ন-১-এর ব্লকে [blockIndex=${rdp.blockIndex[tblIdx]}]`
  );
  const rdOut = buildRedownloadXml(doc, rdp, rdp.questions.map((q) => q.id), {
    partSel: { ...DEFAULT_PART_SELECTION, bekkha: true },
    renumber: false,
    expandAnswer: false,
  });
  ok(
    (rdOut.match(/<w:tbl[\s>]/g) ?? []).length === 1,
    "১৯: রিডাউনলোড-আউটপুটে টেবিল অক্ষত"
  );

  // ④ প্রিভিউ-গ্রিড — দুই ইঞ্জিনেই প্রশ্ন-১-এর tables-এ ১×১ গ্রিড + সেল-টেক্সট
  ok(
    tp.questions[0].tables.length === 1 &&
      tp.questions[0].tables[0].rows.length === 1 &&
      tp.questions[0].tables[0].rows[0].length === 1 &&
      tp.questions[0].tables[0].rows[0][0].text.includes("ঘনত্ব"),
    "১৯: শাফল-পার্স tables গ্রিডে সেল-টেক্সট"
  );
  ok(
    tp.questions[1].tables.length === 0,
    "১৯: টেবিল-বিহীন প্রশ্নে tables খালি"
  );
  ok(
    rdp.questions[0].tables.length === 1 &&
      rdp.questions[0].tables[0].rows[0][0].text.includes("ঘনত্ব"),
    "১৯: রিডাউনলোড-পার্স tables গ্রিডে সেল-টেক্সট"
  );
}
console.log(`\n========================================`);
console.log(`\n========================================`);
console.log(`ফলাফল: ${passed} পাস, ${failed} ফেল`);
console.log(`========================================\n`);
if (failed > 0) process.exit(1);
