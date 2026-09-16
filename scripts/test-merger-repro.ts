// ============================================================
// Word-corruption REPRO — লাইভ সাইটের হুবহু পাইপলাইন (Chromium-এ চালানো)
// ============================================================
// বাগ-রিপোর্ট: লাইভ সাইট থেকে নামানো "MCQ-Redownload-merged.docx" Word-এ খোলে না
// ("Word experienced an error…" + "unreadable content…")। এ টেস্ট ইউজারের
// রানটাইম (ব্রাউজার DOMParser/XMLSerializer) হুবহু ব্যবহার করে — jsdom নয় —
// আসল ফাইলে প্রতিটা অপশন-কম্বিনেশনে single / merged / zip আউটপুট বানিয়ে
// Word-লেভেল ভ্যালিডেশন চালায়:
//   (a) unzip -t — zip ইন্টিগ্রিটি (zip মোডে container-এর উপরেই)
//   (b) প্রতিটা XML পার্ট স্ট্রিক্ট well-formed (scripts/fixtures/ooxml_check.py —
//       namespace-aware: আনডিক্লেয়ার্ড প্রিফিক্স/ডুপ্লিকেট অ্যাট্রিবিউট ফেটাল)
//   (c) r:embed/r:id/r:link রেফারেন্স → word/_rels/document.xml.rels-এ আছে?
//       rel টার্গেট ফাইল zip-এ আছে? [Content_Types].xml কভারেজ? mc:Ignorable প্রিফিক্স?
//       w:sectPr শেষ চাইল্ড?
//   (d) LibreOffice headless convert-to pdf — ব্যর্থ/পিডিএফ-শূন্য = Word-লেভেল পার্স-ব্যর্থতা
// zip মোডে container একটা .zip (docx নয়) — তাই (a) container-এ, আর (b)(c)(d)
// প্রতিটা nested .docx আন-প্যাক করে আলাদাভাবে চালানো হয়।
// রান: bun run scripts/test-merger-repro.ts [--quick]
// আউটপুট ফাইল জমা হয়: /tmp/mcq-merger-repro/
// ============================================================

import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync, readdirSync } from "node:fs";
import { execSync } from "node:child_process";
import { chromium } from "playwright";

// ---------- কনফিগ ----------

const ROOT = "/home/z/my-project";
const OUT_DIR = "/tmp/mcq-merger-repro";
const BUNDLE = "/tmp/mcq-merger-repro-bundle.js";
const LO_DIR = "/tmp/mcq-merger-repro-lo";

const QUICK = process.argv.includes("--quick");

// স্লাইস-ফিল্টার: --combo=a,b --set=x,y --mode=m,n — বড় ম্যাট্রিক্স ছোট ছোট
// প্রসেসে ভাগে চালাতে (৪GB RAM-এ botany+chemf merged পুরো ম্যাট্রিক্সে OOM করে)
function csvArg(name: string): string[] | null {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split("=")[1].split(",").filter(Boolean) : null;
}
const ONLY_COMBOS = csvArg("combo");
const ONLY_SETS = csvArg("set");
const ONLY_MODES = csvArg("mode") as Array<"single" | "merged" | "zip"> | null;

const FILES: Record<string, string> = QUICK
  ? { fixture: `${ROOT}/scripts/fixtures/hsc27-physics-bijoy.docx` }
  : {
      fixture: `${ROOT}/scripts/fixtures/hsc27-physics-bijoy.docx`,
      colorfree: `${ROOT}/upload/color-free-test.docx`,
      phy1: `${ROOT}/upload/Physics 1st Paper Chapter-01 (Raw).docx`,
      phy2: `${ROOT}/upload/Physics 1st Paper Chapter-02 (Raw).docx`,
      botany: `${ROOT}/upload/Agri MCQ Botany 997 mcq - Copy - type serial.docx`,
      chemf: `${ROOT}/upload/Final Chemistry 1st paper only varsity Question (1-5).docx`,
    };

const COMBOS: Record<string, { partSel: Record<string, boolean>; renumber: boolean; expandAnswer: boolean }> = {
  // page.tsx-এর buildRdItems-এর হুবহু আকারে (সেখানে expandAnswer সবসময় true)
  default: { partSel: { serial: true, question: true, reference: false, options: false, answer: false, bekkha: false }, renumber: true, expandAnswer: true },
  alltrue: { partSel: { serial: true, question: true, reference: true, options: true, answer: true, bekkha: true }, renumber: true, expandAnswer: true },
  noren: { partSel: { serial: true, question: true, reference: false, options: false, answer: false, bekkha: false }, renumber: false, expandAnswer: true },
  expand: { partSel: { serial: true, question: true, reference: false, options: false, answer: true, bekkha: false }, renumber: true, expandAnswer: true },
  noserial: { partSel: { serial: false, question: true, reference: true, options: true, answer: true, bekkha: true }, renumber: true, expandAnswer: true },
};

const SETS: Array<{ label: string; keys: string[] }> = QUICK
  ? [{ label: "fixture+fixture", keys: ["fixture", "fixture"] }]
  : [
      { label: "fixture+colorfree", keys: ["fixture", "colorfree"] },
      { label: "phy1+phy2", keys: ["phy1", "phy2"] },
      { label: "botany+chemf", keys: ["botany", "chemf"] },
    ];

// ---------- পাস/ফেল হিসাব ----------

let passed = 0;
let failed = 0;
const issues: string[] = [];
function ok(cond: boolean, name: string) {
  if (cond) {
    passed++;
    console.log("  ✓", name);
  } else {
    failed++;
    issues.push(name);
    console.error("  ✗ FAIL:", name);
  }
}

// ---------- ব্রাউজার-বান্ডিল নির্মাণ (আসল src/lib/mcq কোড, কোনো কপি-পেস্ট নয়) ----------

function buildBrowserBundle(): void {
  const entry = `
import { parseRedownloadXml, buildRedownloadXml } from "${ROOT}/src/lib/mcq/redownload";
import { buildMergedDocxBlob, replaceDocumentXml, buildZipBlob } from "${ROOT}/src/lib/mcq/multi-docx";
import { loadDocxXml } from "${ROOT}/src/lib/mcq/docx-xml";
(globalThis as any).__mcqRepro = { parseRedownloadXml, buildRedownloadXml, buildMergedDocxBlob, replaceDocumentXml, buildZipBlob, loadDocxXml };
`;
  writeFileSync("/tmp/mcq-merger-repro-entry.ts", entry);
  execSync(`cd ${ROOT} && bun build /tmp/mcq-merger-repro-entry.ts --outfile ${BUNDLE} --target=browser --format=iife`, { stdio: "pipe" });
}

// ---------- মেইন ----------

async function main() {
  rmSync(OUT_DIR, { recursive: true, force: true });
  rmSync(LO_DIR, { recursive: true, force: true });
  mkdirSync(OUT_DIR, { recursive: true });
  buildBrowserBundle();

  const exe = process.env.PLAYWRIGHT_CHROMIUM;
  const browser = await chromium.launch(exe ? { executablePath: exe } : {});
  const page = await browser.newPage();
  await page.goto("about:blank");
  await page.addScriptTag({ path: BUNDLE });

  // ফাইল-বাইনারি একবারই ব্রাউজারে পাঠাই (base64)
  const fileB64: Record<string, string> = {};
  for (const [k, f] of Object.entries(FILES)) fileB64[k] = readFileSync(f).toString("base64");
  await page.evaluate((b) => {
    (globalThis as any).__files = b;
    (globalThis as any).__mcqRepro.__combos = {
      __combosRef: 0, // placeholder — নিচে আসল কম্বো বসে
    };
  }, fileB64);
  await page.evaluate((c) => {
    (globalThis as any).__mcqRepro.__combos = c;
  }, COMBOS);

  /** এক কেস = কম্বো × ফাইল-সেট × মোড — ব্রাউজারেই হুবহু পাইপলাইন; ফেরত base64 docx */
  const runCase = (combo: string, keys: string[], mode: "single" | "merged" | "zip") =>
    page.evaluate(async ({ combo, keys, mode }: { combo: string; keys: string[]; mode: string }) => {
      const M = (globalThis as any).__mcqRepro;
      const F = (globalThis as any).__files as Record<string, string>;
      const opts = M.__combos[combo];
      const toU8 = (b64: string) => {
        const bin = atob(b64);
        const u8 = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
        return u8;
      };
      const toB64 = (buf: ArrayBuffer) => {
        const u8 = new Uint8Array(buf);
        let s = "";
        const CH = 0x8000;
        for (let i = 0; i < u8.length; i += CH) s += String.fromCharCode.apply(null, Array.from(u8.subarray(i, i + CH)));
        return btoa(s);
      };
      const items: Array<{ xml: string; file: Blob }> = [];
      const singles: Array<{ name: string; blob: Blob }> = [];
      // merged মোডে অপ্রয়োজনীয় single-blob বানিয়ে রেন্ডারার-হিপ ফুলাই না (৪GB হোস্টে OOM-নিরাপদ)
      const needSingles = mode !== "merged";
      for (let i = 0; i < keys.length; i++) {
        const file = new Blob([toU8(F[keys[i]])]);
        const xml = await M.loadDocxXml(file);
        const parse = M.parseRedownloadXml(xml);
        const ids = parse.questions.map((q: any) => q.id);
        const rd = M.buildRedownloadXml(xml, parse, ids, opts);
        items.push({ xml: rd, file });
        if (needSingles) singles.push({ name: `part-${i + 1}.docx`, blob: await M.replaceDocumentXml(file, rd) });
      }
      if (mode === "merged") return [toB64(await (await M.buildMergedDocxBlob(items)).arrayBuffer())];
      if (mode === "zip") return [toB64(await (await M.buildZipBlob(singles)).arrayBuffer())];
      return await Promise.all(singles.map(async (s) => toB64(await s.blob.arrayBuffer())));
    }, { combo, keys, mode });

  // ---------- ম্যাট্রিক্স ----------
  /** এক docx-ফাইলের (b)+(c)+(d) ভ্যালিডেশন — single/merged ও zip-এর nested ফাইলে একই */
  const validateDocx = (srcPath: string, baseName: string, tag: string, fail: (m: string) => void) => {
    // (b)+(c) স্ট্রিক্ট XML + OOXML রিল/কনটেন্ট-টাইপ ইন্টিগ্রিটি
    try {
      execSync(`python3 ${ROOT}/scripts/fixtures/ooxml_check.py ${srcPath}`, { stdio: "pipe" });
    } catch (e: unknown) {
      const err = e as { stderr?: Buffer };
      fail(`${tag}: OOXML ভ্যালিডেশন — ${(err.stderr?.toString() ?? "ওপেন করা যায়নি").trim()}`);
    }
    // (d) LibreOffice — Word-লেভেল গ্রহণযোগ্যতার প্রক্সি
    const loCase = `${LO_DIR}/${tag.replace(/[^\w-]/g, "_")}`;
    try {
      mkdirSync(loCase, { recursive: true });
      execSync(`cp "${srcPath}" ${loCase}/ && soffice --headless --convert-to pdf --outdir ${loCase} ${loCase}/${baseName}`, {
        stdio: "pipe",
        timeout: 180000,
      });
      if (!existsSync(`${loCase}/${baseName.replace(/\.docx$/i, ".pdf")}`))
        fail(`${tag}: LibreOffice পিডিএফ বানায়নি (Word-ও খুলবে না)`);
    } catch {
      fail(`${tag}: LibreOffice conversion ব্যর্থ (Word-লেভেল পার্স-ব্যর্থতা)`);
    }
  };

  for (const combo of Object.keys(COMBOS)) {
    if (ONLY_COMBOS && !ONLY_COMBOS.includes(combo)) continue;
    for (const set of SETS) {
      if (ONLY_SETS && !ONLY_SETS.includes(set.label)) continue;
      for (const mode of ["single", "merged", "zip"] as const) {
        if (ONLY_MODES && !ONLY_MODES.includes(mode)) continue;
        const label = `${combo}/${set.label}/${mode}`;
        console.log(`\n== ${label} ==`);
        let outB64s: string[];
        try {
          outB64s = await runCase(combo, set.keys, mode);
        } catch (e) {
          ok(false, `${label}: পাইপলাইন এক্সেপশন — ${String(e).slice(0, 250)}`);
          continue;
        }
        const caseDir = `${OUT_DIR}/${label.replace(/[^\w-]/g, "_")}`;
        mkdirSync(caseDir, { recursive: true });
        const isZipBundle = mode === "zip";
        outB64s.forEach((b64, i) =>
          writeFileSync(`${caseDir}/out-${i}.${isZipBundle ? "zip" : "docx"}`, Buffer.from(b64, "base64")),
        );

        let caseFail = 0;
        const fail = (m: string) => {
          caseFail++;
          ok(false, `${label}: ${m}`);
        };

        if (isZipBundle) {
          // (a) zip কনটেইনার-ইন্টিগ্রিটি — container-কে docx ভেবে ভ্যালিডেট করা যায় না
          try {
            execSync(`unzip -t -qq ${caseDir}/out-0.zip`, { stdio: "pipe" });
          } catch {
            fail("out-0.zip: unzip -t ব্যর্থ");
          }
          // (b)+(c)+(d) প্রতিটা nested .docx আলাদাভাবে আন-প্যাক করে ভ্যালিডেট
          const exDir = `${caseDir}/extracted`;
          let nested: string[] = [];
          try {
            mkdirSync(exDir, { recursive: true });
            execSync(`unzip -o -q ${caseDir}/out-0.zip -d ${exDir}`, { stdio: "pipe" });
            nested = readdirSync(exDir)
              .filter((f) => f.toLowerCase().endsWith(".docx"))
              .sort();
          } catch (e) {
            fail(`zip আন-প্যাক ব্যর্থ — ${String(e).slice(0, 120)}`);
          }
          ok(nested.length === set.keys.length, `zip-এ ${set.keys.length}টা nested .docx (পাওয়া গেছে ${nested.length})`);
          for (const f of nested) validateDocx(`${exDir}/${f}`, f, `zip→${f}`, fail);
        } else {
          for (let i = 0; i < outB64s.length; i++) {
            const path = `${caseDir}/out-${i}.docx`;
            // (a) zip ইন্টিগ্রিটি
            try {
              execSync(`unzip -t -qq ${path}`, { stdio: "pipe" });
            } catch {
              fail(`out-${i}.docx: unzip -t ব্যর্থ`);
            }
            validateDocx(path, `out-${i}.docx`, `out-${i}.docx`, fail);
          }
        }
        if (caseFail === 0) {
          passed++;
          console.log(`  ✓ ${label}: ${outB64s.length} ফাইল সব ভ্যালিডেশন পাস`);
        }
      }
    }
  }

  await browser.close();

  console.log(`\n===== ফলাফল: ${passed} পাস, ${failed} ফেল =====`);
  if (issues.length) {
    console.log("\n---- সমস্যাগুলো ----");
    for (const i of issues) console.log(" •", i);
  }
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error("REPRO স্ক্রিপ্ট এরর:", e);
  process.exit(2);
});
