// ============================================================
// Weekly-file (SET A/B/C) regression — non-question blobs survive shuffle
// রান: bun run scripts/test-weekly-sets.ts
// কভার করে: খালি অপশন-লাইন ("A. B."), UwcK-ref লাইন, Topic-লাইন,
//   ফাইল-মেটা (Sub:/Time:) একবার, প্রতি-সেটে "Set X" হেডার, কোনো ড্রপ/ডুপ্লিকেট নয়
// ============================================================

import { readFileSync } from "node:fs";
import JSZip from "jszip";
import { JSDOM } from "jsdom";

const dom = new JSDOM("<!doctype html><html><body></body></html>");
(globalThis as unknown as Record<string, unknown>).DOMParser = dom.window.DOMParser;
(globalThis as unknown as Record<string, unknown>).XMLSerializer = dom.window.XMLSerializer;
(globalThis as unknown as Record<string, unknown>).Node = dom.window.Node;

const { parseDocxXml } = await import("../src/lib/mcq/docx-xml");
const { buildShuffledXml } = await import("../src/lib/mcq/docx-exporter");

const NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
let passed = 0;
let failed = 0;
function ok(cond: boolean, name: string) {
  if (cond) {
    passed++;
    console.log("  ✓", name);
  } else {
    failed++;
    console.error("  ✗ FAIL:", name);
  }
}

const z = await JSZip.loadAsync(readFileSync("Format/Weekly test 2 SET A,B,C.docx"));
const xml = await z.file("word/document.xml")!.async("string");
const res = parseDocxXml(xml);
const tOf = (p: Element) =>
  p.localName === "p"
    ? Array.from(p.getElementsByTagNameNS(NS, "t"))
        .map((t) => t.textContent ?? "")
        .join("")
    : `<${p.localName}>`;

console.log("\n== ১) পার্স ==");
ok(res.questions.length === 100, `১০০টি প্রশ্ন (পেয়েছি ${res.questions.length})`);

console.log("\n== ২) শাফল — ৩ সেটে কিছু হারায় না ==");
const ids = res.questions.map((q) => q.id);
const sets = [ids.slice(0, 34), ids.slice(34, 67), ids.slice(67)];
const out = buildShuffledXml(xml, res.questions, sets, { renumber: true, includeSetHeader: true });
const outDoc = new DOMParser().parseFromString(out, "application/xml");
const texts = Array.from(outDoc.getElementsByTagNameNS(NS, "body")[0].children).map((el) => tOf(el as Element));
const count = (re: RegExp, s: string) => (s.match(re) ?? []).length;
ok(count(/Uwc/g, out) === count(/Uwc/g, xml), `Uwc-লাইন সব অক্ষত (${count(/Uwc/g, out)})`);
ok(count(/Topic/g, out) === count(/Topic/g, xml), `Topic-লাইন সব অক্ষত (${count(/Topic/g, out)})`);
ok(texts.filter((t) => t.includes("Sub:")).length === 1, "ফাইল-মেটা (Sub:) ঠিক ১ বার — প্রতি-সেটে ডুপ্লিকেট নয়");
ok(texts.filter((t) => /^Set [A-Z]/.test(t.trim())).length === 3, "৩ সেটে ৩টা Set-হেডার");
ok(count(/Gi Ea/g, out) === count(/Gi Ea/g, xml), "GiEa-ব্লব অক্ষত");

console.log("\n== ৩) শাফলে টেইল নিজের প্রশ্নের সাথে ==");
const rev = buildShuffledXml(xml, res.questions, [[...ids].reverse()], { renumber: false, includeSetHeader: false });
const revTexts = Array.from(new DOMParser().parseFromString(rev, "application/xml").getElementsByTagNameNS(NS, "body")[0].children).map((el) => tOf(el as Element));
const iQ48 = revTexts.findIndex((t) => /^\s*48[.)]/.test(t));
const iTopic = revTexts.findIndex((t) => t.includes("nvB"));
ok(iQ48 >= 0 && iTopic === iQ48 + 3, "Topic-টেইল শাফলেও Q48-এর ঠিক পরেই");

console.log("\n========================================");
console.log(`ফলাফল: ${passed} পাস, ${failed} ফেল`);
console.log("========================================");
if (failed > 0) process.exit(1);
