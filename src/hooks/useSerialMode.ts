"use client";

/**
 * Phase 3-C slice 2 — COPY-ONLY extraction of serial-mode logic from src/app/page.tsx.
 *
 * - page.tsx থেকে COPY করা (কোনো line কাটা/মুছা হয়নি, page.tsx untouched — 3-D-তে wire হবে)।
 * - এই hook এখনো page.tsx-এ wire করা হয়নি — compile+unused থাকে, runtime-এ কোনো প্রভাব নেই।
 * - শেয়ার্ড helper (proc-overlay, finalizeDownload, font/downloadFormat persisted,
 *   nextMultiId) page.tsx থেকে PARAM-এ আসে (ShuffleDeps pattern) — hook-এর নিজের
 *   duplicate persisted instance নেই (3-B-এর stale-desync গর্ত এড়ানো)।
 * - app-level state (staging/mode/flowStep) লাগে শুধু openInSerialMode-এ — সেটা optional
 *   CALLBACK param (shuffle-এর onParsed-এর মতন), guard-সহ behavior-parity।
 */

import { useState } from "react";
import {
  autoFixNumbering,
  parseMcq,
  type ParseOutput,
} from "@/lib/mcq/parser";
import {
  downloadBlob,
  buildSetsDocxBlob,
  DEFAULT_EXPORT_OPTIONS,
} from "@/lib/mcq/exporter";
import {
  analyzeColorDocx,
  applyColorSerialXml,
  buildColorSerialDocxBlob,
  planSerialByColor,
  type ColorAnalysis,
  type SerialScheme,
} from "@/lib/mcq/color-serial";
import {
  buildMergedDocxBlob,
  buildZipBlob,
  offsetSerialPlan,
  replaceDocumentXml,
} from "@/lib/mcq/multi-docx";
import { renumberQuestionsByPosition } from "@/lib/mcq/serial-paste";
import {
  FILE_TOO_BIG_MSG,
  runFilePipeline,
  type PipelineProgress,
} from "@/lib/mcq/file-pipeline";
import { SHUFFLE_MAX_FILES } from "@/lib/mcq/limits";
import { toast } from "@/hooks/use-toast";
import { type FontSettings } from "@/lib/mcq/font-remap";
import { type DownloadFormat } from "@/lib/mcq/pdf-export";
import { type SerialStrategy } from "@/components/mcq/multi-download-card";

/** সিরিয়াল মোডের আলাদা স্টেট — এখন একাধিক ফাইলও থাকতে পারে (লিস্ট-ক্রমেই আউটপুট) */
export interface SerialState {
  id: string;
  file: File;
  baseName: string;
  xml: string;
  analysis: ColorAnalysis;
}

/**
 * openInSerialMode-এর handoff-doc (shuffle-mode-এর রঙ-ফাইল) — page.tsx-এর DocxState
 * structurally assignable (file/baseName/originalXml/colorAn মিললেই চলে)।
 */
export interface SerialHandoffDoc {
  file: File;
  baseName: string;
  /** সিরিয়াল মোডে অরিজিনাল xml লাগে — রঙ-ইনডেক্স অরিজিনাল ফাইলের সাথে মেলে */
  originalXml: string;
  colorAn: ColorAnalysis | null;
}

export interface SerialDeps {
  fontSettings: FontSettings;
  downloadFormat: DownloadFormat;
  finalizeDownload: (docxOut: { blob: Blob; fileName: string }) => Promise<void>;
  finalizeZipEntries: (
    entries: Array<{ name: string; blob: Blob }>
  ) => Promise<Array<{ name: string; blob: Blob }>>;
  nextMultiId: () => string;
  yieldToUI: () => Promise<void>;
  setProcStage: (stage: string, pct: number | null, fileNo?: number, fileTotal?: number, name?: string) => void;
  clearProc: () => void;
  pipelineReport: (p: PipelineProgress) => void;
  dlFileProgress: (
    stage: string,
    i: number,
    n: number,
    name?: string
  ) => ((frac: number) => void) | undefined;
  loadersBusyRef: { current: boolean };
  /**
   * shuffle→serial handoff-এর app-level অংশ (page.tsx: setStagedFiles(null) +
   * changeMode("serial", true) [skipCarry]) — guard-সহ behavior-parity।
   */
  onOpenSerial?: () => void;
}

/**
 * Serial-mode state + handlers — page.tsx-এর serial slice এখন এখানেই single source (copy)।
 * Shared helper page.tsx থেকে param-এ আসে — কোনো duplicate নেই।
 */
export function useSerialMode(deps: SerialDeps) {
  const {
    fontSettings,
    downloadFormat,
    finalizeDownload,
    finalizeZipEntries,
    nextMultiId,
    yieldToUI,
    setProcStage,
    clearProc,
    pipelineReport,
    dlFileProgress,
    loadersBusyRef,
    onOpenSerial,
  } = deps;

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

  // ================== SERIAL MODE (সম্পূর্ণ আলাদা ওয়ার্কফ্লো) ==================

  /** .docx লোড + রঙ-বিশ্লেষণ — একাধিক হলে লিস্টে বসে; append=false হলে লিস্ট বদলে যায় */
  const loadSerialFiles = async (files: File[], append: boolean) => {
    // সাইজ ক্যাপ — ৫০ ফাইল / MAX_FILE_BYTES (৫০MB) per file (shuffle-এর মতোই সব মোডে)
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

  /**
   * শাফল মোডে উঠা রঙ-ফাইল সিরিয়াল মোডে খোলা (ফাইল নিজেই চলে যায়, আবার আপলোড লাগে না)।
   * page.tsx-এর version-এর হুবহু copy — শুধু shuffle-docx arg-এ আসে + app-level
   * অংশ (setStagedFiles/changeMode) onOpenSerial callback-এ যায়। Guard + toast হুবহু।
   */
  const openInSerialMode = (doc: SerialHandoffDoc | null) => {
    if (!doc?.colorAn) return;
    const id = nextMultiId();
    setSerialDocs([
      {
        id,
        file: doc.file,
        baseName: doc.baseName,
        // সিরিয়াল মোডে অরিজিনাল xml লাগে — রঙ-ইনডেক্স অরিজিনাল ফাইলের সাথে মেলে
        xml: doc.originalXml,
        analysis: doc.colorAn,
      },
    ]);
    setSerialSchemes({ [id]: { kind: "continuous" } });
    setSerialPaste(null);
    // app-level: page.tsx-এ setStagedFiles(null) + carry-বাইপাস changeMode("serial", true)
    // (carryToMode স্টেল serialDocs=[] পড়ে ফাইলটা আবার লোড করত — ডাবল-বিশ্লেষণ + ডাবল-টোস্ট ঠেকাতে)
    onOpenSerial?.();
    toast({
      title: "File opened in Serial mode",
      description: "Pick a color below and download the serial file.",
    });
  };

  return {
    // state
    serialDocs, setSerialDocs,
    serialLoading, serialBusy, serialMergedBusy, serialZipBusy,
    serialStrategy, setSerialStrategy,
    serialSchemes, setSerialSchemes,
    serialPasteText, setSerialPasteText,
    serialPaste, setSerialPaste,
    serialPasteBusy, serialPasteFixing, serialPasteDlBusy,
    // derived
    serialDoc,
    // handlers — file flow
    loadSerialFiles, reorderSerialDocs, removeSerialDoc,
    handleColorSerial, handleSerialMultiMerged, handleSerialMultiZip,
    // handlers — paste flow
    handleSerialPasteDetect, handleSerialPasteFix, handleSerialPasteDownload,
    // handlers — cross-mode handoff
    openInSerialMode,
  };
}

export type SerialMode = ReturnType<typeof useSerialMode>;
