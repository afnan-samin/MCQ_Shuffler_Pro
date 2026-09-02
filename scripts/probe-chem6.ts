// planSerialByColor ইনস্ট্রুমেন্টেড কপি — গ্যাপ-১-এর আশপাশে লগ
import { readFileSync } from "node:fs";
import JSZip from "jszip";

const { analyzeColorDocx } = await import("../src/lib/mcq/color-serial");

const buf = readFileSync("upload/Final Chemistry 1st paper only varsity Question (1-5).docx");
const zip = await JSZip.loadAsync(buf);
const xml = await zip.file("word/document.xml")!.async("string");
const analysis = analyzeColorDocx(xml);
const X = "000000";

const occ: Record<string, number[]> = {};
analysis.paras.forEach((p: any, i: number) => {
  if (p.colorKey) (occ[p.colorKey] ??= []).push(i);
});
const nextOcc = (color: string, after: number): number | null => {
  const arr = occ[color];
  if (!arr) return null;
  for (const v of arr) if (v > after) return v;
  return null;
};

const stack: Array<{ color: string; pos: number }> = [];
let inX = false;
let counter = 0;

analysis.paras.forEach((p: any, i: number) => {
  if (p.colorKey) {
    let at = -1;
    for (let s = stack.length - 1; s >= 0; s--)
      if (stack[s].color === p.colorKey) { at = s; break; }
    if (at >= 0) {
      let protectXAt = -1;
      let xAt = -1;
      for (let s = stack.length - 1; s > at; s--)
        if (stack[s].color === X) { xAt = s; break; }
      if (xAt > at) {
        const xPos = stack[xAt].pos;
        const nextX = nextOcc(X, xPos);
        const nextC = nextOcc(p.colorKey, i);
        if ((nextC !== null && nextX !== null && nextC < nextX) || i === xPos + 1) protectXAt = xAt;
      }
      const before = stack.map((e) => `${e.color}@${e.pos}`).join(",");
      if (protectXAt >= 0) stack.length = protectXAt + 1;
      else stack.length = at;
      stack.push({ color: p.colorKey, pos: i });
      inX = stack.some((e) => e.color === X);
      if (i > 2700 && i < 2830)
        console.log(
          `@${i} ${p.colorKey}: stack[${before}] → at=${at} xAt=${xAt} prot=${protectXAt} → [${stack.map((e) => `${e.color}@${e.pos}`).join(",")}] inX=${inX}`
        );
      if (p.colorKey === X) counter = 0;
    } else {
      stack.push({ color: p.colorKey, pos: i });
      inX = stack.some((e) => e.color === X);
      if (i > 2700 && i < 2830)
        console.log(`@${i} ${p.colorKey} (new): → [${stack.map((e) => `${e.color}@${e.pos}`).join(",")}] inX=${inX}`);
      if (p.colorKey === X) counter = 0;
    }
  } else if (p.isQuestion) {
    if (inX) counter++;
    if (i > 2805 && i < 2825)
      console.log(`@${i} Q [${p.text.slice(0, 20)}] inX=${inX} counter=${inX ? counter : "—"}`);
  }
});
