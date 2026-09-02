// B1-প্ল্যানে বাদ পড়া ৫৪০ প্রশ্ন কোথায় থেমে গেল
import { readFileSync } from "node:fs";
import JSZip from "jszip";

const { analyzeColorDocx, planSerialByColor } = await import("../src/lib/mcq/color-serial");

const buf = readFileSync("upload/Final Chemistry 1st paper only varsity Question (1-5).docx");
const zip = await JSZip.loadAsync(buf);
const xml = await zip.file("word/document.xml")!.async("string");

const analysis = analyzeColorDocx(xml);
const plan = planSerialByColor(analysis, { kind: "color", key: "000000" });

// B1-যুগের প্রশ্নগুলো (প্রথম B1-এর পরে) কোনগুলো প্ল্যানে নেই
let firstB1 = analysis.paras.findIndex((p) => p.colorKey === "000000");
let inB1era = false;
let lastHad = true;
let gapStart = -1;
let gaps = 0;
analysis.paras.forEach((p, i) => {
  if (p.colorKey === "000000") inB1era = true;
  if (!inB1era) return;
  if (p.colorKey) return;
  if (p.isQuestion) {
    const has = plan.has(p.idx);
    if (!has && lastHad) {
      gapStart = i;
      gaps++;
      if (gaps <= 6) {
        // গ্যাপের ঠিক আগের হেডার-ক্রম দেখাই
        const ctx: string[] = [];
        for (let j = Math.max(0, i - 6); j <= i; j++) {
          const q = analysis.paras[j];
          ctx.push(`${q.colorKey ? `[${q.colorKey}]` : q.isQuestion ? "Q" : "·"}${q.colorKey ? "" : ":" + q.text.slice(0, 25)}`);
        }
        console.log(`\nগ্যাপ-${gaps} @paras[${i}] (idx=${p.idx}):`, ctx.join(" "));
      }
    }
    lastHad = has;
  }
});
console.log("\nমোট গ্যাপ:", gaps);
let missing = 0;
analysis.paras.forEach((p, i) => {
  if (i >= firstB1 && !p.colorKey && p.isQuestion && !plan.has(p.idx)) missing++;
});
console.log("B1-যুগে প্ল্যান-বহির্ভূত প্রশ্ন:", missing);
