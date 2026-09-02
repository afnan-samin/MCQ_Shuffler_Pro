// ============================================================
// ফরেনসিক অডিট: ইউজারের ৫টা Chemistry আউটপুট vs আসল ইঞ্জিন-প্ল্যান
// ============================================================
// প্রতিটা আউটপুট ফাইলের জন্য যাচাই:
//   ১) document.xml-এর sha256 (content identity)
//   ২) প্ল্যানের প্রতিটা প্যারায় আসল ডিজিট = প্ল্যান-নম্বর কিনা
//   ৩) প্ল্যানের বাইরের প্যারার সিরিয়াল অপরিবর্তিত কিনা (vs original)
//   ৪) পুরো XML byte-identical কিনা applyColorSerialXml(original, plan)-এর সাথে
//   ৫) সিকোয়েন্স-স্যানিটি: প্রতিটা সেকশনে ১ থেকে শুরু, লাফ নেই
//   ৬) চ্যাপ্টার-বাউন্ডারি কন্টামিনেশন: নতুন অধ্যায়ের B1-হেডারের পরে
//      প্রথম A4/A3-হেডারের আগের প্রশ্নগুলো কোন নম্বর পেল
// ============================================================

import JSZip from "jszip";
import { readFileSync, writeFileSync } from "fs";
import {
  analyzeColorDocx,
  planSerialByColor,
  applyColorSerialXml,
  scanBodyChildren,
  type SerialScheme,
} from "../src/lib/mcq/color-serial";
import {
  serialMatchSpans,
  digitsToNumber,
} from "../src/lib/mcq/docx-xml";

const UPLOAD = "/home/z/my-project/upload";
const OUT = "/tmp/forensic";
const ORIGINAL = `${UPLOAD}/Final Chemistry 1st paper only varsity Question (1-5).docx`;

const FILES: Array<{ label: string; path: string; scheme: SerialScheme }> = [
  { label: "B1", path: `${UPLOAD}/Final Chemistry 1st paper only varsity Question (1-5) (color serial - B1).docx`, scheme: { kind: "color", key: "000000" } },
  { label: "A4", path: `${UPLOAD}/Final Chemistry 1st paper only varsity Question (1-5) (color serial - A4).docx`, scheme: { kind: "color", key: "BFBFBF" } },
  { label: "A3", path: `${UPLOAD}/Final Chemistry 1st paper only varsity Question (1-5) (color serial - A3).docx`, scheme: { kind: "color", key: "D9D9D9" } },
  { label: "B6", path: `${UPLOAD}/Final Chemistry 1st paper only varsity Question (1-5) (color serial - B6).docx`, scheme: { kind: "color", key: "0D0D0D" } },
  { label: "continuous", path: `${UPLOAD}/Final Chemistry 1st paper only varsity Question (1-5) (color serial - continuous).docx`, scheme: { kind: "continuous" } },
];

async function docXmlOf(path: string): Promise<string> {
  const zip = await JSZip.loadAsync(readFileSync(path));
  const f = zip.file("word/document.xml");
  if (!f) throw new Error(`document.xml নেই: ${path}`);
  return await f.async("string");
}

function sha256Of(s: string): string {
  // bun: BuiltinCrypto
  const h = new Bun.CryptoHasher("sha256");
  h.update(new TextEncoder().encode(s));
  return h.digest("hex").slice(0, 16);
}

interface ParaInfo {
  idx: number;
  colorKey: string | null;
  isQuestion: boolean;
  text: string;
}

async function main() {
  const origXml = await docXmlOf(ORIGINAL);
  console.log(`original document.xml: ${(origXml.length / 1e6).toFixed(2)}MB sha=${sha256Of(origXml)}`);

  const analysis = analyzeColorDocx(origXml);
  console.log(`\n=== অরিজিনাল বিশ্লেষণ ===`);
  console.log(`প্যারা: ${analysis.paras.length}, প্রশ্ন: ${analysis.questionCount}, shaded: ${analysis.shadedCount}`);
  for (const c of analysis.colors) console.log(`  রঙ ${c.key} (${c.name}): ${c.sections} সেকশন`);

  // হেডার-সিকোয়েন্স ম্যাপ (অধ্যায়-বাউন্ডারি অডিটের জন্য)
  const headerSeq: Array<{ idx: number; color: string; qUntil: number }> = [];
  {
    const qIdxs = analysis.paras.filter((p) => p.isQuestion).map((p) => p.idx);
    const qAt = new Map(qIdxs.map((v, i) => [v, i]));
    for (const p of analysis.paras) {
      if (p.colorKey) headerSeq.push({ idx: p.idx, color: p.colorKey, qUntil: qIdxs.length });
    }
    // প্রতিটা হেডারের পরে কতগুলো প্রশ্ন তার আগের হেডার পর্যন্ত
    let lastQ = -1;
    for (let i = headerSeq.length - 1; i >= 0; i--) {
      // qUntil হিসাব: এই হেডারের পরের হেডারের আগ পর্যন্ত প্রশ্ন-সংখ্যা — নিচে আলাদা করি
    }
  }

  // অধ্যায়-বাউন্ডারি কন্টামিনেশন অডিট: প্রতিটা B1/B6 (অধ্যায়) হেডারের পরে
  // পরবর্তী A4/A3 হেডারের আগে কয়টা প্রশ্ন আছে এবং তাদের প্ল্যান-নম্বর কত
  function boundaryAudit(scheme: SerialScheme, plan: Map<number, number>): string[] {
    const issues: string[] = [];
    const paras = analysis.paras;
    const idxToPlan = new Map(plan.entries());
    for (let i = 0; i < paras.length; i++) {
      const p = paras[i];
      if (!p.colorKey) continue;
      if (p.colorKey !== "000000" && p.colorKey !== "0D0D0D") continue; // অধ্যায়-হেডার
      // এই অধ্যায়-হেডারের পরে পরবর্তী হেডার পর্যন্ত প্রশ্নগুলো
      const qs: Array<{ idx: number; n: number }> = [];
      for (let j = i + 1; j < paras.length; j++) {
        if (paras[j].colorKey) break;
        if (paras[j].isQuestion && idxToPlan.has(paras[j].idx)) qs.push({ idx: paras[j].idx, n: idxToPlan.get(paras[j].idx)! });
      }
      if (qs.length > 0) {
        issues.push(`অধ্যায়-হেডার(${p.colorKey}) সরাসরি ${qs.length}টা প্ল্যানড প্রশ্ন পেল: প্রথম=${qs[0].n}, শেষ=${qs[qs.length - 1].n} (idx ${qs[0].idx}..${qs[qs.length - 1].idx})`);
      }
    }
    return issues;
  }

  // সেকশন-সিকোয়েন্স অডিট: X-হেডারের মাঝের প্ল্যানড প্রশ্নগুলো ১..n ঠিক আছে?
  function sequenceAudit(scheme: SerialScheme, plan: Map<number, number>): string[] {
    const issues: string[] = [];
    if (scheme.kind !== "color") return issues;
    const X = scheme.key;
    const paras = analysis.paras;
    let expected = 0;
    for (const p of paras) {
      if (p.colorKey === X) expected = 0;
      else if (p.isQuestion && plan.has(p.idx)) {
        expected++;
        if (plan.get(p.idx) !== expected) {
          issues.push(`সিকোয়েন্স ভাঙা idx=${p.idx}: প্রত্যাশা ${expected}, প্ল্যান ${plan.get(p.idx)}`);
          expected = plan.get(p.idx)!;
        }
      }
    }
    return issues;
  }

  const results: any[] = [];
  for (const f of FILES) {
    console.log(`\n=== ${f.label} ===`);
    const plan = planSerialByColor(analysis, f.scheme);
    const planNums = [...plan.values()];
    const resets: number[] = [];
    {
      // রিসেট-পয়েন্ট (নম্বর ১ কোথায় কোথায়)
      const paras = analysis.paras;
      let prev = 0;
      for (const p of paras) {
        if (plan.has(p.idx)) {
          const n = plan.get(p.idx)!;
          if (n === 1 && prev !== 0) resets.push(p.idx);
          prev = n;
        }
      }
    }
    console.log(`প্ল্যান: ${plan.size} প্রশ্ন, মিন=${Math.min(...planNums)}, ম্যাক্স=${Math.max(...planNums)}, রিসেট=${resets.length + 1} সেকশন`);

    const userXml = await docXmlOf(f.path);
    const userSha = sha256Of(userXml);

    const expectedXml = applyColorSerialXml(origXml, plan);
    const expectedSha = sha256Of(expectedXml);
    const byteIdentical = userXml === expectedXml;
    console.log(`ইউজার XML sha=${userSha}`);
    console.log(`কোড-প্রত্যাশা sha=${expectedSha} → byte-identical: ${byteIdentical ? "হ্যাঁ" : "না"}`);

    // প্ল্যান-প্যারায় আসল ডিজিট যাচাই
    const children = scanBodyChildren(userXml);
    let ok = 0, bad = 0, missing = 0;
    const badSamples: string[] = [];
    for (const [idx, want] of plan) {
      const ch = children[idx];
      if (!ch || ch.kind !== "w:p") { missing++; continue; }
      const sub = userXml.slice(ch.start, ch.end);
      const texts = [...sub.matchAll(/<w:t(?=[\s>])[^>]*>([^<]*)<\/w:t>/g)].map((m) => m[1].replace(/&(?:amp|lt|gt|quot|apos|#\d+|#x[0-9A-Fa-f]+);/g, " "));
      const spans = serialMatchSpans(texts.join(""));
      if (!spans) { missing++; badSamples.push(`idx=${idx} সিরিয়াল-স্প্যান নেই`); continue; }
      const digits = texts.join("").slice(spans.digitsStart, spans.digitsEnd);
      const got = digitsToNumber(digits);
      if (got && got.num === want) ok++;
      else { bad++; if (badSamples.length < 5) badSamples.push(`idx=${idx} প্রত্যাশা=${want} পাওয়া=${digits}(${got?.num})`); }
    }
    console.log(`প্ল্যান-ডিজিট যাচাই: ঠিক=${ok}, ভুল=${bad}, মিসিং=${missing}${badSamples.length ? "\n  " + badSamples.join("\n  ") : ""}`);

    // প্ল্যানের বাইরের প্যারা অপরিবর্তিত? (অরিজিনালের সাথে তুলনা)
    const origChildren = scanBodyChildren(origXml);
    let changedOutside = 0;
    const planSet = new Set(plan.keys());
    for (let i = 0; i < Math.min(children.length, origChildren.length); i++) {
      if (planSet.has(i)) continue;
      const a = origChildren[i], b = children[i];
      if (!a || !b) continue;
      if (origXml.slice(a.start, a.end) !== userXml.slice(b.start, b.end)) changedOutside++;
    }
    console.log(`প্ল্যানের বাইরে বদলে যাওয়া প্যারা: ${changedOutside}`);

    const seqIssues = sequenceAudit(f.scheme, plan);
    const boundary = boundaryAudit(f.scheme, plan);
    if (seqIssues.length) console.log(`⚠️ সিকোয়েন্স: ${seqIssues.slice(0, 5).join(" | ")}`);
    if (boundary.length) console.log(`⚠️ বাউন্ডারি: ${boundary.slice(0, 5).join(" | ")}`);

    results.push({
      label: f.label, planSize: plan.size, min: Math.min(...planNums), max: Math.max(...planNums),
      sections: resets.length + 1, userSha, expectedSha, byteIdentical, ok, bad, missing, changedOutside,
      seqIssues: seqIssues.length, boundary,
    });
  }

  // আউটপুট ফাইলগুলোর মধ্যে content identity
  console.log(`\n=== আউটপুটগুলোর content identity (document.xml sha) ===`);
  for (const f of FILES) {
    const xml = await docXmlOf(f.path);
    console.log(`  ${f.label.padEnd(11)} ${sha256Of(xml)}`);
  }

  writeFileSync(`${OUT}/report.json`, JSON.stringify(results, null, 2));
  console.log(`\nরিপোর্ট: ${OUT}/report.json`);
}

main().catch((e) => { console.error(e); process.exit(1); });
