// ============================================================
// Color-Serial unit tests — ইউজারের B1/A2/A5/A6 উদাহরণ + রিনাম্বার
// রান: bun run scripts/test-color-serial.ts
// ============================================================

import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";
import JSZip from "jszip";

// ---- ব্রাউজার DOM API emulation (jsdom) ----
const dom = new JSDOM("<!doctype html><html><body></body></html>");
(globalThis as unknown as Record<string, unknown>).DOMParser = dom.window.DOMParser;
(globalThis as unknown as Record<string, unknown>).XMLSerializer = dom.window.XMLSerializer;

const {
  analyzeColorDocx,
  planSerialByColor,
  applyColorSerialXml,
  paletteCodeOf,
  paletteHexOf,
} = await import("../src/lib/mcq/color-serial");
const { renumberSerialParaTo, extractParaText } = await import("../src/lib/mcq/docx-xml");

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

// ---------- সিনথেটিক docx XML বিল্ডার ----------

const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";

/** শেডেড হেডার প্যারা */
function shadedP(text: string, fill: string): string {
  return (
    `<w:p xmlns:w="${W}"><w:pPr><w:shd w:val="clear" w:color="auto" w:fill="${fill}"/></w:pPr>` +
    `<w:r><w:t xml:space="preserve">${text}</w:t></w:r></w:p>`
  );
}

/** প্রশ্ন প্যারা — সেপারেটর/প্রিফিক্স কাস্টমাইজযোগ্য */
function qP(text: string, runs?: string[]): string {
  const body = (runs ?? [text])
    .map((r) => `<w:r><w:t xml:space="preserve">${r}</w:t></w:r>`)
    .join("");
  return `<w:p xmlns:w="${W}">${body}</w:p>`;
}

function plainP(text: string): string {
  return `<w:p xmlns:w="${W}"><w:r><w:t xml:space="preserve">${text}</w:t></w:r></w:p>`;
}

function wrapDoc(body: string): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="${W}"><w:body>${body}<w:sectPr/></w:body></w:document>`;
}

function q(text: string): string {
  return qP(text);
}

// ============================================================
console.log("\n== ১) প্যালেট ==");
ok(paletteCodeOf("000000") === "B1", "000000 → B1");
ok(paletteCodeOf("F2F2F2") === "A2", "F2F2F2 → A2");
ok(paletteCodeOf("D0CECE") === null, "D0CECE প্যালেটের বাইরে (কাস্টম)");
ok(paletteHexOf("E1") === "4F81BD", "E1 → 4F81BD");
ok(paletteHexOf("A5") === "A6A6A6", "A5 → A6A6A6");
ok(paletteHexOf("A8") === null, "A8 অবৈধ");

// ============================================================
// ইউজারের হুবহু উদাহরণ:
// B1 | A2 | A5 A5 A5 | A2 | A5 A5 A5 | A2 | A5 A5 A5 A6 | A2 | A5 A5 A6 | A5 A6
// (A5/A6-এর ভিতরে প্রশ্ন আছে; B1=অধ্যায়, A2=Type, A5=sub-type, A6=A5-এর ভিতরে)
// ============================================================

console.log("\n== ২) ইউজারের B1/A2/A5/A6 নেস্টিং উদাহরণ ==");
// প্রতিটা হেডারের পরে কিছু প্রশ্ন; সহজ যাচাইয়ের জন্য প্রশ্নগুলো q1,q2... টেক্সটে
type Node = ["H" | "Q", string, string]; // ধরন, রঙ(হেডার হলে), টেক্সট
const userSeq: Array<[kind: "h" | "q", color: string | null, text: string]> = [
  ["h", "B1", "অধ্যায়-১"],
  ["h", "A2", "Type-১"],
  ["q", null, "1.প্রশ্ন-A"],
  ["h", "A5", "সাব-১"],
  ["q", null, "2.প্রশ্ন-B"],
  ["q", null, "2.প্রশ্ন-C"],
  ["h", "A2", "Type-২"],
  ["q", null, "3.প্রশ্ন-D"],
  ["h", "A5", "সাব-২"],
  ["q", null, "4.প্রশ্ন-E"],
  ["h", "A6", "সূক্ষ্ম-১"],
  ["q", null, "5.প্রশ্ন-F"],
  ["q", null, "6.প্রশ্ন-G"],
  ["h", "A2", "Type-৩"],
  ["q", null, "7.প্রশ্ন-H"],
  ["h", "A5", "সাব-৩"],
  ["q", null, "8.প্রশ্ন-I"],
  ["h", "A6", "সূক্ষ্ম-২"],
  ["q", null, "9.প্রশ্ন-J"],
  ["h", "A5", "সাব-৪"],
  ["q", null, "10.প্রশ্ন-K"],
  ["h", "A6", "সূক্ষ্ম-৩"],
  ["q", null, "11.প্রশ্ন-L"],
];

const bodyXml = userSeq
  .map(([kind, color, text]) => (kind === "h" ? shadedP(text, color!) : q(text)))
  .join("");
const xml1 = wrapDoc(bodyXml);
const an1 = analyzeColorDocx(xml1);

ok(an1.questionCount === 12, "১২টা প্রশ্ন ডিটেক্ট");
const colorMap = new Map(an1.colors.map((c) => [c.key, c.sections]));
ok(colorMap.get("B1") === 1, "B1 ×১");
ok(colorMap.get("A2") === 3, "A2 ×৩");
ok(colorMap.get("A5") === 4, "A5 ×৪");
ok(colorMap.get("A6") === 3, "A6 ×৩");

// ---- A6 সিলেক্ট: ৩টা A6-সেকশনের প্রশ্ন আলাদা ১ থেকে ----
{
  const plan = planSerialByColor(an1, { kind: "color", key: "A6" });
  // প্রশ্ন টেক্সট → নতুন নম্বর
  const byText = new Map<string, number>();
  for (const p of an1.paras) if (plan.has(p.idx)) byText.set(p.text.replace(/^\d+\./, ""), plan.get(p.idx)!);
  ok(byText.get("প্রশ্ন-F") === 1 && byText.get("প্রশ্ন-G") === 2, "A6#১ (সূক্ষ্ম-১): F=১, G=২");
  ok(byText.get("প্রশ্ন-J") === 1, "A6#২ (সূক্ষ্ম-২): J=১ (নতুন সেকশন, ১ থেকে)");
  ok(byText.get("প্রশ্ন-L") === 1, "A6#৩ (সূক্ষ্ম-৩): L=১");
  ok(byText.size === 4, "A6-সেকশনে মোট ৪টা প্রশ্নই নম্বর পেল");
  ok(!byText.has("প্রশ্ন-K"), "প্রশ্ন-K সাব-৪-এর (A5), A6#২-এর ক্রমে মেশেনি ← 'ek oddayer sate arek odday' আটকানো");
  ok(!byText.has("প্রশ্ন-E") && !byText.has("প্রশ্ন-H"), "A5/A2-লেভেলের প্রশ্ন A6-প্ল্যানে বাদ");
}

// ---- A5 সিলেক্ট: A6-এর প্রশ্নও A5-এর ক্রমের অংশ ----
{
  const plan = planSerialByColor(an1, { kind: "color", key: "A5" });
  const byText = new Map<string, number>();
  for (const p of an1.paras) if (plan.has(p.idx)) byText.set(p.text.replace(/^\d+\./, ""), plan.get(p.idx)!);
  ok(byText.get("প্রশ্ন-B") === 1 && byText.get("প্রশ্ন-C") === 2, "সাব-১: B=১, C=২");
  ok(byText.get("প্রশ্ন-E") === 1, "সাব-২: E=১ (নতুন A5 সেকশন)");
  ok(byText.get("প্রশ্ন-F") === 2 && byText.get("প্রশ্ন-G") === 3, "সাব-২-এর ভিতরের A6-প্রশ্নও ক্রমে: F=২, G=৩");
  ok(byText.get("প্রশ্ন-I") === 1, "সাব-৩: I=১");
  ok(byText.get("প্রশ্ন-J") === 2, "সাব-৩-এর A6-প্রশ্ন J=২");
  ok(byText.get("প্রশ্ন-K") === 1 && byText.get("প্রশ্ন-L") === 2, "সাব-৪: K=১, L=২ (A6#৩ শেষে নতুন A5 → থেমে নতুন ক্রম)");
  ok(!byText.has("প্রশ্ন-A") && !byText.has("প্রশ্ন-D") && !byText.has("প্রশ্ন-H"), "A2-স্তরের প্রশ্ন A5-প্ল্যানে বাদ");
}

// ---- A2 সিলেক্ট: ভিতরের A5/A6-সহ সব প্রশ্ন টাইপের ক্রমে ----
{
  const plan = planSerialByColor(an1, { kind: "color", key: "A2" });
  const byText = new Map<string, number>();
  for (const p of an1.paras) if (plan.has(p.idx)) byText.set(p.text.replace(/^\d+\./, ""), plan.get(p.idx)!);
  ok(byText.get("প্রশ্ন-A") === 1, "Type-১: A=১");
  ok(byText.get("প্রশ্ন-B") === 2 && byText.get("প্রশ্ন-C") === 3, "Type-১-এর A5-প্রশ্ন চলমান: B=২, C=৩");
  ok(byText.get("প্রশ্ন-D") === 1, "Type-২: D=১ (নতুন Type → ১ থেকে)");
  ok(byText.get("প্রশ্ন-E") === 2 && byText.get("প্রশ্ন-F") === 3 && byText.get("প্রশ্ন-G") === 4, "Type-২: E=২, F=৩, G=৪");
  ok(byText.get("প্রশ্ন-H") === 1 && byText.get("প্রশ্ন-I") === 2 && byText.get("প্রশ্ন-J") === 3, "Type-৩: H=১, I=২, J=৩");
  ok(byText.get("প্রশ্ন-K") === 4 && byText.get("প্রশ্ন-L") === 5, "Type-৩ চলমান: K=৪, L=৫ (A5/A6 ভাই-সেকশন A2-নম্বর ভাঙে না)");
  ok(byText.size === 12, "A2-প্ল্যানে সব ১২টা প্রশ্ন নম্বর পেল");
}

// ---- B1 সিলেক্ট: সব একটানা ----
{
  const plan = planSerialByColor(an1, { kind: "color", key: "B1" });
  const nums = [...plan.entries()].sort((a, b) => a[0] - b[0]).map(([, n]) => n);
  ok(nums.length === 12 && nums.every((n, i) => n === i + 1), "B1: সব ১২টা প্রশ্ন একটানা ১..১২ (ভিতরের কিছুই থামায় না)");
}

// ---- একটানা (continuous) ----
{
  const plan = planSerialByColor(an1, { kind: "continuous" });
  const nums = [...plan.entries()].sort((a, b) => a[0] - b[0]).map(([, n]) => n);
  ok(nums.length === 12 && nums.every((n, i) => n === i + 1), "একটানা: ১..১২");
}

// ============================================================
console.log("\n== ৩) applyColorSerialXml — সার্জিক্যাল রিপ্লেস ==");
{
  // pipe → dot নরমালাইজ + ডিজিট বদল
  const xml2 = wrapDoc(
    shadedP("Type-X", "000000") + q("44|g~L¨vq mvaviY¬vh© —") + qP("ignored", ["1", "2", ".", "বাকি লেখা"])
  );
  const an2 = analyzeColorDocx(xml2);
  ok(an2.questionCount === 2, "pipe-সিরিয়ালও প্রশ্ন ডিটেক্ট (SEP এ | যোগের পর)");
  const plan2 = planSerialByColor(an2, { kind: "color", key: "000000" });
  const out2 = applyColorSerialXml(xml2, plan2);
  const an2b = analyzeColorDocx(out2);
  const texts2 = an2b.paras.map((p) => p.text);
  ok(texts2.includes("1.g~L¨vq mvaviY¬vh© —"), `"44|g~L¨vq…" → "1.g~L¨vq…" (সেকশনের ১ম প্রশ্ন=১, pipe→dot, লেখা অক্ষত)`);
  ok(texts2.includes("2.বাকি লেখা"), "মাল্টি-রান '12.' → '2.' (ক্রস-রান রিপ্লেস, সেপ অক্ষত)");
  // হেডারের টেক্সট/শেডিং অক্ষত
  ok(out2.includes('w:fill="000000"') && out2.includes("Type-X"), "হেডারের শেডিং + লেখা অক্ষত");
}

// ---- বাংলা ডিজিট ----
{
  const xml3 = wrapDoc(plainP("৪৪|প্রশ্ন তিন"));
  const an3 = analyzeColorDocx(xml3);
  ok(an3.questionCount === 1, "বাংলা ডিজিট '৪৪|' প্রশ্ন ডিটেক্ট");
  // একটানা প্ল্যানে ৭ নম্বর ধরি
  const plan3 = new Map([[an3.paras.find((p) => p.isQuestion)!.idx, 7]]);
  const out3 = applyColorSerialXml(xml3, plan3);
  const t3 = analyzeColorDocx(out3).paras.map((p) => p.text).join("");
  ok(t3 === "৭.প্রশ্ন তিন", "বাংলা ডিজিট প্রিজার্ভ: '৪৪|' → '৭.'");
}

// ---- সেপারেটর না থাকলে যোগ হয় না (গ্লুড অক্ষত) ----
{
  // আইসোটোপ-গার্ড: ডিজিটের পরে সরাসরি ইংরেজি অক্ষর = সিরিয়াল নয় ("714N" = ₇¹⁴N)
  const el = new DOMParser().parseFromString(wrapDoc(plainP("12abc")), "application/xml");
  const p = el.getElementsByTagNameNS(W, "p")[0];
  renumberSerialParaTo(p, 3);
  ok(extractParaText(p) === "12abc", "আইসোটোপ-গার্ড: '12abc' অপরিবর্তিত (ডিজিট+অক্ষর = সিরিয়াল নয়)");
}
{
  // সেপারেটরহীন কিন্তু বৈধ: ডিজিট + স্পেস + লেখা → রিনাম্বার হয়, নতুন সেপ ঢোকে না
  const el = new DOMParser().parseFromString(wrapDoc(plainP("12 abc")), "application/xml");
  const p = el.getElementsByTagNameNS(W, "p")[0];
  renumberSerialParaTo(p, 3);
  ok(extractParaText(p) === "3 abc", "সেপারেটরহীন: '12 abc' → '3 abc' (নতুন সেপ ঢোকে না)");
}
{
  // আসল ফাইলের ভুয়া-পজিটিভগুলো: আইসোটোপ লাইন সিরিয়াল হিসেবে ধরা হয় না
  for (const t of ["714N + α → 817O + X", "12Cl2(g) → Cl(g)", "1224Mg emissoin"]) {
    const el = new DOMParser().parseFromString(wrapDoc(plainP(t)), "application/xml");
    const p = el.getElementsByTagNameNS(W, "p")[0];
    renumberSerialParaTo(p, 1);
    ok(extractParaText(p) === t, `আইসোটোপ-গার্ড: '${t.slice(0, 20)}…' অপরিবর্তিত`);
  }
}

// ---- ডিজিট দৈর্ঘ্য বদলালেও সেপ ঠিক জায়গায় (এক-পাস স্প্যান) ----
{
  const el = new DOMParser().parseFromString(wrapDoc(plainP("১২|দীর্ঘ নম্বর")), "application/xml");
  const p = el.getElementsByTagNameNS(W, "p")[0];
  renumberSerialParaTo(p, 7);
  ok(extractParaText(p) === "৭.দীর্ঘ নম্বর", "'১২|' → '৭.' (২→১ ডিজিট, সেপ সরে যায় না)");
}

// ---- ডেসিমাল গার্ড: '2.5 মিটার' প্রশ্ন না (পরের লাইন অপশন-লেড না হলে) ----
{
  const xml4 = wrapDoc(plainP("2.5 মিটার লম্বা একটা দণ্ড") + plainP("এইটা সাধারণ লেখা"));
  const an4 = analyzeColorDocx(xml4);
  ok(an4.questionCount === 0, "ডেসিমাল '2.5 মিটার' প্রশ্ন হিসেবে ধরা হয়নি");
}

// ============================================================
console.log("\n== ৪) আসল Agri ফাইল ==");
const AGRI = "upload/Agri MCQ Botany 997 mcq - Copy - type serial.docx";
const zip = await JSZip.loadAsync(readFileSync(AGRI));
const agriXml = await zip.file("word/document.xml")!.async("string");
const anA = analyzeColorDocx(agriXml);

ok(anA.colors.length === 2, "২টা রঙ: 000000 + D0CECE");
const cBlack = anA.colors.find((c) => c.key === "000000");
const cGray = anA.colors.find((c) => c.key === "D0CECE");
ok(cBlack?.name === "B1" && cBlack.sections === 126, "000000 = B1, ১২৬ Type-হেডার");
ok(cGray?.name === "কাস্টম রঙ" && cGray.sections === 9, "D0CECE = কাস্টম, ৯টা অধ্যায়-হেডার");
ok(anA.questionCount === 435, "৪৩৫ প্রশ্ন ডিটেক্ট (আগে ৩৮৩ ছিল — pipe যোগে পূর্ণ)");

// B1 প্ল্যান: ১২৬টা Type-সেকশন, প্রতিটায় ১ থেকে
{
  const plan = planSerialByColor(anA, { kind: "color", key: "000000" });
  ok(plan.size === 435, "B1 প্ল্যানে ৪৩৫টা প্রশ্নই নম্বর পায় (প্রতিটা Type-এর ভিতরে)");
  // প্রতিটা Type-সেকশনের প্রথম প্রশ্ন = ১
  let firstOfSection: number[] = [];
  let seen = 0;
  for (const p of anA.paras) {
    if (p.colorKey === "000000") { seen = 0; continue; }
    if (p.colorKey === null && plan.has(p.idx)) {
      seen++;
      if (seen === 1) firstOfSection.push(plan.get(p.idx)!);
    }
  }
  ok(firstOfSection.length === 122 && firstOfSection.every((n) => n === 1), "১২২টা প্রশ্ন-যুক্ত Type-সেকশনের প্রথম প্রশ্ন = ১ (৪টা খালি সেকশন বাদ)");
}

// D0CECE (অধ্যায়) প্ল্যান: ৭টা প্রকৃত অধ্যায় + ২ খালি → ৪৩৫ প্রশ্ন, অধ্যায়ে ১ থেকে
{
  const plan = planSerialByColor(anA, { kind: "color", key: "D0CECE" });
  ok(plan.size === 435, "অধ্যায়-প্ল্যানেও সব ৪৩৫ প্রশ্ন নম্বর পায়");
}

// apply + পুনঃযাচাই: B1 প্ল্যান অ্যাপ্লাই করে আবার প্ল্যান বসালে হুবহু এক হয় (idempotent)
{
  const plan = planSerialByColor(anA, { kind: "color", key: "000000" });
  const outXml = applyColorSerialXml(agriXml, plan);
  const anB = analyzeColorDocx(outXml);
  ok(anB.questionCount === 435, "আউটপুটেও ৪৩৫ প্রশ্ন");
  ok(anB.colors.length === 2 && anB.colors.find((c) => c.key === "000000")!.sections === 126, "আউটপুটে রঙ/হেডার অক্ষত");
  const plan2 = planSerialByColor(anB, { kind: "color", key: "000000" });
  let same = true;
  for (const [idx, n] of plan) if (plan2.get(idx) !== n) { same = false; break; }
  ok(same, "আউটপুটে আবার প্ল্যান করলে হুবহু এক (idempotent) — অর্থাৎ সিরিয়াল ঠিকমতো বসেছে");
  // pipe সেপ সব ডট হয়েছে কিনা
  const pipes = anB.paras.filter((p) => p.isQuestion && /^\s*[0-9০-৯ø«ˆµ∏Ï¾˜Ùœ]+\s*\|/.test(p.text)).length;
  ok(pipes === 0, "আউটপুটে pipe-সেপারেটর শূন্য (সব ডট-স্টাইল)");
}

// ফাইল সাইজ স্যানিটি: XML দৈর্ঘ্য প্রায় সমান (শুধু ডিজিট/সেপ বদলায়)
console.log(`\n  (XML সাইজ: আসল ${agriXml.length} → আউটপুট ${applyColorSerialXml(agriXml, planSerialByColor(anA, { kind: "color", key: "000000" })).length})`);

// ============================================================
console.log("\n== ৫) রিগ্রেশন: অধ্যায়ের রঙ বদলানো ফাইল (আসল Chemistry-ফাইল সিনারিও) ==");
// অধ্যায়-১ = B6 (0D0D0D), অধ্যায়-২…৩ = B1 (000000); Type = A4, Varsity = A3
// আগের বাগ-১: অধ্যায়-২-এর প্রথম Type হেডার B1-সেকশন মেরে ফেলত → B1 প্ল্যানে ০
// আগের বাগ-২: অধ্যায়-২-এর ভিন্ন রঙ B6-এর সন্তান বসত → B6-সেকশন কখনো বন্ধ হতো না
//             → B6 আউটপুট continuous-এর হুবহু কপি হয়ে যেত
// ডেটা বাস্তবের মতো ঘনত্ব-অনুপাতে (varsity ≫ Type ≫ অধ্যায়) প্রোগ্রাম্যাটিক জেনারেটেড —
// কারণ অধ্যায়-সোদক সোয়াপের ≤১০× ঘনত্ব-শর্ত বাস্তব ফাইলের মতোই ডেটায় যাচাই করতে হয়
{
  const items: Array<[kind: "h" | "q", color: string | null, text: string]> = [];
  let qn = 0;
  const varsityNames = ["ঢাকা", "রাজশাহী", "চট্টগ্রাম", "খুলনা", "যবিপ্রবি", "জাবি", "ইবি", "কুবি", "রুবি", "সাবি", "নবি", "ববি"];
  // অধ্যায়-১ (B6): Type-১(১q) + ১২ varsity(১q) + Type-২(১q) = ১৪ প্রশ্ন
  items.push(["h", "0D0D0D", "অধ্যায়-১"]);
  items.push(["h", "BFBFBF", "Type-১"]);
  items.push(["q", null, `${++qn}.প্রশ্ন-${qn}`]);
  for (let v = 0; v < 12; v++) {
    items.push(["h", "D9D9D9", `${varsityNames[v]} বিশ্ববিদ্যালয়`]);
    items.push(["q", null, `${++qn}.প্রশ্ন-${qn}`]);
  }
  items.push(["h", "BFBFBF", "Type-২"]);
  items.push(["q", null, `${++qn}.প্রশ্ন-${qn}`]);
  // অধ্যায়-২ (B1): Type-৩(১q) + ১০ varsity(১q) + Type-৪(১q) = ১২ প্রশ্ন
  items.push(["h", "000000", "অধ্যায়-২"]); // নতুন অধ্যায়ের রঙ — B6 থেকে B1
  items.push(["h", "BFBFBF", "Type-৩"]);
  items.push(["q", null, `${++qn}.প্রশ্ন-${qn}`]);
  for (let v = 0; v < 10; v++) {
    items.push(["h", "D9D9D9", `${varsityNames[v]} বিশ্ববিদ্যালয়`]);
    items.push(["q", null, `${++qn}.প্রশ্ন-${qn}`]);
  }
  items.push(["h", "BFBFBF", "Type-৪"]);
  items.push(["q", null, `${++qn}.প্রশ্ন-${qn}`]);
  // অধ্যায়-৩ (B1): Type-৫ + ২ প্রশ্ন
  items.push(["h", "000000", "অধ্যায়-৩"]);
  items.push(["h", "BFBFBF", "Type-৫"]);
  items.push(["q", null, `${++qn}.প্রশ্ন-${qn}`]);
  items.push(["q", null, `${++qn}.প্রশ্ন-${qn}`]);

  const chemXml = wrapDoc(items.map(([k, c, t]) => (k === "h" ? shadedP(t, c!) : q(t))).join(""));
  const anC = analyzeColorDocx(chemXml);
  ok(anC.questionCount === 28 && anC.colors.length === 4, "সিনারিও: ২৮ প্রশ্ন, ৪ রঙ (B6×১, B1×২, A4×৫, A3×২২)");

  const seq = (plan: Map<number, number>): number[] => anC.paras.filter((p) => plan.has(p.idx)).map((p) => plan.get(p.idx)!);

  const planB1 = planSerialByColor(anC, { kind: "color", key: "000000" });
  ok(planB1.size === 14, `B1 প্ল্যানে অধ্যায়-২+৩ এর ১৪টা প্রশ্ন (আগে ছিল ০ — বাগ), পাওয়া গেল ${planB1.size}`);
  ok(
    JSON.stringify(seq(planB1)) === JSON.stringify([1,2,3,4,5,6,7,8,9,10,11,12, 1,2]),
    `অধ্যায়-২ একটানা ১..১২, অধ্যায়-৩ আবার ১,২ — অধ্যায়-১ বাদ (${seq(planB1).join(",")})`
  );

  const planA3 = planSerialByColor(anC, { kind: "color", key: "D9D9D9" });
  ok(planA3.size === 22, `A3 প্ল্যানে ২২টা varsity-সেকশনের ২২ প্রশ্ন, পাওয়া গেল ${planA3.size}`);
  ok(seq(planA3).every((n) => n === 1), "প্রতিটা A3-হেডারে কাউন্টার ১ থেকে রিসেট (সব মান ১)");

  const planA4 = planSerialByColor(anC, { kind: "color", key: "BFBFBF" });
  ok(planA4.size === 28, `A4/Type প্ল্যানে সব ২৮টা প্রশ্ন (ভিতরের varsity-সীমায় থামে না), পাওয়া গেল ${planA4.size}`);

  const planCont = planSerialByColor(anC, { kind: "continuous" });
  ok(planCont.size === 28, "continuous-এ সব ২৮টা প্রশ্ন একটানা");

  // B6-প্ল্যান (বাগ-২ ফিক্স): অধ্যায়-সোদক সোয়াপে অধ্যায়-১-এর ১৪টা প্রশ্ন ১..১৪
  const planB6 = planSerialByColor(anC, { kind: "color", key: "0D0D0D" });
  const numsB6 = seq(planB6);
  ok(planB6.size === 14, `B6 প্ল্যানে শুধু অধ্যায়-১-এর ১৪টা প্রশ্ন (আগে পুরোটা একটানা হয়ে যেত — বাগ), পাওয়া গেল ${planB6.size}`);
  ok(
    numsB6.every((n, i) => n === i + 1),
    `B6-সেকশনের ভিতরে একটানা ১..১৪, অধ্যায়-২ (ভিন্ন রঙ) এলেই থামে (${numsB6.slice(0, 5).join(",")}…${numsB6.slice(-2).join(",")})`
  );

  // তিন-অধ্যায় চেইন: ভিন্ন ভিন্ন অধ্যায়-রঙও পরপর সোদক সোয়াপ হয়
  // (প্রতি অধ্যায়ে ২ Type + ৪ varsity — স্ট্রাকচার/ঘনত্ব বাস্তবের মতো)
  const items3: Array<[kind: "h" | "q", color: string | null, text: string]> = [];
  let q3 = 0;
  const chapterColor = ["111111", "222222", "333333"];
  for (let ch = 0; ch < 3; ch++) {
    items3.push(["h", chapterColor[ch], `অধ্যায়-${ch + 1}`]);
    for (let t = 0; t < 2; t++) {
      items3.push(["h", "BFBFBF", `Type-${ch * 2 + t + 1}`]);
      items3.push(["q", null, `${++q3}.ক-${q3}`]);
      for (let v = 0; v < 2; v++) {
        items3.push(["h", "D9D9D9", `${varsityNames[(ch * 4 + t * 2 + v) % 12]} বিশ্ববিদ্যালয়`]);
        items3.push(["q", null, `${++q3}.ক-${q3}`]);
      }
    }
  }
  const an3ch = analyzeColorDocx(wrapDoc(items3.map(([k, c, t]) => (k === "h" ? shadedP(t, c!) : q(t))).join("")));
  const plan111 = planSerialByColor(an3ch, { kind: "color", key: "111111" });
  ok(plan111.size === 6, `প্রথম অধ্যায়-রঙ সিলেক্টে শুধু নিজের সেকশনের ৬ প্রশ্ন, পাওয়া গেল ${plan111.size}`);
  const plan222 = planSerialByColor(an3ch, { kind: "color", key: "222222" });
  ok(plan222.size === 6, `মাঝের অধ্যায়-রঙ সিলেক্টে শুধু নিজের সেকশনের ৬ প্রশ্ন, পাওয়া গেল ${plan222.size}`);
  const plan333 = planSerialByColor(an3ch, { kind: "color", key: "333333" });
  ok(plan333.size === 6, `তৃতীয় অধ্যায়-রঙ সিলেক্টে শুধু নিজের সেকশনের ৬ প্রশ্ন, পাওয়া গেল ${plan333.size}`);
  const planCont3 = planSerialByColor(an3ch, { kind: "continuous" });
  ok(planCont3.size === 18, "continuous-এ ৩ অধ্যায় মিলে ১৮ প্রশ্ন একটানা");
}

// জিরো-প্যাডিং সংরক্ষণ: "01." স্টাইলের ফাইলে ১ → "01."
console.log("\n== ৬) জিরো-প্যাডিং ==");
{
  const qs = ["01.", "02.", "03.", "04.", "05.", "06.", "07.", "08.", "09.", "10."]
    .map((s, i) => q(`${s}\tপ্রশ্ন-${i + 1}`))
    .join("");
  const padXml = wrapDoc(shadedP("Type", "000000") + qs);
  const anP = analyzeColorDocx(padXml);
  ok(anP.questionCount === 10, "প্যাডেড সিরিয়ালেও ১০ প্রশ্ন");
  const outP = applyColorSerialXml(padXml, planSerialByColor(anP, { kind: "color", key: "000000" }));
  ok(outP.includes(">01.\t") && outP.includes(">07.\t") && outP.includes(">09.\t"),
    "১-অঙ্কের নম্বরে প্যাডিং থাকে: 01. 07. 09.");
  ok(outP.includes(">10.\t"), "১০ অপরিবর্তিত (প্যাড-উইডথ ছাড়িয়ে গেলে স্বাভাবিক)");
  ok(!outP.includes(">1.\t") && !outP.includes(">7.\t"), "প্যাড-হারানো নম্বর (1./7.) নেই");
}

// ============================================================
// শাফল মোডের হেডার-স্ট্রিপ: "header takle bad diye sob ek serial e shuffle"
// ============================================================

const { stripShadedParasXml } = await import("../src/lib/mcq/color-serial");
const { parseDocxXml } = await import("../src/lib/mcq/docx-xml");

console.log("\n== ৭) stripShadedParasXml (শাফল মোডে হেডার বাদ) ==");
{
  // সিনথেটিক: লিড + হেডার(B1) + প্রশ্ন + সাদা-শেড প্যারা + হেডার(A5) + প্রশ্ন
  const tableWithShadedCell =
    `<w:tbl><w:tr><w:tc><w:p xmlns:w="${W}"><w:pPr><w:shd w:val="clear" w:fill="000000"/></w:pPr>` +
    `<w:r><w:t>টেবিলের ভিতরের শেড</w:t></w:r></w:p></w:tc></w:tr></w:tbl>`;
  const body =
    plainP("ভূমিকা — প্রশ্নব্যাংক") +
    shadedP("অধ্যায়-১", "000000") +
    q("1.ক-১") + q("2.ক-২") +
    `<w:p xmlns:w="${W}"><w:pPr><w:shd w:val="clear" w:fill="FFFFFF"/></w:pPr><w:r><w:t xml:space="preserve">সাদা-শেড (হেডার না)</w:t></w:r></w:p>` +
    shadedP("সাব-১", "A6A6A6") +
    q("3.ক-৩") +
    tableWithShadedCell +
    shadedP("", "000000"); // খালি শেডেড সেপারেটর প্যারা
  const xml1 = wrapDoc(body);

  const st = stripShadedParasXml(xml1);
  ok(st.removed === 3, `টপ-লেভেল শেডেড ৩টা প্যারা বাদ (২ হেডার + ১ খালি), বাদ পড়েছে ${st.removed}`);
  ok(!st.xml.includes("অধ্যায়-১") && !st.xml.includes("সাব-১"), "হেডার-টেক্সট আউটপুটে নেই");
  ok(st.xml.includes("ক-১") && st.xml.includes("ক-২") && st.xml.includes("ক-৩"), "সব প্রশ্ন অক্ষত");
  ok(st.xml.includes("ভূমিকা"), "নন-শেড লিড প্যারা অক্ষত");
  ok(st.xml.includes("সাদা-শেড"), "সাদা (FFFFFF) শেড বাদ পড়ে না");
  ok(st.xml.includes("টেবিলের ভিতরের শেড"), "টেবিলের ভিতরের শেড কখনো বাদ পড়ে না (depth-1 মাত্র)");
  ok(st.xml.includes("<w:sectPr/>"), "sectPr অক্ষত");

  // রঙহীন ফাইল → byte-identical
  const noColor = wrapDoc(q("1.এক") + q("2.দুই"));
  const st0 = stripShadedParasXml(noColor);
  ok(st0.removed === 0 && st0.xml === noColor, "রঙহীন ফাইলে removed=0, XML হুবহু এক");

  // স্ট্রিপ-এর পরে পার্স → সব প্রশ্ন এক সিরিয়ালে ধরা পড়ে
  const parsed1 = parseDocxXml(st.xml);
  ok(parsed1.questions.length === 3, `স্ট্রিপ-এর পরে পার্সে ৩ প্রশ্ন, পাওয়া গেল ${parsed1.questions.length}`);

  // আসল ফাইল ১: Agri (9 ধূসর অধ্যায় + 126 কালো Type হেডার, ৪৩৫ প্রশ্ন)
  try {
    const agriFile = "upload/Agri MCQ Botany 997 mcq - Copy - type serial.docx";
    const agriZip = await JSZip.loadAsync((await import("node:fs")).readFileSync(agriFile));
    const agriXml = await agriZip.file("word/document.xml")!.async("string");
    const anA = analyzeColorDocx(agriXml);
    const stA = stripShadedParasXml(agriXml);
    ok(stA.removed === anA.shadedCount, `Agri: বাদ পড়া ${stA.removed} == শেডেড ${anA.shadedCount}`);
    ok(stA.xml.length < agriXml.length, "স্ট্রিপ-এর পরে XML ছোট");
    const parsedA = parseDocxXml(stA.xml);
    ok(
      parsedA.questions.length === anA.questionCount,
      `Agri: স্ট্রিপ-পরবর্তী পার্সে ${parsedA.questions.length} প্রশ্ন == রঙ-বিশ্লেষণের ${anA.questionCount} (হেডার ছাড়া এক সিরিয়ালে সব ধরা পড়ে)`
    );
    // স্ট্রিপ-এর পরে আর কোনো শেডেড হেডারই অবশিষ্ট নেই — শাফলে হেডার যাবেই না
    // (নোট: ফাইলে নিজের ১টা নন-শেডেড "Aa¨vq-8" লাইন থাকে — রঙ না দেওয়ায় সেটা
    //  কনটেন্ট, প্রশ্নের সাথেই থাকে; রঙই হেডারের একমাত্র নির্ভরযোগ্য চিহ্ন)
    const anA2 = analyzeColorDocx(stA.xml);
    ok(anA2.shadedCount === 0 && anA2.colors.length === 0, "Agri: স্ট্রিপ-এর পরে শেডেড হেডার শূন্য (সব ১৩৫টা বাদ)");
  } catch (e) {
    ok(false, `Agri রিয়েল-ফাইল টেস্ট: ${String(e)}`);
  }

  // আসল ফাইল ২: HSC'27 নমুনা (৬টা B1 কালো হেডার, ৬০ প্রশ্ন)
  try {
    const hscZip = await JSZip.loadAsync((await import("node:fs")).readFileSync("public/sample/hsc27-physics-bijoy.docx"));
    const hscXml = await hscZip.file("word/document.xml")!.async("string");
    const anH = analyzeColorDocx(hscXml);
    const stH = stripShadedParasXml(hscXml);
    ok(stH.removed === anH.shadedCount, `HSC নমুনা: বাদ ${stH.removed} == শেডেড ${anH.shadedCount}`);
    const parsedH = parseDocxXml(stH.xml);
    ok(
      parsedH.questions.length === anH.questionCount && parsedH.questions.length === 60,
      `HSC নমুনা: স্ট্রিপ-পরবর্তী ${parsedH.questions.length} প্রশ্ন == ${anH.questionCount} (৬০ প্রত্যাশিত)`
    );
    // আউটপুটে আর কোনো B1-শেড প্যারা নেই
    ok(!stH.xml.includes('w:fill="000000"'), "HSC নমুনা: স্ট্রিপ-এর পরে B1-শেড শূন্য");
  } catch (e) {
    ok(false, `HSC নমুনা টেস্ট: ${String(e)}`);
  }
}

console.log(`\n===== ফলাফল: ${passed} পাস, ${failed} ফেল =====`);
process.exit(failed ? 1 : 0);
