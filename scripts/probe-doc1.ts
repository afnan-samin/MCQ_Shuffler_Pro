// ============================================================
// Doc1.docx (৪৬তম বিসিএস) — বর্তমান পাইপলাইনে পার্স টেস্ট
// রান: bun run scripts/probe-doc1.ts
// ============================================================
import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";
import JSZip from "jszip";

const dom = new JSDOM("<!doctype html><html><body></body></html>");
(globalThis as unknown as Record<string, unknown>).DOMParser = dom.window.DOMParser;
(globalThis as unknown as Record<string, unknown>).XMLSerializer = dom.window.XMLSerializer;
(globalThis as unknown as Record<string, unknown>).Node = dom.window.Node;

const { parseDocxXml } = await import("../src/lib/mcq/docx-xml");

const path = process.argv[2] || "/home/z/my-project/upload/Doc1.docx";
const zip = await JSZip.loadAsync(readFileSync(path));
const xml = await zip.file("word/document.xml")!.async("string");
const res = parseDocxXml(xml);

const withOpt = res.questions.filter((q) => q.options.length >= 2).length;
const withAns = res.questions.filter((q) => q.answer).length;
console.log(`প্রশ্ন: ${res.questions.length}  (অপশন≥২: ${withOpt}, উত্তর: ${withAns})  সিরিয়াল: ${res.serial?.status ?? "-"} (start ${res.serial?.startAt})`);
console.log(`separators: ${res.separators.length ? JSON.stringify(res.separators.slice(0, 5)) : "-"}`);

for (const q of res.questions.slice(0, 10)) {
  console.log(`\n=== #${q.serial} (block ${q.blockStart}-${q.blockEnd}, paras=${q.paras.length})`);
  console.log(`  qText: ${JSON.stringify(q.qText.slice(0, 90))}`);
  console.log(`  ans: ${JSON.stringify(q.answer)}`);
  for (const o of q.options) {
    console.log(`  opt ${o.label}: ${JSON.stringify(o.text.slice(0, 70))}${o.text.length > 70 ? ` …(len ${o.text.length})` : ""}`);
  }
}

// মোট স্ট্যাট
const optCounts = new Map<number, number>();
for (const q of res.questions) optCounts.set(q.options.length, (optCounts.get(q.options.length) ?? 0) + 1);
console.log(`\nঅপশন-কাউন্ট ডিস্ট্রিবিউশন:`, [...optCounts.entries()].sort((a, b) => a[0] - b[0]));
const paraCount = new Map<number, number>();
for (const q of res.questions) paraCount.set(q.paras.length, (paraCount.get(q.paras.length) ?? 0) + 1);
console.log(`প্রশ্ন-প্রতি-প্যারা ডিস্ট্রিবিউশন:`, [...paraCount.entries()].sort((a, b) => a[0] - b[0]).slice(0, 15));
