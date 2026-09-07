// ============================================================
// gen-e2e-fixtures.ts — sandbox-রোলব্যাকে হারানো upload/ ফিক্সচার পুনঃসৃজন
// ============================================================
// প্রাইভেসি-সেফ সিনথেটিক পরীক্ষা-স্টাইল MCQ কনটেন্ট দিয়ে JSZip-এ মিনিমাল
// বৈধ .docx বানায় — প্রতিটা E2E/unit স্ক্রিপ্টের অ্যাসার্শন মিলিয়ে:
//
//   color-free-test.docx
//     → e2e-modes (B/D/E), e2e-mode-tabs, e2e-multi-file, e2e-shuffle-headers §৬
//     • কোনো শেড-প্যারা নেই (serial মোডে NoColorSerialCard / "রঙ-হেডার পাওয়া যায়নি")
//     • প্রশ্ন-টেক্সট রান ≥৮ অক্ষর (e2e-multi-file contentOverlap)
//
//   Final Chemistry 1st paper only varsity Question (1-5).docx
//     → e2e-mode-tabs §৩ (চিপ A3/A4/B1/B6), e2e-modes B, e2e-multi-file (markerOf)
//     • ৪ রঙ: B6(0D0D0D) অধ্যায়-১, B1(000000) অধ্যায়-২…৩, A4(BFBFBF) Type, A3(D9D9D9) varsity
//     • B1-প্ল্যানে ≥১ প্রশ্ন (B1 চিপ-ডাউনলোড অ্যাসার্ট)
//     • সিরিয়াল ও লেখা আলাদা w:t-রানে (রিনাম্বারে লেবা-রান অক্ষত → markerOf পাস)
//
//   Physics 1st Paper Chapter-10 (Raw).docx
//     → e2e-reference (৫০ প্রশ্ন, ৪৮-এ ট্যাগ → "48 টি প্রশ্নে সোর্স-ট্যাগ", strip→০ টোকেন, উত্তর ≥৪৫),
//       e2e-modes B (রঙ-কার্ড B1) + C (রিডাউনলোড), test-reference §২–৩ (keep/strip/endline)
//     • ঠিক ৫০ প্রশ্ন, K/L/M/N অপশন-রো, "Dt X" উত্তর-লাইন, ৪৮-এ ঝোলা [CU-A: 22-23]-জাতীয় ট্যাগ
//     • ১টা B1(000000) শেড-হেডার (serial মোডে রঙ-কার্ড + B1 চিপ)
//
//   Physics 1st Paper Chapter-09/01/02 (Raw).docx
//     → e2e-modes C4 (মার্জ), test-reference §২ (প্রতি ফাইলে ≥১০ ট্যাগ-প্রশ্ন; মোট প্রশ্ন ৫০০+)
//     • ১৬০ প্রশ্ন × ৩ + ৫০ = ৫৩০; প্রতি ফাইলে ২০ ট্যাগ-প্রশ্ন
//
//   Agri MCQ Botany 997 mcq - Copy - type serial.docx
//     → test-color-serial §৪+§৭ (কাঠো কাঠামো), e2e-shuffle-headers §৭ (ব্লকড-লিস্ট)
//     • রং ঠিক ২টা: 000000(B1) ×১২৬ Type-হেডার + D0CECE(কাস্টম) ×৯ অধ্যায়-হেডার = ১৩৫ শেড
//     • প্রশ্ন ঠিক ৪৩৫ (pipe সেপারেটর "1|"), ১২২ Type-সেকশনে প্রশ্ন + ৪ খালি
//     • ১টা রঙহীন নন-MCQ লাইন "Aa¨vq-8" (ব্লকড ১৩৬ = ১৩৫ রঙ + ১ প্যাটার্ন; প্রিভিউ-৮-এর বাইরে)
//     • সব প্রশ্ন অধ্যায়ের ভিতরে (D0CECE-প্ল্যানেও ৪৩৫), B1-প্ল্যান idempotent, আউটপুটে pipe শূন্য
//
// রান: bun run scripts/gen-e2e-fixtures.ts   (শেষে নিজেই lib-দিয়ে সব কাউন্ট যাচাই করে)
// ============================================================
import { writeFileSync, readFileSync, mkdirSync } from "node:fs";
import JSZip from "jszip";

const OUT = "/home/z/my-project/upload";
mkdirSync(OUT, { recursive: true });

const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";

// ---------- XML হেল্পার ----------

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const run = (t: string) => `<w:r><w:t xml:space="preserve">${esc(t)}</w:t></w:r>`;

/** সাধারণ প্যারা; fill দিলে paragraph-shading (রঙ-হেডার) */
const para = (inner: string, fill?: string) =>
  `<w:p><w:pPr>${fill ? `<w:shd w:val="clear" w:color="auto" w:fill="${fill}"/>` : ""}</w:pPr>${inner}</w:p>`;

const plain = (t: string) => para(run(t));

/** সিরিয়াল আলাদা রানে — রিনাম্বার শুধু এই রান বদলায়, লেখার রান বাইট-অক্ষত থাকে */
const qPara = (serial: string, text: string) => para(run(serial) + run(text));

const docXml = (body: string) =>
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="${W}"><w:body>${body}<w:sectPr/></w:body></w:document>`;

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`;

const RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`;

async function writeDocx(name: string, body: string): Promise<number> {
  const zip = new JSZip();
  zip.file("[Content_Types].xml", CONTENT_TYPES);
  zip.file("_rels/.rels", RELS);
  zip.folder("word")!.file("document.xml", docXml(body));
  const buf = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
  writeFileSync(`${OUT}/${name}`, buf);
  return buf.length;
}

const bn = (n: number) => String(n).replace(/\d/g, (d) => "০১২৩৪৫৬৭৮৯"[Number(d)]);

const BN_LETTERS = ["ক", "খ", "গ", "ঘ"];
const ANSWER_BN = ["ক", "খ", "গ", "ঘ"];
const ANSWER_EN = ["K", "L", "M", "N"];

/** বাংলা-অপশন প্রশ্নের ৪ অপশন এক প্যারায় */
const optsBn = (n: number) =>
  plain(BN_LETTERS.map((l, i) => `${l}) বিকল্প-${l}-${n + i}`).join(" "));

/** English K/L/M/N অপশন — প্রতিটা নিজের প্যারায় (test-reference §৩-র option-row রেজেক্স) */
const optsEnParas = (n: number) =>
  BN_LETTERS.map((l, i) => plain(`${ANSWER_EN[i]}. বিকল্প-${l}-${n + i}`)).join("");

// ---------- ১. color-free-test.docx — রঙহীন ১২ প্রশ্ন ----------

function buildColorFree(): string {
  const texts = [
    "পানির রাসায়নিক সংকেত কোনটি?",
    "বাতাসে সবচেয়ে বেশি কোন গ্যাস থাকে?",
    "মানবদেহের সবচেয়ে বড় অঙ্গ কোনটি?",
    "সূর্যের নিকটতম গ্রহ কোনটি?",
  ];
  const body: string[] = [];
  for (let i = 1; i <= 12; i++) {
    body.push(qPara(`${bn(i)}.`, ` ${texts[(i - 1) % texts.length]} (নমুনা ${i})`));
    body.push(optsBn(i));
    body.push(plain(`উত্তর: ${ANSWER_BN[i % 4]}`));
  }
  return body.join("");
}

// ---------- ২. Final Chemistry … (1-5).docx — B6/B1/A4/A3 রঙ-কাঠামো, ১৬ প্রশ্ন ----------

function buildChem(): string {
  let qn = 0;
  const parts: string[] = [];
  /** এক সেকশন = হেডার(শেড) + n প্রশ্ন (সিরিয়াল ১..n রিস্টার্ট) */
  const section = (text: string, fill: string, n: number) => {
    parts.push(para(run(text), fill));
    for (let i = 1; i <= n; i++) {
      qn++;
      parts.push(qPara(`${bn(i)}.`, ` রসায়ন নমুনা প্রশ্ন ${qn}: সঠিক যৌগটি কোনটি?`));
      parts.push(optsBn(qn));
      parts.push(plain(`উত্তর: ${ANSWER_BN[qn % 4]}`));
    }
  };
  // অধ্যায়-১ (B6) — অধ্যায়-২…৩ (B1) — Type (A4) — varsity (A3)
  section("অধ্যায়-১ — রসায়ন প্রথম পত্র", "0D0D0D", 0);
  section("Type-১ — বহুনির্বাচনি", "BFBFBF", 2);
  section("ঢাকা বিশ্ববিদ্যালয় (ক)", "D9D9D9", 1);
  section("রাজশাহী বিশ্ববিদ্যালয় (ক)", "D9D9D9", 1);
  section("চট্টগ্রাম বিশ্ববিদ্যালয় (ক)", "D9D9D9", 1);
  section("Type-২ — বহুনির্বাচনি", "BFBFBF", 1);
  section("অধ্যায়-২ — রসায়ন প্রথম পত্র", "000000", 0);
  section("Type-৩ — বহুনির্বাচনি", "BFBFBF", 2);
  section("খুলনা বিশ্ববিদ্যালয় (ক)", "D9D9D9", 1);
  section("যবিপ্রবি (ক)", "D9D9D9", 1);
  section("জাবি (ক)", "D9D9D9", 1);
  section("Type-৪ — বহুনির্বাচনি", "BFBFBF", 1);
  section("অধ্যায়-৩ — রসায়ন প্রথম পত্র", "000000", 0);
  section("Type-৫ — বহুনির্বাচনি", "BFBFBF", 2);
  section("ইবি (ক)", "D9D9D9", 1);
  section("কুবি (ক)", "D9D9D9", 1);
  return parts.join("");
}

// ---------- ৩. Physics … Chapter-NN (Raw).docx — K/L/M/N + Dt উত্তর + রেফ-ট্যাগ ----------

const REF_TAGS = [
  "[CU-A: 22-23]",
  "[JU-A: 20-21]",
  "[DU-A: 19-20]",
  "[RU-A: 18-19]",
  "[KU-A: 17-18]",
  "[BAU-03-04]",
];

/**
 * raw ফিক্সচার — count প্রশ্ন, প্রতি ৮-এ ট্যাগ (untagged-এ ব্যতিক্রম), ১টা B1 হেডার (hasHeader হলে)।
 * untaggedSet-এর প্রশ্নগুলোতে ট্যাগ বাদ (Chapter-10-এ ঠিক ৪৮/৫০ ট্যাগ-প্রশ্ন ধরতে)।
 */
function buildRaw(count: number, hasHeader: boolean, untaggedSet: Set<number>): string {
  const parts: string[] = [];
  if (hasHeader) parts.push(para(run("অধ্যায়-সংগ্রহ — পদার্থবিজ্ঞান প্রথম পত্র"), "000000"));
  for (let i = 1; i <= count; i++) {
    const tag = untaggedSet.has(i) ? "" : ` ${REF_TAGS[Math.floor((i - 1) / 8) % REF_TAGS.length]}`;
    parts.push(qPara(`${i}.`, ` পদার্থবিজ্ঞান নমুনা প্রশ্ন ${i}: সঠিক উত্তরটি কোনটি?${tag}`));
    parts.push(optsEnParas(i));
    parts.push(plain(`Dt ${ANSWER_EN[i % 4]}`));
  }
  return parts.join("");
}

// ---------- ৪. Agri MCQ Botany … — কাঠো কাঠামো: ৯ অধ্যায় × ১৪ Type = ১২৬, ৪৩৫ প্রশ্ন ----------

function buildAgri(): string {
  // ১২২টা প্রশ্ন-যুক্ত Type-সেকশন (প্রথম ৬৯-টায় ৪ প্রশ্ন, বাকি ৫৩-টায় ৩) + ৪ খালি = ১২৬
  // ৬৯×৪ + ৫৩×৩ = ২৭৬ + ১৫৯ = ৪৩৫
  const EMPTY = new Set([10, 40, 70, 100]); // গ্লোবাল Type-সেকশন নম্বর (১-ভিত্তিক)
  const counts: number[] = [];
  let nonEmpty = 0;
  for (let s = 1; s <= 126; s++) {
    if (EMPTY.has(s)) { counts.push(0); continue; }
    counts.push(nonEmpty < 69 ? 4 : 3);
    nonEmpty++;
  }
  if (counts.reduce((a, b) => a + b, 0) !== 435) throw new Error("Agri বিন্যাস ভাঙা — ৪৩৫ হওয়ার কথা");

  const parts: string[] = [];
  let qn = 0;
  for (let ch = 1; ch <= 9; ch++) {
    parts.push(para(run(`অধ্যায়-${bn(ch)} — উদ্ভিদবিজ্ঞান সংগ্রহ`), "D0CECE"));
    if (ch === 5) parts.push(plain("Aa¨vq-8")); // রঙহীন নন-MCQ লাইন (Bijoy "অধ্যায়-8") — প্যাটার্ন-স্ট্রিপে ধরা পড়ে
    for (let sec = 1; sec <= 14; sec++) {
      const g = (ch - 1) * 14 + sec;
      parts.push(para(run(`Type-${g} — প্রশ্নসেট`), "000000"));
      for (let i = 1; i <= counts[g - 1]; i++) {
        qn++;
        // pipe সেপারেটর — আসল ফাইলের "44|g~L¨vq…" স্টাইল; সিরিয়াল প্রতি Type-এ ১ থেকে রিস্টার্ট
        parts.push(qPara(`${i}|`, ` বটনি নমুনা প্রশ্ন-${qn} — সালোকসংশ্লেষণ সম্পর্কিত সঠিক তথ্যটি কোনটি?`));
        parts.push(optsBn(qn));
      }
    }
  }
  return parts.join("");
}

// ============================================================
// জেনারেশন
// ============================================================

console.log("→ ফিক্সচার জেনারেট হচ্ছে:", OUT);
const sizes: Array<[string, number]> = [];
sizes.push(["color-free-test.docx", await writeDocx("color-free-test.docx", buildColorFree())]);
sizes.push(["Final Chemistry 1st paper only varsity Question (1-5).docx", await writeDocx("Final Chemistry 1st paper only varsity Question (1-5).docx", buildChem())]);
sizes.push(["Physics 1st Paper Chapter-10 (Raw).docx", await writeDocx("Physics 1st Paper Chapter-10 (Raw).docx", buildRaw(50, true, new Set([25, 47])))]);
sizes.push(["Physics 1st Paper Chapter-09 (Raw).docx", await writeDocx("Physics 1st Paper Chapter-09 (Raw).docx", buildRaw(160, false, new Set()))]);
sizes.push(["Physics 1st Paper Chapter-01 (Raw).docx", await writeDocx("Physics 1st Paper Chapter-01 (Raw).docx", buildRaw(160, false, new Set()))]);
sizes.push(["Physics 1st Paper Chapter-02 (Raw).docx", await writeDocx("Physics 1st Paper Chapter-02 (Raw).docx", buildRaw(160, false, new Set()))]);
sizes.push(["Agri MCQ Botany 997 mcq - Copy - type serial.docx", await writeDocx("Agri MCQ Botany 997 mcq - Copy - type serial.docx", buildAgri())]);
for (const [n, s] of sizes) console.log(`  ✓ ${n} — ${s} bytes`);

// ============================================================
// সেলফ-ভেরিফিকেশন — লেখা ফাইল আবার পড়ে আসল lib-দিয়ে প্রতিটা অ্যাসার্শন
// ============================================================

const dom = new (await import("jsdom")).JSDOM("<!doctype html><html><body></body></html>");
const g = globalThis as unknown as Record<string, unknown>;
g.DOMParser = dom.window.DOMParser;
g.XMLSerializer = dom.window.XMLSerializer;

const { parseDocxXml } = await import("../src/lib/mcq/docx-xml");
const {
  analyzeColorDocx,
  planSerialByColor,
  applyColorSerialXml,
  stripShadedParasXml,
  stripNonMcqLinesXml,
} = await import("../src/lib/mcq/color-serial");
const { analyzeRefReport } = await import("../src/lib/mcq/reference");

let failed = 0;
const ok = (cond: boolean, name: string, extra = "") => {
  if (cond) console.log("  ✓", name, extra);
  else { failed++; console.error("  ✗ FAIL:", name, extra); }
};
const readXml = async (name: string) => {
  const z = await JSZip.loadAsync(readFileSync(`${OUT}/${name}`));
  return z.file("word/document.xml")!.async("string");
};

console.log("\n== সেলফ-ভেরিফিকেশন ==");

// ---- color-free ----
{
  const xml = await readXml("color-free-test.docx");
  const an = analyzeColorDocx(xml);
  ok(an.colors.length === 0 && an.shadedCount === 0, "color-free: শেড-প্যারা শূন্য");
  ok(an.questionCount === 12, "color-free: ১২ প্রশ্ন", `(${an.questionCount})`);
  const p = parseDocxXml(xml);
  ok(p.questions.length === 12 && p.questions.every((q) => q.options.length === 4), "color-free: পার্সে ১২ প্রশ্ন × ৪ অপশন");
  ok(p.questions.every((q) => q.answer), "color-free: সব প্রশ্নে উত্তর");
  const cont = planSerialByColor(an, { kind: "continuous" });
  ok(cont.size === 12, "color-free: continuous প্ল্যানে ১২");
  const texts = [...xml.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map((m) => m[1].trim());
  ok(texts.some((t) => t.length >= 8), "color-free: ≥৮-অক্ষর রান আছে (contentOverlap)");
}

// ---- Chemistry ----
{
  const xml = await readXml("Final Chemistry 1st paper only varsity Question (1-5).docx");
  const an = analyzeColorDocx(xml);
  const codes = an.colors.map((c) => c.name).sort();
  ok(JSON.stringify(codes) === JSON.stringify(["A3", "A4", "B1", "B6"]), "chem: চিপ A3/A4/B1/B6", `(${codes.join(",")})`);
  ok(an.questionCount === 16, "chem: ১৬ প্রশ্ন", `(${an.questionCount})`);
  const planB1 = planSerialByColor(an, { kind: "color", key: "000000" });
  ok(planB1.size >= 1, "chem: B1 প্ল্যান খালি নয়", `(${planB1.size})`);
  const p = parseDocxXml(xml);
  ok(p.questions.length === 16 && p.questions.every((q) => q.options.length === 4), "chem: পার্সে ১৬ প্রশ্ন × ৪ অপশন");
}

// ---- Physics (Raw) ----
{
  const xml10 = await readXml("Physics 1st Paper Chapter-10 (Raw).docx");
  const p10 = parseDocxXml(xml10);
  ok(p10.questions.length === 50, "ch10: ঠিক ৫০ প্রশ্ন", `(${p10.questions.length})`);
  const rep = analyzeRefReport(p10.questions);
  ok(!!rep && rep.questionCount === 48, "ch10: ৪৮ প্রশ্নে রেফ-ট্যাগ", `(${rep?.questionCount ?? 0})`);
  ok(p10.questions.every((q) => q.options.length === 4), "ch10: সব প্রশ্নে ৪ অপশন");
  ok(p10.questions.every((q) => q.answer), "ch10: ৫০/৫০ উত্তর");
  ok(p10.questions.every((q) => q.options[0].label === "K" && q.options[3].label === "N"), "ch10: K/L/M/N লেবেল");
  const an10 = analyzeColorDocx(xml10);
  ok(an10.colors.length === 1 && an10.colors[0].name === "B1", "ch10: B1 রঙ-হেডার (serial মোডে চিপ)");
  ok(planSerialByColor(an10, { kind: "color", key: "000000" }).size === 50, "ch10: B1 প্ল্যানে ৫০");

  let total = 0;
  for (const ch of ["09", "01", "02"]) {
    const xml = await readXml(`Physics 1st Paper Chapter-${ch} (Raw).docx`);
    const p = parseDocxXml(xml);
    const r = analyzeRefReport(p.questions);
    ok(p.questions.length === 160 && !!r && r.questionCount >= 10, `ch${ch}: ১৬০ প্রশ্ন, ${r?.questionCount ?? 0} ট্যাগ-প্রশ্ন (≥১০)`);
    total += p.questions.length;
  }
  ok(total + 50 >= 500, "test-reference §২: মোট (Raw) প্রশ্ন ৫০০+", `(${total + 50})`);
}

// ---- Agri — test-color-serial §৪ + §৭-এর হুবহু অ্যাসার্শন ----
{
  const xml = await readXml("Agri MCQ Botany 997 mcq - Copy - type serial.docx");
  const an = analyzeColorDocx(xml);
  ok(an.colors.length === 2, "agri: ২টা রঙ (000000 + D0CECE)", `(${an.colors.map((c) => c.key).join(",")})`);
  const cB = an.colors.find((c) => c.key === "000000");
  const cG = an.colors.find((c) => c.key === "D0CECE");
  ok(cB?.name === "B1" && cB.sections === 126, "agri: B1 × ১২৬ Type-হেডার", `(${cB?.sections})`);
  ok(cG?.name === "কাস্টম রঙ" && cG.sections === 9, "agri: D0CECE × ৯ অধ্যায়-হেডার", `(${cG?.sections})`);
  ok(an.questionCount === 435, "agri: ৪৩৫ প্রশ্ন", `(${an.questionCount})`);
  ok(an.shadedCount === 135, "agri: ১৩৫ শেড-হেডার", `(${an.shadedCount})`);

  // B1 প্ল্যান: ৪৩৫ প্রশ্ন, ১২২ সেকশনের প্রথম প্রশ্ন = ১ (৪ খালি বাদ)
  const planB1 = planSerialByColor(an, { kind: "color", key: "000000" });
  ok(planB1.size === 435, "agri: B1 প্ল্যানে ৪৩৫", `(${planB1.size})`);
  let firstOfSection: number[] = [];
  let seen = 0;
  for (const p of an.paras) {
    if (p.colorKey === "000000") { seen = 0; continue; }
    if (p.colorKey === null && planB1.has(p.idx)) {
      seen++;
      if (seen === 1) firstOfSection.push(planB1.get(p.idx)!);
    }
  }
  ok(firstOfSection.length === 122 && firstOfSection.every((n) => n === 1), "agri: ১২২ প্রশ্ন-যুক্ত Type-সেকশনের প্রথম প্রশ্ন = ১", `(${firstOfSection.length})`);

  // অধ্যায়-প্ল্যানেও ৪৩৫
  ok(planSerialByColor(an, { kind: "color", key: "D0CECE" }).size === 435, "agri: D0CECE প্ল্যানেও ৪৩৫");

  // apply → পুনঃবিশ্লেষণ: idempotent + pipe শূন্য
  const outXml = applyColorSerialXml(xml, planB1);
  const anB = analyzeColorDocx(outXml);
  ok(anB.questionCount === 435, "agri: আউটপুটেও ৪৩৫ প্রশ্ন");
  ok(anB.colors.length === 2 && anB.colors.find((c) => c.key === "000000")!.sections === 126, "agri: আউটপুটে রং/হেডার অক্ষত");
  const plan2 = planSerialByColor(anB, { kind: "color", key: "000000" });
  let same = true;
  for (const [idx, n] of planB1) if (plan2.get(idx) !== n) { same = false; break; }
  ok(same, "agri: আউটপুটে প্ল্যান idempotent");
  const pipes = anB.paras.filter((p) => p.isQuestion && /^\s*[0-9০-৯ø«ˆµ∏Ï¾˜Ùœ]+\s*\|/.test(p.text)).length;
  ok(pipes === 0, "agri: আউটপুটে pipe-সেপারেটর শূন্য");

  // §৭ — strip → parse → ৪৩৫; শেড শূন্য; নন-MCQ ঠিক ১টা ("Aa¨vq-8")
  const st = stripShadedParasXml(xml);
  ok(st.removed === an.shadedCount && st.removed === 135, "agri: শেড-স্ট্রিপে ১৩৫ বাদ", `(${st.removed})`);
  const parsed = parseDocxXml(st.xml);
  ok(parsed.questions.length === an.questionCount, "agri: স্ট্রিপ-পরবর্তী পার্সে ৪৩৫ প্রশ্ন", `(${parsed.questions.length})`);
  const an2 = analyzeColorDocx(st.xml);
  ok(an2.shadedCount === 0 && an2.colors.length === 0, "agri: স্ট্রিপ-এর পরে শেড শূন্য");
  const st2 = stripNonMcqLinesXml(st.xml);
  ok(st2.removed.length === 1 && st2.removed[0].text === "Aa¨vq-8", "agri: নন-MCQ ঠিক ১টা — 'Aa¨vq-8'", `(${st2.removed.map((r) => r.text).join("|")})`);
  const parsedFinal = parseDocxXml(st2.xml);
  ok(parsedFinal.questions.length === 435, "agri: ফুল-স্ট্রিপ-পরবর্তী পার্সেও ৪৩৫ (শাফল-পুল)", `(${parsedFinal.questions.length})`);
  // প্রিভিউ-৮-এ 'Aa¨vq-8' নেই (সে লিস্টের একেবারে শেষ দিকে)
  ok(!st.texts.slice(0, 8).includes("Aa¨vq-8"), "agri: ব্লকড-প্রিভিউ (প্রথম ৮)-এ 'Aa¨vq-8' নেই → expand লাগবে");
}

console.log(failed ? `\n❌ সেলফ-ভেরিফিকেশন ব্যর্থ (${failed})` : "\n✅ সেলফ-ভেরিফিকেশন সব-পাস");
process.exit(failed ? 1 : 0);
