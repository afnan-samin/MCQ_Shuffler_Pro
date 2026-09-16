// ============================================================
// User question-bank validator — parser / serial / duplicate check
// on scripts/fixtures/user-physics-bank.txt
// Run:  bun run scripts/validate-user-bank.ts
// ============================================================

import { parseMcq, analyzeSerial, type McqQuestion } from "../src/lib/mcq/parser";
import { normalizeForDup, type DuplicateGroup } from "../src/lib/mcq/duplicates";

declare const Bun: { file(path: string): { text(): Promise<string> } };
const src = await Bun.file("scripts/fixtures/user-physics-bank.txt").text();
const lines = src.split(/\r?\n/);

// ---- Type-সেকশনগুলোতে ভাগ —---
const segs: Array<{ name: string; text: string }> = [];
let curName = "(header)";
let curLines: string[] = [];
for (const ln of lines) {
  if (/^\s*Type-0\d\s*:/.test(ln)) {
    if (curLines.length) segs.push({ name: curName, text: curLines.join("\n") });
    curName = ln.trim();
    curLines = [];
  } else {
    curLines.push(ln);
  }
}
if (curLines.length) segs.push({ name: curName, text: curLines.join("\n") });

console.log("Source file lines:", lines.length, "| sections:", segs.length);
console.log("Section names:", segs.map((s) => s.name).join(" ; "));

let total = 0;
const perType: Array<{ name: string; count: number; notFour: number[]; serial: string; gaps: string }> = [];

for (const seg of segs) {
  const p = parseMcq(seg.text);
  const qs = p.questions;
  total += qs.length;
  // অপশন-অনিয়ম (4 ছাড়া)
  const notFour = qs.filter((q) => q.options.length !== 4).map((q) => q.id + 1);
  // সিরিয়াল
  const report = analyzeSerial(qs);
  const gaps = report.issues
    .slice(0, 8)
    .map((iss) => `q${iss.index + 1} expect ${iss.expected} found ${iss.found}`)
    .join("; ");
  perType.push({
    name: seg.name,
    count: qs.length,
    notFour,
    serial: report ? `${report.status} (startAt ${report.startAt}${report.startsAtOne ? ", startsAtOne" : ""}, ${report.issues.length} issue)` : "—",
    gaps,
  });
  console.log(`\n  ▸ ${seg.name}`);
  console.log(`      questions=${qs.length}  numberScript=${p.numberScript}`);
  console.log(`      serial: ${perType[perType.length - 1].serial}`);
  if (report.issues.length) console.log(`      gaps: ${gaps || "(none listed)"}`);
  qs.forEach((q, i) => {
    if (q.options.length !== 4)
      console.log(`        [warn] Q${i + 1} has ${q.options.length} option(s) → ${q.lines[0].slice(0, 60)}`);
  });
}

console.log("\n==== TOTALS ====");
console.log("Total parsed questions:", total);

// ---- cross-type duplicate detection (normalized text = first non-empty line) ----
const norm = (q: McqQuestion) =>
  normalizeForDup(q.lines.find((l) => l.trim()) ?? "").replace(/^\d+\s*[.।):–\-—]?\s*/, "");
const byKey = new Map<string, string[]>();
for (const seg of segs) {
  const p = parseMcq(seg.text);
  for (const q of p.questions) {
    const kk = norm(q);
    if (!kk || kk.length < 12) continue; // খুব ছোট কি বাদ
    const arr = byKey.get(kk) ?? [];
    arr.push(seg.name.replace(/^Type-\d+:\s*/, ""));
    byKey.set(kk, arr);
  }
}
const dupGroups: string[][] = [...byKey.values()].filter((a) => a.length > 1);
console.log("\nCross-type duplicate question groups (normalized):", dupGroups.length);
dupGroups.slice(0, 20).forEach((g) =>
  console.log(`  • appears in ${g.join(", ")} → “${[...byKey.entries()].find((e) => e[1] === g)?.[0]?.slice(0, 60)}…”`)
);

// ---- aimed anomalies ----
console.log("\n==== Targeted anomaly checks ====");
const all = lines.join("\n");
console.log("Glued 'D: M' / 'D: N' (Type-01 Q20/Q68-ish keys):", (all.match(/Ans:\s*[ABCD]|D:\s*M|D:\s*N/g) ?? []).filter((x) => /D:\s*[MN]/.test(x)).length, "occurrences");
console.log("'Dt eø¨v¼' glued tail (Type-01 Q25):", /Dt\s+eø¨v¼/.test(all) ? "present" : "absent");
console.log("Type-02 Q28 skipped (27→29):", /27\..*29\./.test(all) ? "check below" : "—");
console.log("Type-03 Q80 duplicate 'A.' option label:", /Q80/.test(all) ? "see A./A. pattern below" : "—");