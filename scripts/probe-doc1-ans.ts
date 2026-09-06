// উত্তর-হীন প্রশ্ন + ব্যাখ্যা কভারেজ প্রোব
import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";
import JSZip from "jszip";

const dom = new JSDOM("<!doctype html><html><body></body></html>");
(globalThis as unknown as Record<string, unknown>).DOMParser = dom.window.DOMParser;
(globalThis as unknown as Record<string, unknown>).XMLSerializer = dom.window.XMLSerializer;
(globalThis as unknown as Record<string, unknown>).Node = dom.window.Node;

const { parseDocxXml } = await import("../src/lib/mcq/docx-xml");

const zip = await JSZip.loadAsync(readFileSync("/home/z/my-project/upload/Doc1.docx"));
const xml = await zip.file("word/document.xml")!.async("string");
const res = parseDocxXml(xml);

const noAns = res.questions.filter((q) => !q.answer);
console.log(`উত্তর-হীন: ${noAns.length}`);
for (const q of noAns.slice(0, 8)) {
  console.log(`  #${q.serial} block ${q.blockStart}-${q.blockEnd} opts=${q.options.length}`);
  for (const p of q.paras) console.log(`    ${JSON.stringify(p.slice(0, 100))}`);
}

const withBek = res.questions.filter((q) => q.bekkha).length;
console.log(`\nব্যাখ্যাসহ: ${withBek}/${res.questions.length}`);
const noBek = res.questions.filter((q) => !q.bekkha);
console.log(`ব্যাখ্যা-হীন: ${noBek.length}`);
for (const q of noBek.slice(0, 5)) {
  console.log(`  #${q.serial} lastParas=${JSON.stringify(q.paras.slice(-2).map((p) => p.slice(0, 80)))}`);
}
// ব্যাখ্যা-টেক্সট নমুনা
const q1 = res.questions[0];
console.log(`\nQ1 ব্যাখ্যা (প্রথম ২০০): ${JSON.stringify(q1.bekkha?.slice(0, 200))}`);
// অপশন টেক্সটে কোথাও D:/e¨vL¨v লেগে আছে কি না
const dirty = res.questions.filter((q) => q.options.some((o) => /D:|Dt|e¨vL¨v/.test(o.text)));
console.log(`\nঅপশনে-উত্তর/ব্যাখ্যা-লাগানো (dirty): ${dirty.length}`);
for (const q of dirty.slice(0, 5)) console.log(`  #${q.serial}: ${JSON.stringify(q.options.map((o) => o.text.slice(0, 60)))}`);
