"use client";

/**
 * Phase 3-I — COPY-ONLY extraction of shared services from src/app/page.tsx.
 *
 * - page.tsx থেকে COPY করা (কোনো line কাটা/মুছা হয়নি, page.tsx untouched — NEXT task-এ wire হবে)।
 * - এই hook এখনো page.tsx-এ wire করা হয়নি — compile+unused থাকে, runtime-এ কোনো প্রভাব নেই।
 * - NEXT task-এ page.tsx এই hook একবার call করে `shared.<field>` দিয়ে 3 mode hook-এর
 *   deps + JSX ভরবে; তখন page-এর কপি CUT হবে (single source)।
 * - page.tsx বা mode hook থেকে কিছু import করা হয়নি — শুধু lib/hooks থেকে।
 */

import { useRef, useState } from "react";
import { usePersistedJson, usePersistedString } from "@/hooks/use-persisted-state";
import { DEFAULT_FONT_REMAP_SETTINGS, FONT_CHOICES, type FontSettings } from "@/lib/mcq/font-remap";
import { docxBlobToPdfParts, type DownloadFormat } from "@/lib/mcq/pdf-export";
import { type PipelineProgress } from "@/lib/mcq/file-pipeline";
import { downloadBlob } from "@/lib/mcq/exporter";
import { toast } from "@/hooks/use-toast";

/** আউটপুট ফাইলের ফন্ট-রিম্যাপ সেটিংস — সব মোডের ডাউনলোডে এক সেটিংস (persisted) */
const FONT_SETTINGS_KEY = "mcq-font-settings";

// ---------- প্রসেস-ওভারলে (বড় ফাইলের লোড/ডাউনলোডে "hang"-চেহারা আটকায়) ----------

/** ওভারলে আপডেটের সর্বনিম্ন ব্যবধান (ms) — JSZip কলব্যাক প্রতি-চাংকে আসে,
 *  প্রতিবার setState করলে 80MB ফাইলে হাজার-হাজার রি-রেন্ডার হত */
const PROC_REPORT_MIN_MS = 120;

export interface ProcState {
  active: boolean;
  stage: string;
  /** 0..1 determinate; null = indeterminate animated pulse */
  pct: number | null;
  fileNo?: number;
  fileTotal?: number;
  name?: string;
}

export const PROC_IDLE: ProcState = { active: false, stage: "", pct: null };

/**
 * Persisted ফন্ট-সেটিংস হাইড্রেশন-গার্ড — FONT_CHOICES-এ নেই এমন ভ্যালু
 * (পুরনো সেভ/হাতে-এডিট localStorage) ড্রপ করে ওই স্লটের ডিফল্টে ফেরায়,
 * নাহলে Radix Select খালি ভ্যালু রেন্ডার করে ভেঙে পড়ে।
 */
function sanitizeFontSettings(raw: unknown): FontSettings {
  const r = (raw ?? {}) as Partial<FontSettings>;
  /** তালিকায় থাকলে ভ্যালু, নাহলে ওই স্লটের ডিফল্ট */
  const pick = (v: string | undefined, list: readonly string[], fallback: string): string =>
    typeof v === "string" && list.includes(v) ? v : fallback;
  return {
    englishFont: pick(r.englishFont, FONT_CHOICES.english, DEFAULT_FONT_REMAP_SETTINGS.englishFont),
    bijoyFont: pick(r.bijoyFont, FONT_CHOICES.bijoy, DEFAULT_FONT_REMAP_SETTINGS.bijoyFont),
    unicodeFont: pick(r.unicodeFont, FONT_CHOICES.unicode, DEFAULT_FONT_REMAP_SETTINGS.unicodeFont),
    enabled: typeof r.enabled === "boolean" ? r.enabled : DEFAULT_FONT_REMAP_SETTINGS.enabled,
  };
}
/** "Download as" ফরম্যাট-টগলের শেষ পছন্দ (DOCX ডিফল্ট — অনুপস্থিত/ভাঙা মানে DOCX) */
const DOWNLOAD_FORMAT_KEY = "mcq-download-format";
/** "Download as" ফরম্যাট-ভ্যালুর গার্ড — PDF coming-soon, তাই আপাতত শুধু docx
 * (পুরনো সেভ-এ "pdf" থাকলে ডিফল্ট docx-এ fallback হয়)। */
function isDownloadFormat(raw: string): raw is DownloadFormat {
  return raw === "docx";
}
// মাল্টি-ফাইল লিস্টের আইটেম-id (reorder/remove-এর জন্য স্টেবল কী দরকার)
// NOTE: page.tsx-এর module-level counter-এর COPY — NEXT wiring-এ এটাই single source হবে।
let multiIdCounter = 0;
const nextMultiId = () => `mf-${++multiIdCounter}-${Date.now().toString(36)}`;

/**
 * Shared services — self-contained, no params: own persisted keys, own proc state.
 * App-level (mode/flow/staging) কিছুই ছোঁয় না, তাই callback লাগেনি।
 */
export function useSharedServices() {
  // ---- আউটপুট ফাইলের ফন্ট-রিম্যাপ (persisted) — ডাউনলোডের সময় document.xml (+styles.xml)-এ প্রয়োগ হয় ----
  const [fontSettings, updateFontSettings] = usePersistedJson<FontSettings>(
    FONT_SETTINGS_KEY,
    DEFAULT_FONT_REMAP_SETTINGS,
    sanitizeFontSettings
  );

  // ---- "Download as" ফরম্যাট (persisted — DOCX ডিফল্ট) — সব মোডের সব ডাউনলোডে এক পছন্দ ----
  const [downloadFormat, updateDownloadFormat] = usePersistedString<DownloadFormat>(
    DOWNLOAD_FORMAT_KEY,
    "docx",
    isDownloadFormat
  );

  // ---- প্রসেস-ওভারলে — বড় ফাইলের লোডে "hang"-চেহারা আটকায় (সব মোডে) ----
  const [proc, setProc] = useState<ProcState>({ active: false, stage: "", pct: null });
  /** UI-থ্রেডে শ্বাস-নেওয়ার জায়গা — ওভারলে/বার রিপেইন্ট হয় */
  const yieldToUI = () => new Promise<void>((r) => setTimeout(r, 1));
  const setProcStage = (stage: string, pct: number | null, fileNo?: number, fileTotal?: number, name?: string) =>
    setProc({ active: true, stage, pct, fileNo: fileNo || undefined, fileTotal: fileTotal || undefined, name });
  const clearProc = () => {
    procReportLastRef.current = 0;
    setProc(PROC_IDLE);
  };
  /** ওভারলে-থ্রটলড রিপোর্ট — একই stage-এ 120ms-এর ভিতরে repeat setState বাদ
   *  (JSZip-এর per-chunk কলব্যাক + parse-লুপ মিলিয়ে সেকেন্ডে শত-শত কল আসে) */
  const procReportLastRef = useRef(0);
  const pipelineReport = (p: PipelineProgress) => {
    const now = Date.now();
    const done = p.pct != null && p.pct >= 1;
    if (!done && now - procReportLastRef.current < PROC_REPORT_MIN_MS) return;
    procReportLastRef.current = now;
    setProcStage(p.stage, p.pct, p.fileNo, p.fileTotal, p.name);
  };

  /** ডাউনলোড-পথের থ্রটলড রিপোর্ট — replaceDocumentXml/buildZipBlob-এর onProgress এখানেই যায় */
  const dlReportLastRef = useRef(0);
  const dlReport = (stage: string, pct: number | null, fileNo?: number, fileTotal?: number, name?: string) => {
    const now = Date.now();
    const done = pct != null && pct >= 1;
    if (!done && now - dlReportLastRef.current < PROC_REPORT_MIN_MS) return;
    dlReportLastRef.current = now;
    setProcStage(stage, pct, fileNo, fileTotal, name);
  };
  /**
   * n-ফাইল লুপের ওজন-ভাগ করা onProgress — ফাইল i (0-based)-এর 0..1 ফ্র্যাককে
   * [i/n, (i+1)/n] উইন্ডোতে ম্যাপ করে; stage-এ "File k of n" যোগ হয়।
   */
  const dlFileProgress = (
    stage: string,
    i: number,
    n: number,
    name?: string,
  ): ((frac: number) => void) | undefined => {
    if (n <= 1) return (frac) => dlReport(stage, frac, undefined, undefined, name);
    return (frac) => dlReport(stage, (i + Math.max(0, Math.min(1, frac))) / n, i + 1, n, name);
  };

  /**
   * ফরম্যাট-টগল অনুযায়ী চূড়ান্ত ডাউনলোড — DOCX হলে হুবহু আগের ব্লব+নাম
   * (বাইট-অভিন্ন আচরণ); PDF হলে docx-ব্লবটা ব্রাউজারেই PDF-এ কনভার্ট হয়ে
   * একই base নামের .pdf হিসেবে নামে (fontSettings আগেই docx-এ প্রয়োগ হয়ে যায়)।
   */
  const finalizeDownload = async (docxOut: { blob: Blob; fileName: string }) => {
    if (downloadFormat === "pdf") {
      // Phase 3 #8 — পেজ-সীমা ছাড়ালে একাধিক PDF-এ auto-split (আগে error ছিল)
      const parts = await docxBlobToPdfParts(docxOut.blob, docxOut.fileName);
      for (let i = 0; i < parts.length; i++) {
        if (i > 0) await new Promise((r) => setTimeout(r, 600)); // multi-download ব্লক এড়াতে
        downloadBlob(parts[i].blob, parts[i].name);
      }
      if (parts.length > 1) {
        toast({
          title: `Split into ${parts.length} PDF files`,
          description: `The document exceeded the 300-page per-file limit — sequential parts were downloaded (part 1 of ${parts.length} first).`,
        });
      }
    } else {
      downloadBlob(docxOut.blob, docxOut.fileName);
    }
  };

  /** ZIP-এর এন্ট্রি-লিস্ট — DOCX হলে হুবহু আগেরটা; PDF হলে প্রতিটা এন্ট্রি .pdf-এ কনভার্ট
   * (নামের base একই; বড় এন্ট্রি auto-split-এ একাধিক "-partN.pdf" হয়) — ZIP-এর
   * নিজের নাম/কনভেনশন অপরিবর্তিত থাকে */
  const finalizeZipEntries = async (entries: Array<{ name: string; blob: Blob }>) => {
    if (downloadFormat !== "pdf") return entries;
    const out: Array<{ name: string; blob: Blob }> = [];
    for (const e of entries) {
      for (const p of await docxBlobToPdfParts(e.blob, e.name)) {
        out.push({ name: p.name, blob: p.blob });
      }
    }
    return out;
  };

  return {
    fontSettings, updateFontSettings,
    downloadFormat, updateDownloadFormat,
    finalizeDownload, finalizeZipEntries,
    nextMultiId,
    yieldToUI, setProcStage, clearProc, pipelineReport, dlReport, dlFileProgress,
    proc, PROC_IDLE,
  };
}

export type SharedServices = ReturnType<typeof useSharedServices>;
