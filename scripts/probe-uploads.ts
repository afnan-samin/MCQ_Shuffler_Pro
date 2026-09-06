// ============================================================
// আপলোড করা Physics/Chemistry ফাইলগুলো বর্তমান পাইপলাইনে পার্স টেস্ট
// রান: bun run scripts/probe-uploads.ts
// ============================================================
import { readFileSync, readdirSync } from "node:fs";
import { JSDOM } from "jsdom";
import JSZip from "jszip";

const dom = new JSDOM("<!doctype html><html><body></body></html>");
(globalThis as unknown as Record<string, unknown>).DOMParser = dom.window.DOMParser;
(globalThis as unknown as Record<string, unknown>).XMLSerializer = dom.window.XMLSerializer;
(globalThis as unknown as Record<string, unknown>).Node = dom.window.Node;

const { parseDocxXml, extractParaText } = await import("../src/lib/mcq/docx-xml");

const UP = "/home/z/my-project/upload";
const files = readdirSync(UP).filter((f) => f.includes("(Raw)")).sort();

for (const name of files) {
  const zip = await JSZip.loadAsync(readFileSync(`${UP}/${name}`));
  const xml = await zip.file("word/document.xml")!.async("string");
  const res = parseDocxXml(xml);
  const withOpt = res.questions.filter((q) => q.options.length >= 2).length;
  const withAns = res.questions.filter((q) => q.answer).length;
  console.log(`\n${name}`);
  console.log(`  প্রশ্ন: ${res.questions.length}  (অপশন≥২: ${withOpt}, উত্তর: ${withAns})  সিরিয়াল: ${res.serial?.status ?? "-"} (start ${res.serial?.startAt})`);
  // প্রথম ৩ প্রশ্নের qText-এর শেষটা দেখি — reference কোথায় আটকে আছে
  for (const q of res.questions.slice(0, 3)) {
    console.log(`  #${q.serial}: q="${q.qText.slice(-60).replace(/\n/g, "⏎")}"`);
    console.log(`     opts=${q.options.length} ans=${q.answer} lastPara="${(q.paras[q.paras.length - 1] || "").slice(0, 50)}"`);
  }
  // স্ট্যান্ডঅ্যালোন reference লাইন কোন প্রশ্নের ভেতরে ঢুকেছে
  const saCount = res.questions.filter((q) => q.paras.some((p) => /^\s*[\[\(][^\[\]\(\)]{2,60}[\]\)]\s*\.?\s*$/.test(p))).length;
  console.log(`  স্ট্যান্ডঅ্যালোন-reference লাইনসহ প্রশ্ন: ${saCount}`);
}
