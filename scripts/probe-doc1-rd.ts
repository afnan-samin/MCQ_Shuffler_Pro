// Doc1.docx — redownload পার্ট-ডিটেকশন + সিরিয়াল-ইস্যু + পরের প্রশ্নের ফরম্যাট প্রোব
import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";
import JSZip from "jszip";

const dom = new JSDOM("<!doctype html><html><body></body></html>");
(globalThis as unknown as Record<string, unknown>).DOMParser = dom.window.DOMParser;
(globalThis as unknown as Record<string, unknown>).XMLSerializer = dom.window.XMLSerializer;
(globalThis as unknown as Record<string, unknown>).Node = dom.window.Node;

const { parseRedownloadXml } = await import("../src/lib/mcq/redownload");
const { parseDocxXml } = await import("../src/lib/mcq/docx-xml");

const path = process.argv[2] || "/home/z/my-project/upload/Doc1.docx";
const zip = await JSZip.loadAsync(readFileSync(path));
const xml = await zip.file("word/document.xml")!.async("string");

const rd = parseRedownloadXml(xml);
console.log(`Rd প্রশ্ন: ${rd.questions.length}`);
console.log(`kindCounts:`, JSON.stringify(rd.kindCounts));

const withAns = rd.questions.filter((q) => q.answer).length;
const withOpt = rd.questions.filter((q) => q.options.length >= 2).length;
console.log(`উত্তর: ${withAns}/${rd.questions.length}  অপশন≥২: ${withOpt}`);

const dx = parseDocxXml(xml);
console.log(`\nসিরিয়াল issues: ${dx.serial?.issues.length}`);
for (const is of (dx.serial?.issues ?? []).slice(0, 12)) {
  const q = dx.questions[is.index];
  console.log(`  #${is.index}: expected ${is.expected} found ${is.found} — "${q.qText.slice(0, 60).replace(/\n/g, "⏎")}"`);
}

// সিরিয়াল-জাম্প পয়েন্টে আসল প্যারাগুলো দেখি
function dumpBlock(qi: number, label: string) {
  const q = dx.questions[qi];
  console.log(`\n--- ${label} (প্রশ্ন #${qi}, serial ${q.serial}, block ${q.blockStart}-${q.blockEnd})`);
  for (const p of q.paras) console.log(`   ${JSON.stringify(p.slice(0, 90))}`);
}

for (const is of (dx.serial?.issues ?? []).slice(0, 3)) {
  dumpBlock(is.index - 1, "আগের প্রশ্ন");
  dumpBlock(is.index, "জাম্প প্রশ্ন");
}

// শেষের প্রশ্নগুলোর ফরম্যাট (২০০+ হলে)
if (dx.questions.length > 300) {
  dumpBlock(370, "শেষের দিকে");
  const last = dx.questions[dx.questions.length - 1];
  dumpBlock(dx.questions.length - 1, "সবশেষ");
}
