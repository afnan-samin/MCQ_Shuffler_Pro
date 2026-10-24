// ============================================================
// QA — EXPANSION অডিট (Prompt/4th.md)
// প্রতিটি Format/*.docx: options OFF + answer ON + expandAnswer ON
// আউটপুট: download/EX_expand-answer/<file> (redownload).docx  (+ per-file parts)
// চেক: প্রতিটি উত্তর-প্রশ্নে "উঃ ক" → ওই অপশনের পুরো লেখা এসেছে কি।
// রান:  bun run scripts/_qa-expand-answer.ts [--files=kw] [--diag=N]
//       bun run scripts/_qa-expand-answer.ts --merge        (parts → audit.json + summary)
// নোট: বড় file-এ Bun crash এড়াতে একবারে এক file চালান, শেষে --merge।
// ============================================================
import { readFileSync, readdirSync, mkdirSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { JSDOM } from "jsdom";
import JSZip from "jszip";

const dom = new JSDOM("<!doctype html><html><body></body></html>");
(globalThis as unknown as Record<string, unknown>).DOMParser = dom.window.DOMParser;
(globalThis as unknown as Record<string, unknown>).XMLSerializer = dom.window.XMLSerializer;
(globalThis as unknown as Record<string, unknown>).Node = dom.window.Node;

const { parseRedownloadXml, buildRedownloadXml } = await import("../src/lib/mcq/redownload");

const args = process.argv.slice(2);
const fileFilter = (args.find((a) => a.startsWith("--files="))?.slice(8) ?? "").toLowerCase();
const diagN = Number(args.find((a) => a.startsWith("--diag="))?.slice(7) ?? "0");
const mergeMode = args.includes("--merge");

const FORMAT = "Format";
const OUT = join("download", "EX_expand-answer");
const PARTS = join(OUT, "_parts");
mkdirSync(OUT, { recursive: true });
mkdirSync(PARTS, { recursive: true });

interface QFail {
  serial: number;
  pos: number;
  answer: string;
  reason: string;
  seen: string;
  want: string;
  src?: string[];
}
interface FileRes {
  file: string;
  qTotal: number;
  qAnswered: number;
  expanded: number;
  letterOnly: number;
  wrongText: number;
  missing: number;
  softPass: number;
  skipped: number;
  skippedReasons: Record<string, number>;
  multiLetter: number;
  multiNotExpanded: number;
  fails: QFail[];
  parseError?: string;
}

const OPTS = {
  partSel: { serial: true, question: true, reference: false, options: false, answer: true, bekkha: false },
  renumber: false,
  expandAnswer: true,
  fixLabels: false,
  topicHeader: true,
};

// ---------- সহায়ক ----------
const SLOT: Record<string, number> = {
  k: 0, l: 1, m: 2, n: 3, "ক": 0, "খ": 1, "গ": 2, "ঘ": 3,
  a: 0, b: 1, c: 2, d: 3, "1": 0, "2": 1, "3": 2, "4": 3,
};
function slotOf(ch: string | null | undefined): number {
  if (!ch) return -1;
  return SLOT[ch] ?? SLOT[ch.toLowerCase()] ?? -1;
}
function unescapeXml(s: string): string {
  return s
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'").replace(/&amp;/g, "&");
}
/** <w:t> + <m:t> (OMML math) — দুটোই নিই, নাহলে arrow (→) হারা পড়ে */
function paraTexts(xml: string): string[] {
  return xml.split(/<\/w:p>/).map((chunk) =>
    unescapeXml(
      (chunk.match(/<(?:w|m):t[^>]*>[\s\S]*?<\/(?:w|m):t>/g) ?? [])
        .map((s) => s.replace(/<[^>]+>/g, ""))
        .join("")
    )
  );
}
// private-use (Wingdings symbol/arrow), whitespace — বাদ (symbol-loss FAIL নয়)
const PUA = /[\uE000-\uF8FF\uFFF0-\uFFFF]/g;
const norm = (s: string) => s.replace(PUA, "").replace(/\s+/g, "");
const safeName = (s: string) => s.replace(/[^\w\u0980-\u09FF.\-]+/g, "_");

// ============================================================
if (mergeMode) {
  const parts = readdirSync(PARTS).filter((f) => f.endsWith(".json")).sort();
  const results: FileRes[] = parts.map((p) => JSON.parse(readFileSync(join(PARTS, p), "utf8")) as FileRes);
  results.sort((a, b) => a.file.localeCompare(b.file));
  const tot = {
    files: results.length, q: 0, ans: 0, exp: 0, letterOnly: 0, wrong: 0, missing: 0,
    softPass: 0, skip: 0, multi: 0, multiNotExpanded: 0, failFiles: 0, failQ: 0,
  };
  for (const r of results) {
    tot.q += r.qTotal; tot.ans += r.qAnswered; tot.exp += r.expanded;
    tot.letterOnly += r.letterOnly; tot.wrong += r.wrongText; tot.missing += r.missing;
    tot.softPass += r.softPass; tot.skip += r.skipped; tot.multi += r.multiLetter;
    tot.multiNotExpanded += r.multiNotExpanded;
    const fq = r.letterOnly + r.wrongText + r.missing;
    tot.failQ += fq;
    if (fq > 0) tot.failFiles++;
  }
  for (const r of results) {
    const fq = r.letterOnly + r.wrongText + r.missing;
    console.log(
      `--- ${r.file} ... q=${r.qTotal} ans=${r.qAnswered} exp=${r.expanded} letterOnly=${r.letterOnly} ` +
      `wrong=${r.wrongText} missing=${r.missing} soft=${r.softPass} multi=${r.multiLetter}/${r.multiNotExpanded} :: ${fq ? "FAIL" : "PASS"}`
    );
  }
  console.log("\n========== EXPANSION AUDIT SUMMARY ==========");
  console.log(
    `files=${tot.files} questions=${tot.q} answered=${tot.ans} expanded=${tot.exp} ` +
    `letterOnly=${tot.letterOnly} wrongText=${tot.wrong} missing=${tot.missing} softPass=${tot.softPass} ` +
    `multiLetter=${tot.multi} (not-expanded=${tot.multiNotExpanded}) FAIL_Q=${tot.failQ} FAIL_FILES=${tot.failFiles}`
  );
  writeFileSync(join(OUT, "audit.json"), JSON.stringify({ generated: new Date().toISOString(), opts: OPTS, totals: tot, results }, null, 2), "utf8");
  console.log(`\nJSON → ${join(OUT, "audit.json")}`);
  process.exit(0);
}

// ============================================================
const results: FileRes[] = [];
function results_push(fr: FileRes) {
  results.push(fr);
  writeFileSync(join(PARTS, safeName(fr.file) + ".json"), JSON.stringify(fr, null, 2), "utf8");
}
function pushFail(fr: FileRes, q: { serial: number; pos: number; answer: string | null; texts?: string[] }, reason: string, region: string, want: string) {
  if (fr.fails.length >= 500) return;
  fr.fails.push({ serial: q.serial, pos: q.pos, answer: q.answer ?? "", reason, seen: region.trim().slice(0, 200), want: want.slice(0, 200), src: (q.texts ?? []).slice(0, 12) });
}

let files = readdirSync(FORMAT).filter((f) => f.toLowerCase().endsWith(".docx"));
if (fileFilter) files = files.filter((f) => f.toLowerCase().includes(fileFilter));
files = files.map((f) => f.replace(/\.docx$/i, "")).sort((a, b) => a.localeCompare(b));
if (fileFilter && files.length === 0) { console.log(`NO MATCH for "${fileFilter}"`); process.exit(1); }
if (files.length === 1) {
  const old = join(PARTS, safeName(files[0]) + ".json");
  if (existsSync(old)) rmSync(old);
}

for (const base of files) {
  const zip = await JSZip.loadAsync(readFileSync(join(FORMAT, `${base}.docx`)));
  const xml = await zip.file("word/document.xml")!.async("string");
  let parse: ReturnType<typeof parseRedownloadXml>;
  const fr: FileRes = {
    file: base, qTotal: 0, qAnswered: 0, expanded: 0, letterOnly: 0, wrongText: 0,
    missing: 0, softPass: 0, skipped: 0, skippedReasons: {}, multiLetter: 0, multiNotExpanded: 0, fails: [],
  };
  try {
    parse = parseRedownloadXml(xml);
  } catch (e) {
    fr.parseError = String(e);
    results_push(fr);
    console.log(`ENDPARSE-FAIL ${base}: ${String(e)}`);
    continue;
  }
  fr.qTotal = parse.questions.length;

  let outXml = "";
  try {
    outXml = buildRedownloadXml(xml, parse, parse.questions.map((q) => q.id), OPTS);
  } catch (e) {
    fr.parseError = "BUILD:" + String(e);
    results_push(fr);
    console.log(`BUILD-FAIL ${base}: ${String(e)}`);
    continue;
  }
  zip.file("word/document.xml", outXml);
  const buf = await zip.generateAsync({ type: "nodebuffer", compression: "STORE" });
  writeFileSync(join(OUT, `${base} (redownload).docx`), buf);

  const outParas = paraTexts(outXml);
  const outNorm = outParas.map(norm);
  const outAllNorm = norm(outParas.join("\n"));
  const qKey = (q: (typeof parse.questions)[number]): string => {
    const kinds = q.kinds ?? [];
    for (let i = 0; i < (q.texts?.length ?? 0); i++) if (kinds[i] === "question") return norm(q.texts[i]);
    return norm(q.qText ?? "");
  };

  // ---- পাস ১: monotonic-cursor output-index ম্যাপ ----
  const qIdx: number[] = new Array(parse.questions.length).fill(-1);
  {
    let cursor = 0;
    for (let k = 0; k < parse.questions.length; k++) {
      const q = parse.questions[k];
      const keyRaw = qKey(q);
      const key = keyRaw.replace(/\[[^\]]*\]|\{[^}]*\}/g, "");
      const short = key.slice(0, 18);
      let idx = -1;
      if (key) {
        const end = Math.min(outNorm.length, cursor + 200);
        for (let i = cursor; i < end; i++) if (outNorm[i] === key || outNorm[i] === keyRaw) { idx = i; break; }
        if (idx < 0 && short.length >= 8) {
          for (let i = cursor; i < end; i++) if (outNorm[i].startsWith(short) || outNorm[i].includes(short)) { idx = i; break; }
        }
      }
      qIdx[k] = idx;
      if (idx >= 0) cursor = idx;
    }
  }

  // ---- পাস ২: region = k-তম প্রশ্ন-প্যারা → পরের প্রশ্ন-প্যারা ----
  for (let k = 0; k < parse.questions.length; k++) {
    const q = parse.questions[k];
    if (!q.answer) continue;
    fr.qAnswered++;
    const isMulti = /[+&,/]/.test(q.answer);
    if (isMulti) fr.multiLetter++;

    const idx = qIdx[k];
    let endIdx = outParas.length;
    for (let j = k + 1; j < parse.questions.length; j++) if (qIdx[j] > idx) { endIdx = qIdx[j]; break; }
    const region = idx >= 0 ? outParas.slice(idx, endIdx).join("\n") : "";
    const regionNorm = norm(region);

    // অপশনই নেই (fill-in-the-blank / সংখ্যা-উত্তর) → বিস্তার প্রযোজ্য নয়
    if (!q.options.some((o) => (o.text ?? "").trim())) {
      fr.skipped++;
      fr.skippedReasons["option নেই"] = (fr.skippedReasons["option নেই"] ?? 0) + 1;
      continue;
    }

    const letters = (q.answer.match(/[A-Za-zক-ঘ০-৪0-9]/g) ?? []).filter((ch) => slotOf(ch) >= 0);
    const targets: Array<{ label: string; text: string }> = [];
    const missingLetters: string[] = [];
    for (const ch of letters) {
      const si = slotOf(ch);
      // ইঞ্জিনের findOptionBySlot-এর অনুরূপ: সরাসরি স্লট না পেলে ordinal
      // ফলব্যাক কেবল তখনই যখন সেই option-এর লেবেল-স্লট ডুপ্লিকেট (টাইপো-প্রমাণ)
      let t = q.options.find((o) => slotOf(o.label) === si);
      if (!t) {
        const cand = q.options[si];
        if (cand && q.options.filter((o) => slotOf(o.label) === slotOf(cand.label)).length > 1) t = cand;
      }
      if (t) targets.push({ label: t.label, text: t.text });
      else missingLetters.push(ch);
    }
    const firstLetter = (q.answer.split(/[+&,/]/)[0] ?? "").trim();
    const letterRe = new RegExp(
      `(?:উত্তর|উঃ|Ans\\.?|Answer|Dt|Cvw|wU|DËi|D\\s*:)[\\s:.]*${firstLetter}(?![A-Za-z0-9\\u0980-\\u09FF])`, "i"
    );

    if (missingLetters.length) {
      fr.letterOnly++;
      if (isMulti) fr.multiNotExpanded++;
      pushFail(fr, q, `target-option পাওয়া যায়নি (${missingLetters.join(",")}) → বিস্তার হয়নি`, region, "(option text)");
      continue;
    }

    const wants = targets.map((t) => norm(t.text)).filter(Boolean);
    // মিলে-যাওয়া অপশনের লেখাই খালি (সোর্স-ত্রুটি) → বিস্তারযোগ্য কিছু নেই
    if (!wants.length) {
      fr.skipped++;
      fr.skippedReasons["অপশনের লেখা খালি"] = (fr.skippedReasons["অপশনের লেখা খালি"] ?? 0) + 1;
      continue;
    }
    const cores = wants.map((w) => w.slice(0, Math.min(w.length, 12)));
    const inRegionFull = wants.length > 0 && wants.every((w) => regionNorm.includes(w));
    const inRegionCore = wants.length > 0 && cores.every((c) => c.length >= 5 && regionNorm.includes(c));
    const inAllFull = wants.length > 0 && wants.every((w) => outAllNorm.includes(w));

    if (inRegionFull) {
      fr.expanded++;
    } else if (inRegionCore || inAllFull) {
      // glue/region-map/symbol — লেখা আছে, তাই বিস্তার হয়েছে
      fr.expanded++;
      fr.softPass++;
    } else {
      const bare = regionNorm && letterRe.test(regionNorm);
      if (bare) { fr.letterOnly++; if (isMulti) fr.multiNotExpanded++; }
      else if (!region.trim()) fr.missing++;
      else fr.wrongText++;
      pushFail(fr, q, bare ? "letter-only (বিস্তার হয়নি)" : !region.trim() ? "answer-line পাওয়া যায়নি (হারিয়ে গেছে)" : "ভুল/অনুপস্থিত ভেতরের লেখা", region, targets.map((t) => `${t.label}: ${t.text}`).join(" | "));
    }
  }

  results_push(fr);
  const failN = fr.letterOnly + fr.wrongText + fr.missing;
  console.log(
    `--- ${base} ... q=${fr.qTotal} ans=${fr.qAnswered} exp=${fr.expanded} letterOnly=${fr.letterOnly} ` +
    `wrong=${fr.wrongText} missing=${fr.missing} soft=${fr.softPass} multi=${fr.multiLetter}/${fr.multiNotExpanded} :: ${failN ? "FAIL" : "PASS"}`
  );
  if (diagN > 0 && fr.fails.length) {
    console.log(`### ${base} — ${fr.fails.length} FAIL`);
    fr.fails.slice(0, diagN).forEach((f) => {
      console.log(`  serial=${f.serial} ans=${f.answer} :: ${f.reason}\n     seen: ${JSON.stringify(f.seen)}\n     want: ${JSON.stringify(f.want)}`);
    });
  }
}
