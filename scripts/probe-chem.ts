// ============================================================
// Chemistry ফাইল probe — B1 plan=0 এবং XML corruption দুটোই ধরার জন্য
// রান: bun run scripts/probe-chem.ts
// ============================================================

import { readFileSync, writeFileSync } from "node:fs";
import { JSDOM } from "jsdom";

const dom = new JSDOM("<!doctype html><html><body></body></html>");
(globalThis as unknown as Record<string, unknown>).DOMParser = dom.window.DOMParser;
(globalThis as unknown as Record<string, unknown>).XMLSerializer = dom.window.XMLSerializer;

const { analyzeColorDocx, planSerialByColor, applyColorSerialXml } = await import(
  "../src/lib/mcq/color-serial"
);
const { extractParaText, detectSerialPrefix, isQuestionStart, countRunTabs } = await import(
  "../src/lib/mcq/docx-xml"
);

const xml = readFileSync("/tmp/chem/word/document.xml", "utf-8");
console.log("xml length:", xml.length);

const analysis = analyzeColorDocx(xml);
console.log("\ncolors:", analysis.colors.map((c) => `${c.name}:${c.sections}`).join("  "));
console.log("questionCount:", analysis.questionCount, " shaded:", analysis.shadedCount);

// ---- B1 প্ল্যান কেন 0 হয় তা খুঁজি ----
const B1 = analysis.colors.find((c) => c.key === "000000");
console.log("\nB1 key found:", B1);
const planB1 = planSerialByColor(analysis, { kind: "color", key: "000000" });
console.log("B1 plan size:", planB1.size);

// B1 হেডারের ঠিক পরের ৫টা প্যারার ডিটেকশন স্টেট দেখাই
const doc = new dom.window.DOMParser().parseFromString(xml, "application/xml");
const body = doc.getElementsByTagNameNS("http://schemas.openxmlformats.org/wordprocessingml/2006/main", "body")[0];
const kids = Array.from(body.children) as Element[];
const texts = kids.map((el) => (el.localName === "p" ? extractParaText(el) : ""));
const hasTabs = kids.map((el) => (el.localName === "p" ? countRunTabs(el) > 0 : false));
const nextNonEmpty = (from: number): string | null => {
  for (let j = from; j < kids.length; j++) {
    if (kids[j].localName !== "p") continue;
    if (texts[j].trim()) return texts[j];
  }
  return null;
};

// body-children এ B1 কোথায়?
for (let i = 0; i < kids.length; i++) {
  if (kids[i].localName !== "p") continue;
  const pPr = Array.from(kids[i].children).find((c) => c.localName === "pPr");
  const shd = pPr ? Array.from(pPr.children).find((c) => c.localName === "shd") : null;
  if (!shd) continue;
  const fill = shd.getAttribute("w:fill") ?? "";
  if (fill === "000000") {
    console.log(`\n=== B1 header @body[${i}]: [${texts[i].slice(0, 60)}]`);
    for (let j = i + 1; j <= i + 5 && j < kids.length; j++) {
      const t = texts[j];
      const si = detectSerialPrefix(t);
      const okQ = si ? isQuestionStart(si, hasTabs[j], nextNonEmpty(j + 1)) : false;
      console.log(
        `  +${j - i}: tab=${hasTabs[j]} serial=${si ? `${si.digits}${si.separator}` : "—"} q=${okQ} [${t.slice(0, 60)}]`
      );
      if (!si && t.trim()) {
        // কেন সিরিয়াল ধরা পড়ল না
        console.log(`        first chars: ${JSON.stringify(t.slice(0, 12))}`);
      }
    }
  }
}

// ---- apply → XML ভ্যালিড? ----
const planA3 = planSerialByColor(analysis, { kind: "color", key: "D9D9D9" });
console.log("\nA3 plan size:", planA3.size);
if (planA3.size > 0) {
  const t0 = Date.now();
  const out = applyColorSerialXml(xml, planA3);
  console.log("apply ms:", Date.now() - t0, " out len:", out.length);
  writeFileSync("/tmp/chem/out-a3.xml", out);
  // re-parse validation
  const re = new dom.window.DOMParser().parseFromString(out, "application/xml");
  console.log("re-parse parsererror:", re.getElementsByTagName("parsererror").length);
}
