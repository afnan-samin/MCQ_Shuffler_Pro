// ============================================================
// উত্তর-কনফ্লিক্ট অডিট রানার (Prompt/3rd.md — Phase A)
// Format/-এর সব .docx parse করে star-vs-tail answerConflict + missed খোঁজে।
// স্বাধীন (independent) guarded tail + star ডিটেকশন দিয়ে verdict ঠিক হয়।
// আউটপুট: download/AC_answer-conflict/audit.json
// রান: bun run scripts/_qa-answer-conflict.ts [--files=keyword]
// ============================================================
import { readFileSync, readdirSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { JSDOM } from "jsdom";
import JSZip from "jszip";

const dom = new JSDOM("<!doctype html><html><body></body></html>");
(globalThis as unknown as Record<string, unknown>).DOMParser = dom.window.DOMParser;
(globalThis as unknown as Record<string, unknown>).XMLSerializer = dom.window.XMLSerializer;
(globalThis as unknown as Record<string, unknown>).Node = dom.window.Node;

const { parseRedownloadXml } = await import("../src/lib/mcq/redownload");
type RdParse = ReturnType<typeof parseRedownloadXml>;
type RdQ = RdParse["questions"][number];

const FORMAT = "Format";
const OUT = "download/AC_answer-conflict";

function slotOf(ch: string | null | undefined): number | null {
  if (!ch) return null;
  let i = "KLMN".indexOf(ch.toUpperCase());
  if (i >= 0) return i;
  i = "কখগঘ".indexOf(ch);
  if (i >= 0) return i;
  i = "ABCD".indexOf(ch.toUpperCase());
  if (i >= 0) return i;
  return null;
}

const LETTER = "[KLMNklmnকখগঘa-dA-D]";
const LETTER_GROUP = `([KLMNklmnকখগঘa-dA-D1-4](?:\\s*[+&,/]\\s*[KLMNklmnকখগঘa-dA-D1-4])*)`;
const ANSWER_TOK = "(?:Dt|DËi?t?|Cvw|wU|উঃ|উত্তর|উওর|Ans?\\.?|Answer|D(?=\\s*[:.]))";
// docx-xml ANSWER_TAIL_RE-এর হুবহু কপি (লাইন-শেষ, global, case-sensitive — asol regex-e `i` নেই)
const TAIL_RE = new RegExp(`${ANSWER_TOK}\\s*[:.]?\\s*${LETTER_GROUP}\\s*$`, "g");
// redownload.findTailAnswer-এর হুবহু glue-guard
const TAIL_GLUE_OK = /^(?:Dt|DË|D:|Cvw|উঃ|উত্তর|উওর|Ans|Answer)/;
const BARE_D = /^D(?=\s*[:.])/;

function genuineGlue(m: RegExpExecArray, line: string): boolean {
  if (m.index > 0 && !/\s/.test(line[m.index - 1]) && !TAIL_GLUE_OK.test(m[0])) return false;
  if (BARE_D.test(m[0])) {
    const first = (m[1] ?? "")[0] ?? "";
    if (!/[KLMNklmnকখগঘa-dA-D]/.test(first)) return false;
  }
  return true;
}

/** লাইন-শেষের সব tail-answer-অক্ষর — guarded (asol glued শুধু টেকে) */
function guardedTails(texts: string[]): Array<{ letter: string; src: string; whole: string }> {
  const out: Array<{ letter: string; src: string; whole: string }> = [];
  for (const line of texts) {
    TAIL_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = TAIL_RE.exec(line))) {
      if (genuineGlue(m, line)) out.push({ letter: (m[1] ?? "")[0] ?? "", src: line, whole: m[0] });
    }
  }
  return out;
}
/** unguarded (কাঁচা) tail-ম্যাচ — FALSE প্রমাণের জন্য */
function rawTails(texts: string[]): Array<{ letter: string; src: string; whole: string }> {
  const out: Array<{ letter: string; src: string; whole: string }> = [];
  for (const line of texts) {
    TAIL_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = TAIL_RE.exec(line))) out.push({ letter: (m[1] ?? "")[0] ?? "", src: line, whole: m[0] });
  }
  return out;
}
function starLetterGuess(text: string): string | null {
  let m = new RegExp(`\\*\\s*(${LETTER})\\s*[.।):]`).exec(text);
  if (m) return m[1];
  m = new RegExp(`(${LETTER})\\s*[.।):][^*\\n]*\\*`).exec(text);
  if (m) return m[1];
  const g = /([KLMNklmnকখগঘa-dA-D])\*/.exec(text);
  if (g) return g[1];
  return null;
}
function independentStar(texts: string[]): { letter: string; src: string } | null {
  for (const t of texts) {
    if (!t.includes("*")) continue;
    const g = starLetterGuess(t);
    if (g) return { letter: g, src: t };
  }
  return null;
}

function clip(s: string, n = 160): string {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > n ? t.slice(0, n) + "…" : t;
}

interface Flagged {
  serial: number;
  star: string;
  tail: string;
  starSrc: string;
  tailSrcRaw: string;
  tailWholeRaw: string;
  genuineTail: string | null;
  verdict: "TRUE" | "FALSE" | "UNCERTAIN";
  reason: string;
}
interface Missed {
  serial: number;
  star: string;
  tail: string;
  starSrc: string;
  tailSrc: string;
}
interface FileAudit {
  file: string;
  questions: number;
  starQs: number;
  tailQs: number;
  bothQs: number;
  steadyQs: number;
  flagged: Flagged[];
  missed: Missed[];
  trueCount: number;
  falseCount: number;
  uncertainCount: number;
  scannedAll: boolean;
  scanNote: string;
}

function analyzeQ(q: RdQ): Flagged {
  const star = q.answerConflict!.star;
  const tail = q.answerConflict!.tail;
  const starSrc = q.texts.find((t) => t.includes("*")) ?? "";
  const gTails = guardedTails(q.texts);
  const gTail = gTails.find((t) => slotOf(t.letter) === slotOf(tail)) ?? null;
  const rTails = rawTails(q.texts);
  const rTail = rTails.find((t) => slotOf(t.letter) === slotOf(tail)) ?? null;

  let verdict: Flagged["verdict"];
  let reason: string;
  if (gTail) {
    verdict = "TRUE";
    reason = `সোর্সে star-অপশন (${star}) ও আসল tail-উত্তর (${tail}) দুটোই আছে, ভিন্ন স্লট — মানুষের টাইপো।`;
  } else if (rTail) {
    verdict = "FALSE";
    reason = `tail (${tail}) এসেছে শব্দ-ভিতরের টোকেন থেকে — "${clip(rTail.whole, 24)}" ("…${clip(rTail.src.slice(Math.max(0, rTail.src.indexOf(rTail.whole) - 8), rTail.src.indexOf(rTail.whole) + rTail.whole.length), 24)}")। উত্তর-লাইন নয়।`;
  } else {
    verdict = "UNCERTAIN";
    reason = `tail (${tail}) সোর্সে পাওয়া গেল না — পর্যালোচনা দরকার।`;
  }
  return { serial: q.serial, star, tail, starSrc, tailSrcRaw: rTail?.src ?? "", tailWholeRaw: rTail?.whole ?? "", genuineTail: gTail?.whole ?? null, verdict, reason };
}

async function loadParse(fp: string): Promise<RdParse> {
  const zip = await JSZip.loadAsync(readFileSync(fp));
  const xml = await zip.file("word/document.xml")!.async("string");
  return parseRedownloadXml(xml);
}

const args = process.argv.slice(2);
const fileFilter = (args.find((a) => a.startsWith("--files="))?.slice(8) ?? "").toLowerCase();
let files = readdirSync(FORMAT).filter((f) => f.toLowerCase().endsWith(".docx"));
if (fileFilter) files = files.filter((f) => f.toLowerCase().includes(fileFilter));
files = files.sort((a, b) => a.localeCompare(b));

const SMALL_LIMIT = 200;
const results: FileAudit[] = [];

for (const file of files) {
  process.stdout.write(`\n--- ${file} ... `);
  let parse: RdParse;
  try {
    parse = await loadParse(join(FORMAT, file));
  } catch (e) {
    console.log("PARSE ERROR:", (e as Error).message);
    results.push({ file, questions: 0, starQs: 0, tailQs: 0, bothQs: 0, steadyQs: 0, flagged: [], missed: [], trueCount: 0, falseCount: 0, uncertainCount: 0, scannedAll: false, scanNote: "parse error" });
    continue;
  }
  const qs = parse.questions;
  const flagged: Flagged[] = [];
  for (const q of qs) if (q.answerConflict) flagged.push(analyzeQ(q));

  // aggregate: কত প্রশ্নে star / genuine-tail / দুটোই / দুটোই-এবং-একই-স্লট
  let starQs = 0, tailQs = 0, bothQs = 0, steadyQs = 0;
  for (const q of qs) {
    const star = independentStar(q.texts);
    const gTails = guardedTails(q.texts);
    if (star) starQs++;
    if (gTails.length) tailQs++;
    if (star && gTails.length) {
      bothQs++;
      const ss = slotOf(star.letter);
      if (gTails.every((t) => slotOf(t.letter) === ss || slotOf(t.letter) === null)) steadyQs++;
    }
  }

  // ---- independent missed scan ----
  const scanAll = qs.length <= SMALL_LIMIT;
  let toScan = qs;
  let scanNote: string;
  if (scanAll) scanNote = `full scan (${qs.length} প্রশ্ন ≤ ${SMALL_LIMIT})`;
  else {
    const set = new Map<number, RdQ>();
    for (const q of [...qs.slice(0, 25), ...qs.slice(-25)]) set.set(q.id, q);
    toScan = [...set.values()];
    scanNote = `sample scan (${toScan.length}/${qs.length}) — প্রথম ২৫ + শেষ ২৫`;
  }
  const missed: Missed[] = [];
  let scanCandidates = 0;
  for (const q of toScan) {
    if (q.answerConflict) continue;
    const star = independentStar(q.texts);
    if (!star) continue;
    const gTails = guardedTails(q.texts);
    if (!gTails.length) continue;
    scanCandidates++;
    const starSlot = slotOf(star.letter);
    const bad = gTails.find((t) => slotOf(t.letter) !== null && starSlot !== null && slotOf(t.letter) !== starSlot);
    if (bad) missed.push({ serial: q.serial, star: star.letter, tail: bad.letter, starSrc: star.src, tailSrc: bad.src });
  }

  const trueCount = flagged.filter((f) => f.verdict === "TRUE").length;
  const falseCount = flagged.filter((f) => f.verdict === "FALSE").length;
  const uncertainCount = flagged.filter((f) => f.verdict === "UNCERTAIN").length;
  results.push({ file, questions: qs.length, starQs, tailQs, bothQs, steadyQs, flagged, missed, trueCount, falseCount, uncertainCount, scannedAll: scanAll, scanNote });
  console.log(`q=${qs.length} star=${starQs} tail=${tailQs} both=${bothQs} (steady=${steadyQs}) flagged=${flagged.length} (T${trueCount}/F${falseCount}/U${uncertainCount}) missed=${missed.length} scanned=${toScan.length}`);
}

mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, "audit.json"), JSON.stringify(results, null, 2), "utf8");
let T = 0, F = 0, U = 0, M = 0, QQ = 0;
for (const r of results) { T += r.trueCount; F += r.falseCount; U += r.uncertainCount; M += r.missed.length; QQ += r.questions; }
console.log(`\n========== SUMMARY ==========`);
console.log(`files=${results.length} questions=${QQ} flagged=${T + F + U} (TRUE=${T} FALSE=${F} UNCERTAIN=${U}) missed=${M}`);
console.log(`JSON → ${join(OUT, "audit.json")}`);
