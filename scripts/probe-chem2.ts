// B1 plan=0 debug — analysis.paras দিয়েই stack simulate (মেমোরি-নিরাপদ)
import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";

const dom = new JSDOM("<!doctype html><html><body></body></html>");
(globalThis as unknown as Record<string, unknown>).DOMParser = dom.window.DOMParser;
(globalThis as unknown as Record<string, unknown>).XMLSerializer = dom.window.XMLSerializer;

const { analyzeColorDocx, planSerialByColor } = await import("../src/lib/mcq/color-serial");

const xml = readFileSync("/tmp/chem/word/document.xml", "utf-8");
const analysis = analyzeColorDocx(xml);

// --- stack simulation সমস্ত প্যারায়, B1 হেডারের আশপাশ প্রিন্ট ---
const stack: string[] = [];
let n = 0;
for (let i = 0; i < analysis.paras.length; i++) {
  const para = analysis.paras[i];
  if (para.colorKey) {
    const at = stack.lastIndexOf(para.colorKey);
    if (at >= 0) stack.length = at;
    stack.push(para.colorKey);
    if (para.colorKey === "000000") {
      console.log(`@${i} B1-header stack=[${stack.join(",")}] text=[${para.text.slice(0, 50)}]`);
    }
  } else if (para.isQuestion) {
    n++;
    if (stack.includes("000000") && n < 999999) {
      // first few questions inside B1
      if (n <= 5 || (para.idx >= 0 && i < 500)) {
        // print first 5 B1 questions
      }
    }
  }
}
console.log("total questions in analysis:", n);

// first 8 paras after each B1 header (from analysis)
for (let i = 0; i < analysis.paras.length; i++) {
  const para = analysis.paras[i];
  if (para.colorKey === "000000") {
    console.log(`\n=== B1 @paras[${i}] idx=${para.idx} [${para.text.slice(0, 50)}]`);
    for (let j = i + 1; j <= i + 6 && j < analysis.paras.length; j++) {
      const p2 = analysis.paras[j];
      console.log(
        `  +${j - i}: color=${p2.colorKey} q=${p2.isQuestion} [${p2.text.slice(0, 60)}]`
      );
    }
  }
}

// সমস্যা হয়তো: B1 হেডারের আগেই কি সব প্রশ্ন? B1 হেডারের আগে কয়টা প্রশ্ন?
const b1First = analysis.paras.findIndex((p) => p.colorKey === "000000");
const qBefore = analysis.paras.slice(0, b1First).filter((p) => p.isQuestion).length;
console.log(`\nfirst B1 at paras[${b1First}], questions BEFORE it: ${qBefore}, total ${analysis.questionCount}`);

const planB1 = planSerialByColor(analysis, { kind: "color", key: "000000" });
console.log("B1 plan size:", planB1.size);
const planA3 = planSerialByColor(analysis, { kind: "color", key: "D9D9D9" });
console.log("A3 plan size:", planA3.size);
const planCont = planSerialByColor(analysis, { kind: "continuous" });
console.log("continuous plan size:", planCont.size);
