// ============================================================
// Task 33-এক্সটেনশন প্রোব — Doc1.docx-এ ব্র্যাকেট-ছাড়া / বাংলা-বছরের
// রেফারেন্স-জাতীয় লাইন কতগুলো এখনো ধরা পড়ে না তা খুঁজে দেখে
// রান: bun run scripts/probe-ref-miss.ts
// ============================================================
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { JSDOM } from "jsdom";

const dom = new JSDOM("<!doctype html><html><body></body></html>");
(globalThis as unknown as Record<string, unknown>).DOMParser = dom.window.DOMParser;
(globalThis as unknown as Record<string, unknown>).XMLSerializer = dom.window.XMLSerializer;
(globalThis as unknown as Record<string, unknown>).Node = dom.window.Node;

const JSZip = (await import("jszip")).default;
const { parseDocxXml } = await import("../src/lib/mcq/docx-xml");
const { findRefTokens, analyzeRefReport } = await import("../src/lib/mcq/reference");

const UP = "/home/z/my-project/upload";
const files = existsSync(UP)
  ? readdirSync(UP).filter((f) => f.endsWith(".docx")).map((f) => `${UP}/${f}`)
  : [];
if (!files.length) {
  console.log("(upload/-এ কোনো .docx নেই)");
  process.exit(0);
}

for (const path of files) {
  const name = path.split("/").pop();
  const zip = await JSZip.loadAsync(readFileSync(path));
  const xml = await zip.file("word/document.xml")!.async("string");
  const parse = parseDocxXml(xml);
  const rep = analyzeRefReport(parse.questions);
  console.log(`\n═══ ${name}: ${parse.questions.length} প্রশ্ন, ডিটেক্টেড ${rep?.questionCount ?? 0}, টোকেন ${rep?.tokenCount ?? 0}`);
  if (rep?.samples.length) console.log("  স্যাম্পল:", rep.samples.join(" | "));

  // ব্র্যাকেট-ছাড়া রেফারেন্স-জাতীয় প্যাটার্ন — EN/BN দুই ডিজিটেই
  const yearBN = /[০-৯]{2}\s*[-–—]\s*[০-৯]{2}|[০-৯]{4}/;
  const yearEN = /\d{2}\s*[-–—]\s*\d{2}|(?<![\d])\d{4}(?![\d])/;
  const kw = /(বোর্ড|ভার্সি|বিশ্ববিদ্যালয়|মেডিকেল|মেডিক্যাল|ঢাবি|জাবি|চবি|রাবি|খুবি|শাবি|বুয়েট|কুয়েট|রুয়েট|চুয়েট|সাস্ট|কলেজ|নার্সিং|বিসিএস|প্রশ্নব্যাংক|পরীক্ষা|সাল|বর্ষ|board|university|college|exam|year|BCS|HSC|SSC|MBBS|DU\b|JU\b|CU\b|RU\b|KU\b|BUET)/i;
  const bijoyKw = /(wefxK|cÖhyw³)/;

  let missCount = 0;
  const shown = new Set<string>();
  for (const q of parse.questions) {
    for (const p of q.paras) {
      const t = p.trim();
      if (!t || findRefTokens(p).length) continue; // আগেই ধরা পড়ে
      const hasYear = yearBN.test(t) || yearEN.test(t);
      const hasKw = kw.test(t) || bijoyKw.test(t);
      const hasBracket = /[\[\(]/.test(t);
      if (hasYear && hasKw) {
        missCount++;
        const key = t.slice(0, 60);
        if (shown.size < 25 && !shown.has(key)) {
          shown.add(key);
          console.log(`  MISS${hasBracket ? "(ব্র্যাকেট-ভেতরে?)" : ""}: ${t.slice(0, 90)}`);
        }
      }
    }
  }
  console.log(`  → আন-ডিটেক্টেড রেফারেন্স-জাতীয় লাইন: ${missCount}`);
}
