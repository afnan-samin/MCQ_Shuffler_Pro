"use client";

/**
 * Phase 3-A slice 1 — COPY-ONLY extraction of shuffle-mode logic from src/app/page.tsx.
 *
 * - page.tsx থেকে COPY করা (কোনো line কাটা/মুছা হয়নি, page.tsx untouched)।
 * - এই hook এখন page.tsx-এ wire করা (Phase 3-B) — shuffle slice-এর single source।
 * - শেয়ার্ড helper (proc-overlay, finalizeDownload, font/downloadFormat persisted,
 *   nextMultiId) page.tsx থেকে PARAM-এ আসে — hook-এর নিজের local copy sorano
 *   হয়েছে (same localStorage key-তে 2 instance stale-desync দিত)।
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import JSZip from "jszip";
import {
  autoFixNumbering,
  parseMcq,
  type ParseOutput,
  type McqQuestion,
} from "@/lib/mcq/parser";
import {
  buildSets,
  reshuffleDistinct,
  orderKey,
  shuffled,
  originalUniqueOrders,
  type Distribution,
} from "@/lib/mcq/set-engine";
import { analyzeText, type Enc, type EncodingStats } from "@/lib/mcq/encoding";
import {
  allSetsClipboardText,
  copyToClipboard,
  downloadBlob,
  buildSetsDocxBlob,
  exportDocHtml,
  printSets,
  DEFAULT_EXPORT_OPTIONS,
  type ExportOptions,
} from "@/lib/mcq/exporter";
import type { DocxParseResult } from "@/lib/mcq/docx-xml";
import {
  type BlockedLine,
  type ColorAnalysis,
} from "@/lib/mcq/color-serial";
import {
  buildMergedDocxBlob,
  buildZipBlob,
  replaceDocumentXml,
} from "@/lib/mcq/multi-docx";
import {
  buildShuffledDocxBlob,
  buildShuffledXml,
  englishSetName,
} from "@/lib/mcq/docx-exporter";
import { type DownloadFormat } from "@/lib/mcq/pdf-export";
import { analyzeRefReport, type RefMode, type RefReport } from "@/lib/mcq/reference";
import {
  FILE_TOO_BIG_MSG,
  prepareShuffleXml,
  runFilePipeline,
  type PipelineProgress,
} from "@/lib/mcq/file-pipeline";
import { MAX_FILE_BYTES, SHUFFLE_MAX_FILES } from "@/lib/mcq/limits";
import { toast } from "@/hooks/use-toast";
import { type FontSettings } from "@/lib/mcq/font-remap";
import { findDuplicateQuestions, type DuplicateGroup } from "@/lib/mcq/duplicates";

// ---------- storage key (shuffle text-autosave — hook-এর নিজের, শুধু shuffle ব্যবহার করে) ----------
const STORAGE_KEY = "mcq-shuffler-text";

export interface DocxState {
  file: File;
  baseName: string;
  /** শাফল-পাইপলাইনের xml — রঙ-ফাইলে হেডার-বিহীন (হেডার বাদ দিয়ে সব প্রশ্ন এক সিরিয়ালে) */
  xml: string;
  /** অরিজিনাল xml — সিরিয়াল মোডে হাত-অফের সময় লাগে (রঙ-ইনডেক্স অরিজিনালের সাথে মেলে) */
  originalXml: string;
  /** xml-এর সাথে সবসময় consistent — রঙ-ফাইলেও null না */
  parse: DocxParseResult | null;
  /** রঙ-স্ট্রাকচার্ড হলে বিশ্লেষণ — সিরিয়াল মোডে হাত-অফে পুনঃব্যবহৃত হয় */
  colorAn: ColorAnalysis | null;
  /** শাফলের জন্য বাদ পড়া রঙ-হেডার সংখ্যা (0 = রঙ-ফাইল না) */
  headersStripped: number;
  /** বাদ পড়া সব লাইন (রঙ-হেডার + টেক্সট-প্যাটার্নে ধরা নন-MCQ) — UI-র আলাদা লিস্টে দেখায় */
  blocked: BlockedLine[];
}

/** শাফল মোড মাল্টি-ফাইল আইটেম — প্রতিটা ফাইল আলাদাভাবে স্ট্রিপ + পার্স হয় */
export interface ShuffleItemState {
  id: string;
  file: File;
  baseName: string;
  /** হেডার/নন-MCQ বাদ দেওয়া xml */
  xml: string;
  parse: DocxParseResult;
  /** বাদ পড়া লাইন (রঙ-হেডার + নন-MCQ) */
  blocked: BlockedLine[];
}

export interface ShuffleDeps {
  fontSettings: FontSettings;
  updateFontSettings: (v: FontSettings) => void;
  downloadFormat: DownloadFormat;
  updateDownloadFormat: (v: DownloadFormat) => void;
  finalizeDownload: (docxOut: { blob: Blob; fileName: string }) => Promise<void>;
  finalizeZipEntries: (
    entries: Array<{ name: string; blob: Blob }>
  ) => Promise<Array<{ name: string; blob: Blob }>>;
  nextMultiId: () => string;
  yieldToUI: () => Promise<void>;
  setProcStage: (stage: string, pct: number | null, fileNo?: number, fileTotal?: number, name?: string) => void;
  clearProc: () => void;
  pipelineReport: (p: PipelineProgress) => void;
  dlReport: (stage: string, pct: number | null, fileNo?: number, fileTotal?: number, name?: string) => void;
  dlFileProgress: (
    stage: string,
    i: number,
    n: number,
    name?: string
  ) => ((frac: number) => void) | undefined;
  loadersBusyRef: { current: boolean };
  /** paste/.txt ফ্লো-তে প্রশ্ন পেলে caller-এর mode/flow সেট করে (behavior parity — page.tsx-এর setMode+setFlowStep) */
  onParsed?: () => void;
}

/**
 * Shuffle-mode state + handlers — page.tsx-এর shuffle slice এখন এখানেই single source।
 * Shared helper (proc/finalize/persisted/counter) page.tsx থেকে param-এ আসে — কোনো duplicate নেই।
 */
export function useShuffleMode(deps: ShuffleDeps) {
  const {
    fontSettings,
    updateFontSettings,
    downloadFormat,
    updateDownloadFormat,
    finalizeDownload,
    finalizeZipEntries,
    nextMultiId,
    yieldToUI,
    setProcStage,
    clearProc,
    pipelineReport,
    dlReport,
    dlFileProgress,
    loadersBusyRef,
    onParsed,
  } = deps;
  // ---- ইনপুট (text mode) ----
  const [rawText, setRawText] = useState("");
  const [hydrated, setHydrated] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const [parsed, setParsed] = useState<ParseOutput | null>(null);

  // ---- ইনপুট (docx mode — XML হুবহু প্রিজার্ভ) ----
  const [docx, setDocx] = useState<DocxState | null>(null);
  const [docxLoading, setDocxLoading] = useState(false);

  // ---- সিলেকশন ----
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [allowBroken, setAllowBroken] = useState(false);
  const [fixing, setFixing] = useState(false);

  // ---- শাফল কনফিগ ----
  const [setCount, setSetCount] = useState(4);
  const [distribution, setDistribution] = useState<Distribution>("original");
  const [shuffleWithin, setShuffleWithin] = useState(true);
  const [shuffling, setShuffling] = useState(false);
  // রেফারেন্স-ট্যাগ ([CU-A: 22-23] স্টাইল) কী করা হবে — ডিফল্ট রাখা
  const [refMode, setRefMode] = useState<RefMode>("keep");

  // ---- আউটপুট ফাইলের ফন্ট-রিম্যাপ / "Download as" ফরম্যাট — shared persisted (page.tsx থেকে param) ----

  // ---- রেজাল্ট ----
  const [sets, setSets] = useState<McqQuestion[][] | null>(null);
  const [setsDocx, setSetsDocx] = useState<number[][] | null>(null);
  // শাফল মোডে সিরিয়াল বদলের দরকার নেই (সিরিয়ালের আলাদা মোড আছেই) —
  // ডিফল্ট OFF: ডাউনলোডে প্রশ্নের আসল নম্বরই থাকে; চাইলে টগল ON করে ১,২,৩…
  // (আগে কোডে useState(true) ছিল — কমেন্টের সাথে উল্টো, তাই Sets-separately
  //  ডাউনলোড ডিফল্টেই ১,২,৩… হয়ে যেত। এখন কমেন্ট ও আচরণ দুটোই OFF।)
  const [renumber, setRenumber] = useState(false);
  const [sortedFlags, setSortedFlags] = useState<boolean[]>([]);
  const [exportOpts, setExportOpts] = useState<ExportOptions>(DEFAULT_EXPORT_OPTIONS);
  const [busy, setBusy] = useState<string | null>(null);
  const [copiedSet, setCopiedSet] = useState<number | null>(null);

  // ---- শাফল মোড মাল্টি-ফাইল (একসাথে একাধিক .docx) ----
  const [shuffleItems, setShuffleItems] = useState<ShuffleItemState[] | null>(null);
  const [shuffleLoading, setShuffleLoading] = useState(false);
  const [shuffleMultiSets, setShuffleMultiSets] = useState<number[][][] | null>(null);
  const [multiShuffling, setMultiShuffling] = useState(false);
  const [multiMergedBusy, setMultiMergedBusy] = useState(false);
  const [multiZipBusy, setMultiZipBusy] = useState(false);
  /** কোন ফাইলের sets-separately ডাউনলোড চলছে (per-file spinner) */
  const [setsFileBusy, setSetsFileBusy] = useState<string | null>(null);
  /** সব ফাইলের সেট এক মাস্টার-ZIP-এ (nested: per-file ZIP + একক-সেট .docx) */
  const [multiSetsZipBusy, setMultiSetsZipBusy] = useState(false);
  /**
   * মাল্টি-শাফলে প্রতি ফাইলের serial-replace (ডিফল্ট ON — ১, ২, ৩…)।
   * সিঙ্গেল-ফাইলের গ্লোবাল টগল থেকে আলাদা — expand করা section-এ নিজের টগল।
   */
  const [multiRenumber, setMultiRenumber] = useState<Record<string, boolean>>({});
  const fileRenumber = (id: string): boolean => multiRenumber[id] ?? true;
  const toggleFileRenumber = (id: string, v: boolean) =>
    setMultiRenumber((prev) => ({ ...prev, [id]: v }));

  const resultsRef = useRef<HTMLDivElement>(null);

  // ---- প্রসেস-ওভারলে / ডাউনলোড-প্রগতি / finalize — shared (page.tsx থেকে param-এ আসে) ----

  // প্রথম লোডে সেভ করা টেক্সট রিস্টোর
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) setRawText(saved);
    } catch { // কোটা/প্রাইভেসি-মোড — নীরবে উপেক্ষা
    }
    setHydrated(true);
  }, []);

  // টেক্সট অটো-সেভ (ডিবাউন্স)
  useEffect(() => {
    if (!hydrated) return;
    const t = setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, rawText);
      } catch { // কোটা/প্রাইভেসি-মোড — নীরবে উপেক্ষা
      }
    }, 600);
    return () => clearTimeout(t);
  }, [rawText, hydrated]);

  // হেডার অটো-প্রি-ফিল (text mode-এ প্রথমবার ডিটেক্টে)
  useEffect(() => {
    if (parsed && exportOpts.headerText === "" && parsed.preamble.length) {
      setExportOpts((o) => ({ ...o, headerText: parsed.preamble.join("\n") }));
    }
  }, [parsed]); // eslint-disable-line react-hooks/exhaustive-deps

  const resetResults = () => {
    setSets(null);
    setSetsDocx(null);
    setSortedFlags([]);
  };

  // ---- রেফারেন্স-ট্যাগ রিপোর্ট (শাফল মোডের ডাউনলোড-কার্ডে সেকশন) ----
  // সিঙ্গেল docx ফ্লো: সিলেক্ট করা প্রশ্নগুলোতেই দেখায়; মাল্টি ফ্লো: সব প্রশ্ন
  const docxRefReport = useMemo<RefReport | null>(() => {
    if (!docx?.parse) return null;
    const pool = docx.parse.questions.filter((q) => selected.has(q.id));
    return analyzeRefReport(pool);
  }, [docx, selected]);
  const multiRefReport = useMemo<RefReport | null>(() => {
    if (!shuffleItems?.length) return null;
    return analyzeRefReport(shuffleItems.flatMap((it) => it.parse.questions));
  }, [shuffleItems]);
  // ডুপ্লিকেট-প্রশ্ন ডিটেকশন (Phase 3 #9) — মাল্টি-ফাইল merge-এর আগে flag
  const shuffleDuplicates = useMemo<DuplicateGroup[]>(
    () =>
      shuffleItems?.length
        ? findDuplicateQuestions(
            shuffleItems.map((it) => ({ fileId: it.id, fileName: it.file.name, questions: it.parse.questions }))
          )
        : [],
    [shuffleItems]
  );

  // প্রতি মোডের ফাইল-সংখ্যা — shuffle slice শুধু নিজেরটা
  const shuffleFileCount = shuffleItems ? shuffleItems.length : docx ? 1 : 0;

  // ================== TEXT MODE ==================

  const handleTextChange = (t: string) => {
    setRawText(t);
    setDocx(null);
    setShuffleItems(null);
    setShuffleMultiSets(null);
    if (parsed) {
      setParsed(null);
      setSelected(new Set());
      resetResults();
    }
  };

  const runTextParse = (source: string) => {
    const result = parseMcq(source);
    setParsed(result);
    setSelected(new Set(result.questions.map((q) => q.id)));
    setAllowBroken(false);
    // পেস্ট/.txt ফ্লো — প্রশ্ন পেলেই সরাসরি শাফল-মোডের কাজের ভিউতে (মোড-বাছাই লাগে না):
    // setMode("shuffle") + setFlowStep("work") app-level বলে caller-এ চলে (onParsed) — behavior parity।
    if (result.questions.length > 0) {
      onParsed?.();
    }
    announceDetect(result);
  };

  const loadAndDetect = (t: string) => {
    setRawText(t);
    setDocx(null);
    setShuffleItems(null);
    setShuffleMultiSets(null);
    resetResults();
    if (!t.trim()) {
      setParsed(null);
      setSelected(new Set());
      return;
    }
    setDetecting(true);
    try {
      runTextParse(t);
    } finally {
      setDetecting(false);
    }
  };

  const handleDetect = () => {
    if (!rawText.trim()) return;
    setDetecting(true);
    setDocx(null);
    resetResults();
    try {
      runTextParse(rawText);
    } finally {
      setDetecting(false);
    }
  };

  const handleAutoFix = () => {
    if (!rawText.trim()) return;
    setFixing(true);
    try {
      const fixed = autoFixNumbering(rawText, 1);
      setRawText(fixed);
      const result = parseMcq(fixed);
      setParsed(result);
      setSelected(new Set(result.questions.map((q) => q.id)));
      setAllowBroken(false);
      toast({
        title: "Serial fixed",
        description: `Renumbered ${result.questions.length} question(s) starting from 1.`,
      });
    } finally {
      setFixing(false);
    }
  };

  const toggleQuestion = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const announceDetect = (result: ParseOutput) => {
    if (result.questions.length === 0) {
      toast({
        title: "No questions found",
        description: "Check that questions start with a number (e.g. 1. or ১.),",
      });
    } else if (result.serial?.status === "ok") {
      toast({
        title: `${result.questions.length} question(s) detected`,
        description: "Serial is correct — the shuffle button is enabled now!",
      });
    } else if (result.serial) {
      toast({
        title: `${result.questions.length} question(s) found, but the serial has problems`,
        description: '"Fix numbering automatically" fixes it in one click.',
      });
    }
  };

  // ================== DOCX MODE (XML হুবহু প্রিজার্ভ) ==================

  const handleDocxFile = useCallback(async (f: File) => {
    // বিশাল ফাইল আগেই ফেলে দিই — ব্রাউজার ফ্রিজ/ক্র্যাশের আগে
    if (f.size > MAX_FILE_BYTES) {
      toast({ title: FILE_TOO_BIG_MSG, variant: "destructive" });
      return;
    }
    setDocxLoading(true);
    setShuffleItems(null);
    setShuffleMultiSets(null);
    try {
      // শেয়ার্ড পাইপলাইন: পড়া (loadDocxXml) → রঙ-বিশ্লেষণ + হেডার/নন-MCQ স্ট্রিপ + পার্স
      // (ইউজারের নিয়ম: শাফল মোডে হেডার থাকলে হেডার বাদ দিয়ে সবগুলো প্রশ্ন এক সিরিয়ালে শাফল)
      const run = await runFilePipeline([f], {
        report: pipelineReport,
        yieldToUI,
        parse: (xml) => prepareShuffleXml(xml),
      });
      const item = run.items[0];
      if (!item) {
        toast({
          title: "Could not read the file",
          description: String(run.failures[0]?.message ?? ""),
          variant: "destructive",
        });
        return;
      }
      const v = item.value;
      const patternStripped = v.blocked.length - v.headersStripped;

      setDocx({
        file: f,
        baseName: item.baseName,
        xml: v.xml,
        originalXml: item.xml,
        parse: v.parse,
        colorAn: v.colorAn,
        headersStripped: v.headersStripped,
        blocked: v.blocked,
      });
      setParsed(null);
      resetResults();
      setSelected(new Set(v.parse.questions.map((q) => q.id)));
      setAllowBroken(false);

      if (v.colorAn) {
        toast({
          title: `Detected ${v.parse.questions.length} question(s) as one serial — stripped ${v.headersStripped} color header(s)${patternStripped ? `+ ${patternStripped} non-MCQ line(s)`: ""}`,
          description: "Headers/non-MCQ lines won't be shuffled — the full stripped-line list is below.",
        });
      } else if (v.parse.questions.length === 0) {
        toast({
          title: "No questions found",
          description: "Check that questions start with a serial (e.g. 32. / ১. / 1.),",
          variant: "destructive",
        });
        return;
      } else {
        const serialMsg =
          v.parse.serial?.status === "ok"
            ? "Serial is correct — ready to shuffle!"
            : `${v.parse.serial?.issues.length ?? 0} serial problem(s) — turning serial replace ON during the shuffle fixes them.`;

        toast({
          title: `${v.parse.questions.length} question(s) detected${patternStripped ? `(${patternStripped} non-MCQ line(s) stripped)`: ""}`,
          description: patternStripped
            ? `${patternStripped} header/title line(s) aren't MCQs — excluded from the shuffle (list below). ${serialMsg}`
            : `${serialMsg}${v.parse.unicodeQuestionIds.length ? `${v.parse.unicodeQuestionIds.length} question(s) contain Unicode (kept as-is in the download).`: ""}`,
        });
      }

      if (item.xml.length > 8_000_000) {
        toast({
          title: "Very large file",
          description: "This file is big — shuffling and downloading may take a while; don't close the tab.",
        });
      }
    } catch (e) {
      toast({
        title: "Could not read the file",
        description: String(e instanceof Error ? e.message : e),
        variant: "destructive",
      });
    } finally {
      clearProc();
      setDocxLoading(false);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleSerialByClick = (v: boolean) => setRenumber(v);

  const handleDocxShuffle = () => {
    if (!docx?.parse || !canShuffle) return;
    setShuffling(true);
    try {
      const pool = docx.parse.questions.filter((q) => selected.has(q.id));
      const isOriginal = distribution === "original";
      // Bug #3 warning: ছোট পুলে সম্ভাব্য distinct-ক্রম সীমিত — সেট-সংখ্যা সীমা
      // ছাড়ালে duplicate সেট অনিবার্য; নীরবে না রেখে আগেই জানাই।
      const uniqueOrders = isOriginal ? originalUniqueOrders(pool.length) : null;
      if (uniqueOrders !== null && setCount > uniqueOrders - 1) {
        toast({
          variant: "destructive",
          title: "Not enough unique orders for this many sets",
          description: `${pool.length} question${pool.length === 1 ? "" : "s"} allow only ${uniqueOrders - 1} distinct order${uniqueOrders - 1 === 1 ? "" : "s"} — some sets will repeat an order. Use more questions or fewer sets.`,
        });
      }
      const result = buildSets(pool, {
        setCount,
        distribution,
        shuffleWithin: isOriginal ? true : shuffleWithin,
      });
      setSetsDocx(result.map((arr) => arr.map((q) => q.id)));
      setTimeout(() => {
        resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 80);
      toast({
        title: isOriginal
          ? `${setCount} set(s) built — all ${pool.length} question(s) in each!`
          : `${setCount} set(s) built!`,
        description: isOriginal
          ? "Each set's serial order is distinct — no two sets share an order."
          : "You can download the Word file now — one set per page.",
      });
    } finally {
      setShuffling(false);
    }
  };

  const handleDocxDownload = async (doRenumber: boolean) => {
    if (!docx?.parse || !setsDocx) return;
    setBusy(doRenumber ? "docx-r" : "docx-o");
    clearProc();
    setProcStage("Building shuffled file...", 0);
    await yieldToUI();
    try {
      await finalizeDownload(
        await buildShuffledDocxBlob({
          originalFile: docx.file,
          xml: docx.xml,
          questions: docx.parse.questions,
          sets: setsDocx,
          baseName: docx.baseName,
          suffix: doRenumber ? " (shuffled, renumbered)" : " (shuffled, original serial)",
          opts: { renumber: doRenumber, includeSetHeader: true, refMode },
          fontSettings,
          onProgress: dlFileProgress("Building shuffled file...", 0, 1, docx.baseName),
        })
      );
      toast({
        title: downloadFormat === "pdf" ? "PDF file downloaded" : "Word file downloaded",
        description: doRenumber
          ? "One set per page, serials 1,2,3…. Formatting exactly intact."
          : "One set per page, with the questions' original numbers. Formatting exactly intact.",
      });
    } catch (e) {
      toast({ title: "Download failed", description: String(e), variant: "destructive" });
    } finally {
      clearProc();
      setBusy(null);
    }
  };

  /**
   * Set-by-set ডাউনলোড — প্রতি সেট আলাদা .docx: ১টা সেট হলে সরাসরি
   * ডাউনলোড, বেশি হলে এক ZIP-এ (ZIP-এর ভিতরে "Set A.docx" স্টাইল নাম)।
   * Serial-replace টগলের বর্তমান অবস্থা + ফরম্যাট-টগল (DOCX/PDF) মেনে চলে।
   */
  const handleDocxDownloadSets = async () => {
    if (!docx?.parse || !setsDocx?.length) return;
    setBusy("docx-sets");
    clearProc();
    setProcStage("Building set files...", 0);
    await yieldToUI();
    try {
      const files: Array<{ name: string; blob: Blob }> = [];
      for (let si = 0; si < setsDocx.length; si++) {
        const out = await buildShuffledDocxBlob({
          originalFile: docx.file,
          xml: docx.xml,
          questions: docx.parse.questions,
          sets: [setsDocx[si]],
          baseName: docx.baseName,
          suffix: ` (${englishSetName(si)}${renumber ? "" : ", original serial"})`,
          opts: { renumber, includeSetHeader: true, refMode },
          fontSettings,
          onProgress: dlFileProgress("Building set files...", si, setsDocx.length, docx.baseName),
        });
        files.push({ name: out.fileName, blob: out.blob });
      }
      if (files.length === 1) {
        await finalizeDownload({ blob: files[0].blob, fileName: files[0].name });
        toast({
          title: downloadFormat === "pdf" ? "PDF file downloaded" : "Word file downloaded",
          description: "The single set as its own file — formatting exactly intact.",
        });
      } else {
        const zip = await buildZipBlob(await finalizeZipEntries(files), dlFileProgress("Compressing ZIP...", 0, 1));
        downloadBlob(zip, `${docx.baseName} (sets).zip`);
        toast({
          title: "ZIP downloaded",
          description: `${files.length} separate set file(s) inside — one file per set.`,
        });
      }
    } catch (e) {
      toast({ title: "Download failed", description: String(e), variant: "destructive" });
    } finally {
      clearProc();
      setBusy(null);
    }
  };

  const handleDocxCopySet = async (si: number) => {
    if (!docx?.parse || !setsDocx) return;
    try {
      const byId = new Map(docx.parse.questions.map((q) => [q.id, q]));
      const lines: string[] = [englishSetName(si), ""];
      for (const id of setsDocx[si]) {
        const q = byId.get(id);
        if (q) lines.push(q.text.replace(/\t/g, "    "), "");
      }
      await copyToClipboard(lines.join("\n").trimEnd());
      setCopiedSet(si);
      setTimeout(() => setCopiedSet(null), 1800);
    } catch (e) {
      toast({ title: "Copy failed", description: String(e), variant: "destructive" });
    }
  };

  // ================== SHARED (shuffle slice-এর অংশ) ==================

  // শব্দ-ধরে এনকোডিং ডিটেক্টর (ডিটেক্ট হলেই চলে)
  const encData = useMemo(() => {
    if (docx?.parse) {
      const s = analyzeText(docx.parse.fullText);
      return { stats: s, dominant: s.dominant };
    }
    if (parsed) {
      const s = analyzeText(rawText);
      return { stats: s, dominant: s.dominant };
    }
    return { stats: null as EncodingStats | null, dominant: null as Enc | null };
  }, [docx, parsed, rawText]);

  const selectAll = () => {
    const questions = docx?.parse ? docx.parse.questions : parsed?.questions ?? [];
    setSelected(new Set(questions.map((q) => q.id)));
  };

  const selectNone = () => setSelected(new Set());

  const selectRange = (fromPos: number, toPos: number) => {
    const questions = docx?.parse ? docx.parse.questions : parsed?.questions ?? [];
    const next = new Set<number>();
    for (let i = fromPos; i <= toPos && i < questions.length; i++) next.add(questions[i].id);
    setSelected(next);
  };

  // ---- শাফল গেট ----
  const activeSerial = docx?.parse ? docx.parse.serial : parsed?.serial ?? null;
  const activeCount = docx?.parse ? docx.parse.questions.length : parsed?.questions.length ?? 0;
  const serialOk = activeSerial?.status === "ok";

  // ---- মাল্টি-শাফল গেট (≥২ ফাইল) ----
  const shuffleMultiTotal = shuffleItems?.reduce((a, i) => a + i.parse.questions.length, 0) ?? 0;
  const shuffleMultiZero = shuffleItems?.filter((i) => i.parse.questions.length === 0).length ?? 0;
  /** ফাইলগুলোর মধ্যে সর্বনিম্ন প্রশ্নসংখ্যা — buildSets প্রতি ফাইলের সেট-সংখ্যা এতে ক্ল্যাম্প করে */
  const multiMinQuestions = useMemo(
    () => (shuffleItems?.length ? Math.min(...shuffleItems.map((i) => i.parse.questions.length)) : 0),
    [shuffleItems]
  );
  /** ইউজারকে যে সেট-সংখ্যা দেখাবো — original বাদে buildSets-এর ক্ল্যাম্প হুবহু */
  const multiEffectiveSets =
    distribution === "original" ? setCount : Math.min(setCount, Math.max(1, multiMinQuestions));
  const multiGateReason = useMemo(() => {
    if (!shuffleItems || shuffleItems.length === 0) return "Upload files first";
    if (shuffleMultiTotal < 2) return "The files need at least 2 questions in total";
    if (shuffleMultiZero > 0)
      return `${shuffleMultiZero} file(s) have no questions — remove them from the list`;
    // সেট-সংখ্যা প্রতি ফাইলের প্রশ্নসংখ্যায় ক্ল্যাম্প হয় — আগেই জানিয়ে দিই (original-এ ক্ল্যাম্প নেই)
    if (distribution !== "original" && setCount > multiMinQuestions)
      return `The smallest file has ${multiMinQuestions} questions — max ${multiMinQuestions} set(s)`;
    return null;
  }, [shuffleItems, shuffleMultiTotal, shuffleMultiZero, distribution, setCount, multiMinQuestions]);

  const gateReason = useMemo(() => {
    if (!docx && !parsed) return "Detect questions first";
    if (activeCount === 0) return "No questions found";
    // docx মোডে সিরিয়াল gate নেই — serial replace ON থাকলে পজিশন-ভিত্তিক নম্বরেই সব ঠিক হয়ে যায়
    if (!docx && !serialOk && !allowBroken) return 'Serial is broken — fix numbering automatically or enable "Run as-is"';
    if (selected.size === 0) return "Select at least one question";
    if (selected.size < 2) return "Select at least 2 questions";
    return null;
  }, [docx, parsed, activeCount, serialOk, allowBroken, selected.size]);

  const canShuffle = gateReason === null;

  // ---- TEXT mode শাফল ----
  const handleTextShuffle = () => {
    if (!parsed || !canShuffle) return;
    setShuffling(true);
    try {
      const pool = parsed.questions.filter((q) => selected.has(q.id));
      const isOriginal = distribution === "original";
      // Bug #3 warning — docx handler-এর মতই (ছোট পুলে duplicate সেট অনিবার্য)
      const uniqueOrders = isOriginal ? originalUniqueOrders(pool.length) : null;
      if (uniqueOrders !== null && setCount > uniqueOrders - 1) {
        toast({
          variant: "destructive",
          title: "Not enough unique orders for this many sets",
          description: `${pool.length} question${pool.length === 1 ? "" : "s"} allow only ${uniqueOrders - 1} distinct order${uniqueOrders - 1 === 1 ? "" : "s"} — some sets will repeat an order. Use more questions or fewer sets.`,
        });
      }
      const result = buildSets(pool, {
        setCount,
        distribution,
        shuffleWithin: isOriginal ? true : shuffleWithin,
      });
      setSets(result);
      setSortedFlags(result.map(() => false));
      setTimeout(() => {
        resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 80);
      toast({
        title: isOriginal
          ? `${setCount} set(s) built — all ${pool.length} question(s) in each!`
          : `${setCount} set(s) built!`,
        description: isOriginal
          ? "Each set's serial order is distinct — no two sets share an order."
          : `${pool.length} question(s) split. You can download the Word file now.`,
      });
    } finally {
      setShuffling(false);
    }
  };

  const handleShuffle = () => {
    if (shuffleItems) handleMultiShuffle();
    else if (docx) handleDocxShuffle();
    else handleTextShuffle();
  };

  // ================== SHUFFLE MODE — মাল্টি-ফাইল ==================

  /**
   * শাফল মোডে ফাইল লোড — append=false: আগেরটা বদলে নতুনগুলো; append=true: আগের ফাইলের সাথে যোগ।
   * সীমা: একসাথে সর্বোচ্চ ৫০ টি ফাইল (min ১) — বেশি দিলে প্রথম ৫০ টি নেওয়া হয়।
   * পড়া/ভ্যালিডেশন/স্ট্রিপ-পার্স শেয়ার্ড runFilePipeline + prepareShuffleXml-এ (সিঙ্গেল-ডক পথের হুবহু কোড)।
   */
  const handleShuffleFiles = async (files: File[], append = false) => {
    if (!files.length) return;
    // রি-এন্ট্রান্সি গার্ড — চলমান লোড থাকলে ওভারল্যাপ কল নীরবে বাদ (state নয়, ref → stale closure নেই)
    if (loadersBusyRef.current) return;
    loadersBusyRef.current = true;
    try {
      const existingCount = shuffleItems ? shuffleItems.length : docx ? 1 : 0;
      let list = files;
      if (existingCount + files.length > SHUFFLE_MAX_FILES) {
        const take = Math.max(0, SHUFFLE_MAX_FILES - (append ? existingCount : 0));
        list = files.slice(0, take);
        toast({
          title: `Shuffle mode: max ${SHUFFLE_MAX_FILES} files`,
          description: take > 0
            ? `Between 1 and ${SHUFFLE_MAX_FILES} files at a time — took the first ${take}, dropped the rest.`
            : `Already ${SHUFFLE_MAX_FILES} files — remove some from the list to add new ones.`,
          variant: "destructive",
        });
      }
      if (!list.length) return;

      // append — আগের একক docx থাকলে items-এ রূপ দিয়ে নতুনগুলো পিছে যোগ
      const canAppend = !!(shuffleItems?.length || (docx && docx.parse));
      const isAppend = append && canAppend;
      if (!isAppend && list.length === 1) {
        setShuffleItems(null);
        setShuffleMultiSets(null);
        // await — গার্ড (loadersBusyRef) handleDocxFile শেষ না হওয়া পর্যন্ত ধরে রাখে;
        // আন-অওয়েটেড থাকলে গার্ড আগেই মুক্ত হয়ে প্যারালাল লোডের রেস হত
        await handleDocxFile(list[0]);
        return;
      }
      setShuffleLoading(true);
      const run = await runFilePipeline(list, {
        report: pipelineReport,
        yieldToUI,
        parse: (xml) => prepareShuffleXml(xml),
      });
      // সাইজ-গার্ডের টোস্ট পাইপলাইন-রিপোর্ট থেকে — ডাবল-টোস্ট এড়াতে এরর-লিস্টে নেই
      for (const f of run.tooBig) toast({ title: FILE_TOO_BIG_MSG, variant: "destructive" });
      // এক্সটেনশন-গার্ডে বাদ পড়া ফাইলের ফিডব্যাক — আগে নীরবে বাদ যেত
      if (run.notDocx.length) {
        toast({ title: `${run.notDocx.length} file(s) skipped — only .docx is supported`, variant: "destructive" });
      }
      const loaded: ShuffleItemState[] = run.items.map((it) => ({
        id: nextMultiId(),
        file: it.file,
        baseName: it.baseName,
        xml: it.xml,
        parse: it.value.parse,
        blocked: it.value.blocked,
      }));
      const errors = run.failures.map((x) => `${x.name}: ${x.message}`);

      const items = isAppend
        ? [
            ...(shuffleItems?.length
              ? [...shuffleItems]
              : docx && docx.parse
                ? [{ id: nextMultiId(), file: docx.file, baseName: docx.baseName, xml: docx.xml, parse: docx.parse, blocked: docx.blocked }]
                : []),
            ...loaded,
          ]
        : loaded;
      setShuffleItems(items.length ? items : null);
      setShuffleMultiSets(null);
      setDocx(null);
      setParsed(null);
      resetResults();
      setSelected(new Set());
      setShuffleLoading(false);
      if (isAppend) {
        if (loaded.length) {
          toast({
            title: `${loaded.length} file(s) added — ${items.length} in total`,
            description: "Reorder from the list — merge/ZIP keeps exactly this order.",
          });
        }
      } else if (items.length) {
        const totalQuestions = items.reduce((a, i) => a + i.parse.questions.length, 0);
        const zeroQ = items.filter((i) => i.parse.questions.length === 0).length;
        toast({
          title: `${items.length} file(s) loaded — ${totalQuestions} question(s) in total`,
          description: zeroQ
            ? `${zeroQ} file(s) have no questions — remove them from the list. Drag to reorder.`
            : "Reorder from the list — the shuffle config below shuffles all files together.",
        });
      }
      if (errors.length) {
        toast({ title: "Some files could not be read", description: errors.join("\n"), variant: "destructive" });
      }
    } finally {
      loadersBusyRef.current = false;
      clearProc();
    }
  };

  const reorderShuffleItems = (from: number, to: number) => {
    setShuffleItems((prev) => {
      if (!prev) return prev;
      const next = prev.slice();
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
    // ক্রম বদলালে আগের শাফল-ফল বাতিল
    setShuffleMultiSets(null);
  };

  const removeShuffleItem = (id: string) => {
    setShuffleItems((prev) => (prev ? prev.filter((i) => i.id !== id) : prev));
    setShuffleMultiSets(null);
  };

  /** সব ফাইল একসাথে শাফল — প্রতিটা ফাইলের প্রশ্ন নিজের ভিতরেই থাকে, সেটগুলো আলাদা পেজে */
  const handleMultiShuffle = () => {
    if (!shuffleItems || shuffleItems.length === 0) return;
    setMultiShuffling(true);
    try {
      const isOriginal = distribution === "original";
      const all = shuffleItems.map((it) =>
        buildSets(it.parse.questions, {
          setCount,
          distribution,
          shuffleWithin: isOriginal ? true : shuffleWithin,
        }).map((s) => s.map((q) => q.id))
      );
      setShuffleMultiSets(all);
      setTimeout(() => {
        resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 80);
      toast({
        title: `${shuffleItems.length} file(s) shuffled — ${multiEffectiveSets} set(s) per file!`,
        description: "Merge (.docx) or ZIP below — both ways available.",
      });
    } finally {
      setMultiShuffling(false);
    }
  };

  /** সব ফাইলের শাফল্ড আউটপুট এক .docx-এ — ফাইলের মাঝে পেজ ব্রেক */
  const handleMultiMergedDownload = async () => {
    if (!shuffleItems || !shuffleMultiSets) return;
    setMultiMergedBusy(true);
    clearProc();
    setProcStage("Building shuffled files...", 0);
    await yieldToUI();
    try {
      const items: Array<{ xml: string; file: Blob }> = [];
      const active = shuffleItems.filter((it) => it.parse.questions.length > 0);
      for (let i = 0; i < shuffleItems.length; i++) {
        const it = shuffleItems[i];
        if (it.parse.questions.length === 0) continue;
        const xml = buildShuffledXml(it.xml, it.parse.questions, shuffleMultiSets[i] ?? [], {
          renumber: fileRenumber(it.id),
          includeSetHeader: true,
          refMode,
        });
        const prog = dlFileProgress("Building shuffled files...", items.length, active.length + 1, it.file.name);
        items.push({ xml, file: await replaceDocumentXml(it.file, xml, undefined, prog) });
      }
      if (items.length < 2) throw new Error("Not enough files to merge");
      const merged = await buildMergedDocxBlob(items, fontSettings, dlFileProgress("Merging files...", active.length, active.length + 1));
      await finalizeDownload({ blob: merged, fileName: `${shuffleItems[0].baseName} (merged shuffled).docx`});
      toast({
        title:
          downloadFormat === "pdf" ? "Merged PDF file downloaded" : "Merged Word file downloaded",
        description: "All files' sets in order — page breaks between files, formatting exactly intact.",
      });
    } catch (e) {
      toast({ title: "Merging failed", description: String(e), variant: "destructive" });
    } finally {
      clearProc();
      setMultiMergedBusy(false);
    }
  };

  /** প্রতিটা ফাইলের শাফল্ড .docx এক ZIP-এ — একটা ফাইল আটকালেও বাকিগুলো যায় (partial ZIP + তালিকা) */
  const handleMultiZipDownload = async () => {
    if (!shuffleItems || !shuffleMultiSets) return;
    setMultiZipBusy(true);
    clearProc();
    setProcStage("Building shuffled files...", 0);
    await yieldToUI();
    try {
      const out: Array<{ name: string; blob: Blob }> = [];
      const failed: string[] = [];
      const active = shuffleItems.filter((it) => it.parse.questions.length > 0);
      for (let i = 0; i < shuffleItems.length; i++) {
        const it = shuffleItems[i];
        if (it.parse.questions.length === 0) continue;
        try {
          const xml = buildShuffledXml(it.xml, it.parse.questions, shuffleMultiSets[i] ?? [], {
            renumber: fileRenumber(it.id),
            includeSetHeader: true,
            refMode,
          });
          const srcZip = await loadSourceZip(it.file, it.file.name);
          out.push({ name: `${it.baseName} (shuffled).docx`, blob: await replaceDocumentXml(srcZip, xml, fontSettings, dlFileProgress("Building shuffled files...", out.length, active.length + 1, it.file.name)) });
        } catch (e) {
          failed.push(`${it.file.name}: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
      if (!out.length) throw new Error(failed.join("; ") || "No files to download");
      const zip = await buildZipBlob(await finalizeZipEntries(out), dlFileProgress("Compressing ZIP...", active.length, active.length + 1));
      downloadBlob(zip, "MCQ-shuffled-files.zip");
      toast({
        title: failed.length ? "ZIP downloaded with skips" : "ZIP downloaded",
        description: failed.length
          ? `${out.length} file(s) inside. Skipped ${failed.length}: ${failed.join("; ")}`
          : `${out.length} separate shuffled file(s) inside.`,
        variant: failed.length ? "destructive" : undefined,
      });
    } catch (e) {
      toast({ title: "ZIP failed", description: String(e), variant: "destructive" });
    } finally {
      clearProc();
      setMultiZipBusy(false);
    }
  };

  /**
   * একটা ফাইলের প্রতিটা সেট আলাদা .docx-ব্লবে — per-file ZIP-এর বিল্ডিং-ব্লক।
   * Serial-replace টগল + ফরম্যাট-টগল (DOCX/PDF) মেনে চলে; ফন্ট-সেটিংসও
   * প্রয়োগ হয় (ডিফল্ট OFF = বাইট-অভিন্ন আচরণ)।
   * সোর্স-ফাইল একবারই পড়া হয় (১০ ফাইল × ৪ সেটে ৪০-বার রিড নয়) + transient
   * লক-এ ১ বার রিট্রাই — বড় ব্যাচে NotReadableError-শ্রেণির ব্যর্থতা কমে।
   */
  const loadSourceZip = async (file: File, tag: string): Promise<JSZip> => {
    let lastErr: unknown = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        return await JSZip.loadAsync(file);
      } catch (e) {
        lastErr = e;
        await new Promise((r) => setTimeout(r, 500));
      }
    }
    throw new Error(`${tag}: ${lastErr instanceof Error ? lastErr.message : String(lastErr)}`);
  };

  const buildFileSetFiles = async (
    it: ShuffleItemState,
    setIds: number[][],
    doRenumber: boolean
  ): Promise<Array<{ name: string; blob: Blob }>> => {
    const srcZip = await loadSourceZip(it.file, it.file.name);
    const files: Array<{ name: string; blob: Blob }> = [];
    for (let si = 0; si < setIds.length; si++) {
      const xml = buildShuffledXml(it.xml, it.parse.questions, [setIds[si] ?? []], {
        renumber: doRenumber,
        includeSetHeader: true,
        refMode,
      });
      const out = await replaceDocumentXml(srcZip, xml, fontSettings);
      files.push({
        name: `${it.baseName} (${englishSetName(si)}${doRenumber ? "" : ", original serial"}).docx`,
        blob: out,
      });
    }
    return finalizeZipEntries(files);
  };

  /** এক ফাইলের sets-separately ডাউনলোড — ১ সেট হলে সরাসরি, বেশি হলে ওই ফাইলের ZIP */
  const handleMultiFileSetsDownload = async (id: string) => {
    if (!shuffleItems || !shuffleMultiSets) return;
    const idx = shuffleItems.findIndex((it) => it.id === id);
    if (idx < 0) return;
    const it = shuffleItems[idx];
    const setIds = shuffleMultiSets[idx] ?? [];
    if (!it.parse.questions.length || !setIds.length) {
      toast({ title: "Nothing to download", description: "This file has no shuffled sets yet.", variant: "destructive" });
      return;
    }
    setSetsFileBusy(id);
    clearProc();
    setProcStage("Building set files...", 0, 1, setIds.length, it.file.name);
    await yieldToUI();
    try {
      const files = await buildFileSetFiles(it, setIds, fileRenumber(id));
      if (files.length === 1) {
        // finalizeZipEntries-এ ফরম্যাট-কনভার্সন হয়েই গেছে — সরাসরি ডাউনলোড (আবার কনভার্ট নয়)
        downloadBlob(files[0].blob, files[0].name);
        toast({
          title: downloadFormat === "pdf" ? "PDF file downloaded" : "Word file downloaded",
          description: `The single set of ${it.file.name} as its own file.`,
        });
      } else {
        const zip = await buildZipBlob(files, dlFileProgress("Compressing ZIP...", 0, 1, it.baseName));
        downloadBlob(zip, `${it.baseName} (sets).zip`);
        toast({
          title: "ZIP downloaded",
          description: `${files.length} set file(s) of ${it.file.name} inside one ZIP.`,
        });
      }
    } catch (e) {
      toast({ title: "Download failed", description: String(e), variant: "destructive" });
    } finally {
      clearProc();
      setSetsFileBusy(null);
    }
  };

  /**
   * সব ফাইলের সেট এক মাস্টার-ZIP-এ (nested): প্রতি ফাইলের সেটগুলো নিজের
   * per-file ZIP-এ (১-সেট ফাইলের একক .docx সরাসরি), আর সেই ZIP/.docx-গুলো
   * সব এক মাস্টার-ZIP-এ — যেমন ১০ ফাইল × ৩ সেট = ১০টা ZIP এক ZIP-এ।
   * একটা ফাইল আটকালেও বাকিগুলো যায় (partial ZIP + কোনটা বাদ গেল toast-এ)।
   */
  const handleMultiAllSetsZip = async () => {
    if (!shuffleItems || !shuffleMultiSets) return;
    setMultiSetsZipBusy(true);
    clearProc();
    setProcStage("Packing set files...", 0);
    await yieldToUI();
    try {
      const inner: Array<{ name: string; blob: Blob }> = [];
      const failed: string[] = [];
      for (let i = 0; i < shuffleItems.length; i++) {
        const it = shuffleItems[i];
        if (!it.parse.questions.length) continue;
        const setIds = shuffleMultiSets[i] ?? [];
        if (!setIds.length) continue;
        try {
          const files = await buildFileSetFiles(it, setIds, fileRenumber(it.id));
          if (files.length === 1) {
            inner.push({ name: files[0].name, blob: files[0].blob });
          } else {
            const z = await buildZipBlob(files, dlFileProgress("Packing set files...", inner.length, shuffleItems.length + 1, it.baseName));
            inner.push({ name: `${it.baseName} (sets).zip`, blob: z });
          }
          dlReport("Packing set files...", (i + 1) / (shuffleItems.length + 1), i + 1, shuffleItems.length, it.file.name);
        } catch (e) {
          failed.push(`${it.file.name}: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
      if (!inner.length) throw new Error(failed.join("; ") || "No files to download");
      // ১ ফাইল হলে per-file পথের হুবহু ফল (ডাবল-ZIP নয়; কনভার্সন আগেই হয়েছে)
      if (shuffleItems.length === 1 && inner.length === 1) {
        const only = inner[0];
        downloadBlob(only.blob, only.name);
        toast({ title: "Download ready", description: "The file's set(s) downloaded." });
        return;
      }
      const master = await buildZipBlob(inner, dlFileProgress("Compressing master ZIP...", inner.length, inner.length + 1));
      downloadBlob(master, "MCQ-shuffled-sets.zip");
      toast({
        title: failed.length ? "ZIP downloaded with skips" : "ZIP downloaded",
        description: failed.length
          ? `${inner.length} file(s) inside one master ZIP. Skipped ${failed.length}: ${failed.join("; ")}`
          : `${inner.length} file(s) inside one master ZIP — each file's sets zipped per file.`,
        variant: failed.length ? "destructive" : undefined,
      });
    } catch (e) {
      toast({ title: "ZIP failed", description: String(e), variant: "destructive" });
    } finally {
      clearProc();
      setMultiSetsZipBusy(false);
    }
  };

  // ---- TEXT mode সেট অ্যাকশন ----
  /** একটা সেটকে সিরিয়াল-অর্ডারে সাজানো / আবার শাফল করা (টগল) */
  const toggleSort = (si: number) => {
    if (!sets) return;
    const wasSorted = sortedFlags[si];
    setSets((prev) => {
      if (!prev) return prev;
      const copy = prev.map((s) => s.slice());
      copy[si] = wasSorted ? shuffled(copy[si]) : copy[si].slice().sort((a, b) => a.id - b.id);
      return copy;
    });
    setSortedFlags((prev) => {
      const copy = prev.slice();
      copy[si] = !wasSorted;
      return copy;
    });
  };

  /**
   * শাফল্ড-থাকা সেটকে নতুন করে শাফল — sort-ফ্ল্যাগ untouched থাকে।
   * অন্য সেটগুলোর ক্রম বাদ দিয়ে শাফল হয় (Phase 1.2) — নাহলে নতুন ক্রমটা
   * কোনো এক সেটের হুবহু কপি হয়ে দুটো সেট এক হয়ে যেত (ছোট পুলে বিশেষভাবে)।
   */
  const reshuffleSet = (si: number) => {
    if (!sets) return;
    setSets((prev) => {
      if (!prev) return prev;
      const copy = prev.map((s) => s.slice());
      const others = copy.filter((_, i) => i !== si).map((s) => orderKey(s));
      copy[si] = reshuffleDistinct(copy[si], others);
      return copy;
    });
  };

  // ---- TEXT mode এক্সপোর্ট ----
  const handleExportDocx = async () => {
    if (!sets) return;
    setBusy("docx");
    clearProc();
    setProcStage("Building Word file...", 0);
    await yieldToUI();
    try {
      await finalizeDownload(await buildSetsDocxBlob(sets, exportOpts, fontSettings));
      toast({
        title: downloadFormat === "pdf" ? "PDF file downloaded" : "Word file downloaded",
        description: "Each set is on its own page.",
      });
    } catch (e) {
      toast({ title: "Download failed", description: String(e), variant: "destructive" });
    } finally {
      // overlay OFF — নাহলে টেক্সট-মোডের Word ডাউনলোডের পরেও "Building Word file..."
      // ফুল-স্ক্রিন ওভারলে (fixed inset-0, কোনো ক্লোজ-বাটন নেই) আটকে থাকত
      // → ইউজার রিলোড না করা পর্যন্ত কিছুই ক্লিক করতে পারত না।
      clearProc();
      setBusy(null);
    }
  };

  /**
   * TEXT-mode set-by-set ডাউনলোড — প্রতি সেট আলাদা .docx: ১টা সেট হলে
   * সরাসরি ডাউনলোড, বেশি হলে এক ZIP-এ। ফন্ট/হেডার সেটিংস + ফরম্যাট-টগল মেনে চলে।
   */
  const handleExportSetsZip = async () => {
    if (!sets?.length) return;
    setBusy("sets-zip");
    clearProc();
    setProcStage("Building set files...", 0);
    await yieldToUI();
    try {
      const files: Array<{ name: string; blob: Blob }> = [];
      for (let si = 0; si < sets.length; si++) {
        const out = await buildSetsDocxBlob(
          [sets[si]],
          { ...exportOpts, fileName: `MCQ-${englishSetName(si)}.docx` },
          fontSettings
        );
        files.push({ name: out.fileName, blob: out.blob });
        dlReport("Building set files...", (si + 1) / sets.length, si + 1, sets.length);
      }
      if (files.length === 1) {
        await finalizeDownload({ blob: files[0].blob, fileName: files[0].name });
        toast({
          title: downloadFormat === "pdf" ? "PDF file downloaded" : "Word file downloaded",
          description: "The single set as its own file.",
        });
      } else {
        const zip = await buildZipBlob(await finalizeZipEntries(files), dlFileProgress("Compressing ZIP...", 0, 1));
        downloadBlob(zip, "MCQ-sets.zip");
        toast({
          title: "ZIP downloaded",
          description: `${files.length} separate set file(s) inside — one file per set.`,
        });
      }
    } catch (e) {
      toast({ title: "Download failed", description: String(e), variant: "destructive" });
    } finally {
      clearProc();
      setBusy(null);
    }
  };

  const handleExportDoc = () => {
    if (!sets) return;
    try {
      // NOTE: the .doc (legacy Word) path stays DOCX/HTML-only by design — the
      // "Download as" PDF toggle does not affect it (nor the Print button below).
      exportDocHtml(sets, exportOpts);
      toast({ title: ".doc file downloaded" });
    } catch (e) {
      toast({ title: "Download failed", description: String(e), variant: "destructive" });
    }
  };

  const handlePrint = () => {
    if (!sets) return;
    try {
      printSets(sets, exportOpts);
    } catch (e) {
      toast({ title: "Could not open print", description: String(e), variant: "destructive" });
    }
  };

  const handleCopySet = async (si: number) => {
    if (!sets) return;
    try {
      const { setClipboardText } = await import("@/lib/mcq/exporter");
      await copyToClipboard(setClipboardText(si, sets[si], exportOpts));
      setCopiedSet(si);
      setTimeout(() => setCopiedSet(null), 1800);
    } catch (e) {
      toast({ title: "Copy failed", description: String(e), variant: "destructive" });
    }
  };

  const handleCopyAll = async () => {
    if (!sets) return;
    setBusy("copyall");
    try {
      await copyToClipboard(allSetsClipboardText(sets, exportOpts));
      toast({ title: "📋 All sets copied", description: "Paste into Word. For page breaks, download the .docx." });
    } catch (e) {
      toast({ title: "Copy failed", description: String(e), variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  return {
    // input
    rawText, setRawText, hydrated, detecting, parsed, setParsed,
    docx, setDocx, docxLoading,
    selected, setSelected, allowBroken, setAllowBroken, fixing,
    // config
    setCount, setSetCount, distribution, setDistribution,
    shuffleWithin, setShuffleWithin, shuffling, refMode, setRefMode,
    fontSettings, updateFontSettings, downloadFormat, updateDownloadFormat,
    // results
    sets, setSets, setsDocx, setSetsDocx, renumber, setRenumber,
    sortedFlags, exportOpts, setExportOpts, busy, copiedSet,
    resetResults,
    // multi
    shuffleItems, setShuffleItems, shuffleLoading, shuffleMultiSets, setShuffleMultiSets,
    multiShuffling, multiMergedBusy, multiZipBusy, setsFileBusy, multiSetsZipBusy,
    multiRenumber, setMultiRenumber, fileRenumber, toggleFileRenumber,
    shuffleFileCount,
    // derived
    docxRefReport, multiRefReport, shuffleDuplicates,
    encData, activeSerial, activeCount, serialOk,
    shuffleMultiTotal, shuffleMultiZero, multiMinQuestions, multiEffectiveSets,
    multiGateReason, gateReason, canShuffle,
    // refs
    resultsRef,
    // handlers — text
    handleTextChange, runTextParse, loadAndDetect, handleDetect, handleAutoFix,
    toggleQuestion, announceDetect,
    selectAll, selectNone, selectRange,
    toggleSerialByClick,
    // handlers — single docx
    handleDocxFile, handleDocxShuffle, handleDocxDownload, handleDocxDownloadSets, handleDocxCopySet,
    // handlers — text shuffle/export
    handleTextShuffle, handleShuffle,
    toggleSort, reshuffleSet,
    handleExportDocx, handleExportSetsZip, handleExportDoc, handlePrint, handleCopySet, handleCopyAll,
    // handlers — multi
    handleShuffleFiles, reorderShuffleItems, removeShuffleItem,
    handleMultiShuffle, handleMultiMergedDownload, handleMultiZipDownload,
    loadSourceZip, buildFileSetFiles, handleMultiFileSetsDownload, handleMultiAllSetsZip,
  };
}

export type ShuffleMode = ReturnType<typeof useShuffleMode>;
