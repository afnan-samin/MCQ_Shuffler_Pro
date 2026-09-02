// ১টা ডিজিট-মিসম্যাচ প্যারা + ১২টা বাদ-পড়া ভুয়া প্রশ্ন শনাক্ত
import { readFileSync } from "node:fs";
import JSZip from "jszip";
import { analyzeColorDocx, planSerialByColor, scanBodyChildren } from "../src/lib/mcq/color-serial";
import { serialMatchSpans, digitsToNumber, detectSerialPrefix } from "../src/lib/mcq/docx-xml";

const origXml = await (await JSZip.loadAsync(readFileSync("upload/Final Chemistry 1st paper only varsity Question (1-5).docx"))).file("word/document.xml")!.async("string");
const newXml = await (await JSZip.loadAsync(readFileSync("download/Chemistry (color serial - continuous).docx"))).file("word/document.xml")!.async("string");
const analysis = analyzeColorDocx(origXml);
const plan = planSerialByColor(analysis, { kind: "continuous" });
const children = scanBodyChildren(newXml);

// ১) মিসম্যাচ প্যারা (আউটপুটের বিপরীতে)
for (const [idx, want] of plan) {
  const ch = children[idx];
  const sub = newXml.slice(ch.start, ch.end);
  const segs = [...sub.matchAll(/<w:t(?=[\s>])[^>]*>([^<]*)<\/w:t>/g)].map((m) =>
    m[1].replace(/&(?:amp|lt|gt|quot|apos|#\d+|#x[0-9A-Fa-f]+);/g, " ")
  );
  const spans = serialMatchSpans(segs.join(""));
  const got = spans ? digitsToNumber(segs.join("").slice(spans.digitsStart, spans.digitsEnd)) : null;
  if (!got || got.num !== want) {
    console.log(`MISMATCH idx=${idx} want=${want} got=${got?.num}(${spans ? "span" : "no-span"})`);
    console.log(`  টেক্সট: ${JSON.stringify(analysis.paras.find((p) => p.idx === idx)?.text.slice(0, 90))}`);
    console.log(`  w:t segs: ${JSON.stringify(segs.slice(0, 6))}`);
    const mts = [...sub.matchAll(/<m:t(?=[\s>])[^>]*>([^<]*)<\/m:t>/g)].map((m) => m[1]);
    console.log(`  m:t segs: ${JSON.stringify(mts.slice(0, 6))}`);
    console.log(`  প্যারার রঙ: ${analysis.paras.find((p) => p.idx === idx)?.colorKey}`);
  }
}

// ২) আগে যে ১২টা ভুয়া প্রশ্ন ছিল (detectSerialPrefix আগের মতো চালালে যেগুলো ধরা পড়ত কিন্তু এখন isQuestion=false)
import { isQuestionStart } from "../src/lib/mcq/docx-xml";
const texts = analysis.paras.map((p) => p.text);
const oldStyle: string[] = [];
for (let k = 0; k < analysis.paras.length; k++) {
  const p = analysis.paras[k];
  if (p.colorKey || p.isQuestion) continue;
  const si = detectSerialPrefix(texts[k]);
  if (!si) continue;
  const hasTab = /<w:tab\/>/.test(origXml.slice(children[p.idx].start, children[p.idx].end));
  const next = texts.slice(k + 1).find((t) => t.trim()) ?? null;
  if (isQuestionStart(si, hasTab, next)) oldStyle.push(`idx=${p.idx}: ${JSON.stringify(texts[k].slice(0, 60))}`);
}
console.log(`\nআইসোটোপ-গার্ডে বাদ পড়া ${oldStyle.length}টা লাইন:`);
for (const s of oldStyle) console.log("  " + s);
