"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { InputCard } from "@/components/mcq/input-card";
import { DetectCard } from "@/components/mcq/detect-card";
import { DocxDetectCard } from "@/components/mcq/docx-detect-card";
import { ShuffleCard } from "@/components/mcq/shuffle-card";
import { SetsResult } from "@/components/mcq/sets-result";
import { DocxSetsResult } from "@/components/mcq/docx-sets-result";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { MultiFileList } from "@/components/mcq/multi-file-list";
import { MultiDownloadCard, type SerialStrategy } from "@/components/mcq/multi-download-card";
import {
  autoFixNumbering,
  parseMcq,
  type ParseOutput,
  type McqQuestion,
} from "@/lib/mcq/parser";
import { buildSets, shuffled, type Distribution } from "@/lib/mcq/set-engine";
import { analyzeText, type Enc, type EncodingStats } from "@/lib/mcq/encoding";
import {
  allSetsClipboardText,
  copyToClipboard,
  exportDocHtml,
  exportDocx,
  printSets,
  DEFAULT_EXPORT_OPTIONS,
  type ExportOptions,
} from "@/lib/mcq/exporter";
import {
  loadDocxXml,
  parseDocxXml,
  type DocxParseResult,
} from "@/lib/mcq/docx-xml";
import {
  analyzeColorDocx,
  applyColorSerialXml,
  downloadColorSerialDocx,
  planSerialByColor,
  stripNonMcqLinesXml,
  stripShadedParasXml,
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
import { ColorSerialCard } from "@/components/mcq/color-serial-card";
import { ModeTabs, type McqMode } from "@/components/mcq/mode-tabs";
import { SerialInputCard } from "@/components/mcq/serial-input-card";
import { SerialPasteCard } from "@/components/mcq/serial-paste-card";
import { NextModesCard } from "@/components/mcq/next-modes-card";
import { StagedFilesCard, UploadFirstCard } from "@/components/mcq/upload-first-card";
import {
  BlockedLinesCard,
  ColorShuffleInfoCard,
  MultiSerialSchemeCard,
  NoColorSerialCard,
} from "@/components/mcq/serial-extra-cards";
import {
  buildShuffledXml,
  downloadSerialFixedDocx,
  downloadShuffledDocx,
  englishSetName,
} from "@/lib/mcq/docx-exporter";
import { downloadBlob } from "@/lib/mcq/exporter";
import { RedownloadInputCard } from "@/components/mcq/redownload-input-card";
import { RedownloadPartsCard } from "@/components/mcq/redownload-parts-card";
import { RedownloadQuestionsCard } from "@/components/mcq/redownload-questions-card";
import {
  buildRedownloadXml,
  DEFAULT_PART_SELECTION,
  extractWatermark,
  parseRedownloadXml,
  type PartKind,
  type PartSel,
  type RdParseResult,
  type WatermarkInfo,
} from "@/lib/mcq/redownload";
import { SAMPLE_MCQ } from "@/lib/mcq/sample";
import { renumberQuestionsByPosition } from "@/lib/mcq/serial-paste";
import { toast } from "@/hooks/use-toast";
import { Dices, ShieldCheck, Zap } from "lucide-react";

const STORAGE_KEY = "mcq-shuffler-text";
const MODE_KEY = "mcq-shuffler-mode";

// মাল্টি-ফাইল লিস্টের আইটেম-id (reorder/remove-এর জন্য স্টেবল কী দরকার)
let multiIdCounter = 0;
const nextMultiId = () => `mf-${++multiIdCounter}-${Date.now().toString(36)}`;

interface DocxState {
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

/** সিরিয়াল মোডের আলাদা স্টেট — এখন একাধিক ফাইলও থাকতে পারে (লিস্ট-ক্রমেই আউটপুট) */
interface SerialState {
  id: string;
  file: File;
  baseName: string;
  xml: string;
  analysis: ColorAnalysis;
}

/** শাফল মোড মাল্টি-ফাইল আইটেম — প্রতিটা ফাইল আলাদাভাবে স্ট্রিপ + পার্স হয় */
interface ShuffleItemState {
  id: string;
  file: File;
  baseName: string;
  /** হেডার/নন-MCQ বাদ দেওয়া xml */
  xml: string;
  parse: DocxParseResult;
  /** বাদ পড়া লাইন (রঙ-হেডার + নন-MCQ) */
  blocked: BlockedLine[];
}

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
  // ---- মোড (শাফল / সিরিয়াল / রিডাউনলোড — আপলোডের পরে দেখা যায়) ----
  const [mode, setMode] = useState<McqMode>("shuffle");

  // ---- স্টেজড ফাইল — আপলোড হয়েছে, কিন্তু এখনো কোনো মোডে খোলা হয়নি ----
  // ইউজার যেকোনো মোডে ক্লিক করলে এই ফাইলগুলো ওই মোডে লোড হয়ে যায়
  const [stagedFiles, setStagedFiles] = useState<File[] | null>(null);

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
  const [distribution, setDistribution] = useState<Distribution>("interleaved");
  const [shuffleWithin, setShuffleWithin] = useState(true);
  const [shuffling, setShuffling] = useState(false);

  // ---- রেজাল্ট ----
  const [sets, setSets] = useState<McqQuestion[][] | null>(null);
  const [setsDocx, setSetsDocx] = useState<number[][] | null>(null);
  const [renumber, setRenumber] = useState(true);
  const [sortedFlags, setSortedFlags] = useState<boolean[]>([]);
  const [exportOpts, setExportOpts] = useState<ExportOptions>(DEFAULT_EXPORT_OPTIONS);
  const [busy, setBusy] = useState<string | null>(null);
  const [copiedSet, setCopiedSet] = useState<number | null>(null);

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

  // ---- শাফল মোড মাল্টি-ফাইল (একসাথে একাধিক .docx) ----
  const [shuffleItems, setShuffleItems] = useState<ShuffleItemState[] | null>(null);
  const [shuffleLoading, setShuffleLoading] = useState(false);
  const [shuffleMultiSets, setShuffleMultiSets] = useState<number[][][] | null>(null);
  const [multiShuffling, setMultiShuffling] = useState(false);
  const [multiMergedBusy, setMultiMergedBusy] = useState(false);
  const [multiZipBusy, setMultiZipBusy] = useState(false);

  // ---- রিডাউনলোড মোডের সম্পূর্ণ আলাদা স্টেট (একাধিক .docx + অংশ-বাছাই) ----
  const [rdDocs, setRdDocs] = useState<RdDocState[]>([]);
  const [rdLoading, setRdLoading] = useState(false);
  // প্রতি ফাইলে সিলেক্ট করা প্রশ্ন (কী = RdDocState.id)
  const [rdSel, setRdSel] = useState<Record<string, Set<number>>>({});
  // কোন অংশগুলো নতুন ফাইলে থাকবে (ডিফল্ট: সিরিয়াল + প্রশ্ন)
  const [rdParts, setRdParts] = useState<PartSel>(DEFAULT_PART_SELECTION);
  const [rdRenumber, setRdRenumber] = useState(true);
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

  // ---- ফ্লো-গেট: কোনো ইনপুট নেই → আগে আপলোড-কার্ড; ইনপুট আছে → ৩ মোড-বাটন ----
  const hasAnyInput =
    !!stagedFiles?.length ||
    !!docx ||
    !!shuffleItems ||
    serialDocs.length > 0 ||
    !!serialPaste ||
    rdDocs.length > 0 ||
    !!(parsed && parsed.questions.length > 0);

  // ---- প্রতি মোডের ফাইল-সংখ্যা (NextModesCard-এ দেখানোর জন্য) ----
  const shuffleFileCount = shuffleItems ? shuffleItems.length : docx ? 1 : 0;
  const serialFileCount = serialDocs.length;
  const rdFileCount = rdDocs.length;

  const resultsRef = useRef<HTMLDivElement>(null);

  // শেষ ব্যবহৃত মোড মনে রাখা
  useEffect(() => {
    try {
      const m = localStorage.getItem(MODE_KEY);
      if (m === "shuffle" || m === "serial" || m === "redownload") setMode(m);
    } catch {}
  }, []);

  const changeMode = (m: McqMode) => {
    setMode(m);
    try {
      localStorage.setItem(MODE_KEY, m);
    } catch {}
    carryToMode(m, mode);
  };

  // ================== মোডের মাঝে ফাইল বহন (carry-over) ==================

  /** মোডে এখন কাজের ডেটা আছে কি না (আছে হলে ছুঁই না — ইউজারের কাজ নষ্ট হবে না) */
  const modeHasContent = (m: McqMode): boolean =>
    m === "shuffle"
      ? !!(docx || shuffleItems || (parsed && parsed.questions.length > 0))
      : m === "serial"
        ? serialDocs.length > 0 || !!serialPaste
        : rdDocs.length > 0;

  /** মোডে থাকা ফাইলগুলো (File অবজেক্ট) — অন্য মোডে বহনের জন্য */
  const filesOfMode = (m: McqMode): File[] =>
    m === "shuffle"
      ? shuffleItems
        ? shuffleItems.map((i) => i.file)
        : docx
          ? [docx.file]
          : []
      : m === "serial"
        ? serialDocs.map((d) => d.file)
        : rdDocs.map((d) => d.file);

  /** ফাইল একটা মোডে লোড — প্রতিটা মোডের নিজের লোডার ব্যবহার করে */
  const loadIntoMode = (m: McqMode, files: File[]) => {
    if (m === "shuffle") handleShuffleFiles(files);
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
      const files = stagedFiles;
      setStagedFiles(null);
      loadIntoMode(target, files);
      return;
    }
    if (source !== target) {
      const files = filesOfMode(source);
      if (files.length) loadIntoMode(target, files);
    }
  };

  // প্রথম লোডে সেভ করা টেক্সট রিস্টোর
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) setRawText(saved);
    } catch {}
    setHydrated(true);
  }, []);

  // টেক্সট অটো-সেভ (ডিবাউন্স)
  useEffect(() => {
    if (!hydrated) return;
    const t = setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, rawText);
      } catch {}
    }, 600);
    return () => clearTimeout(t);
  }, [rawText, hydrated]);

  // হেডার অটো-প্রি-ফিল (text mode-এ প্রথমবার ডিটেক্টে)
  useEffect(() => {
    if (parsed && exportOpts.headerText === "" && parsed.preamble.length) {
      setExportOpts((o) => ({ ...o, headerText: parsed.preamble.join("\n") }));
    }
  }, [parsed]);

  const resetResults = () => {
    setSets(null);
    setSetsDocx(null);
    setSortedFlags([]);
  };

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

  const handleSample = () => {
    loadAndDetect(SAMPLE_MCQ);
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
        title: "🔧 সিরিয়াল ঠিক করা হয়েছে",
        description: `${result.questions.length} টি প্রশ্নে ১ থেকে শুরু করে নতুন নম্বর বসানো হয়েছে।`,
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
        title: "কোনো প্রশ্ন পাওয়া যায়নি",
        description: "প্রশ্নগুলো নম্বর দিয়ে শুরু আছে কিনা দেখুন (যেমন: ১. অথবা 1.)",
      });
    } else if (result.serial?.status === "ok") {
      toast({
        title: `✅ ${result.questions.length} টি প্রশ্ন ডিটেক্ট হয়েছে`,
        description: "সিরিয়াল ঠিক আছে — শাফল বাটন এখন চালু!",
      });
    } else if (result.serial) {
      toast({
        title: `⚠️ ${result.questions.length} টি প্রশ্ন পাওয়া গেছে, কিন্তু সিরিয়ালে সমস্যা আছে`,
        description: "'অটো নম্বরিং ঠিক করুন' চাপলে এক ক্লিকে ঠিক হয়ে যাবে।",
      });
    }
  };

  // ================== DOCX MODE (XML হুবহু প্রিজার্ভ) ==================

  const handleDocxFile = useCallback(async (f: File) => {
    setDocxLoading(true);
    setShuffleItems(null);
    setShuffleMultiSets(null);
    try {
      const originalXml = await loadDocxXml(f);
      // রঙ-বিশ্লেষণ (string-level, হালকা)
      let colorAn: ColorAnalysis | null = null;
      try {
        colorAn = analyzeColorDocx(originalXml);
      } catch {}
      const hasColors = !!colorAn && colorAn.colors.length > 0;

      // ইউজারের নিয়ম: শাফল মোডে হেডার থাকলে হেডার বাদ দিয়ে সবগুলো প্রশ্ন
      // এক সিরিয়ালে নিয়ে শাফল — তাই রঙ-হেডারগুলো আগে সরিয়ে নিই,
      // যাতে হেডার কোনো প্রশ্ন-ব্লকের সাথে জড়িয়ে শাফলে এলোমেলো না যায়
      // + রঙ-নেই হেডার/শিরোনাম লাইনও (যেমন "Aa¨vq-8") টেক্সট-প্যাটার্নে বাদ
      let xml = originalXml;
      let headersStripped = 0;
      const blocked: BlockedLine[] = [];
      if (hasColors && colorAn) {
        const st = stripShadedParasXml(originalXml);
        xml = st.xml;
        headersStripped = st.removed;
        for (const t of st.texts) blocked.push({ text: t, reason: "color" });
      }
      const st2 = stripNonMcqLinesXml(xml);
      xml = st2.xml;
      blocked.push(...st2.removed);
      const patternStripped = blocked.length - headersStripped;

      const parse = parseDocxXml(xml);
      setDocx({
        file: f,
        baseName: f.name.replace(/\.docx$/i, ""),
        xml,
        originalXml,
        parse,
        colorAn: hasColors ? colorAn : null,
        headersStripped,
        blocked,
      });
      setParsed(null);
      resetResults();
      setSelected(new Set(parse.questions.map((q) => q.id)));
      setAllowBroken(false);

      if (hasColors && colorAn) {
        toast({
          title: `🎨 রঙ-হেডার ${headersStripped} টি${patternStripped ? ` + নন-MCQ লাইন ${patternStripped} টি` : ""} বাদ দিয়ে ${parse.questions.length} টি প্রশ্ন এক সিরিয়ালে ডিটেক্ট হয়েছে`,
          description: "শাফলে হেডার/নন-MCQ লাইনগুলো যাবে না — নিচে বাদ-পড়া লাইনের পুরো লিস্ট দেখা যায়।",
        });
      } else if (parse.questions.length === 0) {
        toast({
          title: "কোনো প্রশ্ন পাওয়া যায়নি",
          description: "প্রশ্নগুলো সিরিয়াল দিয়ে শুরু আছে কিনা দেখুন (যেমন: 32. / ১. / 1.)",
          variant: "destructive",
        });
        return;
      } else {
        const serialMsg =
          parse.serial?.status === "ok"
            ? "সিরিয়াল ঠিক আছে — শাফল রেডি!"
            : `সিরিয়ালে ${parse.serial?.issues.length ?? 0} টি জায়গায় সমস্যা — শাফলের সময় serial replace ON রাখলে ঠিক হয়ে যাবে।`;

        toast({
          title: `✅ ${parse.questions.length} টি প্রশ্ন ডিটেক্ট হয়েছে${patternStripped ? ` (নন-MCQ লাইন ${patternStripped} টি বাদ)` : ""}`,
          description: patternStripped
            ? `${patternStripped} টি হেডার/শিরোনাম লাইন MCQ না — শাফলে যাবে না (নিচে লিস্ট)। ${serialMsg}`
            : `${serialMsg}${parse.unicodeQuestionIds.length ? ` ⚠️ ${parse.unicodeQuestionIds.length} টি প্রশ্নে Unicode আছে (ডাউনলোডে অরিজিনালই থাকবে)।` : ""}`,
        });
      }

      if (originalXml.length > 8_000_000) {
        toast({
          title: "⚠️ বিশাল ফাইল",
          description: "ফাইলটা বড় — শাফল ও ডাউনলোডে কিছু সময় লাগতে পারে, ট্যাব বন্ধ করবেন না।",
        });
      }
    } catch (e) {
      toast({
        title: "ফাইল পড়া যায়নি",
        description: String(e instanceof Error ? e.message : e),
        variant: "destructive",
      });
    } finally {
      setDocxLoading(false);
    }
  }, []);

  const toggleSerialByClick = (v: boolean) => setRenumber(v);

  // ================== SERIAL MODE (সম্পূর্ণ আলাদা ওয়ার্কফ্লো) ==================

  /** .docx লোড + রঙ-বিশ্লেষণ — একাধিক হলে লিস্টে বসে; append=false হলে লিস্ট বদলে যায় */
  const loadSerialFiles = async (files: File[], append: boolean) => {
    setSerialLoading(true);
    const added: SerialState[] = [];
    const errors: string[] = [];
    let colors = 0;
    let questions = 0;
    for (const f of files) {
      try {
        const xml = await loadDocxXml(f);
        const analysis = analyzeColorDocx(xml);
        added.push({ id: nextMultiId(), file: f, baseName: f.name.replace(/\.docx$/i, ""), xml, analysis });
        colors += analysis.colors.length;
        questions += analysis.questionCount;
      } catch (e) {
        errors.push(`${f.name}: ${e instanceof Error ? e.message : String(e)}`);
      }
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
        title: `✅ ${added.length} টি ফাইল ${append ? "যোগ" : "লোড"} হয়েছে`,
        description: `মোট ${questions} টি প্রশ্ন${colors ? `, ${colors} টি রঙ-হেডার` : ""}।${added.length > 1 ? " লিস্ট থেকে ক্রম বদলাতে পারবেন — নিচে মার্জ/ZIP ডাউনলোড।" : ""}`,
      });
    }
    if (errors.length) {
      toast({ title: "কিছু ফাইল পড়া যায়নি", description: errors.join("\n"), variant: "destructive" });
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
    try {
      const plan = planSerialByColor(serialDoc.analysis, scheme);
      if (plan.size === 0) {
        toast({
          title: "নম্বর দেওয়ার মতো প্রশ্ন পাওয়া যায়নি",
          description: "এই রঙের সেকশনের ভিতরে সিরিয়াল-দেওয়া প্রশ্ন-লাইন নেই।",
          variant: "destructive",
        });
        return;
      }
      await downloadColorSerialDocx({
        originalFile: serialDoc.file,
        xml: serialDoc.xml,
        plan,
        baseName: serialDoc.baseName,
        schemeLabel: label,
      });
      toast({
        title: "✅ রঙ-অনুযায়ী সিরিয়াল করা .docx ডাউনলোড হয়েছে",
        description:
          scheme.kind === "continuous"
            ? `${plan.size} টি প্রশ্ন একটানা ১,২,৩… নম্বর পেয়েছে। বাকি সব হুবহু অক্ষত।`
            : `${plan.size} টি প্রশ্ন রঙ-সেকশন অনুযায়ী ১ থেকে নম্বর পেয়েছে। হেডার/ইকুয়েশন/ছবি অক্ষত।`,
      });
    } catch (e) {
      toast({ title: "সিরিয়াল করা যায়নি", description: String(e), variant: "destructive" });
    } finally {
      setSerialBusy(false);
    }
  };

  // ---- মাল্টি-ফাইল সিরিয়াল ডাউনলোড (≥২ ফাইল) ----

  /** প্রতিটা ফাইল সিরিয়াল করে এক .docx-এ মার্জ — ফাইলের মাঝে পেজ ব্রেক */
  const handleSerialMultiMerged = async () => {
    if (serialDocs.length < 2) return;
    setSerialMergedBusy(true);
    try {
      const items: Array<{ xml: string; file: Blob }> = [];
      let offset = 0;
      for (const d of serialDocs) {
        // প্রতি ফাইলের নিজের স্কিম (ডিফল্ট একটানা — আগের আচরণ হুবহু)
        const base = planSerialByColor(d.analysis, serialSchemes[d.id] ?? { kind: "continuous" });
        // file-by-file হলে প্রতি ফাইল ১ থেকে; global হলে আগের ফাইলের শেষ নম্বরের পর থেকে
        const plan = serialStrategy === "global" ? offsetSerialPlan(base, offset) : base;
        offset += base.size;
        const xml = applyColorSerialXml(d.xml, plan);
        items.push({ xml, file: await replaceDocumentXml(d.file, xml) });
      }
      const merged = await buildMergedDocxBlob(items);
      downloadBlob(merged, `${serialDocs[0].baseName} (merged serial).docx`);
      toast({
        title: "✅ মার্জ করা .docx ডাউনলোড হয়েছে",
        description:
          serialStrategy === "global"
            ? "সব ফাইল পরপর, পেজ ব্রেকসহ — সিরিয়াল শুরু থেকে শেষ পর্যন্ত একটানা।"
            : "সব ফাইল পরপর, পেজ ব্রেকসহ — প্রতি ফাইলে সিরিয়াল নতুন করে ১ থেকে।",
      });
    } catch (e) {
      toast({ title: "মার্জ করা যায়নি", description: String(e), variant: "destructive" });
    } finally {
      setSerialMergedBusy(false);
    }
  };

  /** প্রতিটা ফাইল আলাদাভাবে সিরিয়াল করে এক .zip-এ বানিয়ে দেয় */
  const handleSerialMultiZip = async () => {
    if (serialDocs.length < 2) return;
    setSerialZipBusy(true);
    try {
      const out: Array<{ name: string; blob: Blob }> = [];
      for (const d of serialDocs) {
        // প্রতি ফাইলের নিজের স্কিম (ডিফল্ট একটানা — আগের আচরণ হুবহু)
        const plan = planSerialByColor(d.analysis, serialSchemes[d.id] ?? { kind: "continuous" });
        const xml = applyColorSerialXml(d.xml, plan);
        out.push({ name: `${d.baseName} (serial).docx`, blob: await replaceDocumentXml(d.file, xml) });
      }
      const zip = await buildZipBlob(out);
      downloadBlob(zip, "MCQ-serial-files.zip");
      toast({
        title: "✅ ZIP ডাউনলোড হয়েছে",
        description: `${out.length} টি ফাইল আলাদা আলাদা সিরিয়াল করা — ভিতরে সবগুলো আছে।`,
      });
    } catch (e) {
      toast({ title: "ZIP বানানো যায়নি", description: String(e), variant: "destructive" });
    } finally {
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
          title: "কোনো প্রশ্ন পাওয়া যায়নি",
          description: "প্রশ্নগুলো নম্বর দিয়ে শুরু আছে কিনা দেখুন (যেমন: ১. অথবা 1.)",
          variant: "destructive",
        });
      } else if (result.serial?.status === "ok") {
        toast({
          title: `✅ ${result.questions.length} টি প্রশ্ন ডিটেক্ট হয়েছে`,
          description: "সিরিয়াল ঠিক আছে — নিচে সিরিয়াল ডাউনলোড বাটন চালু!",
        });
      } else {
        toast({
          title: `⚠️ ${result.questions.length} টি প্রশ্ন পাওয়া গেছে, কিন্তু সিরিয়ালে সমস্যা আছে`,
          description: "'অটো নম্বরিং ঠিক করুন' চাপলে এক ক্লিকে ঠিক হয়ে যাবে।",
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
        title: "🔧 সিরিয়াল ঠিক করা হয়েছে",
        description: `${result.questions.length} টি প্রশ্নে ১ থেকে শুরু করে নতুন নম্বর বসানো হয়েছে।`,
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
      await exportDocx([renumbered], {
        ...DEFAULT_EXPORT_OPTIONS,
        includeHeader: false,
        includeSetHeader: false,
        fileName: `MCQ-Serial-${renumbered.length}q.docx`,
      });
      toast({
        title: "✅ সিরিয়াল করা .docx ডাউনলোড হয়েছে",
        description: `${renumbered.length} টি প্রশ্ন পজিশন-অনুযায়ী ১..N নম্বর পেয়েছে — ক্রম ও অপশন হুবহু অক্ষত।`,
      });
    } catch (e) {
      toast({ title: "ডাউনলোডে সমস্যা", description: String(e), variant: "destructive" });
    } finally {
      setSerialPasteDlBusy(false);
    }
  };

  /** শাফল মোডে উঠা রঙ-ফাইল সিরিয়াল মোডে খোলা (ফাইল নিজেই চলে যায়, আবার আপলোড লাগে না) */
  const openInSerialMode = () => {
    if (!docx?.colorAn) return;
    const id = nextMultiId();
    setStagedFiles(null);
    setSerialDocs([
      {
        id,
        file: docx.file,
        baseName: docx.baseName,
        // সিরিয়াল মোডে অরিজিনাল xml লাগে — রঙ-ইনডেক্স অরিজিনাল ফাইলের সাথে মেলে
        xml: docx.originalXml,
        analysis: docx.colorAn,
      },
    ]);
    setSerialSchemes({ [id]: { kind: "continuous" } });
    setSerialPaste(null);
    changeMode("serial");
    toast({
      title: "🔢 সিরিয়াল মোডে ফাইল খোলা হলো",
      description: "নিচে রঙ বাছাই করে সিরিয়াল ডাউনলোড করুন।",
    });
  };

  const handleDocxShuffle = () => {
    if (!docx?.parse || !canShuffle) return;
    setShuffling(true);
    try {
      const pool = docx.parse.questions.filter((q) => selected.has(q.id));
      const isOriginal = distribution === "original";
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
          ? `🔀 ${setCount} টি সেট তৈরি — প্রতিটিতে সব ${pool.length} টি প্রশ্ন!`
          : `🔀 ${setCount} টি সেট তৈরি হয়েছে!`,
        description: isOriginal
          ? "প্রতি সেটের সিরিয়াল ক্রম আলাদা — এক সেটের ক্রম আরেক সেটের সাথে মিলবে না।"
          : "এখন Word ফাইল ডাউনলোড করতে পারেন — প্রতি সেট আলাদা পেজে।",
      });
    } finally {
      setShuffling(false);
    }
  };

  const handleDocxDownload = async (doRenumber: boolean) => {
    if (!docx?.parse || !setsDocx) return;
    setBusy(doRenumber ? "docx-r" : "docx-o");
    try {
      await downloadShuffledDocx({
        originalFile: docx.file,
        xml: docx.xml,
        questions: docx.parse.questions,
        sets: setsDocx,
        baseName: docx.baseName,
        suffix: doRenumber ? " (shuffled, renumbered)" : " (shuffled, original serial)",
        opts: { renumber: doRenumber, includeSetHeader: true },
      });
      toast({
        title: "✅ Word ফাইল ডাউনলোড হয়েছে",
        description: doRenumber
          ? "প্রতি সেট আলাদা পেজে, সিরিয়াল ১,২,৩… করা। ফরম্যাট হুবহু অক্ষত।"
          : "প্রতি সেট আলাদা পেজে, প্রশ্নের আসল নম্বরসহ। ফরম্যাট হুবহু অক্ষত।",
      });
    } catch (e) {
      toast({ title: "ডাউনলোডে সমস্যা", description: String(e), variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  const handleDocxSerialFix = async () => {
    if (!docx?.parse) return;
    setFixing(true);
    try {
      await downloadSerialFixedDocx({
        originalFile: docx.file,
        xml: docx.xml,
        questions: docx.parse.questions,
        baseName: docx.baseName,
      });
      toast({
        title: "🔧 সিরিয়াল ঠিক করা .docx ডাউনলোড হয়েছে",
        description: "অরিজিনাল অর্ডারেই প্রশ্নগুলো, সিরিয়াল ১..N বসানো — ফরম্যাট হুবহু অক্ষত।",
      });
    } catch (e) {
      toast({ title: "ডাউনলোডে সমস্যা", description: String(e), variant: "destructive" });
    } finally {
      setFixing(false);
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
      toast({ title: "কপি করা যায়নি", description: String(e), variant: "destructive" });
    }
  };

  // ================== SHARED ==================

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
  const multiGateReason = useMemo(() => {
    if (!shuffleItems || shuffleItems.length === 0) return "প্রথমে ফাইল আপলোড করুন";
    if (shuffleMultiTotal < 2) return "ফাইলগুলোতে মোট অন্তত ২ টি প্রশ্ন দরকার";
    if (shuffleMultiZero > 0)
      return `${shuffleMultiZero} টি ফাইলে কোনো প্রশ্ন পাওয়া যায়নি — লিস্ট থেকে বাদ দিন`;
    return null;
  }, [shuffleItems, shuffleMultiTotal, shuffleMultiZero]);

  const gateReason = useMemo(() => {
    if (!docx && !parsed) return "প্রথমে প্রশ্ন ডিটেক্ট করুন";
    if (activeCount === 0) return "কোনো প্রশ্ন পাওয়া যায়নি";
    // docx মোডে সিরিয়াল gate নেই — serial replace ON থাকলে পজিশন-ভিত্তিক নম্বরেই সব ঠিক হয়ে যায়
    if (!docx && !serialOk && !allowBroken) return "সিরিয়াল ঠিক নেই — অটো নম্বরিং ঠিক করুন অথবা 'যেভাবে আছে তেভাবে চালান' চালু করুন";
    if (selected.size === 0) return "অন্তত একটি প্রশ্ন সিলেক্ট করুন";
    if (selected.size < 2) return "অন্তত ২ টি প্রশ্ন সিলেক্ট করুন";
    return null;
  }, [docx, parsed, activeCount, serialOk, allowBroken, selected.size]);

  const canShuffle = gateReason === null;

  // ================== REDOWNLOAD MODE ==================

  /** রিডাউনলোড মোডে ফাইল লোড — পার্স + অংশ-বিশ্লেষণ + ওয়াটারমার্ক এক্সট্র্যাক্ট */
  const loadRedownloadFiles = async (files: File[], append: boolean) => {
    setRdLoading(true);
    const added: RdDocState[] = [];
    const errors: string[] = [];
    for (const f of files) {
      try {
        const xml = await loadDocxXml(f);
        const parse = parseRedownloadXml(xml);
        const watermark = await extractWatermark(f);
        added.push({ id: nextMultiId(), file: f, baseName: f.name.replace(/\.docx$/i, ""), xml, parse, watermark });
      } catch (e) {
        errors.push(`${f.name}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
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
        title: `✅ ${added.length} টি ফাইল ${append ? "যোগ" : "লোড"} হয়েছে`,
        description: `মোট ${totalQ} টি প্রশ্ন। এখন অংশ বাছাই করে ডাউনলোড করুন।`,
      });
    }
    if (errors.length) {
      toast({ title: "কিছু ফাইল পড়া যায়নি", description: errors.join("\n"), variant: "destructive" });
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
  const buildRdItems = (): Array<{ xml: string; file: Blob; baseName: string }> | null => {
    const items = rdDocs
      .map((d) => {
        const sel = rdSelOf(d.id);
        if (!sel.size) return null;
        const xml = buildRedownloadXml(d.xml, d.parse, sel, {
          partSel: rdParts,
          renumber: rdRenumber,
          expandAnswer: true,
        });
        return { xml, file: d.file as Blob, baseName: d.baseName };
      })
      .filter((x): x is { xml: string; file: Blob; baseName: string } => x !== null);
    return items.length ? items : null;
  };

  const handleRdMerged = async () => {
    const items = buildRdItems();
    if (!items) {
      toast({ title: "প্রশ্ন সিলেক্ট করুন", description: "অন্তত একটা ফাইলে প্রশ্ন টিক দিন।", variant: "destructive" });
      return;
    }
    setRdMergedBusy(true);
    try {
      const blob =
        items.length === 1
          ? await replaceDocumentXml(items[0].file, items[0].xml)
          : await buildMergedDocxBlob(items);
      const name =
        items.length === 1 ? `${items[0].baseName} (redownload).docx` : "MCQ-Redownload-merged.docx";
      downloadBlob(blob, name);
      toast({
        title: "✅ রিডাউনলোড ফাইল তৈরি",
        description: `${items.length} টি ফাইলের বাছাই করা অংশ নতুন ফাইলে — ট্যাব, ইকুয়েশন, ওয়াটারমার্ক সব অক্ষত।`,
      });
    } catch (e) {
      toast({ title: "ডাউনলোডে সমস্যা", description: String(e), variant: "destructive" });
    } finally {
      setRdMergedBusy(false);
    }
  };

  const handleRdZip = async () => {
    const items = buildRdItems();
    if (!items) {
      toast({ title: "প্রশ্ন সিলেক্ট করুন", description: "অন্তত একটা ফাইলে প্রশ্ন টিক দিন।", variant: "destructive" });
      return;
    }
    setRdZipBusy(true);
    try {
      const files: Array<{ name: string; blob: Blob }> = [];
      for (const it of items) {
        const blob = await replaceDocumentXml(it.file, it.xml);
        files.push({ name: `${it.baseName} (redownload).docx`, blob });
      }
      const zip = await buildZipBlob(files);
      downloadBlob(zip, "MCQ-Redownload.zip");
      toast({
        title: "✅ ZIP ডাউনলোড হয়েছে",
        description: `${files.length} টি আলাদা ফাইল — প্রতিটাতেই বাছাই করা অংশ।`,
      });
    } catch (e) {
      toast({ title: "ZIP-এ সমস্যা", description: String(e), variant: "destructive" });
    } finally {
      setRdZipBusy(false);
    }
  };

  // ---- TEXT mode শাফল ----
  const handleTextShuffle = () => {
    if (!parsed || !canShuffle) return;
    setShuffling(true);
    try {
      const pool = parsed.questions.filter((q) => selected.has(q.id));
      const isOriginal = distribution === "original";
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
          ? `🔀 ${setCount} টি সেট তৈরি — প্রতিটিতে সব ${pool.length} টি প্রশ্ন!`
          : `🔀 ${setCount} টি সেট তৈরি হয়েছে!`,
        description: isOriginal
          ? "প্রতি সেটের সিরিয়াল ক্রম আলাদা — এক সেটের ক্রম আরেক সেটের সাথে মিলবে না।"
          : `${pool.length} টি প্রশ্ন ভাগ হয়েছে। এখন Word ফাইল ডাউনলোড করতে পারেন।`,
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

  /** একাধিক .docx — প্রতিটা আলাদাভাবে হেডার-স্ট্রিপ + পার্স; ১টা হলে পুরনো একক পাইপলাইন */
  const handleShuffleFiles = async (files: File[]) => {
    if (files.length === 1) {
      setShuffleItems(null);
      setShuffleMultiSets(null);
      handleDocxFile(files[0]);
      return;
    }
    setShuffleLoading(true);
    const items: ShuffleItemState[] = [];
    const errors: string[] = [];
    let totalQuestions = 0;
    for (const f of files) {
      try {
        const originalXml = await loadDocxXml(f);
        let colorAn: ColorAnalysis | null = null;
        try {
          colorAn = analyzeColorDocx(originalXml);
        } catch {}
        let xml = originalXml;
        const blocked: BlockedLine[] = [];
        if (colorAn && colorAn.colors.length > 0) {
          const st = stripShadedParasXml(originalXml);
          xml = st.xml;
          for (const t of st.texts) blocked.push({ text: t, reason: "color" });
        }
        const st2 = stripNonMcqLinesXml(xml);
        xml = st2.xml;
        blocked.push(...st2.removed);
        const parse = parseDocxXml(xml);
        items.push({ id: nextMultiId(), file: f, baseName: f.name.replace(/\.docx$/i, ""), xml, parse, blocked });
        totalQuestions += parse.questions.length;
      } catch (e) {
        errors.push(`${f.name}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    setShuffleItems(items.length ? items : null);
    setShuffleMultiSets(null);
    setDocx(null);
    setParsed(null);
    resetResults();
    setSelected(new Set());
    setShuffleLoading(false);
    if (items.length) {
      const zeroQ = items.filter((i) => i.parse.questions.length === 0).length;
      toast({
        title: `✅ ${items.length} টি ফাইল লোড হয়েছে — মোট ${totalQuestions} টি প্রশ্ন`,
        description: zeroQ
          ? `${zeroQ} টি ফাইলে কোনো প্রশ্ন পাওয়া যায়নি — লিস্ট থেকে বাদ দিন। ক্রম বদলাতে টেনে ধরুন।`
          : "লিস্ট থেকে ক্রম বদলাতে পারবেন — নিচের শাফল-কনফিগ দিয়ে সব ফাইল একসাথে শাফল হবে।",
      });
    }
    if (errors.length) {
      toast({ title: "কিছু ফাইল পড়া যায়নি", description: errors.join("\n"), variant: "destructive" });
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
        title: `🔀 ${shuffleItems.length} টি ফাইল শাফল হয়েছে — প্রতি ফাইলে ${setCount} টি সেট!`,
        description: "নিচে মার্জ (.docx) বা ZIP — দুইভাবেই ডাউনলোড করা যাবে।",
      });
    } finally {
      setMultiShuffling(false);
    }
  };

  /** সব ফাইলের শাফল্ড আউটপুট এক .docx-এ — ফাইলের মাঝে পেজ ব্রেক */
  const handleMultiMergedDownload = async () => {
    if (!shuffleItems || !shuffleMultiSets) return;
    setMultiMergedBusy(true);
    try {
      const items: Array<{ xml: string; file: Blob }> = [];
      for (let i = 0; i < shuffleItems.length; i++) {
        const it = shuffleItems[i];
        if (it.parse.questions.length === 0) continue;
        const xml = buildShuffledXml(it.xml, it.parse.questions, shuffleMultiSets[i] ?? [], {
          renumber,
          includeSetHeader: true,
        });
        items.push({ xml, file: await replaceDocumentXml(it.file, xml) });
      }
      if (items.length < 2) throw new Error("মার্জ করার মতো পর্যাপ্ত ফাইল নেই");
      const merged = await buildMergedDocxBlob(items);
      downloadBlob(merged, `${shuffleItems[0].baseName} (merged shuffled).docx`);
      toast({
        title: "✅ মার্জ করা Word ফাইল ডাউনলোড হয়েছে",
        description: "সব ফাইলের সেটগুলো পরপর — ফাইলের মাঝে পেজ ব্রেক, ফরম্যাট হুবহু অক্ষত।",
      });
    } catch (e) {
      toast({ title: "মার্জ করা যায়নি", description: String(e), variant: "destructive" });
    } finally {
      setMultiMergedBusy(false);
    }
  };

  /** প্রতিটা ফাইলের শাফল্ড .docx এক ZIP-এ */
  const handleMultiZipDownload = async () => {
    if (!shuffleItems || !shuffleMultiSets) return;
    setMultiZipBusy(true);
    try {
      const out: Array<{ name: string; blob: Blob }> = [];
      for (let i = 0; i < shuffleItems.length; i++) {
        const it = shuffleItems[i];
        if (it.parse.questions.length === 0) continue;
        const xml = buildShuffledXml(it.xml, it.parse.questions, shuffleMultiSets[i] ?? [], {
          renumber,
          includeSetHeader: true,
        });
        out.push({ name: `${it.baseName} (shuffled).docx`, blob: await replaceDocumentXml(it.file, xml) });
      }
      if (!out.length) throw new Error("ডাউনলোড করার মতো ফাইল নেই");
      const zip = await buildZipBlob(out);
      downloadBlob(zip, "MCQ-shuffled-files.zip");
      toast({
        title: "✅ ZIP ডাউনলোড হয়েছে",
        description: `${out.length} টি আলাদা শাফল্ড ফাইল ভিতরে আছে।`,
      });
    } catch (e) {
      toast({ title: "ZIP বানানো যায়নি", description: String(e), variant: "destructive" });
    } finally {
      setMultiZipBusy(false);
    }
  };

  // ---- TEXT mode সেট অ্যাকশন ----
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

  // ---- TEXT mode এক্সপোর্ট ----
  const handleExportDocx = async () => {
    if (!sets) return;
    setBusy("docx");
    try {
      await exportDocx(sets, exportOpts);
      toast({ title: "✅ Word ফাইল ডাউনলোড হয়েছে", description: "প্রতিটি সেট আলাদা পেজে আছে।" });
    } catch (e) {
      toast({ title: "ডাউনলোডে সমস্যা", description: String(e), variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  const handleExportDoc = () => {
    if (!sets) return;
    try {
      exportDocHtml(sets, exportOpts);
      toast({ title: "✅ .doc ফাইল ডাউনলোড হয়েছে" });
    } catch (e) {
      toast({ title: "ডাউনলোডে সমস্যা", description: String(e), variant: "destructive" });
    }
  };

  const handlePrint = () => {
    if (!sets) return;
    try {
      printSets(sets, exportOpts);
    } catch (e) {
      toast({ title: "প্রিন্ট খোলা যায়নি", description: String(e), variant: "destructive" });
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
      toast({ title: "কপি করা যায়নি", description: String(e), variant: "destructive" });
    }
  };

  const handleCopyAll = async () => {
    if (!sets) return;
    setBusy("copyall");
    try {
      await copyToClipboard(allSetsClipboardText(sets, exportOpts));
      toast({ title: "📋 সব সেট কপি হয়েছে", description: "Word-এ পেস্ট করলেই পাবেন। পেজ ব্রেক চাইলে .docx ডাউনলোড করুন।" });
    } catch (e) {
      toast({ title: "কপি করা যায়নি", description: String(e), variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-b from-emerald-50/60 via-background to-background">
      {/* হেডার */}
      <header className="border-b bg-white/80 backdrop-blur dark:bg-background/80">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-3 px-4 py-4">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-sm">
            <Dices className="h-6 w-6" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-bold tracking-tight md:text-2xl">MCQ Shuffler Pro</h1>
            <p className="text-xs text-muted-foreground md:text-sm">
              ফাইল আপলোড করুন, তারপর ৩টা মোড — 🔀 শাফল+সেট • 🔢 রঙ-সিরিয়াল • 📥 রিডাউনলোড — যেকোনো মোডে কাজ শেষে ফাইল নিয়ে অন্য মোডে সরাসরি কাজ করুন • .docx হুবহু প্রিজার্ভ
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge className="gap-1 bg-emerald-100 text-emerald-800 hover:bg-emerald-100">
              <Zap className="h-3 w-3" /> ১০০% ফ্রি
            </Badge>
            <Badge variant="secondary" className="gap-1">
              <ShieldCheck className="h-3 w-3" /> ডেটা ব্রাউজারেই থাকে
            </Badge>
          </div>
        </div>
      </header>

      {/* মেইন */}
      <main className="mx-auto w-full max-w-5xl flex-1 space-y-5 px-3 py-6 sm:px-4">
        {!hasAnyInput ? (
          /* ধাপ ১ — কোনো ইনপুট নেই: আগে ফাইল আপলোড (মোড-বাটন এখনো দেখায় না) */
          <UploadFirstCard
            onFiles={(fs) => setStagedFiles(fs)}
            onTextFileLoaded={loadAndDetect}
            rawText={rawText}
            onTextChange={handleTextChange}
            onDetect={handleDetect}
            onSample={handleSample}
            busy={detecting}
          />
        ) : (
          <>
            {/* স্টেজ হওয়া ফাইল — মোড-বাটনে ক্লিক করলেই ওই মোডে চলে যাবে */}
            {stagedFiles && <StagedFilesCard files={stagedFiles} onClear={() => setStagedFiles(null)} />}

            {/* মোড-বাটন — শাফল, সিরিয়াল, রিডাউনলোড */}
            <ModeTabs mode={mode} onChange={changeMode} />

            {/* স্টেজ খালি হলেই মোডের কাজের জায়গা দেখা যায় */}
            {!stagedFiles && (
              <>
        {mode === "redownload" ? (
          <>
            <RedownloadInputCard
              onFiles={loadRedownloadFiles}
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
                />

                {rdDocs.map((d) => (
                  <RedownloadQuestionsCard
                    key={d.id}
                    fileName={d.file.name}
                    questions={d.parse.questions}
                    selected={rdSelOf(d.id)}
                    onToggle={(qid) => toggleRdQuestion(d.id, qid)}
                    onSelectAll={() => selectAllRd(d.id)}
                    onSelectNone={() => selectNoneRd(d.id)}
                    onSelectRange={(f, t) => selectRangeRd(d.id, f, t)}
                    watermark={d.watermark}
                    dominant={null}
                  />
                ))}

                <MultiDownloadCard
                  title={rdDocs.length === 1 ? "৪. ডাউনলোড — বাছাই করা অংশের নতুন ফাইল" : "৪. ডাউনলোড — সব ফাইলের বাছাই করা অংশ"}
                  description={
                    rdDocs.length === 1
                      ? "টিক দেওয়া প্রশ্নগুলোর বাছাই করা অংশ নিয়ে নতুন .docx — ট্যাব, ইকুয়েশন, ওয়াটারমার্ক সব অক্ষত।"
                      : "সব ফাইল পরপর এক .docx-এ (ফাইলের মাঝে পেজ ব্রেক) অথবা ZIP-এ আলাদা আলাদা নামান।"
                  }
                  stats={`${rdDocs.length} টি ফাইল • সিলেক্টেড ${rdSelTotal} টি প্রশ্ন`}
                  onDownloadMerged={handleRdMerged}
                  onDownloadZip={handleRdZip}
                  mergedBusy={rdMergedBusy}
                  zipBusy={rdZipBusy}
                  fileCount={rdDocs.length}
                />

                <NextModesCard current="redownload" filesCount={rdFileCount} onOpen={changeMode} />
              </>
            )}
          </>
        ) : mode === "serial" ? (
          <>
            <SerialInputCard
              onFiles={(fs) => loadSerialFiles(fs, false)}
              onAddFiles={(fs) => loadSerialFiles(fs, true)}
              loading={serialLoading}
              items={serialDocs.map((d) => ({
                id: d.id,
                name: d.file.name,
                status: "ready" as const,
                questionCount: d.analysis.questionCount,
              }))}
              onReorder={reorderSerialDocs}
              onRemove={removeSerialDoc}
              pasteText={serialPasteText}
              onPasteTextChange={setSerialPasteText}
              onPasteDetect={handleSerialPasteDetect}
              pasteBusy={serialPasteBusy}
            />

            {/* পেস্ট-ডিটেকশন রেজাল্ট — ফাইল লোড থাকলে রেন্ডার নয় (পারস্পরিক একচেটিয়া) */}
            {serialDocs.length === 0 && serialPaste && serialPaste.questions.length > 0 && (
              <SerialPasteCard
                result={serialPaste}
                fixing={serialPasteFixing}
                downloading={serialPasteDlBusy}
                onFix={handleSerialPasteFix}
                onDownload={handleSerialPasteDownload}
              />
            )}

            {/* ঠিক ১ টা ফাইল — পুরনো রঙ-চিপ কার্ড */}
            {serialDocs.length === 1 && serialDoc ? (
              serialDoc.analysis.colors.length > 0 ? (
                <ColorSerialCard
                  analysis={serialDoc.analysis}
                  fileName={serialDoc.file.name}
                  busy={serialBusy}
                  onSerial={handleColorSerial}
                />
              ) : (
                <NoColorSerialCard
                  questionCount={serialDoc.analysis.questionCount}
                  busy={serialBusy}
                  onContinuous={() => handleColorSerial({ kind: "continuous" }, "continuous")}
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
                  title="সব ফাইল একসাথে সিরিয়াল করুন"
                  description="প্রতিটা ফাইলের সব প্রশ্ন পরপর নম্বর পাবে — রঙ-হেডার, ইকুয়েশন, ছবি সব অক্ষত থাকবে। রঙ-অনুযায়ী সিরিয়াল লাগলে ওই ফাইলটা একা আপলোড করুন।"
                  stats={`${serialDocs.length} টি ফাইল • মোট ${serialDocs.reduce((a, d) => a + d.analysis.questionCount, 0)} টি প্রশ্ন`}
                  showSerialChoice
                  serialStrategy={serialStrategy}
                  onSerialStrategyChange={setSerialStrategy}
                  onDownloadMerged={handleSerialMultiMerged}
                  onDownloadZip={handleSerialMultiZip}
                  mergedBusy={serialMergedBusy}
                  zipBusy={serialZipBusy}
                  fileCount={serialDocs.length}
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
            <InputCard
              rawText={rawText}
              onTextChange={handleTextChange}
              onDetect={handleDetect}
              onSample={handleSample}
              onDocxFile={handleDocxFile}
              onDocxFiles={handleShuffleFiles}
              onTextFileLoaded={loadAndDetect}
              detecting={detecting}
              detected={parsed !== null && parsed.questions.length > 0}
              docxLoading={docxLoading || shuffleLoading}
            />

            {shuffleItems ? (
              <>
                {/* মাল্টি-ফাইল লিস্ট — টেনে ক্রম বদলানো যায় */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base md:text-lg">
                      📂 আপলোড হওয়া ফাইল ({shuffleItems.length} টি)
                    </CardTitle>
                    <CardDescription>
                      ক্রম বদলাতে টেনে ধরুন বা তীর চাপুন — মার্জ/ZIP-এ ঠিক এই ক্রমেই আসবে। প্রতিটা ফাইল নিজের ভিতরেই শাফল হবে।
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <MultiFileList
                      items={shuffleItems.map((it) => ({
                        id: it.id,
                        name: it.file.name,
                        status: "ready" as const,
                        questionCount: it.parse.questions.length,
                      }))}
                      onReorder={reorderShuffleItems}
                      onRemove={removeShuffleItem}
                      disabled={shuffleLoading || multiShuffling}
                    />
                  </CardContent>
                </Card>

                {shuffleItems.some((i) => i.blocked.length > 0) && (
                  <BlockedLinesCard blocked={shuffleItems.flatMap((i) => i.blocked)} />
                )}

                <ShuffleCard
                  enabled={multiGateReason === null}
                  lockReason={multiGateReason}
                  selectedCount={shuffleMultiTotal}
                  setCount={setCount}
                  onSetCountChange={setSetCount}
                  distribution={distribution}
                  onDistributionChange={setDistribution}
                  shuffleWithin={shuffleWithin}
                  onShuffleWithinChange={setShuffleWithin}
                  onShuffle={handleShuffle}
                  shuffling={multiShuffling}
                />

                <div ref={resultsRef} className="scroll-mt-4">
                  {shuffleMultiSets && (
                    <MultiDownloadCard
                      title="শাফল সম্পন্ন — এখন ডাউনলোড করুন"
                      description="প্রতিটা ফাইলের সেটগুলো আলাদা পেজে, সিরিয়াল ১,২,৩… করা।"
                      stats={`${shuffleItems.length} টি ফাইল • প্রতি ফাইলে ${setCount} টি সেট`}
                      onDownloadMerged={handleMultiMergedDownload}
                      onDownloadZip={handleMultiZipDownload}
                      mergedBusy={multiMergedBusy}
                      zipBusy={multiZipBusy}
                      fileCount={shuffleItems.length}
                    />
                  )}
                </div>

                <NextModesCard current="shuffle" filesCount={shuffleFileCount} onOpen={changeMode} />
              </>
            ) : docx ? (
              <>
                {docx.colorAn && (
                  <ColorShuffleInfoCard
                    analysis={docx.colorAn}
                    headersStripped={docx.headersStripped}
                    fileName={docx.file.name}
                    onOpenSerial={openInSerialMode}
                  />
                )}

                {docx.blocked.length > 0 && <BlockedLinesCard blocked={docx.blocked} />}

                {docx.parse && (
                  <DocxDetectCard
                    parse={docx.parse}
                    fileName={docx.file.name}
                    selected={selected}
                    onToggle={toggleQuestion}
                    onSelectAll={selectAll}
                    onSelectNone={selectNone}
                    onSelectRange={selectRange}
                    onSerialFix={handleDocxSerialFix}
                    fixing={fixing}
                    allowBroken={allowBroken}
                    onAllowBrokenChange={setAllowBroken}
                    encStats={encData.stats}
                    dominant={encData.dominant}
                  />
                )}

                <ShuffleCard
                  enabled={canShuffle}
                  lockReason={gateReason ?? null}
                  selectedCount={selected.size}
                  setCount={setCount}
                  onSetCountChange={setSetCount}
                  distribution={distribution}
                  onDistributionChange={setDistribution}
                  shuffleWithin={shuffleWithin}
                  onShuffleWithinChange={setShuffleWithin}
                  onShuffle={handleShuffle}
                  shuffling={shuffling}
                />

                <div ref={resultsRef} className="scroll-mt-4">
                  {setsDocx && docx.parse && (
                    <DocxSetsResult
                      sets={setsDocx}
                      questions={docx.parse.questions}
                      renumber={renumber}
                      onRenumberChange={toggleSerialByClick}
                      busy={busy}
                      copiedSet={copiedSet}
                      onDownload={handleDocxDownload}
                      onCopySet={handleDocxCopySet}
                      dominant={encData.dominant}
                    />
                  )}
                </div>

                <NextModesCard current="shuffle" filesCount={shuffleFileCount} onOpen={changeMode} />
              </>
            ) : (
              <>
                <DetectCard
                  parsed={parsed}
                  selected={selected}
                  onToggle={toggleQuestion}
                  onSelectAll={selectAll}
                  onSelectNone={selectNone}
                  onSelectRange={selectRange}
                  onAutoFix={handleAutoFix}
                  allowBroken={allowBroken}
                  onAllowBrokenChange={setAllowBroken}
                  fixing={fixing}
                  encStats={encData.stats}
                  dominant={encData.dominant}
                />

                <ShuffleCard
                  enabled={canShuffle}
                  lockReason={parsed ? gateReason : "প্রথমে প্রশ্ন ডিটেক্ট করুন"}
                  selectedCount={selected.size}
                  setCount={setCount}
                  onSetCountChange={setSetCount}
                  distribution={distribution}
                  onDistributionChange={setDistribution}
                  shuffleWithin={shuffleWithin}
                  onShuffleWithinChange={setShuffleWithin}
                  onShuffle={handleShuffle}
                  shuffling={shuffling}
                />

                <div ref={resultsRef} className="scroll-mt-4">
                  {sets && (
                    <SetsResult
                      sets={sets}
                      sortedFlags={sortedFlags}
                      onToggleSort={toggleSort}
                      onReshuffleSet={toggleSort}
                      exportOpts={exportOpts}
                      onExportOptsChange={setExportOpts}
                      onExportDocx={handleExportDocx}
                      onExportDoc={handleExportDoc}
                      onPrint={handlePrint}
                      onCopySet={handleCopySet}
                      onCopyAll={handleCopyAll}
                      busy={busy}
                      copiedSet={copiedSet}
                      dominant={encData.dominant}
                    />
                  )}
                </div>

                {/* টেক্সট-ফ্লোতে ফাইল নেই — NextModesCard নিজেই null রেন্ডার করে */}
                <NextModesCard current="shuffle" filesCount={shuffleFileCount} onOpen={changeMode} />
              </>
            )}
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
          MCQ Shuffler Pro — অফিস, স্কুল, কোচিং সেন্টার ও ভার্সিটির জন্য ফ্রি টুল। সব প্রসেসিং আপনার ব্রাউজারেই হয়, কোনো প্রশ্ন সার্ভারে যায় না।
        </div>
      </footer>
    </div>
  );
}
