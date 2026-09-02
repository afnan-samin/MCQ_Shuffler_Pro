// ============================================================
// E2E: আসল Agri ফাইলে color-serial চালিয়ে আসল .docx আউটপুট বানায়
// রান: bun run scripts/e2e-color-agri.ts
// ============================================================

import { readFileSync, writeFileSync } from "node:fs";
import { JSDOM } from "jsdom";
import JSZip from "jszip";

const dom = new JSDOM("<!doctype html><html><body></body></html>");
(globalThis as unknown as Record<string, unknown>).DOMParser = dom.window.DOMParser;
(globalThis as unknown as Record<string, unknown>).XMLSerializer = dom.window.XMLSerializer;

const { analyzeColorDocx, planSerialByColor, applyColorSerialXml } = await import(
  "../src/lib/mcq/color-serial"
);

const SRC = "upload/Agri MCQ Botany 997 mcq - Copy - type serial.docx";
const OUT = "download/Agri MCQ Botany (color serial - B1).docx";

const buf = readFileSync(SRC);
const zip = await JSZip.loadAsync(buf);
const xml = await zip.file("word/document.xml")!.async("string");

// B1 (000000) = Type রঙ — প্রতি Type-এ ১ থেকে (ফাইলের নিজস্ব প্যাটার্ন)
const analysis = analyzeColorDocx(xml);
const plan = planSerialByColor(analysis, { kind: "color", key: "000000" });
const newXml = applyColorSerialXml(xml, plan);

const outZip = await JSZip.loadAsync(buf);
outZip.file("word/document.xml", newXml);
const outBuf = await outZip.generateAsync({
  type: "nodebuffer",
  mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  compression: "DEFLATE",
});
writeFileSync(OUT, outBuf);

console.log("✅ আউটপুট লেখা হয়েছে:", OUT);
console.log(`   প্ল্যান: ${plan.size} টি প্রশ্ন রিনাম্বার (B1/Type অনুযায়ী)`);
console.log(`   রঙ: ${analysis.colors.map((c) => `${c.name}×${c.sections}`).join(", ")}`);
