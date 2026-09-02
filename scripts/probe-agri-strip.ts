// প্রোব: Agri স্ট্রিপ-পরবর্তী পার্সে কোন প্রশ্নে "Aa¨vq"/"Type-" আছে
import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";
const dom = new JSDOM("<!doctype html><html><body></body></html>");
(globalThis as unknown as Record<string, unknown>).DOMParser = dom.window.DOMParser;
(globalThis as unknown as Record<string, unknown>).XMLSerializer = dom.window.XMLSerializer;

const { analyzeColorDocx, stripShadedParasXml } = await import("../src/lib/mcq/color-serial");
const { parseDocxXml } = await import("../src/lib/mcq/docx-xml");
const JSZip = (await import("jszip")).default;

const zip = await JSZip.loadAsync(readFileSync("upload/Agri MCQ Botany 997 mcq - Copy - type serial.docx"));
const xml = await zip.file("word/document.xml")!.async("string");

const st = stripShadedParasXml(xml);
const parsed = parseDocxXml(st.xml);

let n = 0;
for (const q of parsed.questions) {
  if (q.text.includes("Aa¨vq") || /^Type-\d/.test(q.text)) {
    n++;
    if (n <= 8) {
      console.log(`--- প্রশ্ন #${q.id} serial=${q.serial} blockStart=${q.blockStart}`);
      console.log(q.text.split("\n").slice(0, 4).map((l) => "   |" + l.slice(0, 90)).join("\n"));
    }
  }
}
console.log(`মোট ${n} টি প্রশ্ন ম্যাচ করে / ${parsed.questions.length}`);

// এই লাইনগুলো কি শেডেড ছিল? অরিজিনাল analyze দেখি
const an = analyzeColorDocx(xml);
const hdr = an.paras.filter((p) => p.colorKey && /Aa¨vq|Type-\d/.test(p.text));
console.log(`অরিজিনালে শেডেড Aa¨vq/Type হেডার: ${hdr.length} (সব বাদ হয়ে যাওয়ার কথা)`);
// নন-শেডেড Aa¨vq/Type লাইন আছে?
const nonShaded = an.paras.filter((p) => !p.colorKey && /Aa¨vq|Type-\d/.test(p.text));
console.log(`নন-শেডেড Aa¨vq/Type লাইন: ${nonShaded.length}`);
for (const p of nonShaded.slice(0, 6)) console.log(`   idx=${p.idx} q=${p.isQuestion} |${p.text.slice(0, 80)}`);
