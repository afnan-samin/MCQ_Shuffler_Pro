// প্রোব: ৬টা no-span প্যারা + অধ্যায়-বাউন্ডারি স্ট্রাকচার পরীক্ষা
import JSZip from "jszip";
import { readFileSync } from "fs";
import { analyzeColorDocx, scanBodyChildren, planSerialByColor } from "../src/lib/mcq/color-serial";
import { detectSerialPrefix } from "../src/lib/mcq/docx-xml";

const ORIGINAL = "/home/z/my-project/upload/Final Chemistry 1st paper only varsity Question (1-5).docx";

async function main() {
  const zip = await JSZip.loadAsync(readFileSync(ORIGINAL));
  const xml = (await zip.file("word/document.xml")!.async("string"));
  const children = scanBodyChildren(xml);
  const analysis = analyzeColorDocx(xml);

  // ৬টা সন্দেহজনক প্যারা — পুরো সাবস্ট্রিং-এর গঠন দেখি
  const SUSPECT = [518, 532, 536, 932, 2120, 7787];
  console.log("=== ৬টা সন্দেহজনক প্যারা (plan-এ আছে কিন্তু apply-এ স্প্যান পায়নি) ===");
  for (const i of SUSPECT) {
    const ch = children[i];
    const sub = xml.slice(ch.start, ch.end);
    const wts = [...sub.matchAll(/<w:t(?=[\s>])[^>]*>([^<]*)<\/w:t>/g)].map((m) => m[1]);
    const mts = [...sub.matchAll(/<m:t(?=[\s>])[^>]*>([^<]*)<\/m:t>/g)].map((m) => m[1]);
    const info = analysis.paras.find((p) => p.idx === i);
    console.log(`\n--- idx=${i} kind=${ch.kind} isQuestion=${info?.isQuestion} color=${info?.colorKey}`);
    console.log(`  w:t = ${JSON.stringify(wts.slice(0, 8))}`);
    console.log(`  m:t = ${JSON.stringify(mts.slice(0, 8))}`);
    console.log(`  টেক্সট(সনাক্তকৃত) = ${JSON.stringify((info?.text ?? "").slice(0, 90))}`);
    const si = detectSerialPrefix(info?.text ?? "");
    console.log(`  detectSerialPrefix = ${si ? JSON.stringify({ num: si.num, enc: si.enc, len: si.len }) : "null"}`);
  }

  // অধ্যায়-বাউন্ডারি: প্রতিটা অধ্যায়-হেডার (B6/B1) এবং তার ঠিক পরের ৩টা হেডার
  console.log("\n\n=== অধ্যায়-হেডার সিকোয়েন্স (B6/B1 ও প্রতিটার পরের ৩ হেডার) ===");
  const headers = analysis.paras.filter((p) => p.colorKey);
  for (let i = 0; i < headers.length; i++) {
    const h = headers[i];
    if (h.colorKey !== "0D0D0D" && h.colorKey !== "000000") continue;
    const nexts = headers.slice(i + 1, i + 4).map((n) => `${n.colorKey}:"${n.text.slice(0, 25)}"`);
    console.log(`idx=${h.idx} ${h.colorKey} "${h.text.slice(0, 40)}" → পরের: ${nexts.join(" | ")}`);
  }

  // B6-প্ল্যান আসলে কী করে দেখাই (বাগ ডেমো)
  const planB6 = planSerialByColor(analysis, { kind: "color", key: "0D0D0D" });
  const nums = [...planB6.values()];
  console.log(`\n=== B6-প্ল্যান (বাগ): ${planB6.size} প্রশ্ন, ম্যাক্স=${Math.max(...nums)} (১২৩ হওয়ার কথা) ===`);

  // অধ্যায়-১-এ কত প্রশ্ন (প্রথম B1 হেডারের আগে)
  const firstB1 = analysis.paras.find((p) => p.colorKey === "000000");
  const ch1Qs = analysis.paras.filter((p) => !p.colorKey && p.isQuestion && firstB1 && p.idx < firstB1.idx).length;
  console.log(`অধ্যায়-১-এর প্রশ্ন (প্রথম B1-এর আগে): ${ch1Qs}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
