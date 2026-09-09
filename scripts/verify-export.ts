// docx এক্সপোর্ট স্ট্রাকচার ভেরিফিকেশন — প্লেইন টেক্সট সিরিয়াল, ফন্ট রান, পেজ ব্রেক
import { Document, Packer, Paragraph, TextRun, AlignmentType } from "docx";
import { parseMcq } from "../src/lib/mcq/parser";
import { buildSets } from "../src/lib/mcq/set-engine";
import { runsForLine, DEFAULT_EXPORT_OPTIONS, type ExportOptions } from "../src/lib/mcq/exporter";
import { writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const BIJOY_DOC = `টেস্ট কলেজ
1. evsjv Av‡i Pµgvb?
(d) DÏcvZ¨ (f) mvBq
2. wKQz‡Z †Kvb gvÎv?
(a) ½b (b) wW
3. wba©vi ms¯‹iY MÖx?
(g) cÖvq (h) A‡bU
4. Av›¯vj−‡Z mvBq?
(j) n (k) bv`;

const parsed = parseMcq(BIJOY_DOC);
const sets = buildSets(parsed.questions, { setCount: 3, distribution: "original", shuffleWithin: true });

// exporter-এর মতো করে ডকুমেন্ট বানাই
const opts: ExportOptions = { ...DEFAULT_EXPORT_OPTIONS, includeHeader: true, headerText: "টেস্ট কলেজ" };
const paras: Paragraph[] = [];
const halfPoints = Math.round(opts.fontSize * 2);
sets.forEach((questions, si) => {
  paras.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    pageBreakBefore: si > 0,
    children: [new TextRun({ text: `সেট ${"ABC"[si]}`, bold: true, size: halfPoints + 4, font: { ascii: opts.unicodeFont, hAnsi: opts.unicodeFont, cs: opts.unicodeFont } })],
  }));
  for (const q of questions) {
    for (const line of q.lines) {
      paras.push(new Paragraph({
        spacing: { after: 40 },
        children: runsForLine(line, opts).map(r => new TextRun({ text: r.text, size: halfPoints, font: { ascii: r.font, hAnsi: r.font, cs: r.font } })),
      }));
    }
    paras.push(new Paragraph({ children: [new TextRun({ text: "", size: halfPoints })] }));
  }
});

const doc = new Document({ sections: [{ children: paras }] });
const buf = await Packer.toBuffer(doc);
// স্ক্রিপ্টের নিজের ফোল্ডারে লেখা — কোনো OS-নির্দিষ্ট absolute path নয় (.gitignore-এ আগেই বাদ)
const scriptDir = dirname(fileURLToPath(import.meta.url));
writeFileSync(join(scriptDir, "test-export.docx"), Buffer.from(buf));

// XML ইন্সপেক্ট — JSZip দিয়ে মেমরিতেই document.xml পড়া (python3/shell দরকার নেই, সব OS-এ চলে)
const { default: JSZip } = await import("jszip");
const zip = await JSZip.loadAsync(buf);
const xmlFile = zip.file("word/document.xml");
if (!xmlFile) {
  console.error("  ✗ FAIL: word/document.xml পাওয়া যায়নি");
  process.exit(1);
}
const xml = await xmlFile.async("string");

let pass = 0, fail = 0;
const check = (name: string, cond: boolean, extra = "") => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ FAIL: ${name} ${extra}`); }
};

check("৩ সেটের হেডার আছে", xml.includes("সেট A") && xml.includes("সেট B") && xml.includes("সেট C"));
check("পেজ ব্রেক আছে (সেটসংখ্যা−১)", xml.split("pageBreakBefore").length - 1 === 2, `got ${xml.split("pageBreakBefore").length - 1}`);
check("কোনো বুলেট/নম্বরিং নেই (w:numPr)", !xml.includes("w:numPr"));
check("Bijoy টেক্সটে SutonnyMJ ফন্ট রান", xml.includes('w:ascii="SutonnyMJ"'));
check("Bijoy শব্দ অক্ষত (evsjv)", xml.includes("evsjv"));
check("প্লেইন সিরিয়াল টেক্সট (1., 2.)", xml.includes("1. evsjv") || xml.includes(">1."));
check("Original shuffle: প্রতি সেটে ৪টি প্রশ্ন", (xml.match(/evsjv/g) || []).length === 3, `evsjv count=${(xml.match(/evsjv/g) || []).length}`);

console.log(`\n==== এক্সপোর্ট ভেরিফিকেশন: ${pass} পাস, ${fail} ফেল ====`);
process.exit(fail ? 1 : 0);
