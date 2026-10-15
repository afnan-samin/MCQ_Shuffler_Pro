"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import JSZip from "jszip";
import { DetectCard } from "@/components/mcq/detect-card";
import { DocxDetectCard } from "@/components/mcq/docx-detect-card";
import { ShuffleCard } from "@/components/mcq/shuffle-card";
import { SetsResult } from "@/components/mcq/sets-result";
import { DocxSetsResult } from "@/components/mcq/docx-sets-result";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { MultiFileList } from "@/components/mcq/multi-file-list";
import { MultiDownloadCard, type SerialStrategy } from "@/components/mcq/multi-download-card";
import { ShuffleMultiSetsCard } from "@/components/mcq/shuffle-multi-sets-card";
import {
  autoFixNumbering,
  parseMcq,
  type ParseOutput,
  type McqQuestion,
} from "@/lib/mcq/parser";
import { buildSets, reshuffleDistinct, orderKey, shuffled, originalUniqueOrders, type Distribution } from "@/lib/mcq/set-engine";
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
import {
  type DocxParseResult,
} from "@/lib/mcq/docx-xml";
import {
  analyzeColorDocx,
  applyColorSerialXml,
  buildColorSerialDocxBlob,
  planSerialByColor,
  type BlockedLine,
  type ColorAnalysis,
  type SerialScheme,
} from "@/lib/mcq/color-serial";
import {
  buildMergedDocxBlob,
  buildZipBlob,
  offsetSerialPlan,
  replaceDocumentXml,
} from "@/lib/mcq/multi-docx";
import { remapDominantOf } from "@/lib/mcq/repack-docx";
import type { RemapDominant } from "@/lib/mcq/font-remap";
import { ColorSerialCard } from "@/components/mcq/color-serial-card";
import { ModeTabs, type McqMode } from "@/components/mcq/mode-tabs";
import { SerialInputCard } from "@/components/mcq/serial-input-card";
import { NextModesCard } from "@/components/mcq/next-modes-card";
import { StagedFilesCard, UploadFirstCard, type StagedFile, type StagedFileStats } from "@/components/mcq/upload-first-card";
import { ModeWorkBar } from "@/components/mcq/mode-work-bar";
import {
  BlockedLinesCard,
  ColorShuffleInfoCard,
  MultiSerialSchemeCard,
  NoColorSerialCard,
} from "@/components/mcq/serial-extra-cards";
import {
  buildShuffledDocxBlob,
  buildShuffledXml,
  englishSetName,
} from "@/lib/mcq/docx-exporter";
import { docxBlobToPdfParts, type DownloadFormat } from "@/lib/mcq/pdf-export";
import { analyzeRefReport, type RefMode, type RefReport } from "@/lib/mcq/reference";
import { RedownloadInputCard } from "@/components/mcq/redownload-input-card";
import { RedownloadPartsCard } from "@/components/mcq/redownload-parts-card";
import { RedownloadQuestionsCard } from "@/components/mcq/redownload-questions-card";
import {
  buildRedownloadXml,
  DEFAULT_PART_SELECTION,
  extractWatermark,
  parseRedownloadXml,
  type LabelTypo,
  type PartKind,
  type PartSel,
  type RdParseResult,
  type WatermarkInfo,
} from "@/lib/mcq/redownload";
import { renumberQuestionsByPosition } from "@/lib/mcq/serial-paste";
import { DEFAULT_FONT_REMAP_SETTINGS, FONT_CHOICES, type FontSettings } from "@/lib/mcq/font-remap";
import {
  DEFAULT_OPTION_LABEL_SETTINGS,
  sanitizeOptionLabelSettings,
  type OptionLabelSettings,
} from "@/lib/mcq/option-labels";
import { FontSettingsCard } from "@/components/mcq/font-settings-card";
import { OptionLabelsCard } from "@/components/mcq/option-labels-card";
import { LabelTyposCard, type LabelTypoRow } from "@/components/mcq/label-typos-card";
import { AnswerConflictsCard, answerConflictRowsOf, type AnswerConflictRow } from "@/components/mcq/answer-conflicts-card";
import { DuplicateQuestionsCard } from "@/components/mcq/duplicate-questions-card";
import { findDuplicateQuestions, type DuplicateGroup } from "@/lib/mcq/duplicates";
import {
  FILE_TOO_BIG_MSG,
  prepareShuffleXml,
  runFilePipeline,
  isValidDocxZip,
  type PipelineProgress,
} from "@/lib/mcq/file-pipeline";
import { MAX_FILE_BYTES, MIN_OPTIONS_PER_MCQ, SHUFFLE_MAX_FILES } from "@/lib/mcq/limits";
import { toast } from "@/hooks/use-toast";
import { usePersistedJson, usePersistedString } from "@/hooks/use-persisted-state";
import { Dices, Loader2, ShieldCheck, Upload, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { type DropzoneTrigger } from "@/components/mcq/file-dropzone";
import { useSharedServices } from "@/hooks/useSharedServices";
import { useStagedFiles } from "@/hooks/useStagedFiles";
import { useShuffleMode } from "@/hooks/useShuffleMode";

const MODE_KEY = "mcq-shuffler-mode";
/** রিডাউনলোডের অপশন-লেবেল কাস্টমাইজ সেটিংস (persisted) */
const OPTION_LABELS_KEY = "mcq-option-labels";
/** অপশন-লেবেল টাইপো অটো-ফিক্স (ডিফল্ট OFF — ডাউনলোড হুবহু) */
const RD_FIX_LABELS_KEY = "mcq-rd-fix-labels";

// ---------- প্রসেস-ওভারলে (বড় ফাইলের লোড/ডাউনলোডে "hang"-চেহারা আটকায়) ----------

export interface ProcState {
  active: boolean;
  stage: string;
  /** 0..1 determinate; null = indeterminate animated pulse */
  pct: number | null;
  fileNo?: number;
  fileTotal?: number;
  name?: string;
}

/** ফুল-স্ক্রিন "processing" ওভারলে — প্রগতি-বারসহ। determinate % জানা থাকলে
 * (মাল্টি-ফাইল "File 2/5"), না থাকলে অ্যানিমেটেড pulse। সব মোডের লোড পথ ব্যবহার করে। */
function ProcessOverlay({ proc }: { proc: ProcState }) {
  if (!proc.active) return null;
  const files = proc.fileTotal && proc.fileTotal > 1;
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-0 z-[120] flex items-center justify-center bg-background/80 backdrop-blur-sm dark:bg-background/85"
    >
      <div className="w-full max-w-md rounded-xl border bg-card p-6 text-center shadow-xl dark:bg-card">
        <Loader2 className="mx-auto h-8 w-8 animate-spin text-brand-600" />
        <div className="mt-3 text-base font-semibold">{proc.stage}</div>
        {files && (
          <div className="mt-0.5 text-xs text-muted-foreground">
            File {proc.fileNo} of {proc.fileTotal}
            {proc.name ? <span className="pl-1 truncate">{proc.name}</span> : null}
          </div>
        )}
        <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-muted">
          {proc.pct == null ? (
            <div className="h-full w-full animate-pulse bg-brand-500" />
          ) : (
            <div className="h-full bg-brand-500" style={{ width: `${Math.round(proc.pct * 100)}%` }} />
          )}
        </div>
        <div className="mt-1 text-right text-xs font-medium text-muted-foreground">
          {proc.pct == null ? "Working..." : `${Math.round(proc.pct * 100)}%`}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Processing in your browser - please wait, don&apos;t close the tab.
        </p>
      </div>
    </div>
  );
}

/** localStorage থেকে আসা মোড-ভ্যালুর গার্ড — অজানা ভ্যালু এলে ডিফল্ট "shuffle" থাকে */
function isMcqMode(raw: string): raw is McqMode {
  return raw === "shuffle" || raw === "serial" || raw === "redownload";
}
// ("Download as" ফরম্যাট-গার্ড + multi-id কাউন্টার — useSharedServices-এ)

// (DocxState — useShuffleMode-এ)
/** সিরিয়াল মোডের আলাদা স্টেট — এখন একাধিক ফাইলও থাকতে পারে (লিস্ট-ক্রমেই আউটপুট) */
interface SerialState {
  id: string;
  file: File;
  baseName: string;
  xml: string;
  analysis: ColorAnalysis;
}

// (ShuffleItemState — useShuffleMode-এ)
/** রিডাউনলোড মোডের আলাদা স্টেট — একাধিক ফাইল, প্রতি ফাইলের অংশ-বিশ্লেষণ */
interface RdDocState {
  id: string;
  file: File;
  baseName: string;
  xml: string;
  parse: RdParseResult;
  watermark: WatermarkInfo | null;
}

export default function Home() {
  // ---- মোড (persisted — শেষ ব্যবহৃত মোড মনে থাকে) ----
  const [mode, setMode] = usePersistedString<McqMode>(MODE_KEY, "shuffle", isMcqMode);

  // ---- স্টেজড ফাইল-স্লাইস + শেয়ার্ড সার্ভিস — hooks (single source of truth) ----
  // নিচের নামগুলো আগের inline state/handler-এর হুবহু একই — বাকি কোডে কোনো পরিবর্তন নেই।
  const {
    stagedFiles, setStagedFiles,
    stagedDzTrigger,
    stageFiles, stageMoreFiles,
  } = useStagedFiles();


  const {
    fontSettings, updateFontSettings,
    downloadFormat, updateDownloadFormat,
    finalizeDownload, finalizeZipEntries,
    nextMultiId,
    yieldToUI, setProcStage, clearProc, pipelineReport, dlReport, dlFileProgress,
    proc,
  } = useSharedServices();
  /** লোডার রি-এন্ট্রান্সি গার্ড — state নয়, ref (stale-closure এড়াতে); চলমান লোড থাকলে নতুন কল নীরবে বাদ */
  const loadersBusyRef = useRef(false);

  // ================== SHUFFLE MODE (hook — single source of truth) ==================
  const shuffle = useShuffleMode({
    fontSettings, updateFontSettings,
    downloadFormat, updateDownloadFormat,
    finalizeDownload, finalizeZipEntries,
    nextMultiId, yieldToUI, setProcStage,
    clearProc, pipelineReport,
    dlReport, dlFileProgress, loadersBusyRef,
    onParsed: () => {
      setMode("shuffle"); // persisted — localStorage-এও লেখে
      setFlowStep("work");
    },
  });
  // shuffle-এর resultsRef একবার destructure — JSX `ref=`-এ member-access থাকলে
  // react-hooks/refs মডেল `shuffle` অবজেক্টকে taint করে (একই অবজেক্ট, আচরণ হুবহু)।
  const { resultsRef } = shuffle;

  // ---- ফ্লো-ধাপ: "select" = মোড-বাছাই (৩টা মোড-বাটন শুধু এখানেই), "work" = মোডের ভিতরে কাজ ----
  // মোডে ঢোকার পর ৩টা মোড-বাটন আর দেখানো হয় না — উপরে থাকে পেছনে + আরও-ফাইল বার
  const [flowStep, setFlowStep] = useState<"select" | "work">("select");

  // (shuffle input/config state — useShuffleMode-এ)


  // (আউটপুট ফন্ট-রিম্যাপ + "Download as" ফরম্যাট — useSharedServices-এ)

  // (shuffle results state — useShuffleMode-এ)


  // ---- সিরিয়াল মোডের সম্পূর্ণ আলাদা স্টেট (একাধিক ফাইল সাপোর্ট) ----
  const [serialDocs, setSerialDocs] = useState<SerialState[]>([]);
  const [serialLoading, setSerialLoading] = useState(false);
  const [serialBusy, setSerialBusy] = useState(false);
  const [serialMergedBusy, setSerialMergedBusy] = useState(false);
  const [serialZipBusy, setSerialZipBusy] = useState(false);
  const [serialStrategy, setSerialStrategy] = useState<SerialStrategy>("per-file");
  // প্রতি ফাইলের সিরিয়াল-স্কিম (কী = SerialState.id; ডিফল্ট একটানা — আগের আচরণ হুবহু)
  const [serialSchemes, setSerialSchemes] = useState<Record<string, SerialScheme>>({});
  // সিরিয়াল মোডের পেস্ট-ইনপুট — ফাইল-ফ্লোর সাথে পারস্পরিক একচেটিয়া (দুটো একসাথে অ্যাক্টিভ থাকে না)
  const [serialPasteText, setSerialPasteText] = useState("");
  const [serialPaste, setSerialPaste] = useState<ParseOutput | null>(null);
  const [serialPasteBusy, setSerialPasteBusy] = useState(false);
  const [serialPasteFixing, setSerialPasteFixing] = useState(false);
  const [serialPasteDlBusy, setSerialPasteDlBusy] = useState(false);
  // ঠিক ১ টা ফাইল হলে পুরনো একক-ফাইল কার্ড (রঙ-চিপসহ) — ≥২ হলে মাল্টি ডাউনলোড কার্ড
  const serialDoc = serialDocs.length === 1 ? serialDocs[0] : null;

  // (shuffle multi-file state — useShuffleMode-এ)


  // ---- রিডাউনলোড মোডের সম্পূর্ণ আলাদা স্টেট (একাধিক .docx + অংশ-বাছাই) ----
  const [rdDocs, setRdDocs] = useState<RdDocState[]>([]);
  const [rdLoading, setRdLoading] = useState(false);
  // প্রতি ফাইলে সিলেক্ট করা প্রশ্ন (কী = RdDocState.id)
  const [rdSel, setRdSel] = useState<Record<string, Set<number>>>({});
  // কোন অংশগুলো নতুন ফাইলে থাকবে (ডিফল্ট: ৬টাই সিলেক্ট)
  const [rdParts, setRdParts] = useState<PartSel>(DEFAULT_PART_SELECTION);
  const [rdRenumber, setRdRenumber] = useState(false);
  const [optionLabels, updateOptionLabels] = usePersistedJson<OptionLabelSettings>(
    OPTION_LABELS_KEY,
    DEFAULT_OPTION_LABEL_SETTINGS,
    sanitizeOptionLabelSettings
  );
  // লেবেল-টাইপো ফিক্স টগল — ডিফল্ট OFF (ডাউনলোডে লেবেল হুবহু)
  const [rdFixLabels, setRdFixLabels] = usePersistedJson<boolean>(RD_FIX_LABELS_KEY, false);
  const [rdMergedBusy, setRdMergedBusy] = useState(false);
  const [rdZipBusy, setRdZipBusy] = useState(false);

  // রিডাউনলোড মোডের ডেরাইভড — সব ফাইল মিলিয়ে অংশ-কাউন্ট ও সিলেকশন স্ট্যাট
  const rdTotalCounts = rdDocs.reduce<Record<PartKind, number>>(
    (acc, d) => {
      for (const k of ["serial", "question", "reference", "options", "answer", "bekkha", "other"] as PartKind[]) {
        acc[k] = (acc[k] ?? 0) + d.parse.kindCounts[k];
      }
      return acc;
    },
    { serial: 0, question: 0, reference: 0, options: 0, answer: 0, bekkha: 0, other: 0 }
  );
  const rdTotalQuestions = rdDocs.reduce((a, d) => a + d.parse.questions.length, 0);
  const rdSelTotal = rdDocs.reduce((a, d) => a + (rdSel[d.id]?.size ?? 0), 0);
  // প্রতি অংশ কয়টা প্রশ্নে পাওয়া গেছে (প্যারা-কাউন্ট নয় — গ্লুড উত্তর / এক-প্যারায় ৪ অপশনও ধরা পড়ে)
  const rdFoundStats = rdDocs.reduce(
    (acc, d) => {
      for (const q of d.parse.questions) {
        if (q.kinds.includes("reference")) acc.withReference++;
        if (q.options.length > 0) acc.withOptions++;
        acc.optionsTotal += q.options.length;
        // উত্তর পাওয়া = লেটার-ভ্যালু এক্সট্র্যাক্ট হয়েছে **অথবা** উত্তর-লাইন আছে।
        // শুধু q.answer দিলে টেক্সট-উত্তর ("Ans: will be delivered") বা বেয়ার
        // "Ans:" লাইনও ০ ধরা পড়ত — Weekly Exam 4 (Ans)-এ ১০০ উত্তর-লাইন থেকেও ২ দেখাত।
        if (q.answer || q.kinds.includes("answer")) acc.withAnswer++;
        if (q.bekkha) acc.withBekkha++;
      }
      return acc;
    },
    { withReference: 0, withOptions: 0, optionsTotal: 0, withAnswer: 0, withBekkha: 0 }
  );
  // লেবেল-টাইপো — সব ফাইল মিলিয়ে (কার্ডে ফাইল-নামসহ দেখানো হয়)
  const rdLabelTypos = useMemo<LabelTypoRow[]>(
    () => rdDocs.flatMap((d) => d.parse.labelTypos.map((t) => ({ ...t, fileName: d.file.name }))),
    [rdDocs]
  );
  // উত্তর-কনফ্লিক্ট (star vs Dt-tail) — সব ফাইল মিলিয়ে (warning কার্ডে)
  const rdAnswerConflicts = useMemo<AnswerConflictRow[]>(
    () => rdDocs.flatMap((d) => answerConflictRowsOf(d.parse.questions, d.file.name)),
    [rdDocs]
  );

  // (shuffle ref-report/duplicate memos — useShuffleMode-এ)


  // ---- ফ্লো-গেট: কোনো ইনপুট নেই → আগে আপলোড-কার্ড; ইনপুট আছে → ৩ মোড-বাটন ----
  const hasAnyInput =
    !!stagedFiles?.length ||
    !!shuffle.docx ||
    !!shuffle.shuffleItems ||
    serialDocs.length > 0 ||
    !!serialPaste ||
    rdDocs.length > 0 ||
    !!(shuffle.parsed && shuffle.parsed.questions.length > 0);

  // ---- Phase 4.1: কাজ থাকা অবস্থায় ট্যাব বন্ধ/রিফ্রেশে ব্রাউজারের "leave site?" গার্ড ----
  useEffect(() => {
    if (!hasAnyInput) return;
    const handler = (e: BeforeUnloadEvent) => {
      // স্ট্যান্ডার্ড + Chrome-লিগ্যাসি দুই ফ্ল্যাগই — ব্রাউজার নিজের কনফার্ম দেখায়
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [hasAnyInput]);

  // ---- প্রতি মোডের ফাইল-সংখ্যা (NextModesCard-এ দেখানোর জন্য) ----
  const serialFileCount = serialDocs.length;
  const rdFileCount = rdDocs.length;

  // (স্টেজড-প্রিভিউ + stageFiles/stageMoreFiles/stagedFilesRef — useStagedFiles-এ)

  // (proc/yieldToUI/pipeline/dl-helpers — useSharedServices-এ)

  // (finalizeDownload/finalizeZipEntries — useSharedServices-এ)
  /** skipCarry=true → carry-over বাইপাস (openInSerialMode নিজেই স্টেট সাজিয়ে রাখে — দুইবার লোড/টোস্ট ঠেকাতে) */
  const changeMode = (m: McqMode, skipCarry = false) => {
    setMode(m); // persisted — localStorage-এও লেখে
    if (!skipCarry) carryToMode(m, mode);
    setFlowStep("work");
  };

  /** "পেছনে" — হোমে (ধাপ ১: আপলোড-কার্ড) ফেরা — লোড করা ফাইল/ডেটা মুছে একদম নতুন শুরু (ড্রাফট-টেক্সট localStorage-এ থাকে) */
  const backToHome = () => {
    // Phase 4.2: কাজ থাকলে এক-ক্লিকে সব মুছে ফেলার আগে নিশ্চিত করা — ভুলে চাপলে ফেরানোর উপায় নেই
    if (hasAnyInput && !window.confirm("Go back home? All loaded files and results will be cleared.")) {
      return;
    }
    setStagedFiles(null);
    shuffle.setDocx(null);
    shuffle.setParsed(null);
    shuffle.setShuffleItems(null);
    shuffle.setShuffleMultiSets(null);
    shuffle.setMultiRenumber({});
    shuffle.setSelected(new Set());
    shuffle.setAllowBroken(false);
    setSerialDocs([]);
    setSerialSchemes({});
    setSerialPaste(null);
    setSerialPasteText("");
    setRdDocs([]);
    setRdSel({});
    shuffle.resetResults();
    setFlowStep("select"); // hasAnyInput ফলস হলেই অটো ধাপ ১ (আপলোড-কার্ড) দেখাবে
  };

  /** কাজ-চলাকালীন "আরও ফাইল" — নতুন ফাইল বর্তমান মোডেই যোগ (append) হয় */
  const handleAddMoreFiles = (files: File[]) => {
    if (!files.length) return;
    if (mode === "serial") loadSerialFiles(files, true);
    else if (mode === "redownload") loadRedownloadFiles(files, true);
    else shuffle.handleShuffleFiles(files, true);
  };

  // ================== মোডের মাঝে ফাইল বহন (carry-over) ==================

  /** মোডে এখন কাজের ডেটা আছে কি না (আছে হলে ছুঁই না — ইউজারের কাজ নষ্ট হবে না) */
  const modeHasContent = (m: McqMode): boolean =>
    m === "shuffle"
      ? !!(shuffle.docx || shuffle.shuffleItems || (shuffle.parsed && shuffle.parsed.questions.length > 0))
      : m === "serial"
        ? serialDocs.length > 0 || !!serialPaste
        : rdDocs.length > 0;

  /** মোডে থাকা ফাইলগুলো (File অবজেক্ট) — অন্য মোডে বহনের জন্য */
  const filesOfMode = (m: McqMode): File[] =>
    m === "shuffle"
      ? shuffle.shuffleItems
        ? shuffle.shuffleItems.map((i) => i.file)
        : shuffle.docx
          ? [shuffle.docx.file]
          : []
      : m === "serial"
        ? serialDocs.map((d) => d.file)
        : rdDocs.map((d) => d.file);

  /** ফাইল একটা মোডে লোড — প্রতিটা মোডের নিজের লোডার ব্যবহার করে */
  const loadIntoMode = (m: McqMode, files: File[]) => {
    if (m === "shuffle") shuffle.handleShuffleFiles(files);
    else if (m === "serial") loadSerialFiles(files, false);
    else loadRedownloadFiles(files, false);
  };

  /**
   * মোড-সুইচে ফাইল বহন:
   * ১) টার্গেট মোডে কাজ থাকলে কিছুই করা হয় না
   * ২) স্টেজ করা ফাইল থাকলে সেগুলোই টার্গেটে লোড হয়
   * ৩) নাহলে সোর্স মোডের ফাইল খালি টার্গেটে বহন হয়
   */
  const carryToMode = (target: McqMode, source: McqMode) => {
    if (modeHasContent(target)) return;
    if (stagedFiles && stagedFiles.length) {
      const files = stagedFiles.map((s) => s.file);
      setStagedFiles(null);
      loadIntoMode(target, files);
      return;
    }
    if (source !== target) {
      const files = filesOfMode(source);
      if (files.length) loadIntoMode(target, files);
    }
  };

  // (shuffle handlers — useShuffleMode-এ)
  // (shuffle handlers — useShuffleMode-এ)
  // ================== SERIAL MODE (সম্পূর্ণ আলাদা ওয়ার্কফ্লো) ==================

  /** .docx লোড + রঙ-বিশ্লেষণ — একাধিক হলে লিস্টে বসে; append=false হলে লিস্ট বদলে যায় */
  const loadSerialFiles = async (files: File[], append: boolean) => {
    // সাইজ ক্যাপ — ৫০ ফাইল / ১০০MB per file (shuffle-এর মতোই সব মোডে)
    const existingCount = serialDocs.length;
    let cappedFiles = files;
    if (existingCount + files.length > SHUFFLE_MAX_FILES) {
      const take = Math.max(0, SHUFFLE_MAX_FILES - (append ? existingCount : 0));
      cappedFiles = files.slice(0, take);
      toast({
        title: `Max ${SHUFFLE_MAX_FILES} files`,
        description: take > 0 ? `Between 1 and ${SHUFFLE_MAX_FILES} files at a time — took the first ${take}, dropped the rest.` : `Already ${SHUFFLE_MAX_FILES} files — remove some from the list to add new ones.`,
        variant: "destructive",
      });
    }
    if (!cappedFiles.length) return;
    // রি-এন্ট্রান্সি গার্ড — চলমান লোড থাকলে ওভারল্যাপ কল নীরবে বাদ (state নয়, ref → stale closure নেই)
    if (loadersBusyRef.current) return;
    loadersBusyRef.current = true;
    setSerialLoading(true);
    await yieldToUI();
    try {
      const run = await runFilePipeline(cappedFiles, {
        report: pipelineReport,
        yieldToUI,
        parse: (xml) => analyzeColorDocx(xml),
      });
      // সাইজ-গার্ড — পাইপলাইন রিপোর্ট করে, টোস্ট এখানেই (আগের হুবহু মেসেজ)
      for (const f of run.tooBig) toast({ title: FILE_TOO_BIG_MSG, variant: "destructive" });
      // এক্সটেনশন-গার্ডে বাদ পড়া ফাইলের ফিডব্যাক — আগে নীরবে বাদ যেত
      if (run.notDocx.length) {
        toast({ title: `${run.notDocx.length} file(s) skipped — only .docx is supported`, variant: "destructive" });
      }
      const added: SerialState[] = run.items.map((it) => ({
        id: nextMultiId(),
        file: it.file,
        baseName: it.baseName,
        xml: it.xml,
        analysis: it.value,
      }));
      const errors = run.failures.map((x) => `${x.name}: ${x.message}`);
      let colors = 0;
      let questions = 0;
      for (const d of added) {
        colors += d.analysis.colors.length;
        questions += d.analysis.questionCount;
      }
      setSerialDocs((prev) => (append ? [...prev, ...added] : added));
      setSerialLoading(false);
      if (added.length) {
        // ফাইল আপলোড হলে পেস্ট-রেজাল্ট ক্লিয়ার — দুটো একসাথে অ্যাক্টিভ থাকবে না
        setSerialPaste(null);
        setSerialSchemes((prev) => {
          const next = append ? { ...prev } : {};
          for (const d of added) next[d.id] = { kind: "continuous" };
          return next;
        });
        toast({
          title: `${added.length} file(s) ${append ? "added" : "loaded"}`,
          description: `${questions} question(s) in total${colors ? `, ${colors} color header(s)`: ""}.${added.length > 1 ? " Reorder from the list — merge/ZIP download below." : ""}`,
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

  const reorderSerialDocs = (from: number, to: number) => {
    setSerialDocs((prev) => {
      const next = prev.slice();
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  };

  const removeSerialDoc = (id: string) => {
    setSerialDocs((prev) => prev.filter((d) => d.id !== id));
    setSerialSchemes((prev) => {
      if (!(id in prev)) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
  };

  const handleColorSerial = async (scheme: SerialScheme, label: string) => {
    if (!serialDoc) return;
    setSerialBusy(true);
    clearProc();
    setProcStage("Serializing file...", 0);
    await yieldToUI();
    try {
      const plan = planSerialByColor(serialDoc.analysis, scheme);
      if (plan.size === 0) {
        toast({
          title: "No questions found to number",
          description: "No serial-numbered question lines inside this color's sections.",
          variant: "destructive",
        });
        return;
      }
      // ফরম্যাট-টগল অনুযায়ী ডাউনলোড — DOCX হলে হুবহু আগের ব্লব; PDF হলে ব্রাউজারে কনভার্ট
      await finalizeDownload(
        await buildColorSerialDocxBlob({
          originalFile: serialDoc.file,
          xml: serialDoc.xml,
          plan,
          baseName: serialDoc.baseName,
          schemeLabel: label,
          fontSettings,
          onProgress: dlFileProgress("Serializing file...", 0, 1, serialDoc.baseName),
        })
      );
      toast({
        title: `Color-serial .${downloadFormat === "pdf" ? "pdf" : "docx"} downloaded`,
        description:
          scheme.kind === "continuous"
            ? `${plan.size} question(s) numbered continuously 1,2,3…. Everything else untouched.`
            : `${plan.size} question(s) numbered from 1 per color section. Headers/equations/images intact.`,
      });
    } catch (e) {
      toast({ title: "Serialing failed", description: String(e), variant: "destructive" });
    } finally {
      clearProc();
      setSerialBusy(false);
    }
  };

  // ---- মাল্টি-ফাইল সিরিয়াল ডাউনলোড (≥২ ফাইল) ----

  /** প্রতিটা ফাইল সিরিয়াল করে এক .docx-এ মার্জ — ফাইলের মাঝে পেজ ব্রেক */
  const handleSerialMultiMerged = async () => {
    if (serialDocs.length < 2) return;
    setSerialMergedBusy(true);
    clearProc();
    setProcStage("Serializing files...", 0);
    await yieldToUI();
    try {
      const items: Array<{ xml: string; file: Blob }> = [];
      let offset = 0;
      for (let fi = 0; fi < serialDocs.length; fi++) {
        const d = serialDocs[fi];
        // প্রতি ফাইলের নিজের স্কিম (ডিফল্ট একটানা — আগের আচরণ হুবহু)
        const base = planSerialByColor(d.analysis, serialSchemes[d.id] ?? { kind: "continuous" });
        // file-by-file হলে প্রতি ফাইল ১ থেকে; global হলে আগের ফাইলের শেষ নম্বরের পর থেকে
        const plan = serialStrategy === "global" ? offsetSerialPlan(base, offset) : base;
        offset += base.size;
        const xml = applyColorSerialXml(d.xml, plan);
        items.push({ xml, file: await replaceDocumentXml(d.file, xml, undefined, dlFileProgress("Serializing files...", fi, serialDocs.length + 1, d.baseName)) });
      }
      const merged = await buildMergedDocxBlob(items, fontSettings, dlFileProgress("Merging files...", serialDocs.length, serialDocs.length + 1));
      await finalizeDownload({ blob: merged, fileName: `${serialDocs[0].baseName} (merged serial).docx`});
      toast({
        title: `Merged .${downloadFormat === "pdf" ? "pdf" : "docx"} downloaded`,
        description:
          serialStrategy === "global"
            ? "All files in order with page breaks — one continuous serial start to finish."
            : "All files in order with page breaks — serials restart at 1 in each file.",
      });
    } catch (e) {
      toast({ title: "Merging failed", description: String(e), variant: "destructive" });
    } finally {
      clearProc();
      setSerialMergedBusy(false);
    }
  };

  /** প্রতিটা ফাইল আলাদাভাবে সিরিয়াল করে এক .zip-এ বানিয়ে দেয় */
  const handleSerialMultiZip = async () => {
    if (serialDocs.length < 2) return;
    setSerialZipBusy(true);
    clearProc();
    setProcStage("Serializing files...", 0);
    await yieldToUI();
    try {
      const out: Array<{ name: string; blob: Blob }> = [];
      for (let fi = 0; fi < serialDocs.length; fi++) {
        const d = serialDocs[fi];
        // প্রতি ফাইলের নিজের স্কিম (ডিফল্ট একটানা — আগের আচরণ হুবহু)
        const plan = planSerialByColor(d.analysis, serialSchemes[d.id] ?? { kind: "continuous" });
        const xml = applyColorSerialXml(d.xml, plan);
        out.push({ name: `${d.baseName} (serial).docx`, blob: await replaceDocumentXml(d.file, xml, fontSettings, dlFileProgress("Serializing files...", fi, serialDocs.length + 1, d.baseName)) });
      }
      const zip = await buildZipBlob(await finalizeZipEntries(out), dlFileProgress("Compressing ZIP...", serialDocs.length, serialDocs.length + 1));
      downloadBlob(zip, "MCQ-serial-files.zip");
      toast({
        title: "ZIP downloaded",
        description: `${out.length} file(s), each serialized separately — all inside.`,
      });
    } catch (e) {
      toast({ title: "ZIP failed", description: String(e), variant: "destructive" });
    } finally {
      clearProc();
      setSerialZipBusy(false);
    }
  };

  // ---- সিরিয়াল মোড পেস্ট-ইনপুট (ফাইল-ফ্লোর সাথে পারস্পরিক একচেটিয়া) ----

  /** পেস্ট-টেক্সটে parseMcq — রেজাল্ট সেভ + ফাইল-লিস্ট/কার্ড ক্লিয়ার (দুটো একসাথে থাকবে না) */
  const handleSerialPasteDetect = () => {
    if (!serialPasteText.trim()) return;
    setSerialPasteBusy(true);
    try {
      const result = parseMcq(serialPasteText);
      setSerialDocs([]);
      setSerialSchemes({});
      setSerialPaste(result);
      if (result.questions.length === 0) {
        toast({
          title: "No questions found",
          description: "Check that questions start with a number (e.g. 1. or ১.),",
          variant: "destructive",
        });
      } else if (result.serial?.status === "ok") {
        toast({
          title: `${result.questions.length} question(s) detected`,
          description: "Serial is correct — the serial download button below is enabled!",
        });
      } else {
        toast({
          title: `${result.questions.length} question(s) found, but the serial has problems`,
          description: '"Fix numbering automatically" fixes it in one click.',
        });
      }
    } finally {
      setSerialPasteBusy(false);
    }
  };

  /** পেস্ট-টেক্সটে autoFixNumbering — টেক্সট ও রেজাল্ট দুটোই আপডেট */
  const handleSerialPasteFix = () => {
    if (!serialPasteText.trim()) return;
    setSerialPasteFixing(true);
    try {
      const fixed = autoFixNumbering(serialPasteText, 1);
      const result = parseMcq(fixed);
      setSerialPasteText(fixed);
      setSerialPaste(result);
      toast({
        title: "Serial fixed",
        description: `Renumbered ${result.questions.length} question(s) starting from 1.`,
      });
    } finally {
      setSerialPasteFixing(false);
    }
  };

  /** পেস্টের প্রশ্নগুলো পজিশন-অনুযায়ী ১..N রিনাম্বার করে এক সেট .docx এক্সপোর্ট */
  const handleSerialPasteDownload = async () => {
    if (!serialPaste || serialPaste.questions.length === 0) return;
    setSerialPasteDlBusy(true);
    try {
      const renumbered = renumberQuestionsByPosition(serialPaste.questions, 1);
      // একক সেট → পেজ-হেডার ও সেট-টাইটেল ("সেট A") দুটোই অফ — খালি সিরিয়াল ফাইল
      await finalizeDownload(
        await buildSetsDocxBlob([renumbered], {
          ...DEFAULT_EXPORT_OPTIONS,
          includeHeader: false,
          includeSetHeader: false,
          fileName: `MCQ-Serial-${renumbered.length}q.docx`,
        }, fontSettings)
      );
      toast({
        title: `Serial .${downloadFormat === "pdf" ? "pdf" : "docx"} downloaded`,
        description: `${renumbered.length} question(s) numbered 1..N by position — order and options exactly intact.`,
      });
    } catch (e) {
      toast({ title: "Download failed", description: String(e), variant: "destructive" });
    } finally {
      setSerialPasteDlBusy(false);
    }
  };

  /** শাফল মোডে উঠা রঙ-ফাইল সিরিয়াল মোডে খোলা (ফাইল নিজেই চলে যায়, আবার আপলোড লাগে না) */
  const openInSerialMode = () => {
    if (!shuffle.docx?.colorAn) return;
    const id = nextMultiId();
    setStagedFiles(null);
    setSerialDocs([
      {
        id,
        file: shuffle.docx.file,
        baseName: shuffle.docx.baseName,
        // সিরিয়াল মোডে অরিজিনাল xml লাগে — রঙ-ইনডেক্স অরিজিনাল ফাইলের সাথে মেলে
        xml: shuffle.docx.originalXml,
        analysis: shuffle.docx.colorAn,
      },
    ]);
    setSerialSchemes({ [id]: { kind: "continuous" } });
    setSerialPaste(null);
    // carry বাইপাস — changeMode-এর carryToMode স্টেল serialDocs=[] পড়ে ফাইলটা আবার লোড করত (ডাবল-বিশ্লেষণ + ডাবল-টোস্ট)
    changeMode("serial", true);
    toast({
      title: "File opened in Serial mode",
      description: "Pick a color below and download the serial file.",
    });
  };

  // (shuffle handlers — useShuffleMode-এ)
  // ================== SHARED ==================

  // (shuffle handlers — useShuffleMode-এ)
  // (shuffle handlers — useShuffleMode-এ)
  // ================== REDOWNLOAD MODE ==================

  /** রিডাউনলোড মোডে ফাইল লোড — পার্স + অংশ-বিশ্লেষণ + ওয়াটারমার্ক এক্সট্র্যাক্ট */
  const loadRedownloadFiles = async (files: File[], append: boolean) => {
    const existingCount = rdDocs.length;
    let cappedFiles = files;
    if (existingCount + files.length > SHUFFLE_MAX_FILES) {
      const take = Math.max(0, SHUFFLE_MAX_FILES - (append ? existingCount : 0));
      cappedFiles = files.slice(0, take);
      toast({
        title: `Max ${SHUFFLE_MAX_FILES} files`,
        description: take > 0 ? `Between 1 and ${SHUFFLE_MAX_FILES} files at a time — took the first ${take}, dropped the rest.` : `Already ${SHUFFLE_MAX_FILES} files — remove some from the list to add new ones.`,
        variant: "destructive",
      });
    }
    if (!cappedFiles.length) return;
    // রি-এন্ট্রান্সি গার্ড — চলমান লোড থাকলে ওভারল্যাপ কল নীরবে বাদ
    if (loadersBusyRef.current) return;
    loadersBusyRef.current = true;
    setRdLoading(true);
    await yieldToUI();
    try {
      const run = await runFilePipeline(cappedFiles, {
        report: pipelineReport,
        yieldToUI,
        parse: async (xml, file) => ({ parse: parseRedownloadXml(xml), watermark: await extractWatermark(file) }),
      });
      // সাইজ-গার্ড — পাইপলাইন রিপোর্ট করে, টোস্ট এখানেই (আগের হুবহু মেসেজ)
      for (const f of run.tooBig) toast({ title: FILE_TOO_BIG_MSG, variant: "destructive" });
      // এক্সটেনশন-গার্ডে বাদ পড়া ফাইলের ফিডব্যাক — আগে নীরবে বাদ যেত
      if (run.notDocx.length) {
        toast({ title: `${run.notDocx.length} file(s) skipped — only .docx is supported`, variant: "destructive" });
      }
      const added: RdDocState[] = run.items.map((it) => ({
        id: nextMultiId(),
        file: it.file,
        baseName: it.baseName,
        xml: it.xml,
        parse: it.value.parse,
        watermark: it.value.watermark,
      }));
      const errors = run.failures.map((x) => `${x.name}: ${x.message}`);
      setRdDocs((prev) => (append ? [...prev, ...added] : added));
      if (added.length) {
        // নতুন ফাইলের সব প্রশ্ন ডিফল্ট সিলেক্টেড
        setRdSel((prev) => {
          const next = append ? { ...prev } : {};
          for (const d of added) next[d.id] = new Set(d.parse.questions.map((q) => q.id));
          return next;
        });
        const totalQ = added.reduce((a, d) => a + d.parse.questions.length, 0);
        toast({
          title: `${added.length} file(s) ${append ? "added" : "loaded"}`,
          description: `${totalQ} question(s) in total. Now pick parts and download.`,
        });
      }
      if (errors.length) {
        toast({ title: "Some files could not be read", description: errors.join("\n"), variant: "destructive" });
      }
    } finally {
      loadersBusyRef.current = false;
      clearProc();
    }
    setRdLoading(false);
  };

  const reorderRdDocs = (from: number, to: number) => {
    setRdDocs((prev) => {
      const next = prev.slice();
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  };

  const removeRdDoc = (id: string) => {
    setRdDocs((prev) => prev.filter((d) => d.id !== id));
    setRdSel((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  };

  const rdSelOf = (id: string): Set<number> => rdSel[id] ?? new Set<number>();

  const toggleRdQuestion = (docId: string, qid: number) => {
    setRdSel((prev) => {
      const cur = new Set(prev[docId] ?? []);
      if (cur.has(qid)) cur.delete(qid);
      else cur.add(qid);
      return { ...prev, [docId]: cur };
    });
  };

  const selectAllRd = (docId: string) => {
    const d = rdDocs.find((x) => x.id === docId);
    if (!d) return;
    setRdSel((prev) => ({ ...prev, [docId]: new Set(d.parse.questions.map((q) => q.id)) }));
  };

  const selectNoneRd = (docId: string) => {
    setRdSel((prev) => ({ ...prev, [docId]: new Set<number>() }));
  };

  const selectRangeRd = (docId: string, from: number, to: number) => {
    const d = rdDocs.find((x) => x.id === docId);
    if (!d) return;
    const ids = d.parse.questions.slice(from, to + 1).map((q) => q.id);
    setRdSel((prev) => ({ ...prev, [docId]: new Set(ids) }));
  };

  /** সব ফাইলের বাছাই করা প্রশ্ন + অংশ দিয়ে রেডি XML-আইটেম (খালি-সিলেক্ট ফাইল স্কিপ) */
  const buildRdItems = (): Array<{ xml: string; file: Blob; baseName: string; dominant: RemapDominant }> | null => {
    const items = rdDocs
      .map((d) => {
        const sel = rdSelOf(d.id);
        if (!sel.size) return null;
        const xml = buildRedownloadXml(d.xml, d.parse, sel, {
          partSel: rdParts,
          renumber: rdRenumber,
          expandAnswer: true,
          optionLabels,
          fixLabels: rdFixLabels,
        });
        return { xml, file: d.file as Blob, baseName: d.baseName, dominant: remapDominantOf(d.xml) };
      })
      .filter((x): x is { xml: string; file: Blob; baseName: string; dominant: RemapDominant } => x !== null);
    return items.length ? items : null;
  };

  const handleRdMerged = async () => {
    const items = buildRdItems();
    if (!items) {
      toast({ title: "Select questions", description: "Tick questions in at least one file.", variant: "destructive" });
      return;
    }
    setRdMergedBusy(true);
    clearProc();
    setProcStage(items.length === 1 ? "Building redownload file..." : "Merging redownload files...", 0);
    await yieldToUI();
    try {
      const blob =
        items.length === 1
          ? await replaceDocumentXml(items[0].file, items[0].xml, fontSettings, dlFileProgress("Building redownload file...", 0, 1, items[0].baseName), items[0].dominant)
          : await buildMergedDocxBlob(items, fontSettings, dlFileProgress("Merging redownload files...", 0, 1));
      clearProc();
      const name =
        items.length === 1 ? `${items[0].baseName} (redownload).docx`: "MCQ-Redownload-merged.docx";
      await finalizeDownload({ blob, fileName: name });
      toast({
        title: "Redownload file created",
        description: `Picked parts from ${items.length} file(s) in the new file — tabs, equations, watermark all intact.`,
      });
    } catch (e) {
      toast({ title: "Download failed", description: String(e), variant: "destructive" });
    } finally {
      clearProc();
      setRdMergedBusy(false);
    }
  };

  const handleRdZip = async () => {
    const items = buildRdItems();
    if (!items) {
      toast({ title: "Select questions", description: "Tick questions in at least one file.", variant: "destructive" });
      return;
    }
    setRdZipBusy(true);
    clearProc();
    setProcStage("Packing redownload ZIP...", 0);
    await yieldToUI();
    try {
      const files: Array<{ name: string; blob: Blob }> = [];
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        const blob = await replaceDocumentXml(it.file, it.xml, fontSettings, dlFileProgress("Building redownload files...", i, items.length + 1, it.baseName), it.dominant);
        files.push({ name: `${it.baseName} (redownload).docx`, blob });
      }
      const zip = await buildZipBlob(await finalizeZipEntries(files), dlFileProgress("Compressing ZIP...", items.length, items.length + 1));
      downloadBlob(zip, "MCQ-Redownload.zip");
      toast({
        title: "ZIP downloaded",
        description: `${files.length} separate file(s) — each with the picked parts.`, 
      });
    } catch (e) {
      toast({ title: "ZIP failed", description: String(e), variant: "destructive" });
    } finally {
      clearProc();
      setRdZipBusy(false);
    }
  };

  // (shuffle handlers — useShuffleMode-এ)
  // (shuffle handlers — useShuffleMode-এ)
  // ---- TEXT mode সেট অ্যাকশন ----
  // (shuffle handlers — useShuffleMode-এ)
  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-b from-brand-50/60 via-background to-background">
      {/* প্রসেস-ওভারলে — বড় ফাইলের লোড/পার্সে hang-চেহারা আটকায় (সব মোডে) */}
      <ProcessOverlay proc={proc} />
      {/* হেডার */}
      <header className="border-b bg-white/80 backdrop-blur dark:bg-background/80">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-2 px-3 py-3 sm:gap-3 sm:px-4 sm:py-4">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-600 text-white shadow-sm sm:h-11 sm:w-11">
            <Dices className="h-5 w-5 sm:h-6 sm:w-6" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-lg font-bold tracking-tight sm:text-xl md:text-2xl">MCQ Shuffler Pro</h1>
            <p className="hidden text-xs text-muted-foreground sm:block md:text-sm">
              Upload a file, pick a mode, and work — switch modes any time, your files come along
            </p>
          </div>
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
            <Badge className="gap-1 bg-brand-100 text-brand-800 hover:bg-brand-100">
              <Zap className="h-3 w-3" /> 100% free
            </Badge>
            <Badge variant="secondary" className="gap-1">
              <ShieldCheck className="h-3 w-3" /> Data stays in your browser
            </Badge>
          </div>
        </div>
      </header>

      {/* মেইন */}
      <main className="mx-auto w-full max-w-5xl flex-1 space-y-5 px-3 py-6 sm:px-4">
        {!hasAnyInput ? (
          /* ধাপ ১ — কোনো ইনপুট নেই: আগে ফাইল আপলোড (মোড-বাটন এখনো দেখায় না) */
          <UploadFirstCard
            onFiles={(fs) => void stageFiles(fs)}
            onTextFileLoaded={shuffle.loadAndDetect}
            rawText={shuffle.rawText}
            onTextChange={shuffle.handleTextChange}
            onDetect={shuffle.handleDetect}
            busy={shuffle.detecting}
          />
        ) : flowStep === "select" ? (
          /* ধাপ ২ — মোড-বাছাই: ৩টা মোড-বাটন শুধু এই ধাপেই দেখা যায়; মোডে ঢুকলেই আর দেখা যায় না */
          <div className="flex flex-col gap-4">
            {stagedFiles && stagedFiles.length > 0 && (
              <StagedFilesCard
                files={stagedFiles}
                onClear={() => setStagedFiles(null)}
                onRemoveFile={(idx) => {
                  // একটা ফাইল বাদ — শেষ ফাইলটাও বাদ পড়লে তালিকা খালি হয়ে আপলোড-কার্ডে ফিরে যায়
                  // (hasAnyInput ফলস হলে ধাপ ১ অটো দেখায়)
                  setStagedFiles((prev) => {
                    const next = (prev ?? []).filter((_, i) => i !== idx);
                    return next.length ? next : null;
                  });
                }}
                addFilesTriggerRef={stagedDzTrigger}
                maxSizeBytes={MAX_FILE_BYTES}
                onAddFiles={(fs, rej) => {
                  if (rej.notAccepted.length) {
                    toast({ title: `${rej.notAccepted.length} file(s) skipped — only .docx is supported`, variant: "destructive" });
                  }
                  for (const f of rej.tooBig) toast({ title: FILE_TOO_BIG_MSG, variant: "destructive" });
                  void stageMoreFiles(fs);
                }}
                addFilesDisabled={shuffle.detecting}
              />
            )}
            <div className="flex flex-wrap items-center gap-3">
              <ModeTabs mode={mode} onChange={changeMode} />
            </div>
            <p className="text-xs text-muted-foreground">
              Files upload only once — after selecting a mode, use the "Add files" button in the top bar to add more.
            </p>
          </div>
        ) : (
          <>
            {/* কাজ-চলাকালীন বার — ৩ মোড আর দেখানো হয় না; বাঁয়ে পেছনে (হোমে ফেরা) + Mode Change (অন্য মোডে ফাইলসহ সুইচ), ডানে আরও ফাইল */}
            <ModeWorkBar
              mode={mode}
              onBack={backToHome}
              onModeChange={changeMode}
              onAddFiles={handleAddMoreFiles}
              busy={shuffle.shuffleLoading || shuffle.docxLoading || serialLoading || rdLoading || shuffle.detecting || shuffle.shuffling || shuffle.multiShuffling || shuffle.multiMergedBusy || shuffle.multiZipBusy || shuffle.setsFileBusy !== null || shuffle.multiSetsZipBusy || serialBusy || serialMergedBusy || serialZipBusy || serialPasteBusy || serialPasteFixing || serialPasteDlBusy || rdMergedBusy || rdZipBusy || shuffle.fixing}
              filesCount={mode === "shuffle" ? shuffle.shuffleFileCount : mode === "serial" ? serialFileCount : rdFileCount}
              maxFiles={SHUFFLE_MAX_FILES}
            />
        {mode === "redownload" ? (
          <>
            <RedownloadInputCard
              loading={rdLoading}
              items={rdDocs.map((d) => ({
                id: d.id,
                name: d.file.name,
                status: "ready" as const,
                questionCount: d.parse.questions.length,
              }))}
              onReorder={reorderRdDocs}
              onRemove={removeRdDoc}
            />

            {rdDocs.length > 0 && (
              <>
                <RedownloadPartsCard
                  counts={rdTotalCounts}
                  sel={rdParts}
                  onChange={(k, v) => setRdParts((p) => ({ ...p, [k]: v }))}
                  renumber={rdRenumber}
                  onRenumberChange={setRdRenumber}
                  filesCount={rdDocs.length}
                  questionsCount={rdTotalQuestions}
                  found={rdFoundStats}
                  onApplyPreset={(parts, ren) => {
                    setRdParts(parts);
                    setRdRenumber(ren);
                    toast({ title: "Preset applied", description: "Part selection and renumber toggle restored." });
                  }}
                />

                <RedownloadQuestionsCard
                  files={rdDocs.map((d) => ({
                    id: d.id,
                    fileName: d.file.name,
                    questions: d.parse.questions,
                    selected: rdSelOf(d.id),
                    onToggle: (qid) => toggleRdQuestion(d.id, qid),
                    onSelectAll: () => selectAllRd(d.id),
                    onSelectNone: () => selectNoneRd(d.id),
                    onSelectRange: (f, t) => selectRangeRd(d.id, f, t),
                    watermark: d.watermark,
                    dominant: null,
                  }))}
                />

                {/* লেবেল-টাইপো কার্ড — সবসময় দেখায় (টাইপো থাকলে লাল, না থাকলে সবুজ "none found") */}
                <LabelTyposCard
                  typos={rdLabelTypos}
                  checked={rdFixLabels}
                  onCheckedChange={setRdFixLabels}
                />

                {/* উত্তর-কনফ্লিক্ট কার্ড — star-উত্তর আর Dt-tail উত্তর ভিন্ন হলে লাল */}
                <AnswerConflictsCard conflicts={rdAnswerConflicts} />

                <OptionLabelsCard settings={optionLabels} onChange={updateOptionLabels} />

                <FontSettingsCard settings={fontSettings} onChange={updateFontSettings} />

                <MultiDownloadCard
                  title={rdDocs.length === 1 ? "4. Download — new file from picked parts" : "4. Download — picked parts of all files"}
                  description={
                    rdDocs.length === 1
                      ? "A new .docx from the ticked questions' picked parts — tabs, equations, watermark all intact."
                      : "All files in order in one .docx (page breaks between files) or download them separately in a ZIP."
                  }
                  stats={`${rdDocs.length} file(s) • ${rdSelTotal} question(s) selected`}
                  onDownloadMerged={handleRdMerged}
                  onDownloadZip={handleRdZip}
                  mergedBusy={rdMergedBusy}
                  zipBusy={rdZipBusy}
                  fileCount={rdDocs.length}
                  format={downloadFormat}
                  onFormatChange={updateDownloadFormat}
                />

                <NextModesCard current="redownload" filesCount={rdFileCount} onOpen={changeMode} />
              </>
            )}
          </>
        ) : mode === "serial" ? (
          <>
            <SerialInputCard
              loading={serialLoading}
              items={serialDocs.map((d) => ({
                id: d.id,
                name: d.file.name,
                status: "ready" as const,
                questionCount: d.analysis.questionCount,
              }))}
              onReorder={reorderSerialDocs}
              onRemove={removeSerialDoc}
            />

            {/* আউটপুট ফাইলের ফন্ট-রিম্যাপ কার্ড — সিঙ্গেল (রঙ-সিরিয়াল/কন্টিনিউয়াস) ও মাল্টি (মার্জ/ZIP) ডাউনলোড দুই পাথেই প্রয়োগ হয় */}
            <FontSettingsCard settings={fontSettings} onChange={updateFontSettings} />

            {/* ঠিক ১ টা ফাইল — পুরনো রঙ-চিপ কার্ড */}
            {serialDocs.length === 1 && serialDoc ? (
              serialDoc.analysis.colors.length > 0 ? (
                <ColorSerialCard
                  analysis={serialDoc.analysis}
                  fileName={serialDoc.file.name}
                  busy={serialBusy}
                  onSerial={handleColorSerial}
                  format={downloadFormat}
                  onFormatChange={updateDownloadFormat}
                />
              ) : (
                <NoColorSerialCard
                  questionCount={serialDoc.analysis.questionCount}
                  busy={serialBusy}
                  onContinuous={() => handleColorSerial({ kind: "continuous" }, "continuous")}
                  format={downloadFormat}
                  onFormatChange={updateDownloadFormat}
                />
              )
            ) : null}

            {/* ≥২ ফাইল — প্রতি ফাইলের সিরিয়াল-স্কিম + মার্জ (.docx) / ZIP ডাউনলোড */}
            {serialDocs.length >= 2 && (
              <>
                <MultiSerialSchemeCard
                  docs={serialDocs.map((d) => ({ id: d.id, name: d.file.name, analysis: d.analysis }))}
                  schemes={serialSchemes}
                  onSchemeChange={(id, scheme) => setSerialSchemes((prev) => ({ ...prev, [id]: scheme }))}
                />
                <MultiDownloadCard
                  title="Serial all files together"
                  description="Color headers, equations and images stay intact. Files with colored headers can restart at 1 per section (scheme card above); files without colors always run continuous 1,2,3…"
                  stats={`${serialDocs.length} file(s) • ${serialDocs.reduce((a, d) => a + d.analysis.questionCount, 0)} question(s) in total`}
                  showSerialChoice
                  serialStrategy={serialStrategy}
                  onSerialStrategyChange={setSerialStrategy}
                  onDownloadMerged={handleSerialMultiMerged}
                  onDownloadZip={handleSerialMultiZip}
                  mergedBusy={serialMergedBusy}
                  zipBusy={serialZipBusy}
                  fileCount={serialDocs.length}
                  format={downloadFormat}
                  onFormatChange={updateDownloadFormat}
                />
                <NextModesCard current="serial" filesCount={serialFileCount} onOpen={changeMode} />
              </>
            )}

            {/* ঠিক ১ ফাইল — ডাউনলোড-কার্ডের নিচেই বাকি মোডে ফাইল নিয়ে যাওয়ার বাটন */}
            {serialDocs.length === 1 && (
              <NextModesCard current="serial" filesCount={serialFileCount} onOpen={changeMode} />
            )}
          </>
        ) : (
          <>
            {shuffle.shuffleItems ? (
              <>
                {/* মাল্টি-ফাইল লিস্ট — টেনে ক্রম বদলানো যায় */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base md:text-lg">
                      Uploaded files ({shuffle.shuffleItems.length})
                    </CardTitle>
                    <CardDescription>
                      Drag or use the arrows to reorder — merge/ZIP keeps exactly this order. Each file is shuffled within itself.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <MultiFileList
                      items={shuffle.shuffleItems.map((it) => ({
                        id: it.id,
                        name: it.file.name,
                        status: "ready" as const,
                        questionCount: it.parse.questions.length,
                      }))}
                      onReorder={shuffle.reorderShuffleItems}
                      onRemove={shuffle.removeShuffleItem}
                      disabled={shuffle.shuffleLoading || shuffle.multiShuffling}
                    />
                  </CardContent>
                </Card>

                {shuffle.shuffleItems.some((i) => i.blocked.length > 0) && (
                  <BlockedLinesCard blocked={shuffle.shuffleItems.flatMap((i) => i.blocked)} />
                )}

                <ShuffleCard
                  enabled={shuffle.multiGateReason === null}
                  lockReason={shuffle.multiGateReason}
                  selectedCount={shuffle.shuffleMultiTotal}
                  setCount={shuffle.setCount}
                  onSetCountChange={shuffle.setSetCount}
                  distribution={shuffle.distribution}
                  onDistributionChange={shuffle.setDistribution}
                  shuffleWithin={shuffle.shuffleWithin}
                  onShuffleWithinChange={shuffle.setShuffleWithin}
                  onShuffle={shuffle.handleShuffle}
                  shuffling={shuffle.multiShuffling}
                  refReport={shuffle.multiRefReport}
                  refMode={shuffle.refMode}
                  onRefModeChange={shuffle.setRefMode}
                />

                {/* ডুপ্লিকেট-প্রশ্ন কার্ড — একাধিক ফাইলে একই প্রশ্ন থাকলে লাল (Phase 3 #9) */}
                <DuplicateQuestionsCard groups={shuffle.shuffleDuplicates} />

                <div ref={resultsRef} className="scroll-mt-4">
                  {shuffle.shuffleMultiSets && (
                    <>
                      <ShuffleMultiSetsCard
                        files={shuffle.shuffleItems.map((it, i) => ({
                          id: it.id,
                          fileName: it.file.name,
                          setIds: shuffle.shuffleMultiSets?.[i] ?? [],
                          questions: it.parse.questions,
                          renumber: shuffle.fileRenumber(it.id),
                        }))}
                        busyFileId={shuffle.setsFileBusy}
                        disabled={shuffle.multiMergedBusy || shuffle.multiZipBusy || shuffle.multiSetsZipBusy || shuffle.multiShuffling}
                        onDownloadFileSets={shuffle.handleMultiFileSetsDownload}
                        onRenumberChange={shuffle.toggleFileRenumber}
                      />
                      <div className="mt-5">
                        <MultiDownloadCard
                          title="Shuffle complete — download now"
                          description={
                            // Serial-replace এখন প্রতি ফাইলে আলাদা (Serial switch উপরে) —
                            // সব ফাইল original হলে "serials 1,2,3…" লেখা মিথ্যা হতো।
                            shuffle.shuffleItems.every((it) => shuffle.fileRenumber(it.id))
                              ? "Each file's sets on separate pages, serials 1,2,3…."
                              : shuffle.shuffleItems.some((it) => shuffle.fileRenumber(it.id))
                                ? "Each file's sets on separate pages — serials follow each file's Serial switch above."
                                : "Each file's sets on separate pages, with the questions' original numbers."
                          }
                          stats={`${shuffle.shuffleItems.length} file(s) • ${shuffle.multiEffectiveSets} set(s) per file`}
                          onDownloadMerged={shuffle.handleMultiMergedDownload}
                          onDownloadZip={shuffle.handleMultiZipDownload}
                          mergedBusy={shuffle.multiMergedBusy}
                          zipBusy={shuffle.multiZipBusy}
                          onDownloadSetsZip={shuffle.handleMultiAllSetsZip}
                          setsZipBusy={shuffle.multiSetsZipBusy}
                          fileCount={shuffle.shuffleItems.length}
                          format={downloadFormat}
                          onFormatChange={updateDownloadFormat}
                        />
                      </div>
                    </>
                  )}
                </div>

                <NextModesCard current="shuffle" filesCount={shuffle.shuffleFileCount} onOpen={changeMode} />
              </>
            ) : shuffle.docx ? (
              <>
                {shuffle.docx.colorAn && (
                  <ColorShuffleInfoCard
                    analysis={shuffle.docx.colorAn}
                    headersStripped={shuffle.docx.headersStripped}
                    fileName={shuffle.docx.file.name}
                    onOpenSerial={openInSerialMode}
                  />
                )}

                {shuffle.docx.blocked.length > 0 && <BlockedLinesCard blocked={shuffle.docx.blocked} />}

                {shuffle.docx.parse && (
                  <DocxDetectCard
                    parse={shuffle.docx.parse}
                    fileName={shuffle.docx.file.name}
                    selected={shuffle.selected}
                    onToggle={shuffle.toggleQuestion}
                    onSelectAll={shuffle.selectAll}
                    onSelectNone={shuffle.selectNone}
                    onSelectRange={shuffle.selectRange}
                    encStats={shuffle.encData.stats}
                    dominant={shuffle.encData.dominant}
                  />
                )}

                <ShuffleCard
                  enabled={shuffle.canShuffle}
                  lockReason={shuffle.gateReason ?? null}
                  selectedCount={shuffle.selected.size}
                  setCount={shuffle.setCount}
                  onSetCountChange={shuffle.setSetCount}
                  distribution={shuffle.distribution}
                  onDistributionChange={shuffle.setDistribution}
                  shuffleWithin={shuffle.shuffleWithin}
                  onShuffleWithinChange={shuffle.setShuffleWithin}
                  onShuffle={shuffle.handleShuffle}
                  shuffling={shuffle.shuffling}
                  refReport={shuffle.docxRefReport}
                  refMode={shuffle.refMode}
                  onRefModeChange={shuffle.setRefMode}
                />

                <div ref={resultsRef} className="scroll-mt-4">
                  {shuffle.setsDocx && shuffle.docx.parse && (
                    <DocxSetsResult
                      sets={shuffle.setsDocx}
                      questions={shuffle.docx.parse.questions}
                      renumber={shuffle.renumber}
                      onRenumberChange={shuffle.toggleSerialByClick}
                      busy={shuffle.busy}
                      copiedSet={shuffle.copiedSet}
                      onDownload={shuffle.handleDocxDownload}
                      onDownloadSets={shuffle.handleDocxDownloadSets}
                      onCopySet={shuffle.handleDocxCopySet}
                      dominant={shuffle.encData.dominant}
                      format={downloadFormat}
                      onFormatChange={updateDownloadFormat}
                    />
                  )}
                </div>

                <NextModesCard current="shuffle" filesCount={shuffle.shuffleFileCount} onOpen={changeMode} />
              </>
            ) : (
              <>
                <DetectCard
                  parsed={shuffle.parsed}
                  selected={shuffle.selected}
                  onToggle={shuffle.toggleQuestion}
                  onSelectAll={shuffle.selectAll}
                  onSelectNone={shuffle.selectNone}
                  onSelectRange={shuffle.selectRange}
                  onAutoFix={shuffle.handleAutoFix}
                  allowBroken={shuffle.allowBroken}
                  onAllowBrokenChange={shuffle.setAllowBroken}
                  fixing={shuffle.fixing}
                  encStats={shuffle.encData.stats}
                  dominant={shuffle.encData.dominant}
                />

                <ShuffleCard
                  enabled={shuffle.canShuffle}
                  lockReason={shuffle.parsed ? shuffle.gateReason : "Detect questions first"}
                  selectedCount={shuffle.selected.size}
                  setCount={shuffle.setCount}
                  onSetCountChange={shuffle.setSetCount}
                  distribution={shuffle.distribution}
                  onDistributionChange={shuffle.setDistribution}
                  shuffleWithin={shuffle.shuffleWithin}
                  onShuffleWithinChange={shuffle.setShuffleWithin}
                  onShuffle={shuffle.handleShuffle}
                  shuffling={shuffle.shuffling}
                  refReport={null}
                  refMode={shuffle.refMode}
                  onRefModeChange={shuffle.setRefMode}
                />

                <div ref={resultsRef} className="scroll-mt-4">
                  {shuffle.sets && (
                    <SetsResult
                      sets={shuffle.sets}
                      sortedFlags={shuffle.sortedFlags}
                      onToggleSort={shuffle.toggleSort}
                      onReshuffleSet={shuffle.reshuffleSet}
                      exportOpts={shuffle.exportOpts}
                      onExportOptsChange={shuffle.setExportOpts}
                      onExportDocx={shuffle.handleExportDocx}
                      onExportSets={shuffle.handleExportSetsZip}
                      onExportDoc={shuffle.handleExportDoc}
                      onPrint={shuffle.handlePrint}
                      onCopySet={shuffle.handleCopySet}
                      onCopyAll={shuffle.handleCopyAll}
                      busy={shuffle.busy}
                      copiedSet={shuffle.copiedSet}
                      dominant={shuffle.encData.dominant}
                      format={downloadFormat}
                      onFormatChange={updateDownloadFormat}
                    />
                  )}
                </div>

                {/* টেক্সট-ফ্লোতে ফাইল নেই — NextModesCard নিজেই null রেন্ডার করে */}
                <NextModesCard current="shuffle" filesCount={shuffle.shuffleFileCount} onOpen={changeMode} />
              </>
            )}
          </>
        )}
          </>
        )}
      </main>

      {/* ফুটার */}
      <footer className="mt-auto border-t bg-white/60 py-4 dark:bg-background/60">
        <div className="mx-auto max-w-5xl px-4 text-center text-xs text-muted-foreground">
          MCQ Shuffler Pro — everything runs in your browser; no question ever leaves your device.
        </div>
      </footer>
    </div>
  );
}
