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
import { useSerialMode } from "@/hooks/useSerialMode";
import { useRedownloadMode } from "@/hooks/useRedownloadMode";

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
// (SerialState — useSerialMode-এ)
/** রিডাউনলোড মোডের আলাদা স্টেট — একাধিক ফাইল, প্রতি ফাইলের অংশ-বিশ্লেষণ */
// (RdDocState — useRedownloadMode-এ)
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
  // ================== SERIAL MODE (hook — single source of truth) ==================
  const serial = useSerialMode({
    fontSettings, downloadFormat,
    finalizeDownload, finalizeZipEntries,
    nextMultiId, yieldToUI, setProcStage,
    clearProc, pipelineReport,
    dlFileProgress, loadersBusyRef,
    onOpenSerial: () => { setStagedFiles(null); changeMode("serial", true); },
  });
  // ================== REDOWNLOAD MODE (hook — single source of truth) ==================
  const rd = useRedownloadMode({
    fontSettings, finalizeDownload,
    finalizeZipEntries, nextMultiId,
    yieldToUI, setProcStage, clearProc,
    pipelineReport, dlFileProgress,
    loadersBusyRef,
  });

  // ---- ফ্লো-ধাপ: "select" = মোড-বাছাই (৩টা মোড-বাটন শুধু এখানেই), "work" = মোডের ভিতরে কাজ ----
  // মোডে ঢোকার পর ৩টা মোড-বাটন আর দেখানো হয় না — উপরে থাকে পেছনে + আরও-ফাইল বার
  const [flowStep, setFlowStep] = useState<"select" | "work">("select");

  // (shuffle input/config state — useShuffleMode-এ)


  // (আউটপুট ফন্ট-রিম্যাপ + "Download as" ফরম্যাট — useSharedServices-এ)

  // (shuffle results state — useShuffleMode-এ)


  // (serial state — useSerialMode-এ)


  // (shuffle multi-file state — useShuffleMode-এ)


  // (redownload state — useRedownloadMode-এ)


  // (redownload derived — useRedownloadMode-এ)
  // (shuffle ref-report/duplicate memos — useShuffleMode-এ)


  // ---- ফ্লো-গেট: কোনো ইনপুট নেই → আগে আপলোড-কার্ড; ইনপুট আছে → ৩ মোড-বাটন ----
  const hasAnyInput =
    !!stagedFiles?.length ||
    !!shuffle.docx ||
    !!shuffle.shuffleItems ||
    serial.serialDocs.length > 0 ||
    !!serial.serialPaste ||
    rd.rdDocs.length > 0 ||
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
  const serialFileCount = serial.serialDocs.length;
  const rdFileCount = rd.rdDocs.length;

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
    serial.setSerialDocs([]);
    serial.setSerialSchemes({});
    serial.setSerialPaste(null);
    serial.setSerialPasteText("");
    rd.setRdDocs([]);
    rd.setRdSel({});
    shuffle.resetResults();
    setFlowStep("select"); // hasAnyInput ফলস হলেই অটো ধাপ ১ (আপলোড-কার্ড) দেখাবে
  };

  /** কাজ-চলাকালীন "আরও ফাইল" — নতুন ফাইল বর্তমান মোডেই যোগ (append) হয় */
  const handleAddMoreFiles = (files: File[]) => {
    if (!files.length) return;
    if (mode === "serial") serial.loadSerialFiles(files, true);
    else if (mode === "redownload") rd.loadRedownloadFiles(files, true);
    else shuffle.handleShuffleFiles(files, true);
  };

  // ================== মোডের মাঝে ফাইল বহন (carry-over) ==================

  /** মোডে এখন কাজের ডেটা আছে কি না (আছে হলে ছুঁই না — ইউজারের কাজ নষ্ট হবে না) */
  const modeHasContent = (m: McqMode): boolean =>
    m === "shuffle"
      ? !!(shuffle.docx || shuffle.shuffleItems || (shuffle.parsed && shuffle.parsed.questions.length > 0))
      : m === "serial"
        ? serial.serialDocs.length > 0 || !!serial.serialPaste
        : rd.rdDocs.length > 0;

  /** মোডে থাকা ফাইলগুলো (File অবজেক্ট) — অন্য মোডে বহনের জন্য */
  const filesOfMode = (m: McqMode): File[] =>
    m === "shuffle"
      ? shuffle.shuffleItems
        ? shuffle.shuffleItems.map((i) => i.file)
        : shuffle.docx
          ? [shuffle.docx.file]
          : []
      : m === "serial"
        ? serial.serialDocs.map((d) => d.file)
        : rd.rdDocs.map((d) => d.file);

  /** ফাইল একটা মোডে লোড — প্রতিটা মোডের নিজের লোডার ব্যবহার করে */
  const loadIntoMode = (m: McqMode, files: File[]) => {
    if (m === "shuffle") shuffle.handleShuffleFiles(files);
    else if (m === "serial") serial.loadSerialFiles(files, false);
    else rd.loadRedownloadFiles(files, false);
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
  // (serial handlers + openInSerialMode — useSerialMode-এ)
  // (redownload handlers — useRedownloadMode-এ)


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
              busy={shuffle.shuffleLoading || shuffle.docxLoading || serial.serialLoading || rd.rdLoading || shuffle.detecting || shuffle.shuffling || shuffle.multiShuffling || shuffle.multiMergedBusy || shuffle.multiZipBusy || shuffle.setsFileBusy !== null || shuffle.multiSetsZipBusy || serial.serialBusy || serial.serialMergedBusy || serial.serialZipBusy || serial.serialPasteBusy || serial.serialPasteFixing || serial.serialPasteDlBusy || rd.rdMergedBusy || rd.rdZipBusy || shuffle.fixing}
              filesCount={mode === "shuffle" ? shuffle.shuffleFileCount : mode === "serial" ? serialFileCount : rdFileCount}
              maxFiles={SHUFFLE_MAX_FILES}
            />
        {mode === "redownload" ? (
          <>
            <RedownloadInputCard
              loading={rd.rdLoading}
              items={rd.rdDocs.map((d) => ({
                id: d.id,
                name: d.file.name,
                status: "ready" as const,
                questionCount: d.parse.questions.length,
              }))}
              onReorder={rd.reorderRdDocs}
              onRemove={rd.removeRdDoc}
            />

            {rd.rdDocs.length > 0 && (
              <>
                <RedownloadPartsCard
                  counts={rd.rdTotalCounts}
                  sel={rd.rdParts}
                  onChange={(k, v) => rd.setRdParts((p) => ({ ...p, [k]: v }))}
                  renumber={rd.rdRenumber}
                  onRenumberChange={rd.setRdRenumber}
                  filesCount={rd.rdDocs.length}
                  questionsCount={rd.rdTotalQuestions}
                  found={rd.rdFoundStats}
                  onApplyPreset={(parts, ren) => {
                    rd.setRdParts(parts);
                    rd.setRdRenumber(ren);
                    toast({ title: "Preset applied", description: "Part selection and renumber toggle restored." });
                  }}
                />

                <RedownloadQuestionsCard
                  files={rd.rdDocs.map((d) => ({
                    id: d.id,
                    fileName: d.file.name,
                    questions: d.parse.questions,
                    selected: rd.rdSelOf(d.id),
                    onToggle: (qid) => rd.toggleRdQuestion(d.id, qid),
                    onSelectAll: () => rd.selectAllRd(d.id),
                    onSelectNone: () => rd.selectNoneRd(d.id),
                    onSelectRange: (f, t) => rd.selectRangeRd(d.id, f, t),
                    watermark: d.watermark,
                    dominant: null,
                  }))}
                />

                {/* লেবেল-টাইপো কার্ড — সবসময় দেখায় (টাইপো থাকলে লাল, না থাকলে সবুজ "none found") */}
                <LabelTyposCard
                  typos={rd.rdLabelTypos}
                  checked={rd.rdFixLabels}
                  onCheckedChange={rd.setRdFixLabels}
                />

                {/* উত্তর-কনফ্লিক্ট কার্ড — star-উত্তর আর Dt-tail উত্তর ভিন্ন হলে লাল */}
                <AnswerConflictsCard conflicts={rd.rdAnswerConflicts} />

                <OptionLabelsCard settings={rd.optionLabels} onChange={rd.updateOptionLabels} />

                <FontSettingsCard settings={fontSettings} onChange={updateFontSettings} />

                <MultiDownloadCard
                  title={rd.rdDocs.length === 1 ? "4. Download — new file from picked parts" : "4. Download — picked parts of all files"}
                  description={
                    rd.rdDocs.length === 1
                      ? "A new .docx from the ticked questions' picked parts — tabs, equations, watermark all intact."
                      : "All files in order in one .docx (page breaks between files) or download them separately in a ZIP."
                  }
                  stats={`${rd.rdDocs.length} file(s) • ${rd.rdSelTotal} question(s) selected`}
                  onDownloadMerged={rd.handleRdMerged}
                  onDownloadZip={rd.handleRdZip}
                  mergedBusy={rd.rdMergedBusy}
                  zipBusy={rd.rdZipBusy}
                  fileCount={rd.rdDocs.length}
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
              loading={serial.serialLoading}
              items={serial.serialDocs.map((d) => ({
                id: d.id,
                name: d.file.name,
                status: "ready" as const,
                questionCount: d.analysis.questionCount,
              }))}
              onReorder={serial.reorderSerialDocs}
              onRemove={serial.removeSerialDoc}
            />

            {/* আউটপুট ফাইলের ফন্ট-রিম্যাপ কার্ড — সিঙ্গেল (রঙ-সিরিয়াল/কন্টিনিউয়াস) ও মাল্টি (মার্জ/ZIP) ডাউনলোড দুই পাথেই প্রয়োগ হয় */}
            <FontSettingsCard settings={fontSettings} onChange={updateFontSettings} />

            {/* ঠিক ১ টা ফাইল — পুরনো রঙ-চিপ কার্ড */}
            {serial.serialDocs.length === 1 && serial.serialDoc ? (
              serial.serialDoc.analysis.colors.length > 0 ? (
                <ColorSerialCard
                  analysis={serial.serialDoc.analysis}
                  fileName={serial.serialDoc.file.name}
                  busy={serial.serialBusy}
                  onSerial={serial.handleColorSerial}
                  format={downloadFormat}
                  onFormatChange={updateDownloadFormat}
                />
              ) : (
                <NoColorSerialCard
                  questionCount={serial.serialDoc.analysis.questionCount}
                  busy={serial.serialBusy}
                  onContinuous={() => serial.handleColorSerial({ kind: "continuous" }, "continuous")}
                  format={downloadFormat}
                  onFormatChange={updateDownloadFormat}
                />
              )
            ) : null}

            {/* ≥২ ফাইল — প্রতি ফাইলের সিরিয়াল-স্কিম + মার্জ (.docx) / ZIP ডাউনলোড */}
            {serial.serialDocs.length >= 2 && (
              <>
                <MultiSerialSchemeCard
                  docs={serial.serialDocs.map((d) => ({ id: d.id, name: d.file.name, analysis: d.analysis }))}
                  schemes={serial.serialSchemes}
                  onSchemeChange={(id, scheme) => serial.setSerialSchemes((prev) => ({ ...prev, [id]: scheme }))}
                />
                <MultiDownloadCard
                  title="Serial all files together"
                  description="Color headers, equations and images stay intact. Files with colored headers can restart at 1 per section (scheme card above); files without colors always run continuous 1,2,3…"
                  stats={`${serial.serialDocs.length} file(s) • ${serial.serialDocs.reduce((a, d) => a + d.analysis.questionCount, 0)} question(s) in total`}
                  showSerialChoice
                  serialStrategy={serial.serialStrategy}
                  onSerialStrategyChange={serial.setSerialStrategy}
                  onDownloadMerged={serial.handleSerialMultiMerged}
                  onDownloadZip={serial.handleSerialMultiZip}
                  mergedBusy={serial.serialMergedBusy}
                  zipBusy={serial.serialZipBusy}
                  fileCount={serial.serialDocs.length}
                  format={downloadFormat}
                  onFormatChange={updateDownloadFormat}
                />
                <NextModesCard current="serial" filesCount={serialFileCount} onOpen={changeMode} />
              </>
            )}

            {/* ঠিক ১ ফাইল — ডাউনলোড-কার্ডের নিচেই বাকি মোডে ফাইল নিয়ে যাওয়ার বাটন */}
            {serial.serialDocs.length === 1 && (
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
                    onOpenSerial={() => serial.openInSerialMode(shuffle.docx)}
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
