"use client";

/**
 * Phase 3-G — COPY-ONLY extraction of the staging slice from src/app/page.tsx.
 *
 * - page.tsx থেকে COPY করা (কোনো line কাটা/মুছা হয়নি, page.tsx untouched — wiring পরের task-এ)।
 * - এই hook এখনো page.tsx-এ wire করা হয়নি — compile+unused থাকে, runtime-এ কোনো প্রভাব নেই।
 * - Staging-এর নিজের lightweight validation path — কোনো SHARED page-instance লাগে না
 *   (proc overlay / pipeline / id-counter / persisted কিছুই ব্যবহার করে না), তাই
 *   StagedFilesDeps আপাতত খালি — wiring-phase-এর injection-point হিসেবে রাখা।
 * - handleAddMoreFiles ইচ্ছা করে COPY করা হয়নি: ওটা mode-dispatch (app-level `mode`
 *   পড়ে + তিন মোড-লোডারে পাঠায়) — carry-over/mode-switch-এর মতো page-এই থাকে।
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { FILE_TOO_BIG_MSG, isValidDocxZip } from "@/lib/mcq/file-pipeline";
import { MAX_FILE_BYTES, MIN_OPTIONS_PER_MCQ } from "@/lib/mcq/limits";
import { toast } from "@/hooks/use-toast";
import { type DropzoneTrigger } from "@/components/mcq/file-dropzone";
import { type StagedFile, type StagedFileStats } from "@/components/mcq/upload-first-card";

export interface StagedFilesDeps {
  /** Reserved for the wiring phase — staging currently needs no shared instances. */
  _reserved?: never;
}

/**
 * Staging state + handlers — page.tsx-এর staging slice এখন এখানেই single source (copy)।
 */
export function useStagedFiles(_deps?: StagedFilesDeps) {
  // ---- স্টেজড ফাইল — আপলোড হয়েছে, কিন্তু এখনো কোনো মোডে খোলা হয়নি ----
  // ইউজার যেকোনো মোডে ক্লিক করলে এই ফাইলগুলো ওই মোডে লোড হয়ে যায়।
  // প্রতিটা ফাইলের ডিটেকশন-সংখ্যা (প্রশ্ন/৬-অংশ) staging-সময়েই একবার গুনে রাখা হয় —
  // মোড-লোডাররা পরে নিজেদের পার্স চালায়; এটা শুধু "files ready" টেবিলের প্রিভিউ।
  const [stagedFiles, setStagedFiles] = useState<StagedFile[] | null>(null);
  /** staging-পার্সের রান-আইডি — পুরনো রানের দেরিতে-আসা রেজাল্ট নতুন লিস্টে মিশবে না */
  const stagedRunRef = useRef(0);

  const stagedDzTrigger = useRef<DropzoneTrigger | null>(null);

  /**
   * স্টেজড ফাইলের ডিটেকশন-প্রিভিউ — মোডে ঢোকার আগেই "files ready" টেবিলে
   * প্রশ্ন/৬-অংশের সংখ্যা দেখানোর জন্য। parseRedownloadXml-এর নিজস্ব সংখ্যা
   * (প্রতি প্রশ্নে kinds → found-স্ট্যাট) — মোড-ভেতরের RedownloadPartsCard-এর
   * ব্যাজ-হিসাবের (rdFoundStats) হুবহু একই নিয়ম, তাই সংখ্যা মিলবে।
   */
  const previewStagedStats = useCallback(async (xml: string): Promise<StagedFileStats> => {
    const { parseRedownloadXml } = await import("@/lib/mcq/redownload");
    const parse = parseRedownloadXml(xml);
    let serial = 0;
    let question = 0;
    let reference = 0;
    let withOptions = 0;
    let optionsTotal = 0;
    let mcq = 0;
    let withAnswer = 0;
    let withBekkha = 0;
    for (const q of parse.questions) {
      // Serial = প্রশ্নে নিজে লেখা নম্বর আছে কিনা (kinds "serial" শুধু একক-সিরিয়াল-লাইনে বসে —
      // ইনলাইন "1. প্রশ্ন…" হলে কিন্তু প্রতি প্রশ্নের নম্বর থাকে — তাই serialDigits ধরি)
      if (q.serialDigits.length > 0) serial++;
      if (q.kinds.includes("question")) question++;
      if (q.kinds.includes("reference")) reference++;
      if (q.options.length > 0) withOptions++;
      optionsTotal += q.options.length;
      // Total MCQ = সত্যিকারের প্রশ্ন, অর্থাৎ যেগুলোর পূর্ণ ৪টা অপশন আছে
      // (MIN_OPTIONS_PER_MCQ) — ০-অপশন ফাইলে "১০০ MCQ" দেখিয়ে দিত না।
      if (q.options.length >= MIN_OPTIONS_PER_MCQ) mcq++;
      // উত্তর-লাইন থাকলেই "Answer found" (ভ্যালু-এক্সট্র্যাক্ট ছাড়াও) —
      // rdFoundStats-এর হুবহু একই নিয়ম, তাই টেবিল ও মোড-ব্যাজ মিলবে।
      if (q.answer || q.kinds.includes("answer")) withAnswer++;
      if (q.bekkha) withBekkha++;
    }
    return {
      questions: parse.questions.length,
      serial,
      question,
      reference,
      options: withOptions,
      optionsTotal,
      mcq,
      answer: withAnswer,
      bekkha: withBekkha,
    };
  }, []);

  /**
   * স্টেজিং-সময় .docx ভ্যালিডেশন (F3) — প্রতিটা .docx-এর হালকা JSZip চেক
   * (zip খোলা যায় + word/document.xml আছে; XML পার্স নয়)। ব্যর্থ ফাইল বাদ +
   * English টোস্ট; সবগুলো ব্যর্থ হলে স্টেজই হয় না (আপলোড-কার্ডেই থাকে)।
   * ভ্যালিড ফাইলগুলোর ডিটেকশন-সংখ্যা ব্যাকগ্রাউন্ডে গুনে টেবিলে বসে।
   */
  const stageFiles = useCallback(
    async (files: File[]) => {
      const valid: File[] = [];
      for (const f of files) {
        // সাইজ-গার্ড (Phase 4-A) — MAX_FILE_BYTES ছাড়ালে loadDocxXml/isValidDocxZip-এই যায় না
        if (f.size > MAX_FILE_BYTES) {
          toast({ title: FILE_TOO_BIG_MSG, variant: "destructive" });
          continue;
        }
        if (await isValidDocxZip(f)) {
          valid.push(f);
        } else {
          toast({
            title: "Could not read the file",
            description: `${f.name} is not a valid .docx`,
            variant: "destructive",
          });
        }
      }
      // সব ব্যর্থ → স্টেজ নয় — আপলোড-কার্ডেই থাকে ("files ready" ভুল ইঙ্গিত নয়)
      if (!valid.length) return;
      const runId = ++stagedRunRef.current;
      setStagedFiles(valid.map((file) => ({ file, status: "parsing" as const })));
      // ডিটেকশন-প্রিভিউ — একটা একটা করে (বড় ফাইলে UI ব্লক হয় না); রান বদলে গেলে থামে
      for (let i = 0; i < valid.length; i++) {
        if (stagedRunRef.current !== runId) return;
        const f = valid[i];
        try {
          const { loadDocxXml } = await import("@/lib/mcq/docx-xml");
          const xml = await loadDocxXml(f);
          if (stagedRunRef.current !== runId) return;
          const stats = await previewStagedStats(xml);
          if (stagedRunRef.current !== runId) return;
          setStagedFiles((prev) =>
            prev === null
              ? prev
              : prev.map((s, j) => (j === i ? { ...s, status: "ready" as const, stats } : s))
          );
        } catch {
          if (stagedRunRef.current !== runId) return;
          setStagedFiles((prev) =>
            prev === null
              ? prev
              : prev.map((s, j) =>
                  j === i ? { ...s, status: "error" as const, error: "Could not read the file" } : s
                )
          );
        }
      }
    },
    [previewStagedStats]
  );
  /** মোড-বাছাই ধাপে "Add files" — স্টেজড লিস্টের শেষে যোগ হয় (replace নয়) */
  const stageMoreFiles = useCallback(
    async (files: File[]) => {
      if (!files.length) return;
      const valid: File[] = [];
      for (const f of files) {
        // সাইজ-গার্ড (Phase 4-A) — MAX_FILE_BYTES ছাড়ালে loadDocxXml/isValidDocxZip-এই যায় না
        if (f.size > MAX_FILE_BYTES) {
          toast({ title: FILE_TOO_BIG_MSG, variant: "destructive" });
          continue;
        }
        if (await isValidDocxZip(f)) {
          valid.push(f);
        } else {
          toast({
            title: "Could not read the file",
            description: `${f.name} is not a valid .docx`,
            variant: "destructive",
          });
        }
      }
      if (!valid.length) return;
      const runId = ++stagedRunRef.current;
      const base = (stagedFilesRef.current ?? []).length;
      setStagedFiles((prev) => [...(prev ?? []), ...valid.map((file) => ({ file, status: "parsing" as const }))]);
      for (let k = 0; k < valid.length; k++) {
        if (stagedRunRef.current !== runId) return;
        const idx = base + k;
        const f = valid[k];
        try {
          const { loadDocxXml } = await import("@/lib/mcq/docx-xml");
          const xml = await loadDocxXml(f);
          if (stagedRunRef.current !== runId) return;
          const stats = await previewStagedStats(xml);
          if (stagedRunRef.current !== runId) return;
          setStagedFiles((prev) =>
            prev === null
              ? prev
              : prev.map((s, j) => (j === idx ? { ...s, status: "ready" as const, stats } : s))
          );
        } catch {
          if (stagedRunRef.current !== runId) return;
          setStagedFiles((prev) =>
            prev === null
              ? prev
              : prev.map((s, j) =>
                  j === idx ? { ...s, status: "error" as const, error: "Could not read the file" } : s
                )
          );
        }
      }
    },
    [previewStagedStats]
  );
  /** stageMoreFiles-এর base-ইনডেক্সের জন্য স্টেজড-লিস্টের লাইভ রেফ (stale-closure এড়াতে) */
  const stagedFilesRef = useRef<StagedFile[] | null>(null);
  useEffect(() => {
    stagedFilesRef.current = stagedFiles;
  }, [stagedFiles]);

  return {
    // state
    stagedFiles, setStagedFiles,
    stagedRunRef,
    stagedDzTrigger,
    stagedFilesRef,
    // handlers
    previewStagedStats, stageFiles, stageMoreFiles,
  };
}

export type StagedFiles = ReturnType<typeof useStagedFiles>;
