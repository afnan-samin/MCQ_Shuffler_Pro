// ============================================================
// ফন্ট-রিম্যাপ ইঞ্জিন টেস্ট (Task 41)
// classifyRunText + applyFontRemapXml + styles.xml রিম্যাপ —
// ইউনিট + সিনথেটিক ৭২০-রান ফিক্সচার + আসল Bijoy docx ইন্টিগ্রেশন
// রান: bun run scripts/test-font-remap.ts
// ============================================================
import { existsSync, readFileSync } from "node:fs";
import { JSDOM } from "jsdom";
import JSZip from "jszip";

const dom = new JSDOM("<!doctype html><html><body></body></html>");
(globalThis as unknown as Record<string, unknown>).DOMParser = dom.window.DOMParser;

const {
  classifyRunText,
  applyFontRemapXml,
  applyFontRemapStylesXml,
  applyFontRemap,
  FONT_CHOICES,
  DEFAULT_FONT_REMAP_SETTINGS,
} = await import("../src/lib/mcq/font-remap");
type FontRemapSettings = import("../src/lib/mcq/font-remap").FontRemapSettings;

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
function countStr(hay: string, needle: string): number {
  let n = 0;
  let i = hay.indexOf(needle);
  while (i !== -1) {
    n++;
    i = hay.indexOf(needle, i + needle.length);
  }
  return n;
}
function collectTInner(xml: string): string[] {
  const out: string[] = [];
  for (const m of xml.matchAll(/<w:t(?:\s[^>]*)?(\/>|>([\s\S]*?)<\/w:t>)/g)) {
    if (m[2] !== undefined) out.push(m[2]);
  }
  return out;
}
function scanRunInners(xml: string): string[] {
  // টেস্টের নিজস্ব রান-স্ক্যান (lib-এর সাথে স্বাধীন যাচাই)
  const out: string[] = [];
  for (const m of xml.matchAll(/<w:r(?:\s[^>]*)?>|<w:r\/>/g)) {
    if (m[0].endsWith("/>")) continue;
    const start = (m.index ?? 0) + m[0].length;
    const end = xml.indexOf("</w:r>", start);
    if (end !== -1) out.push(xml.slice(start, end));
  }
  return out;
}
function decodeEntities(s: string): string {
  return s
    .replace(/&#x([0-9A-Fa-f]+);/g, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(parseInt(d, 10)));
}
function wellFormed(xml: string): boolean {
  const doc = new dom.window.DOMParser().parseFromString(xml, "application/xml");
  return doc.getElementsByTagName("parsererror").length === 0;
}

// টেস্ট-সেটিংস: ডিফল্ট থেকে আলাদা ফন্ট-নাম (leftover-যাচাই অর্থবহ করতে)
const S: FontRemapSettings = {
  englishFont: "Arial",
  bijoyFont: "Shibly",
  unicodeFont: "SolaimanLipi",
  enabled: true,
};
const W_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
function wrapDoc(inner: string): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:document xmlns:w="${W_NS}"><w:body>${inner}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/></w:sectPr></w:body></w:document>`;
}

// ---------- ১. classifyRunText ----------

console.log("\n── classifyRunText — ইউনিকোড বাংলা ──");
const uniCases = [
  "বাংলা",
  "প্রশ্নের সঠিক উত্তর কোনটি?",
  "১২৩৪৫",
  "ক. ঢাকা বোর্ড ২০১৭",
  "অর্থনীতি।",
  "স্বাধীনতা যুদ্ধের ইতিহাস",
];
for (const c of uniCases) {
  ok(classifyRunText(c) === "unicode-bengali", `ইউনিকোড: "${c.slice(0, 16)}"`);
}

console.log("\n── classifyRunText — Bijoy/ANSI ──");
const bijoyCases = [
  "Avgvi wbd‡ïhv",
  "e¨vL¨v:",
  "evsjv`k",
  "cÖwZwfwU wek¦",
  "†KvbwU wbDUbxq ev wPivqZ ejwe`¨vq AcwieZ©bxq bq?",
  "wefxK ø«-«ˆ",
  "DËi wj‡L",
  "ÕõÜ§¶",
  "¯'vb n‡jv",
];
for (const c of bijoyCases) {
  ok(classifyRunText(c) === "bijoy", `বিজয়: "${c.slice(0, 16)}"`);
}

console.log("\n── classifyRunText — ল্যাটিন/নিরপেক্ষ ──");
const latinCases = [
  "Which one is correct?",
  "Dhaka Board 2017",
  "Physics 1st Paper",
  "12.5",
  "10 + 5 = 15",
  "K. L. M. N.",
  "",
  "   ",
  "(a) (b) (c)",
  "™", // weak-মার্কার একা + অক্ষর নেই → latin
  "10 × 5", // weak × একা, অক্ষর নেই → latin
];
for (const c of latinCases) {
  ok(classifyRunText(c) === "latin", `ল্যাটিন: "${c === "" ? "(খালি)" : c.slice(0, 16)}"`);
}

console.log("\n── classifyRunText — মিশ্র প্রাধান্য ──");
ok(classifyRunText("বাংলা লেখা Avgvi †KvW") === "unicode-bengali", "মিশ্র: বাংলা-প্রাধান্য → unicode-bengali");
ok(classifyRunText("e¨vL¨v: 'Hamlet' bvUKwUi Kvwnwbi ¯'vb n‡jv †WbgvK©| mv‡j া") === "bijoy", "মিশ্র: Bijoy-প্রাধান্য → bijoy");
ok(classifyRunText("Õা") === "bijoy", "মিশ্র: টাই (১:১) → bijoy");
ok(classifyRunText("প্রশ্ন †_‡K †hgb") === "unicode-bengali", "মিশ্র: বাংলা>মার্কার → unicode-bengali");

console.log("\n── classifyRunText — dominant হিন্ট ──");
ok(classifyRunText("wefxK", "bijoy") === "bijoy", "হিন্ট bijoy: খাঁটি-ASCII Bijoy শব্দ → bijoy");
ok(classifyRunText("12.5", "bijoy") === "latin", "হিন্ট bijoy: সংখ্যা থেকে যায় latin");
ok(classifyRunText("Physics", null) === "latin", "হিন্ট null: ASCII → latin");

// ---------- ২. applyFontRemapXml — ইউনিট ----------

console.log("\n── applyFontRemapXml — রান-লেভেল ইউনিট ──");
const unitDoc = wrapDoc(
  `<w:p>` +
    `<w:r><w:rPr><w:rFonts w:ascii="OldFont" w:hAnsi="OldFont" w:cs="OldFont" w:eastAsia="OldFont"/></w:rPr><w:t>Avgvi †Kvb</w:t></w:r>` +
    `<w:r><w:t xml:space="preserve">বাংলা লেখা </w:t></w:r>` +
    `<w:r><w:rPr><w:i/></w:rPr><w:t>Which is correct?</w:t></w:r>` +
    `</w:p>`
);
const unitOut = applyFontRemapXml(unitDoc, S);

ok(countStr(unitOut, "OldFont") === 0, "পুরনো ফন্ট-নাম সম্পূর্ণ বদলেছে");
ok(
  unitOut.includes(`<w:rFonts w:ascii="Shibly" w:hAnsi="Shibly" w:eastAsia="Shibly" w:cs="Shibly"/>`),
  "বিদ্যমান rFonts-এ ৪টি অ্যাট্রিবিউটই ক্যানোনিকেল আকারে বসেছে"
);
ok(unitOut.includes(`<w:r><w:rPr><w:rFonts w:ascii="SolaimanLipi"`, ), "rPr-হীন রানে rPr FIRST child হিসেবে তৈরি");
ok(countStr(unitOut, "<w:rPr>") === 3 && countStr(unitOut, "</w:rPr>") === 3, "প্রতি রানে ঠিক ১টি rPr");
ok(
  unitOut.includes(`<w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:eastAsia="Arial" w:cs="Arial"/><w:i/>`),
  "rPr আছে-rFonts নেই → rFonts rPr-এর প্রথম child (w:i-এর আগে)"
);
ok(
  unitOut.includes(`<w:t xml:space="preserve">বাংলা লেখা </w:t>`),
  "xml:space=\"preserve\" + w:t-কনটেন্ট অক্ষত"
);
ok(unitOut.includes(`w:ascii="Shibly"`), "রান-১ (Bijoy) → bijoyFont");
ok(unitOut.includes(`w:ascii="SolaimanLipi"`), "রান-২ (বাংলা) → unicodeFont");
ok(unitOut.includes(`w:ascii="Arial"`), "রান-৩ (English) → englishFont");
ok(unitOut.includes(`<w:sectPr><w:pgSz w:w="11906" w:h="16838"/></w:sectPr>`), "রান-বাইরের XML (sectPr) বাইট-অক্ষত");

{
  const textsBefore = collectTInner(unitDoc).join("\u0001");
  const textsAfter = collectTInner(unitOut).join("\u0001");
  ok(textsBefore === textsAfter, "সব w:t কনটেন্ট অপরিবর্তিত");
}

console.log("\n── applyFontRemapXml — এজ-কেস ──");
{
  const doc = wrapDoc(`<w:p><w:hyperlink w:anchor="h1"><w:r><w:t>Avgvi †Kvb</w:t></w:r></w:hyperlink></w:p>`);
  const out = applyFontRemapXml(doc, S);
  ok(out.includes(`<w:hyperlink w:anchor="h1">`) && out.includes(`w:ascii="Shibly"`), "hyperlink-এর ভেতরের রানও রিম্যাপ হয়");
}
{
  const doc = wrapDoc(`<w:p><w:r/><w:r><w:t>Avgvi †K</w:t></w:r></w:p>`);
  const out = applyFontRemapXml(doc, S);
  ok(out.includes(`<w:p><w:r/><w:r>`), "self-closing <w:r/> বাইট-অক্ষত");
}
{
  const tabRun = `<w:r w:rsidRPr="009F708A"><w:rPr><w:rFonts w:ascii="SutonnyMJ" w:hAnsi="SutonnyMJ"/></w:rPr><w:tab/></w:r>`;
  const doc = wrapDoc(`<w:p>${tabRun}<w:r><w:t>Avgvi †K</w:t></w:r></w:p>`);
  const out = applyFontRemapXml(doc, S);
  ok(out.includes(tabRun), "w:t-হীন রান (w:tab) অস্পৃশ্য");
}
{
  const doc = wrapDoc(
    `<w:p><w:r><w:rPr><w:rFonts w:asciiTheme="minorHAnsi" w:hAnsiTheme="minorHAnsi" w:cstheme="minorBidi" w:hint="eastAsia"/></w:rPr><w:t>Avgvi †K</w:t></w:r></w:p>`
  );
  const out = applyFontRemapXml(doc, S);
  ok(!out.includes("Theme"), "থিম-অ্যাট্রিবিউট (asciiTheme/cstheme…) সরানো হয়েছে");
  ok(out.includes(`w:hint="eastAsia"`), "অ-ফন্ট অ্যাট্রিবিউট (w:hint) রক্ষা পায়");
  ok(out.includes(`w:ascii="Shibly"`) && out.includes(`w:cs="Shibly"`), "থিম-রFonts-এও ৪ অ্যাট্রিবিউট বসেছে");
}
{
  const doc = wrapDoc(`<w:p><w:r><w:rPr><w:rFonts w:ascii="OldFont" w:hAnsi="OldFont"></w:rFonts></w:rPr><w:t>Avgvi †K</w:t></w:r></w:p>`);
  const out = applyFontRemapXml(doc, S);
  ok(!out.includes("</w:rFonts>") && out.includes(`w:ascii="Shibly"`), "নন-সেলফ-ক্লোজিং rFonts-ও সঠিকভাবে বদলায়");
}
{
  const doc = wrapDoc(`<w:p><w:r><w:rPr><w:rStyle w:val="Emphasis"/><w:i/></w:rPr><w:t>Avgvi †K</w:t></w:r></w:p>`);
  const out = applyFontRemapXml(doc, S);
  ok(out.includes(`<w:rStyle w:val="Emphasis"/><w:rFonts w:ascii="Shibly"`), "rStyle থাকলে rFonts তার ঠিক পরে (স্কিমা-অর্ডার)");
}
{
  const doc = wrapDoc(`<w:p><w:r><w:t></w:t></w:r></w:p>`);
  const out = applyFontRemapXml(doc, S);
  ok(out.includes(`<w:rPr><w:rFonts w:ascii="Arial"`), "খালি <w:t/> রান → নির্ধারিত latin ফন্ট (ডিটারমিনিস্টিক)");
}
{
  const doc = wrapDoc(`<w:p><w:r><w:t>wefxK</w:t></w:r></w:p>`);
  ok(
    applyFontRemapXml(doc, S).includes(`w:ascii="Arial"`) &&
      applyFontRemapXml(doc, S, { dominant: "bijoy" }).includes(`w:ascii="Shibly"`),
    "dominant-হিন্ট: ছাড়া → latin, 'bijoy' দিলে → bijoyFont"
  );
}
{
  const doc = wrapDoc(`<w:p><w:r><w:t>Avgvi †K</w:t></w:r></w:p>`);
  const out = applyFontRemapXml(doc, { ...S, enabled: false });
  ok(out === doc, "enabled:false → বাইট-অপরিবর্তিত");
}
{
  const once = applyFontRemapXml(unitDoc, S);
  const twice = applyFontRemapXml(once, S);
  ok(once === twice, "idempotency: দুইবার চালালে বাইট-অভিন্ন");
  ok(wellFormed(once), "রিম্যাপ-পরবর্তী ইউনিট XML well-formed");
}

// ---------- ৩. applyFontRemapStylesXml ----------

console.log("\n── applyFontRemapStylesXml ──");
const stylesXml =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:styles xmlns:w="${W_NS}">` +
  `<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="SutonnyMJ" w:eastAsiaTheme="minorHAnsi" w:hAnsi="SutonnyMJ" w:cs="SutonnyMJ"/><w:sz w:val="24"/></w:rPr></w:rPrDefault></w:docDefaults>` +
  `<w:style w:type="paragraph" w:styleId="Normal"><w:name w:val="Normal"/><w:rPr><w:rFonts w:ascii="SutonnyMJLT" w:hAnsi="SutonnyMJLT" w:cs="Bijoy"/></w:rPr></w:style>` +
  `<w:style w:type="character" w:styleId="X"><w:name w:val="BijoyHeading"/><w:rPr><w:rFonts w:cs="sutonnymj" w:ascii="Shibly"/></w:rPr></w:style>` +
  `<w:style w:type="paragraph" w:styleId="TNR"><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/></w:rPr></w:style>` +
  `</w:styles>`;
{
  const out = applyFontRemapStylesXml(stylesXml, S);
  ok(countStr(out, "Shibly") === 8, `লিগ্যাসি ভ্যালু ৭টি + আগেই-থাকা ১টি = Shibly ×${countStr(out, "Shibly")} (প্রত্যাশা ৮)`);
  ok(!/w:(?:ascii|hAnsi|cs|eastAsia)="(?:Sutonny|Bijoy)/i.test(out), "কোনো ফন্ট-অ্যাট্রিবিউটে লিগ্যাসি নাম অবশিষ্ট নেই");
  ok(out.includes(`w:ascii="Times New Roman"`), "Times New Roman অস্পৃশ্য");
  ok(out.includes(`w:eastAsiaTheme="minorHAnsi"`), "থিম-অ্যাট্রিবিউট অস্পৃশ্য");
  ok(out.includes(`<w:name w:val="BijoyHeading"/>`), "w:name-এর 'BijoyHeading' অস্পৃশ্য (শুধু ফন্ট-অ্যাট্রিবিউট বদলায়)");
  ok(applyFontRemapStylesXml(out, S) === out, "styles: idempotent");
  ok(applyFontRemapStylesXml(stylesXml, { ...S, enabled: false }) === stylesXml, "styles: enabled:false → অপরিবর্তিত");
  const both = applyFontRemap({ documentXml: unitDoc, stylesXml }, S);
  ok(both.documentXml.includes("Shibly") && both.stylesXml!.includes("Shibly"), "applyFontRemap: document+styles একসাথে রিম্যাপ");
  ok(both.documentXml === applyFontRemapXml(unitDoc, S), "applyFontRemap ≡ applyFontRemapXml (document.xml)");
}

// ---------- ৪. সিনথেটিক ৭২০-রান ফিক্সচার ----------

console.log("\n── সিনথেটিক ফিক্সচার: ৭২০টি SutonnyMJ রান ──");
const BIJOY_POOL = [
  "Avgvi †Kvb wbd‡ïhv",
  "e¨vL¨v: wba‡ev`b cÖ_‡g †_‡K",
  "cÖwZwfwU cÖ‡qvRbiv n‡q _vKev",
  "wefxK ø«-«ˆ M«s †U‡jvK",
  "DËi wj‡L †Mvjb ev ¯'vb Ki",
  "Ggb A‡bK we‡kíi mv‡_ myweav",
];
function bijoyText(i: number): string {
  return `${BIJOY_POOL[i % BIJOY_POOL.length]} (${i + 1})`;
}
function fixtureRun(i: number): string {
  const t = `<w:t xml:space="preserve">${bijoyText(i)}</w:t>`;
  if (i % 5 === 0) return `<w:r>${t}</w:r>`; // rPr নেই
  if (i % 7 === 0) return `<w:r><w:rPr><w:b/><w:i/></w:rPr>${t}</w:r>`; // rPr আছে, rFonts নেই
  if (i % 11 === 0)
    return `<w:r><w:rPr><w:rFonts w:asciiTheme="minorHAnsi" w:hAnsiTheme="minorHAnsi" w:cstheme="minorBidi"/>${t}</w:rPr></w:r>`; // থিম-অ্যাট্রি
  return `<w:r><w:rPr><w:rFonts w:ascii="SutonnyMJ" w:hAnsi="SutonnyMJ" w:cs="SutonnyMJ"/>${t}</w:rPr></w:r>`;
}
const N_RUNS = 720;
const fixtureDoc = wrapDoc(`<w:p>${Array.from({ length: N_RUNS }, (_, i) => fixtureRun(i)).join("")}</w:p>`);
{
  const out = applyFontRemapXml(fixtureDoc, S);
  ok(countStr(out, `w:ascii="Shibly"`) === N_RUNS, `রিম্যাপ ১:১ — w:ascii="Shibly" × ${countStr(out, `w:ascii="Shibly"`)} / ${N_RUNS}`);
  ok(countStr(out, `w:hAnsi="Shibly"`) === N_RUNS, `w:hAnsi="Shibly" × ${N_RUNS}`);
  ok(countStr(out, `w:cs="Shibly"`) === N_RUNS, `w:cs="Shibly" × ${N_RUNS}`);
  ok(countStr(out, `w:eastAsia="Shibly"`) === N_RUNS, `w:eastAsia="Shibly" × ${N_RUNS}`);
  ok(!out.includes("SutonnyMJ"), "পুরনো ফন্ট-নামের কোনো অবশেষ নেই");
  ok(!out.includes("Theme"), "সব থিম-অ্যাট্রিবিউট সরানো হয়েছে");
  ok(
    collectTInner(fixtureDoc).join("\u0001") === collectTInner(out).join("\u0001"),
    "৭২০ রানের টেক্সট বাইট-অক্ষত"
  );
  ok(
    countStr(out, "<w:r>") === N_RUNS &&
      countStr(out, "</w:r>") === N_RUNS &&
      countStr(out, "<w:rPr>") === N_RUNS &&
      countStr(out, "</w:rPr>") === N_RUNS,
    "ব্যালেন্স: <w:r>/<w:rPr> ওপেন-ক্লোজ ৭২০/৭২০"
  );
  ok(applyFontRemapXml(out, S) === out, "ফিক্সচার: idempotent (দ্বিতীয় পাস বাইট-অভিন্ন)");
  ok(wellFormed(out), "৭২০-রান আউটপুট XML well-formed (parsererror নেই)");
  {
    const doc2 = new dom.window.DOMParser().parseFromString(out, "application/xml");
    ok(doc2.getElementsByTagName("w:r").length === N_RUNS, "পার্স-পরবর্তী w:r সংখ্যা ৭২০");
    ok(doc2.getElementsByTagName("w:rFonts").length === N_RUNS, "পার্স-পরবর্তী w:rFonts সংখ্যা ৭২০");
  }
}

// ---------- ৫. আসল Bijoy docx ইন্টিগ্রেশন ----------

console.log("\n── আসল ফিক্সচার: hsc27-physics-bijoy.docx ──");
const FIXTURE = "/home/z/my-project/scripts/fixtures/hsc27-physics-bijoy.docx";
if (!existsSync(FIXTURE)) {
  console.log("  (স্কিপ: ফিক্সচার নেই)");
} else {
  try {
    const zip = await JSZip.loadAsync(readFileSync(FIXTURE));
    const xml = await zip.file("word/document.xml")!.async("string");
    const out = applyFontRemapXml(xml, S);

    ok(wellFormed(out), "আসল docx → রিম্যাপ-পরবর্তী XML well-formed");
    ok(applyFontRemapXml(out, S) === out, "আসল docx: idempotent");
    ok(
      collectTInner(xml).join("\u0001") === collectTInner(out).join("\u0001"),
      "আসল docx: সব w:t টেক্সট অক্ষত"
    );
    ok(
      countStr(out, "<w:r>") === countStr(xml, "<w:r>") && countStr(out, "</w:r>") === countStr(xml, "</w:r>"),
      "আসল docx: রান-সংখ্যা অপরিবর্তিত"
    );

    // স্বাধীন স্ক্যান → ক্লাস-ভিত্তিক প্রত্যাশিত ফন্ট-গণনা
    let expBijoy = 0, expUni = 0, expLatin = 0, expTabBijoy = 0, expSutonnyInTextRuns = 0;
    let unchangedSample: string | null = null;
    for (const m of xml.matchAll(/<w:r(?:\s[^>]*)?>|<w:r\/>/g)) {
      if (m[0].endsWith("/>")) continue;
      const start = (m.index ?? 0) + m[0].length;
      const end = xml.indexOf("</w:r>", start);
      if (end === -1) continue;
      const runXml = xml.slice((m.index ?? 0), end + 6);
      const inner = xml.slice(start, end);
      const tM = inner.match(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/);
      if (!tM) {
        // w:t-হীন রান অস্পৃশ্য — এর SutonnyMJ ascii-অ্যাট্রিবিউটই আউটপুটে অবশিষ্ট থাকবে
        expTabBijoy += countStr(runXml, `w:ascii="SutonnyMJ"`);
        if (countStr(runXml, `w:ascii="SutonnyMJ"`) > 0) unchangedSample ??= runXml;
        continue;
      }
      const cls = classifyRunText(decodeEntities(tM[1]));
      expSutonnyInTextRuns += countStr(runXml, `w:ascii="SutonnyMJ"`);
      if (cls === "bijoy") expBijoy++;
      else if (cls === "unicode-bengali") expUni++;
      else expLatin++;
    }
    ok(
      countStr(out, `w:ascii="Shibly"`) === expBijoy,
      `আসল docx: bijoy-রান ${expBijoy} → w:ascii="Shibly" × ${countStr(out, `w:ascii="Shibly"`)}`
    );
    ok(
      countStr(out, `w:ascii="SolaimanLipi"`) === expUni,
      `আসল docx: ইউনিকোড-রান ${expUni} → SolaimanLipi`
    );
    ok(
      countStr(out, `w:ascii="Arial"`) === expLatin,
      `আসল docx: latin-রান ${expLatin} → Arial`
    );
    // অবশিষ্ট SutonnyMJ = w:t-হীন রান + রান-বাহির্ভূত প্রসঙ্গ (pPr-মার্ক rPr ইত্যাদি —
    // রান-লেভেল-অনলি ডিজাইন-সিদ্ধান্ত) — অর্থাৎ w:t-ধারী কোনো রানেই লিগ্যাসি ফন্ট থাকবে না
    let leftoverInTextRuns = 0;
    for (const m of out.matchAll(/<w:r(?:\s[^>]*)?>/g)) {
      const s0 = (m.index ?? 0) + m[0].length;
      const e0 = out.indexOf("</w:r>", s0);
      if (e0 === -1) continue;
      const inner = out.slice(s0, e0);
      if (/<w:t(?:\s[^>]*)?>/.test(inner) && inner.includes("SutonnyMJ")) leftoverInTextRuns++;
    }
    ok(leftoverInTextRuns === 0, "w:t-ধারী কোনো রানেই লিগ্যাসি SutonnyMJ অবশিষ্ট নেই");
    ok(
      countStr(out, `w:ascii="SutonnyMJ"`) ===
        countStr(xml, `w:ascii="SutonnyMJ"`) - expSutonnyInTextRuns,
      `অবশিষ্ট ${countStr(out, `w:ascii="SutonnyMJ"`)} = টেক্সটহীন রান ${expTabBijoy} + রান-বাহির্ভূত (pPr-মার্ক rPr ইত্যাদি) — হিসাব মিলল`
    );
    if (unchangedSample) ok(out.includes(unchangedSample), "টেক্সটহীন Bijoy-রান বাইট-অক্ষত (স্যাম্পল)");

    // styles.xml রিম্যাপ-যাচাই (আসল ফাইলে Times New Roman + থিম আছে)
    const st = await zip.file("word/styles.xml")!.async("string");
    const stOut = applyFontRemapStylesXml(st, S);
    const legacyVals = [...st.matchAll(/w:(?:ascii|hAnsi|cs|eastAsia)="([^"]*)"/g)]
      .filter((m) => /^(sutonny|bijoy|shibly)/i.test(m[1])).length;
    if (legacyVals === 0) {
      ok(stOut === st, "আসল styles.xml: লিগ্যাসি ফন্ট নেই → বাইট-অপরিবর্তিত");
    } else {
      ok(
        countStr(stOut, `w:ascii="Shibly"`) + countStr(stOut, `w:hAnsi="Shibly"`) +
          countStr(stOut, `w:cs="Shibly"`) + countStr(stOut, `w:eastAsia="Shibly"`) >= legacyVals,
        `আসল styles.xml: ${legacyVals} লিগ্যাসি ভ্যালু রিম্যাপ হয়েছে`
      );
    }
  } catch (e) {
    console.log("  (স্কিপ: ফিক্সচার পড়া যায়নি)", e instanceof Error ? e.message : e);
  }
}

// ---------- ৬. FONT_CHOICES ও ডিফল্ট ----------

console.log("\n── FONT_CHOICES ও ডিফল্ট সেটিংস ──");
ok(FONT_CHOICES.english.length === 5 && FONT_CHOICES.english.includes("Times New Roman"), "FONT_CHOICES.english (৫টি, TNR-সহ)");
ok(FONT_CHOICES.bijoy.length === 5 && FONT_CHOICES.bijoy.includes("SutonnyMJ") && FONT_CHOICES.bijoy.includes("Shibly"), "FONT_CHOICES.bijoy (৫টি)");
ok(FONT_CHOICES.unicode.length === 5 && FONT_CHOICES.unicode.includes("Noto Serif Bengali"), "FONT_CHOICES.unicode (৫টি)");
ok(DEFAULT_FONT_REMAP_SETTINGS.enabled === true, "ডিফল্ট: enabled=true");
ok(DEFAULT_FONT_REMAP_SETTINGS.englishFont === "Times New Roman", "ডিফল্ট: englishFont");
ok(DEFAULT_FONT_REMAP_SETTINGS.bijoyFont === "SutonnyMJ", "ডিফল্ট: bijoyFont");
ok(DEFAULT_FONT_REMAP_SETTINGS.unicodeFont === "Noto Serif Bengali", "ডিফল্ট: unicodeFont");

// ---------- ৭. ওয়্যারিং — repackDocxRemapped / replaceDocumentXml / buildMergedDocxBlob ----------

console.log("\n── ওয়্যারিং — zip-লেভেল রিম্যাপ (repack-docx কোর) ──");
{
  const {
    repackDocxRemapped,
  } = await import("../src/lib/mcq/repack-docx");
  const { buildMergedDocxBlob, replaceDocumentXml } = await import("../src/lib/mcq/multi-docx");

  const CT_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/></Types>`;
  const RELS_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`;
  const STYLES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="${W_NS}"><w:style w:type="paragraph" w:styleId="Normal"><w:rPr><w:rFonts w:ascii="SutonnyMJ" w:hAnsi="SutonnyMJ"/></w:rPr></w:style></w:styles>`;

  /** bijoy + unicode + latin তিন রানের মিনিমাল document.xml */
  const DOC_XML = wrapDoc(
    `<w:p><w:r><w:rPr><w:rFonts w:ascii="SutonnyMJ" w:hAnsi="SutonnyMJ"/></w:rPr><w:t>Avgvi †KvW</w:t></w:r></w:p>` +
      `<w:p><w:r><w:rPr><w:rFonts w:ascii="SutonnyMJ"/></w:rPr><w:t>বাংলা প্রশ্ন</w:t></w:r></w:p>` +
      `<w:p><w:r><w:t>Chemistry Board</w:t></w:r></w:p>`,
  );
  const SETTINGS_PART = `<?xml version="1.0"?><w:settings xmlns:w="${W_NS}"><w:zoom w:percent="100"/></w:settings>`;

  async function makeDocxBlob(documentXml: string, stylesXml?: string): Promise<Blob> {
    const zip = new JSZip();
    zip.file("[Content_Types].xml", CT_XML);
    zip.file("_rels/.rels", RELS_XML);
    zip.file("word/document.xml", documentXml);
    if (stylesXml != null) zip.file("word/styles.xml", stylesXml);
    zip.file("word/settings.xml", SETTINGS_PART);
    // bun-এ JSZip-এর blob-ইনপুট সাপোর্ট নেই (FileReader নেই) — uint8array-ই পাঠাই
    // (browser-এ একই কল-সাইট Blob পায়; JSZip দুটোই হুবহু একভাবে আন-প্যাক করে)
    return (await zip.generateAsync({ type: "uint8array" })) as unknown as Blob;
  }
  async function partOf(blob: Blob, path: string): Promise<string | null> {
    // bun-এ JSZip blob-ইনপুট চেনে না — arrayBuffer দিয়েই (browser-এও নিরাপদ)
    const z = await JSZip.loadAsync(await blob.arrayBuffer());
    const f = z.file(path);
    return f ? await f.async("string") : null;
  }

  // ---- বন্ধ (undefined + enabled:false) → বাইট-অভিন্ন ----
  {
    const srcBlob = await makeDocxBlob(DOC_XML, STYLES_XML);
    const outOff = await repackDocxRemapped(srcBlob, DOC_XML, undefined);
    ok((await partOf(outOff, "word/document.xml")) === DOC_XML, "repackDocxRemapped(undefined): document.xml বাইট-অভিন্ন");
    ok((await partOf(outOff, "word/styles.xml")) === STYLES_XML, "repackDocxRemapped(undefined): styles.xml বাইট-অভিন্ন");
    const outDisabled = await repackDocxRemapped(srcBlob, DOC_XML, { ...S, enabled: false });
    ok((await partOf(outDisabled, "word/document.xml")) === DOC_XML, "repackDocxRemapped(enabled:false): document.xml বাইট-অভিন্ন");
    ok((await partOf(outDisabled, "word/settings.xml")) === SETTINGS_PART, "অন্য পার্ট (settings.xml) byte-হুবহু কপি");
  }

  // ---- চালু → document + styles রিম্যাপ, অন্য পার্ট অক্ষত ----
  {
    const srcBlob = await makeDocxBlob(DOC_XML, STYLES_XML);
    const out = await repackDocxRemapped(srcBlob, DOC_XML, S);
    const docOut = (await partOf(out, "word/document.xml"))!;
    ok(countStr(docOut, `w:ascii="Shibly"`) === 1 && /Avgvi †KvW/.test(docOut), "ওয়্যারিং: bijoy-রান → Shibly (টেক্সট অক্ষত)");
    ok(countStr(docOut, `w:ascii="SolaimanLipi"`) === 1 && /বাংলা প্রশ্ন/.test(docOut), "ওয়্যারিং: unicode-রান → SolaimanLipi");
    ok(countStr(docOut, `w:ascii="Arial"`) === 1 && /Chemistry Board/.test(docOut), "ওয়্যারিং: latin-রান (rPr নেই) → Arial");
    ok(countStr(docOut, `w:ascii="SutonnyMJ"`) === 0, "ওয়্যারিং: document.xml-এ লিগ্যাসি ফন্ট শূন্য");
    const stylesOut = (await partOf(out, "word/styles.xml"))!;
    ok(/w:ascii="Shibly"/.test(stylesOut) && !stylesOut.includes("SutonnyMJ"), "ওয়্যারিং: styles.xml লিগ্যাসি ভ্যালু → bijoyFont");
    ok((await partOf(out, "word/settings.xml")) === SETTINGS_PART, "রিম্যাপ-চালুতেও অন্য পার্ট byte-হুবহু");
    ok(wellFormed(docOut) && wellFormed(stylesOut), "ওয়্যারিং: দুই XML-ই well-formed");

    // styles.xml সোর্সে নেই → আউটপুটেও নেই, document রিম্যাপ হয়
    const outNoStyles = await repackDocxRemapped(await makeDocxBlob(DOC_XML), DOC_XML, S);
    ok((await partOf(outNoStyles, "word/styles.xml")) === null, "সোর্সে styles.xml নেই → আউটপুটেও নেই (কৃত্রিম পার্ট যোগ হয় না)");
    ok((await partOf(outNoStyles, "word/document.xml"))!.includes(`w:ascii="Shibly"`), "styles না থাকলেও document.xml রিম্যাপ হয়");
  }

  // ---- ডকুমেন্ট-dominant অটো-ডিটেকশন (Bijoy-প্রধান ফাইলের বাস্তব বাগ ফিক্স) ----
  // মার্কারহীন খাঁটি-ASCII বাংলা রান ("Avgvi Rvbvb"-জাতীয়) আগে latin ধরে
  // Times New Roman পেত — ফলে বাংলা English ফন্টে ডাউনলোড হতো। এখন
  // ① রানের নিজস্ব লিগ্যাসি-Bijoy ফন্ট এবং ② ডকুমেন্ট-dominant হিন্ট দুটোই কাজ করে।
  {
    const BIJOY_DOC = wrapDoc(
      `<w:p><w:r><w:rPr><w:rFonts w:ascii="SutonnyMJ"/></w:rPr><w:t>wefxK ø«-«ˆ</w:t></w:r></w:p>` +
        `<w:p><w:r><w:rPr><w:rFonts w:ascii="SutonnyMJ"/></w:rPr><w:t>Avgvi Rvbvb</w:t></w:r></w:p>` +
        `<w:p><w:r><w:rPr><w:rFonts w:ascii="SutonnyMJ"/></w:rPr><w:t>cÖwZwfwU wek¦</w:t></w:r></w:p>` +
        `<w:p><w:r><w:t>Which option is correct?</w:t></w:r></w:p>`,
    );
    const outBijoy = await repackDocxRemapped(await makeDocxBlob(BIJOY_DOC), BIJOY_DOC, S);
    const bijoyOut = (await partOf(outBijoy, "word/document.xml"))!;
    ok(
      countStr(bijoyOut, `w:ascii="Shibly"`) === 3,
      "dominant-অটো: Bijoy-প্রধান ডকে মার্কারহীন ASCII বাংলা রানও bijoyFont (৩টিই)"
    );
    ok(
      countStr(bijoyOut, `w:ascii="Arial"`) === 1,
      "dominant-অটো: English কমন-ওয়ার্ড রান latin-ই থাকে"
    );
    ok(wellFormed(bijoyOut), "dominant-অটো: আউটপুট XML well-formed");
  }

  // ---- replaceDocumentXml + buildMergedDocxBlob (মার্জ-পাথ) ----
  {
    const baseBlob = await makeDocxBlob(DOC_XML, STYLES_XML);
    const extraBlob = await makeDocxBlob(DOC_XML);
    const items = [
      { xml: DOC_XML, file: baseBlob },
      { xml: DOC_XML, file: extraBlob },
    ];
    const mergedOn = await buildMergedDocxBlob(items, S);
    const mergedDoc = (await partOf(mergedOn, "word/document.xml"))!;
    ok(
      countStr(mergedDoc, `w:ascii="Shibly"`) === 2 && countStr(mergedDoc, `w:ascii="SolaimanLipi"`) === 2,
      "মার্জ (চালু): base+extra দুই body-ই রিম্যাপ্ট (bijoy×2 + unicode×2)"
    );
    ok(/w:ascii="Shibly"/.test((await partOf(mergedOn, "word/styles.xml"))!), "মার্জ (চালু): base-এর styles.xml রিম্যাপ্ট");

    const mergedOff = await buildMergedDocxBlob(items);
    const mergedOffDoc = (await partOf(mergedOff, "word/document.xml"))!;
    ok(
      countStr(mergedOffDoc, `w:ascii="SutonnyMJ"`) === 4 && !mergedOffDoc.includes("Shibly"),
      "মার্জ (বন্ধ): document.xml আগের আচরণ হুবহু (রিম্যাপ শূন্য — ২ ডক × ২ w:ascii)"
    );
    ok((await partOf(mergedOff, "word/styles.xml")) === STYLES_XML, "মার্জ (বন্ধ): styles.xml byte-হুবহু");

    const singleOn = await replaceDocumentXml(baseBlob, DOC_XML, S);
    ok((await partOf(singleOn, "word/document.xml"))!.includes(`w:ascii="SolaimanLipi"`), "replaceDocumentXml (চালু): রিম্যাপ্ট");
    const singleOff = await replaceDocumentXml(baseBlob, DOC_XML);
    ok((await partOf(singleOff, "word/document.xml")) === DOC_XML, "replaceDocumentXml (বন্ধ): বাইট-অভিন্ন");
  }
}

// ---------- ফলাফল ----------

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
