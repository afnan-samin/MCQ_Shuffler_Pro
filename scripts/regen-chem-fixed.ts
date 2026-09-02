// ============================================================
// ফিক্সড অ্যালগরিদম দিয়ে ৫টা Chemistry আউটপুট রিজেনারেট + কঠোর যাচাই
// ============================================================
import { readFileSync, writeFileSync } from "node:fs";
import JSZip from "jszip";
import { analyzeColorDocx, planSerialByColor, applyColorSerialXml, scanBodyChildren, type SerialScheme } from "../src/lib/mcq/color-serial";
import { serialMatchSpans, digitsToNumber } from "../src/lib/mcq/docx-xml";

const SRC = "upload/Final Chemistry 1st paper only varsity Question (1-5).docx";
const SCHEMES: Array<{ label: string; scheme: SerialScheme }> = [
  { label: "B1", scheme: { kind: "color", key: "000000" } },
  { label: "A4", scheme: { kind: "color", key: "BFBFBF" } },
  { label: "A3", scheme: { kind: "color", key: "D9D9D9" } },
  { label: "B6", scheme: { kind: "color", key: "0D0D0D" } },
  { label: "continuous", scheme: { kind: "continuous" } },
];

let failed = 0;
const ok = (cond: boolean, name: string) => {
  if (cond) console.log("  ✓", name);
  else { failed++; console.error("  ✗ FAIL:", name); }
};

async function docXmlOf(path: string): Promise<string> {
  const zip = await JSZip.loadAsync(readFileSync(path));
  return await zip.file("word/document.xml")!.async("string");
}

const buf = readFileSync(SRC);
const origZip = await JSZip.loadAsync(buf);
const origXml = await origZip.file("word/document.xml")!.async("string");
console.log(`অরিজিনাল document.xml: ${(origXml.length / 1e6).toFixed(1)}MB`);

const t0 = Date.now();
const analysis = analyzeColorDocx(origXml);
console.log(`analyze: ${Date.now() - t0}ms — প্রশ্ন: ${analysis.questionCount} (আগে ২৪৯৪; আইসোটোপ-গার্ডে ১২টা ভুয়া বাদ = ২৪৮২)`);
ok(analysis.questionCount === 2482, "আইসোটোপ-গার্ডের পরে ২৪৮২ প্রশ্ন");
for (const c of analysis.colors) console.log(`  রঙ ${c.key} (${c.name}): ${c.sections} সেকশন`);

// আইসোটোপ-লাইন (শুরুতেই ডিজিট+অক্ষর) আর প্রশ্ন নয় তা যাচাই — মাঝখানে
// আইসোটোপ থাকা বৈধ প্রশ্ন (যেমন "103.\t714N+…") বৈধই থাকবে
const isoRe = /^\s*[0-9০-৯ø«ˆµ∏Ï¾˜Ùœ]{1,4}[A-Za-z]/;
const isoParas: string[] = [];
for (const p of analysis.paras) {
  if (p.isQuestion && isoRe.test(p.text)) isoParas.push(p.text.slice(0, 40));
}
ok(isoParas.length === 0, `শুরুতে-আইসোটোপ লাইন আর প্রশ্ন নয় (${isoParas.length}টা অবশিষ্ট)`);

const origChildren = scanBodyChildren(origXml);
const results: string[] = [];

for (const { label, scheme } of SCHEMES) {
  console.log(`\n=== ${label} ===`);
  const t1 = Date.now();
  const plan = planSerialByColor(analysis, scheme);
  const nums = [...plan.values()];
  const min = Math.min(...nums), max = Math.max(...nums);
  let resets = 1;
  let prev = 0;
  for (const n of nums) { if (n === 1 && prev !== 0) resets++; prev = n; }
  console.log(`plan: ${plan.size} প্রশ্ন, ১..${max}, সেকশন-রিসেট ${resets}টা (${Date.now() - t1}ms)`);

  // প্রত্যাশিত মান (আইসোটোপ-গার্ডের পরে — ১২টা ভুয়া প্রশ্ন বাদ)
  const EXPECT: Record<string, { size: number; max: number; resets: number }> = {
    B1: { size: 2359, max: 758, resets: 4 },
    A4: { size: 2482, max: 199, resets: 27 },
    A3: { size: 2482, max: 53, resets: 257 },
    B6: { size: 123, max: 123, resets: 1 },
    continuous: { size: 2482, max: 2482, resets: 1 },
  };
  const e = EXPECT[label];
  ok(plan.size === e.size, `${label}: প্ল্যান-সাইজ ${e.size} (পাওয়া গেল ${plan.size})`);
  ok(max === e.max, `${label}: সর্বোচ্চ নম্বর ${e.max} (পাওয়া গেল ${max})`);
  ok(resets === e.resets, `${label}: রিসেট ${e.resets}টা (পাওয়া গেল ${resets})`);

  const newXml = applyColorSerialXml(origXml, plan);
  const children = scanBodyChildren(newXml);

  // প্ল্যান-প্যারায় ডিজিট = প্ল্যান-নম্বর
  let bad = 0;
  for (const [idx, want] of plan) {
    const ch = children[idx];
    if (!ch || ch.kind !== "w:p") { bad++; continue; }
    const sub = newXml.slice(ch.start, ch.end);
    const segs = [...sub.matchAll(/<w:t(?=[\s>])[^>]*>([^<]*)<\/w:t>/g)].map((m) =>
      m[1].replace(/&(?:amp|lt|gt|quot|apos|#\d+|#x[0-9A-Fa-f]+);/g, " ")
    );
    const segEnds: number[] = [];
    let acc = 0;
    for (const s of segs) { acc += s.length; segEnds.push(acc); }
    const spans = serialMatchSpans(segs.join(""), segEnds);
    if (!spans) { bad++; continue; }
    const got = digitsToNumber(segs.join("").slice(spans.digitsStart, spans.digitsEnd));
    if (!got || got.num !== want) bad++;
  }
  ok(bad === 0, `${label}: সব প্ল্যান-ডিজিট সঠিক (ভুল ${bad}টা)`);

  // প্ল্যানের বাইরে কিছু বদলায়নি
  const planSet = new Set(plan.keys());
  let changedOutside = 0;
  for (let i = 0; i < origChildren.length; i++) {
    if (planSet.has(i)) continue;
    const a = origChildren[i], b = children[i];
    if (!a || !b) continue;
    if (origXml.slice(a.start, a.end) !== newXml.slice(b.start, b.end)) changedOutside++;
  }
  ok(changedOutside === 0, `${label}: প্ল্যানের বাইরের প্যারা হুবহু অক্ষত`);

  // B6-বিশেষ যাচাই: অধ্যায়-২-এর কোনো প্রশ্ন B6-প্ল্যানে নেই
  if (label === "B6") {
    const firstB1 = analysis.paras.find((p) => p.colorKey === "000000")!;
    const afterB1 = [...plan.keys()].some((idx) => {
      const para = analysis.paras.find((p) => p.idx === idx)!;
      return para.idx > firstB1.idx;
    });
    ok(!afterB1, "B6: অধ্যায়-২-এর কোনো প্রশ্ন প্ল্যানে নেই (B6-সীমা অধ্যায়-১-এই শেষ)");
  }

  // docx বানাও
  const src2 = await JSZip.loadAsync(buf);
  const outZip = new JSZip();
  const others: Array<{ path: string; data: Promise<Uint8Array> }> = [];
  src2.forEach((path, entry) => {
    if (!entry.dir && path !== "word/document.xml") others.push({ path, data: entry.async("uint8array") });
  });
  outZip.file("word/document.xml", new TextEncoder().encode(newXml));
  for (const o of others) outZip.file(o.path, await o.data);
  const outBuf = await outZip.generateAsync({
    type: "nodebuffer",
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    compression: "DEFLATE",
  });
  const OUT = `download/Chemistry (color serial - ${label}).docx`;
  writeFileSync(OUT, outBuf);
  console.log(`  ✅ ${OUT} (${(outBuf.length / 1024).toFixed(0)} KB)`);
  results.push(`${label}: ${plan.size} প্রশ্ন ১..${max}, ${resets} সেকশন`);
}

console.log("\nসারাংশ:", results.join(" | "));
console.log(failed === 0 ? "\n🎉 সব যাচাই পাস" : `\n❌ ${failed}টা যাচাই ফেল`);
process.exit(failed ? 1 : 0);
