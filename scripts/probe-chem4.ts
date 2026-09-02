// নতুন synthetic-এ protection ট্রেস
import { JSDOM } from "jsdom";
const dom = new JSDOM("<!doctype html><html><body></body></html>");
(globalThis as unknown as Record<string, unknown>).DOMParser = dom.window.DOMParser;
(globalThis as unknown as Record<string, unknown>).XMLSerializer = dom.window.XMLSerializer;

const { analyzeColorDocx, planSerialByColor } = await import("../src/lib/mcq/color-serial");

const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const shadedP = (text: string, fill: string) =>
  `<w:p xmlns:w="${W}"><w:pPr><w:shd w:val="clear" w:color="auto" w:fill="${fill}"/></w:pPr><w:r><w:t xml:space="preserve">${text}</w:t></w:r></w:p>`;
const q = (text: string) =>
  `<w:p xmlns:w="${W}"><w:r><w:t xml:space="preserve">${text}</w:t></w:r></w:p>`;
const wrapDoc = (body: string) =>
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="${W}"><w:body>${body}<w:sectPr/></w:body></w:document>`;

const chem: Array<["h" | "q", string | null, string]> = [
  ["h", "0D0D0D", "অধ্যায়-১"],
  ["h", "BFBFBF", "Type-১"],
  ["q", null, "1.প্রশ্ন-১"],
  ["q", null, "2.প্রশ্ন-২"],
  ["h", "D9D9D9", "ঢাকা বিশ্ববিদ্যালয়"],
  ["q", null, "3.প্রশ্ন-৩"],
  ["q", null, "4.প্রশ্ন-৪"],
  ["h", "BFBFBF", "Type-২"],
  ["q", null, "5.প্রশ্ন-৫"],
  ["h", "000000", "অধ্যায়-২"],
  ["h", "BFBFBF", "Type-৩"],
  ["h", "D9D9D9", "ঢাকা বিশ্ববিদ্যালয়"],
  ["q", null, "1.প্রশ্ন-৬"],
  ["q", null, "2.প্রশ্ন-৭"],
  ["h", "D9D9D9", "রাজশাহী বিশ্ববিদ্যালয়"],
  ["q", null, "3.প্রশ্ন-৮"],
  ["h", "BFBFBF", "Type-৪"],
  ["q", null, "4.প্রশ্ন-৯"],
  ["h", "000000", "অধ্যায়-৩"],
  ["h", "BFBFBF", "Type-৫"],
  ["q", null, "1.প্রশ্ন-১০"],
  ["q", null, "2.প্রশ্ন-১১"],
];
const xml = wrapDoc(chem.map(([k, c, t]) => (k === "h" ? shadedP(t, c!) : q(t))).join(""));
const an = analyzeColorDocx(xml);
console.log("questionCount:", an.questionCount);
an.paras.forEach((p, i) => {
  if (p.colorKey || p.isQuestion)
    console.log(`paras[${i}] idx=${p.idx} color=${p.colorKey} q=${p.isQuestion} [${p.text.slice(0, 20)}]`);
});

const plan = planSerialByColor(an, { kind: "color", key: "000000" });
console.log("\nB1 plan:", [...plan.entries()]);

// ম্যানুয়াল ট্রেস: A4@10 (Type-৩) ইভেন্টে কী হয়
const occ: Record<string, number[]> = {};
an.paras.forEach((p, i) => {
  if (p.colorKey) (occ[p.colorKey] ??= []).push(i);
});
console.log("\nocc BFBFBF:", occ["BFBFBF"], " 000000:", occ["000000"], " D9D9D9:", occ["D9D9D9"]);
