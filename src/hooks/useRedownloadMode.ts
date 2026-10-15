"use client";

/**
 * Phase 3-E slice 3 — COPY-ONLY extraction of redownload-mode logic from src/app/page.tsx.
 *
 * - page.tsx থেকে COPY করা (কোনো line কাটা/মুছা হয়নি, page.tsx untouched — 3-F-তে wire হবে)।
 * - এই hook এখনো page.tsx-এ wire করা হয়নি — compile+unused থাকে, runtime-এ কোনো প্রভাব নেই।
 * - শেয়ার্ড helper (proc-overlay, finalizeDownload, fontSettings, nextMultiId, loader-guard)
 *   page.tsx থেকে PARAM-এ আসে (ShuffleDeps/SerialDeps pattern) — শুধু আসলে-ব্যবহৃতগুলোই।
 * - REDOWNLOAD-ONLY persisted কী (option-label settings, label-fix toggle) hook-এর ভেতরে
 *   usePersistedJson-এ থাকে — 3-F wiring-এ page.tsx-এর কপি CUT হবে (single source)।
 * - App-level callback লাগেনি: redownload slice-এ staging/mode/flowStep-এর কোনো
 *   ব্যবহার নেই (loader files-arg-এ পায় — page-এর dispatcher দেয়)।
 */

import { useMemo, useState } from "react";
import {
  buildRedownloadXml,
  DEFAULT_PART_SELECTION,
  parseRedownloadXml,
  extractWatermark,
  type PartKind,
  type PartSel,
  type RdParseResult,
  type WatermarkInfo,
} from "@/lib/mcq/redownload";
import { remapDominantOf } from "@/lib/mcq/repack-docx";
import type { FontSettings, RemapDominant } from "@/lib/mcq/font-remap";
import {
  buildMergedDocxBlob,
  buildZipBlob,
  replaceDocumentXml,
} from "@/lib/mcq/multi-docx";
import { downloadBlob } from "@/lib/mcq/exporter";
import {
  FILE_TOO_BIG_MSG,
  runFilePipeline,
  type PipelineProgress,
} from "@/lib/mcq/file-pipeline";
import { SHUFFLE_MAX_FILES } from "@/lib/mcq/limits";
import { toast } from "@/hooks/use-toast";
import { usePersistedJson } from "@/hooks/use-persisted-state";
import {
  DEFAULT_OPTION_LABEL_SETTINGS,
  sanitizeOptionLabelSettings,
  type OptionLabelSettings,
} from "@/lib/mcq/option-labels";
import { type LabelTypoRow } from "@/components/mcq/label-typos-card";
import { answerConflictRowsOf, type AnswerConflictRow } from "@/components/mcq/answer-conflicts-card";

/** রিডাউনলোডের অপশন-লেবেল কাস্টমাইজ সেটিংস (persisted — REDOWNLOAD-ONLY, 3-F-এ page-এর কপি কাটবে) */
const OPTION_LABELS_KEY = "mcq-option-labels";
/** অপশন-লেবেল টাইপো অটো-ফিক্স (ডিফল্ট OFF — ডাউনলোড হুবহু) (persisted — REDOWNLOAD-ONLY) */
const RD_FIX_LABELS_KEY = "mcq-rd-fix-labels";

/** রিডাউনলোড মোডের আলাদা স্টেট — একাধিক ফাইল, প্রতি ফাইলের অংশ-বিশ্লেষণ */
export interface RdDocState {
  id: string;
  file: File;
  baseName: string;
  xml: string;
  parse: RdParseResult;
  watermark: WatermarkInfo | null;
}

export interface RedownloadDeps {
  fontSettings: FontSettings;
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
}

/**
 * Redownload-mode state + handlers — page.tsx-এর redownload slice এখন এখানেই single source (copy)।
 * Shared helper page.tsx থেকে param-এ আসে — কোনো duplicate shared instance নেই।
 */
export function useRedownloadMode(deps: RedownloadDeps) {
  const {
    fontSettings,
    finalizeDownload,
    finalizeZipEntries,
    nextMultiId,
    yieldToUI,
    setProcStage,
    clearProc,
    pipelineReport,
    dlFileProgress,
    loadersBusyRef,
  } = deps;

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

  return {
    // state
    rdDocs, setRdDocs,
    rdLoading, setRdLoading,
    rdSel, setRdSel,
    rdParts, setRdParts,
    rdRenumber, setRdRenumber,
    optionLabels, updateOptionLabels,
    rdFixLabels, setRdFixLabels,
    rdMergedBusy, rdZipBusy,
    // derived
    rdTotalCounts, rdTotalQuestions, rdSelTotal, rdFoundStats,
    rdLabelTypos, rdAnswerConflicts,
    // handlers
    loadRedownloadFiles, reorderRdDocs, removeRdDoc,
    rdSelOf, toggleRdQuestion, selectAllRd, selectNoneRd, selectRangeRd,
    buildRdItems, handleRdMerged, handleRdZip,
  };
}

export type RedownloadMode = ReturnType<typeof useRedownloadMode>;
