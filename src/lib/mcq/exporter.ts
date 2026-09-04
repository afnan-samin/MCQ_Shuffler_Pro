// ============================================================
// Exporter — .docx / .doc (HTML) / প্রিন্ট / ক্লিপবোর্ড
// প্রতিটি সেট আলাদা পেজে (page break) এক্সপোর্ট হয়
// Bijoy (SutonnyMJ) ও Unicode বাংলা উভয় ফন্ট সাপোর্ট
// ============================================================

import { AlignmentType, Document, Packer, Paragraph, TextRun } from "docx";
import type { McqQuestion } from "./parser";
import { getSetName, setToText, type NameStyle } from "./set-engine";
import { splitLineSegments, type Enc } from "./encoding";

export type FontMode = "auto" | "legacy" | "unicode" | "english";

export interface ExportOptions {
  fontMode: FontMode;
  /** Bijoy/ANSI লিগ্যাসি ফন্ট (যেমন SutonnyMJ) */
  legacyFont: string;
  /** Unicode বাংলা ফন্ট (যেমন Nirmala UI, Kalpurush) */
  unicodeFont: string;
  /** English ফন্ট (auto মোডে English শব্দে বসবে) */
  englishFont: string;
  /** ফন্ট সাইজ (pt) */
  fontSize: number;
  nameStyle: NameStyle;
  /** প্রতি সেটের শুরুতে হেডার (ইনস্টিটিউট নাম ইত্যাদি) বসবে কিনা */
  includeHeader: boolean;
  headerText: string;
  /** সেট-টাইটেল প্যারা ("সেট A") বসবে কিনা — ডিফল্ট true; একক-সেট এক্সপোর্টে (যেমন সিরিয়াল-পেস্ট) false */
  includeSetHeader?: boolean;
  /** ডাউনলোড ফাইলনেম — না দিলে MCQ-Sets-<টাইমস্ট্যাম্প>.docx */
  fileName?: string;
}

export const DEFAULT_EXPORT_OPTIONS: ExportOptions = {
  fontMode: "auto",
  legacyFont: "SutonnyMJ",
  unicodeFont: "Nirmala UI",
  englishFont: "Times New Roman",
  fontSize: 12,
  nameStyle: "letter",
  includeHeader: true,
  headerText: "",
};

/** বাংলা Unicode ক্যারেক্টার আছে কিনা */
export function isBanglaUnicode(line: string): boolean {
  return /[\u0980-\u09FF]/.test(line);
}

/** লাইন অনুযায়ী ফন্ঠ নির্ধারণ */
function fontForLine(line: string, opts: ExportOptions): string {
  switch (opts.fontMode) {
    case "legacy":
      return opts.legacyFont;
    case "unicode":
      return opts.unicodeFont;
    case "english":
      return opts.englishFont;
    default: {
      // auto: Unicode বাংলা হলে Unicode ফন্ট, নাহলে লিগ্যাসি (Bijoy/English)
      return isBanglaUnicode(line) ? opts.unicodeFont : opts.legacyFont;
    }
  }
}

/**
 * লাইন → ফন্ট-রান তালিকা। auto মোডে শব্দ ধরে ধরে ফন্ট বসে:
 * Bijoy শব্দ → legacyFont (SutonnyMJ), Unicode বাংলা → unicodeFont,
 * English → englishFont। অন্য মোডে পুরো লাইন এক ফন্টে।
 */
export interface LineRun {
  text: string;
  font: string;
  enc: Enc;
}

export function runsForLine(line: string, opts: ExportOptions): LineRun[] {
  if (opts.fontMode !== "auto") {
    return [{ text: line, font: fontForLine(line, opts), enc: "neutral" }];
  }
  const base = fontForLine(line, opts);
  const segs = splitLineSegments(line);
  if (segs.length === 0) return [{ text: line, font: base, enc: "neutral" }];
  if (segs.length === 1) return [{ text: line, font: base, enc: segs[0].enc }];
  return segs.map((s) => {
    let font = base;
    if (s.enc === "bijoy") font = opts.legacyFont;
    else if (s.enc === "unicode") font = opts.unicodeFont;
    else if (s.enc === "english") font = opts.englishFont;
    return { text: s.text, font, enc: s.enc };
  });
}

function fontObj(name: string) {
  return { ascii: name, hAnsi: name, cs: name, eastAsia: name };
}

export function getHeaderLines(opts: ExportOptions): string[] {
  if (!opts.includeHeader) return [];
  return opts.headerText
    .split("\n")
    .map((l) => l.trimEnd())
    .filter((l) => l.trim() !== "");
}

// ---------- .docx ----------

function buildDocxParagraphs(sets: McqQuestion[][], opts: ExportOptions): Paragraph[] {
  const paras: Paragraph[] = [];
  const halfPoints = Math.round(opts.fontSize * 2);

  sets.forEach((questions, si) => {
    const name = getSetName(si, opts.nameStyle);
    // সেট-টাইটেল বন্ধ থাকলে প্রথম প্রশ্ন-প্যারাতেই পেজ-ব্রেক যায় (মাল্টি-সেট হলে)
    const showSetTitle = opts.includeSetHeader !== false;

    // সেট হেডার — প্রতিটি সেট নতুন পেজে শুরু হয়
    if (showSetTitle) {
      paras.push(
        new Paragraph({
          alignment: AlignmentType.CENTER,
          pageBreakBefore: si > 0,
          spacing: { after: 120 },
          children: [
            new TextRun({
              text: name,
              bold: true,
              size: halfPoints + 4,
              font: fontObj(opts.unicodeFont),
            }),
          ],
        })
      );
    }

    // প্রশ্নের হেডার লাইন (ইনস্টিটিউট, সময় ইত্যাদি)
    for (const h of getHeaderLines(opts)) {
      paras.push(
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 60 },
          children: runsForLine(h, opts).map(
            (r) =>
              new TextRun({
                text: r.text,
                size: halfPoints,
                bold: isBanglaUnicode(h) === false && /^[A-Z0-9 ]+$/.test(h),
                font: fontObj(r.font),
              })
          ),
        })
      );
    }

    // প্রশ্নগুলো — সিরিয়ালসহ প্রতিটি লাইন প্লেইন টেক্সট রানে (কোনো বুলেট/
    // অটো নম্বরিং নেই), শব্দ ধরে ধরে সঠিক ফন্ট বসে
    for (const [qi, q] of questions.entries()) {
      for (const line of q.lines) {
        paras.push(
          new Paragraph({
            spacing: { after: 40 },
            pageBreakBefore: !showSetTitle && si > 0 && qi === 0,
            children: runsForLine(line, opts).map(
              (r) =>
                new TextRun({
                  text: r.text,
                  size: halfPoints,
                  font: fontObj(r.font),
                })
            ),
          })
        );
      }
      // প্রশ্নের পর সামান্য ফাঁক
      paras.push(
        new Paragraph({ spacing: { after: 60 }, children: [new TextRun({ text: "", size: halfPoints })] })
      );
    }
  });

  return paras;
}

/** .docx বানিয়ে ডাউনলোড করায় — প্রতিটি সেট আলাদা পেজে */
export async function exportDocx(sets: McqQuestion[][], opts: ExportOptions): Promise<void> {
  const doc = new Document({
    styles: {
      default: {
        document: {
          run: { font: fontObj(opts.legacyFont), size: Math.round(opts.fontSize * 2) },
        },
      },
    },
    sections: [
      {
        properties: {
          page: { margin: { top: 720, bottom: 720, left: 900, right: 900 } },
        },
        children: buildDocxParagraphs(sets, opts),
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  downloadBlob(blob, opts.fileName ?? `MCQ-Sets-${fileNameStamp()}.docx`);
}

// ---------- .doc (HTML ভিত্তিক — পুরনো Word-ও খুলতে পারে) ----------

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildSetsHtml(sets: McqQuestion[][], opts: ExportOptions, forPrint: boolean): string {
  const size = opts.fontSize + "pt";
  const headerLines = getHeaderLines(opts);

  const setBlocks = sets
    .map((questions, si) => {
      const name = escapeHtml(getSetName(si, opts.nameStyle));
      const headerHtml = headerLines
        .map((h) => {
          const f = fontForLine(h, opts);
          return `<p class="hdr" style="font-family:'${f}'">${escapeHtml(h)}</p>`;
        })
        .join("\n");
      const qHtml = questions
        .map(
          (q) =>
            q.lines
              .map((line) => {
                const spans = runsForLine(line, opts)
                  .map((r) => `<span style="font-family:'${r.font}'">${escapeHtml(r.text)}</span>`)
                  .join("");
                return `<p class="line">${spans}</p>`;
              })
              .join("\n") + `<p class="gap">&nbsp;</p>`
        )
        .join("\n");

      return `<div class="set${si > 0 ? " set-break" : ""}">
  <h2 class="setname">${name}</h2>
  ${headerHtml}
  ${qHtml}
</div>`;
    })
    .join("\n");

  return `<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word">
<head>
<meta charset="utf-8">
<title>MCQ Sets</title>
<style>
@page { size: A4; margin: 2cm 1.8cm; }
body { margin: 0; color: #000; }
.setname { text-align: center; font-family:'${opts.unicodeFont}'; font-size: ${opts.fontSize + 2}pt; font-weight: bold; margin: 0 0 8pt 0; }
.hdr { text-align: center; font-size: ${size}; margin: 2pt 0; }
.line { font-size: ${size}; margin: 0 0 2pt 0; }
.gap { font-size: 6pt; margin: 0; }
.set-break { page-break-before: always; }
@media print { body { -webkit-print-color-adjust: exact; } }
</style>
${forPrint ? "" : '<!-- word compatibility -->'}
</head>
<body>
${setBlocks}
</body>
</html>`;
}

/** .doc ডাউনলোড (HTML ভিত্তিক Word ফাইল, পেজ ব্রেক সহ) */
export function exportDocHtml(sets: McqQuestion[][], opts: ExportOptions): void {
  const html = buildSetsHtml(sets, opts, false);
  const blob = new Blob(["\ufeff", html], { type: "application/msword" });
  downloadBlob(blob, `MCQ-Sets-${fileNameStamp()}.doc`);
}

/** প্রিন্ট উইন্ডো খোলে — প্রতি সেট আলাদা পেজে */
export function printSets(sets: McqQuestion[][], opts: ExportOptions): void {
  const html = buildSetsHtml(sets, opts, true);
  const w = window.open("", "_blank", "width=900,height=700");
  if (!w) {
    throw new Error("প্রিন্ট উইন্ডো খোলা যায়নি — ব্রাউজারের পপআপ ব্লকার চেক করুন");
  }
  w.document.write(html);
  w.document.close();
  w.focus();
  setTimeout(() => {
    w.print();
  }, 400);
}

// ---------- ক্লিপবোর্ড ----------

/** একটি সেটের প্লেইন টেক্সট */
export function setClipboardText(
  si: number,
  questions: McqQuestion[],
  opts: ExportOptions
): string {
  return setToText(getSetName(si, opts.nameStyle), questions, getHeaderLines(opts));
}

/** সব সেট একসাথে কপি করার টেক্সট */
export function allSetsClipboardText(sets: McqQuestion[][], opts: ExportOptions): string {
  return sets
    .map((qs, si) => setClipboardText(si, qs, opts))
    .join("\n\n--------------------------------------------------\n\n");
}

export async function copyToClipboard(text: string): Promise<void> {
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(text);
  } else {
    // ফলব্যাক (পুরনো ব্রাউজার)
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
  }
}

// ---------- হেল্পার ----------

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export function fileNameStamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}
