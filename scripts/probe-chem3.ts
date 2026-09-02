// Chemistry full-pipeline reproduction — SINGLE parse (মেমোরি-নিরাপদ)
// রান: bun run scripts/probe-chem3.ts <colorKey, যেমন D9D9D9 | 000000>
import { readFileSync, writeFileSync } from "node:fs";
import { JSDOM } from "jsdom";
import JSZip from "jszip";

const dom = new JSDOM("<!doctype html><html><body></body></html>");
(globalThis as unknown as Record<string, unknown>).DOMParser = dom.window.DOMParser;
(globalThis as unknown as Record<string, unknown>).XMLSerializer = dom.window.XMLSerializer;

const { analyzeColorDocx, planSerialByColor } = await import("../src/lib/mcq/color-serial");
const { renumberSerialParaTo, W_NS } = await import("../src/lib/mcq/docx-xml");

const KEY = process.argv[2] ?? "D9D9D9";
const xml = readFileSync("/tmp/chem/word/document.xml", "utf-8");

const analysis = analyzeColorDocx(xml);
const plan = planSerialByColor(analysis, { kind: "color", key: KEY });
console.log(`plan for ${KEY}: ${plan.size} questions`);
if (plan.size === 0) {
  console.log("plan খালি — এই রঙে নম্বর দেওয়ার কিছু নেই");
  process.exit(0);
}

// apply — একই parse ব্যবহার করি (applyColorSerialXml আবার parse করবে বলে নিজে করি)
const doc = new dom.window.DOMParser().parseFromString(xml, "application/xml");
const body = doc.getElementsByTagNameNS(W_NS, "body")[0];
const kids = Array.from(body.children) as Element[];
for (const [idx, num] of plan) {
  const el = kids[idx];
  if (el && el.localName === "p") renumberSerialParaTo(el, num, ".");
}
const out = new dom.window.XMLSerializer().serializeToString(doc);
const newXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n' + out;
writeFileSync(`/tmp/chem/out-${KEY}.xml`, newXml);
console.log("serialized:", newXml.length, "chars");

// zip rebuild (ব্রাউজারের downloadColorSerialDocx-এর মত)
const zip = await JSZip.loadAsync(readFileSync("/home/z/my-project/upload/Final Chemistry 1st paper only varsity Question (1-5).docx"));
zip.file("word/document.xml", newXml);
const buf = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
writeFileSync(`/tmp/chem/out-${KEY}.docx`, buf);
console.log("docx written:", buf.length, "bytes");

// পুরনো analysis রেফারেন্স ছেড়ে দিই GC-কে সুযোগ
console.log("done");
