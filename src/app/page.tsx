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
import { ColorSerialCard } from "@/components/mcq/color-serial-card";
import { ModeTabs, type McqMode } from "@/components/mcq/mode-tabs";
import { SerialInputCard } from "@/components/mcq/serial-input-card";
import { SerialPasteCard } from "@/components/mcq/serial-paste-card";
import { NextModesCard } from "@/components/mcq/next-modes-card";
import { StagedFilesCard, UploadFirstCard } from "@/components/mcq/upload-first-card";
import { ModeWorkBar } from "@/components/mcq/mode-work-bar";
import {
  BlockedLinesCard,
  ColorShuffleInfoCard,
  MultiSerialSchemeCard,
  NoColorSerialCard,
} from "@/components/mcq/serial-extra-cards";
import {
  buildSerialFixedDocxBlob,
  buildShuffledDocxBlob,
  buildShuffledXml,
  englishSetName,
} from "@/lib/mcq/docx-exporter";
import { docxBlobToPdfBlob, pdfFileNameOf, type DownloadFormat } from "@/lib/mcq/pdf-export";
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
import {
  FILE_TOO_BIG_MSG,
  prepareShuffleXml,
  runFilePipeline,
  isValidDocxZip,
} from "@/lib/mcq/file-pipeline";
import { MAX_FILE_BYTES, SHUFFLE_MAX_FILES } from "@/lib/mcq/limits";
import { toast } from "@/hooks/use-toast";
import { usePersistedJson, usePersistedString } from "@/hooks/use-persisted-state";
import { Dices, ShieldCheck, Zap } from "lucide-react";

const STORAGE_KEY = "mcq-shuffler-text";
const MODE_KEY = "mcq-shuffler-mode";
/** আউটপুট ফাইলের ফন্ট-রিম্যাপ সেটিংস — সব মোডের ডাউনলোডে এক সেটিংস (persisted) */
const FONT_SETTINGS_KEY = "mcq-font-settings";
/** রিডাউনলোডের অপশন-লেবেল কাস্টমাইজ সেটিংস (persisted) */
const OPTION_LABELS_KEY = "mcq-option-labels";
/** অপশন-লেবেল টাইপো অটো-ফিক্স (ডিফল্ট OFF — ডাউনলোড হুবহু) */
const RD_FIX_LABELS_KEY = "mcq-rd-fix-labels";

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
/** localStorage থেকে আসা মোড-ভ্যালুর গার্ড — অজানা ভ্যালু এলে ডিফল্ট "shuffle" থাকে */
function isMcqMode(raw: string): raw is McqMode {
  return raw === "shuffle" || raw === "serial" || raw === "redownload";
}
/** "Download as" ফরম্যাট-ভ্যালুর গার্ড */
function isDownloadFormat(raw: string): raw is DownloadFormat {
  return raw === "docx" || raw === "pdf";
}
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
  // ---- মোড (persisted — শেষ ব্যবহৃত মোড মনে থাকে) ----
  const [mode, setMode] = usePersistedString<McqMode>(MODE_KEY, "shuffle", isMcqMode);

  // ---- স্টেজড ফাইল — আপলোড হয়েছে, কিন্তু এখনো কোনো মোডে খোলা হয়নি ----
  // ইউজার যেকোনো মোডে ক্লিক করলে এই ফাইলগুলো ওই মোডে লোড হয়ে যায়
  const [stagedFiles, setStagedFiles] = useState<File[] | null>(null);

  // ---- ফ্লো-ধাপ: "select" = মোড-বাছাই (৩টা মোড-বাটন শুধু এখানেই), "work" = মোডের ভিতরে কাজ ----
  // মোডে ঢোকার পর ৩টা মোড-বাটন আর দেখানো হয় না — উপরে থাকে পেছনে + আরও-ফাইল বার
  const [flowStep, setFlowStep] = useState<"select" | "work">("select");

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
  // রেফারেন্স-ট্যাগ ([CU-A: 22-23] স্টাইল) কী করা হবে — ডিফল্ট রাখা
  const [refMode, setRefMode] = useState<RefMode>("keep");

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

  // ---- রেজাল্ট ----
  const [sets, setSets] = useState<McqQuestion[][] | null>(null);
  const [setsDocx, setSetsDocx] = useState<number[][] | null>(null);
  // শাফল মোডে সিরিয়াল বদলের দরকার নেই (সিরিয়ালের আলাদা মোড আছেই) —
  // ডিফল্ট OFF: ডাউনলোডে প্রশ্নের আসল নম্বরই থাকে; চাইলে টগল ON করে ১,২,৩…
  const [renumber, setRenumber] = useState(false);
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
        if (q.answer) acc.withAnswer++;
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

  /**
   * স্টেজিং-সময় .docx ভ্যালিডেশন (F3) — প্রতিটা .docx-এর হালকা JSZip চেক
   * (zip খোলা যায় + word/document.xml আছে; XML পার্স নয়)। ব্যর্থ ফাইল বাদ +
   * English টোস্ট; সবগুলো ব্যর্থ হলে স্টেজই হয় না (আপলোড-কার্ডেই থাকে)।
   */
  const stageFiles = useCallback(async (files: File[]) => {
    const valid: File[] = [];
    for (const f of files) {
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
    if (valid.length) setStagedFiles(valid);
  }, []);
  const resultsRef = useRef<HTMLDivElement>(null);
  /** লোডার রি-এন্ট্রান্সি গার্ড — state নয়, ref (stale-closure এড়াতে); চলমান লোড থাকলে নতুন কল নীরবে বাদ */
  const loadersBusyRef = useRef(false);

  // মোড / ফন্ট-সেটিংস / অপশন-লেবেল / ডাউনলোড-ফরম্যাট — use-persisted-state হুকে
  // হাইড্রেট + কমিট হয় (updateFontSettings / updateOptionLabels /
  // updateDownloadFormat এখন হুকের setter — JSX-এ কোনো পরিবর্তন নেই)।

  /**
   * ফরম্যাট-টগল অনুযায়ী চূড়ান্ত ডাউনলোড — DOCX হলে হুবহু আগের ব্লব+নাম
   * (বাইট-অভিন্ন আচরণ); PDF হলে docx-ব্লবটা ব্রাউজারেই PDF-এ কনভার্ট হয়ে
   * একই base নামের .pdf হিসেবে নামে (fontSettings আগেই docx-এ প্রয়োগ হয়ে যায়)।
   */
  const finalizeDownload = async (docxOut: { blob: Blob; fileName: string }) => {
    if (downloadFormat === "pdf") {
      const pdf = await docxBlobToPdfBlob(docxOut.blob, docxOut.fileName);
      downloadBlob(pdf, pdfFileNameOf(docxOut.fileName));
    } else {
      downloadBlob(docxOut.blob, docxOut.fileName);
    }
  };

  /** ZIP-এর এন্ট্রি-লিস্ট — DOCX হলে হুবহু আগেরটা; PDF হলে প্রতিটা এন্ট্রি .pdf-এ কনভার্ট
   * (নামের base একই) — ZIP-এর নিজের নাম/কনভেনশন অপরিবর্তিত থাকে */
  const finalizeZipEntries = async (entries: Array<{ name: string; blob: Blob }>) => {
    if (downloadFormat !== "pdf") return entries;
    const out: Array<{ name: string; blob: Blob }> = [];
    for (const e of entries) {
      out.push({ name: pdfFileNameOf(e.name), blob: await docxBlobToPdfBlob(e.blob, e.name) });
    }
    return out;
  };

  /** skipCarry=true → carry-over বাইপাস (openInSerialMode নিজেই স্টেট সাজিয়ে রাখে — দুইবার লোড/টোস্ট ঠেকাতে) */
  const changeMode = (m: McqMode, skipCarry = false) => {
    setMode(m); // persisted — localStorage-এও লেখে
    if (!skipCarry) carryToMode(m, mode);
    setFlowStep("work");
  };

  /** "পেছনে" — হোমে (ধাপ ১: আপলোড-কার্ড) ফেরা — লোড করা ফাইল/ডেটা মুছে একদম নতুন শুরু (ড্রাফট-টেক্সট localStorage-এ থাকে) */
  const backToHome = () => {
    setStagedFiles(null);
    setDocx(null);
    setParsed(null);
    setShuffleItems(null);
    setShuffleMultiSets(null);
    setSelected(new Set());
    setAllowBroken(false);
    setSerialDocs([]);
    setSerialSchemes({});
    setSerialPaste(null);
    setSerialPasteText("");
    setRdDocs([]);
    setRdSel({});
    resetResults();
    setFlowStep("select"); // hasAnyInput ফলস হলেই অটো ধাপ ১ (আপলোড-কার্ড) দেখাবে
  };

  /** কাজ-চলাকালীন "আরও ফাইল" — নতুন ফাইল বর্তমান মোডেই যোগ (append) হয় */
  const handleAddMoreFiles = (files: File[]) => {
    if (!files.length) return;
    if (mode === "serial") loadSerialFiles(files, true);
    else if (mode === "redownload") loadRedownloadFiles(files, true);
    else handleShuffleFiles(files, true);
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
    // পেস্ট/.txt ফ্লো — প্রশ্ন পেলেই সরাসরি শাফল-মোডের কাজের ভিউতে (মোড-বাছাই লাগে না)
    if (result.questions.length > 0) {
      setMode("shuffle"); // persisted — localStorage-এও লেখে
      setFlowStep("work");
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
      const run = await runFilePipeline([f], { parse: (xml) => prepareShuffleXml(xml) });
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
      setDocxLoading(false);
    }
  }, []);

  const toggleSerialByClick = (v: boolean) => setRenumber(v);

  // ================== SERIAL MODE (সম্পূর্ণ আলাদা ওয়ার্কফ্লো) ==================

  /** .docx লোড + রঙ-বিশ্লেষণ — একাধিক হলে লিস্টে বসে; append=false হলে লিস্ট বদলে যায় */
  const loadSerialFiles = async (files: File[], append: boolean) => {
    // রি-এন্ট্রান্সি গার্ড — চলমান লোড থাকলে ওভারল্যাপ কল নীরবে বাদ (state নয়, ref → stale closure নেই)
    if (loadersBusyRef.current) return;
    loadersBusyRef.current = true;
    setSerialLoading(true);
    try {
      const run = await runFilePipeline(files, { parse: (xml) => analyzeColorDocx(xml) });
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
      const merged = await buildMergedDocxBlob(items, fontSettings);
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
        out.push({ name: `${d.baseName} (serial).docx`, blob: await replaceDocumentXml(d.file, xml, fontSettings) });
      }
      const zip = await buildZipBlob(await finalizeZipEntries(out));
      downloadBlob(zip, "MCQ-serial-files.zip");
      toast({
        title: "ZIP downloaded",
        description: `${out.length} file(s), each serialized separately — all inside.`,
      });
    } catch (e) {
      toast({ title: "ZIP failed", description: String(e), variant: "destructive" });
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
    // carry বাইপাস — changeMode-এর carryToMode স্টেল serialDocs=[] পড়ে ফাইলটা আবার লোড করত (ডাবল-বিশ্লেষণ + ডাবল-টোস্ট)
    changeMode("serial", true);
    toast({
      title: "File opened in Serial mode",
      description: "Pick a color below and download the serial file.",
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
      setBusy(null);
    }
  };

  const handleDocxSerialFix = async () => {
    if (!docx?.parse) return;
    setFixing(true);
    try {
      await finalizeDownload(
        await buildSerialFixedDocxBlob({
          originalFile: docx.file,
          xml: docx.xml,
          questions: docx.parse.questions,
          baseName: docx.baseName,
          refMode,
          fontSettings,
        })
      );
      toast({
        title: `Serial-fixed .${downloadFormat === "pdf" ? "pdf" : "docx"} downloaded`,
        description: "Questions in original order with serials 1..N — formatting exactly intact.",
      });
    } catch (e) {
      toast({ title: "Download failed", description: String(e), variant: "destructive" });
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
      toast({ title: "Copy failed", description: String(e), variant: "destructive" });
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

  // ================== REDOWNLOAD MODE ==================

  /** রিডাউনলোড মোডে ফাইল লোড — পার্স + অংশ-বিশ্লেষণ + ওয়াটারমার্ক এক্সট্র্যাক্ট */
  const loadRedownloadFiles = async (files: File[], append: boolean) => {
    // রি-এন্ট্রান্সি গার্ড — চলমান লোড থাকলে ওভারল্যাপ কল নীরবে বাদ
    if (loadersBusyRef.current) return;
    loadersBusyRef.current = true;
    setRdLoading(true);
    try {
      const run = await runFilePipeline(files, {
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
          optionLabels,
          fixLabels: rdFixLabels,
        });
        return { xml, file: d.file as Blob, baseName: d.baseName };
      })
      .filter((x): x is { xml: string; file: Blob; baseName: string } => x !== null);
    return items.length ? items : null;
  };

  const handleRdMerged = async () => {
    const items = buildRdItems();
    if (!items) {
      toast({ title: "Select questions", description: "Tick questions in at least one file.", variant: "destructive" });
      return;
    }
    setRdMergedBusy(true);
    try {
      const blob =
        items.length === 1
          ? await replaceDocumentXml(items[0].file, items[0].xml, fontSettings)
          : await buildMergedDocxBlob(items, fontSettings);
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
    try {
      const files: Array<{ name: string; blob: Blob }> = [];
      for (const it of items) {
        const blob = await replaceDocumentXml(it.file, it.xml, fontSettings);
        files.push({ name: `${it.baseName} (redownload).docx`, blob });
      }
      const zip = await buildZipBlob(await finalizeZipEntries(files));
      downloadBlob(zip, "MCQ-Redownload.zip");
      toast({
        title: "ZIP downloaded",
        description: `${files.length} separate file(s) — each with the picked parts.`, 
      });
    } catch (e) {
      toast({ title: "ZIP failed", description: String(e), variant: "destructive" });
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
      const run = await runFilePipeline(list, { parse: (xml) => prepareShuffleXml(xml) });
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
    try {
      const items: Array<{ xml: string; file: Blob }> = [];
      for (let i = 0; i < shuffleItems.length; i++) {
        const it = shuffleItems[i];
        if (it.parse.questions.length === 0) continue;
        const xml = buildShuffledXml(it.xml, it.parse.questions, shuffleMultiSets[i] ?? [], {
          renumber,
          includeSetHeader: true,
          refMode,
        });
        items.push({ xml, file: await replaceDocumentXml(it.file, xml) });
      }
      if (items.length < 2) throw new Error("Not enough files to merge");
      const merged = await buildMergedDocxBlob(items, fontSettings);
      await finalizeDownload({ blob: merged, fileName: `${shuffleItems[0].baseName} (merged shuffled).docx`});
      toast({
        title:
          downloadFormat === "pdf" ? "Merged PDF file downloaded" : "Merged Word file downloaded",
        description: "All files' sets in order — page breaks between files, formatting exactly intact.",
      });
    } catch (e) {
      toast({ title: "Merging failed", description: String(e), variant: "destructive" });
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
          refMode,
        });
        out.push({ name: `${it.baseName} (shuffled).docx`, blob: await replaceDocumentXml(it.file, xml, fontSettings) });
      }
      if (!out.length) throw new Error("No files to download");
      const zip = await buildZipBlob(await finalizeZipEntries(out));
      downloadBlob(zip, "MCQ-shuffled-files.zip");
      toast({
        title: "ZIP downloaded",
        description: `${out.length} separate shuffled file(s) inside.`, 
      });
    } catch (e) {
      toast({ title: "ZIP failed", description: String(e), variant: "destructive" });
    } finally {
      setMultiZipBusy(false);
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

  /** শাফল্ড-থাকা সেটকে নতুন করে শাফল — sort-ফ্ল্যাগ untouched থাকে */
  const reshuffleSet = (si: number) => {
    if (!sets) return;
    setSets((prev) => {
      if (!prev) return prev;
      const copy = prev.map((s) => s.slice());
      copy[si] = shuffled(copy[si]);
      return copy;
    });
  };

  // ---- TEXT mode এক্সপোর্ট ----
  const handleExportDocx = async () => {
    if (!sets) return;
    setBusy("docx");
    try {
      await finalizeDownload(await buildSetsDocxBlob(sets, exportOpts, fontSettings));
      toast({
        title: downloadFormat === "pdf" ? "PDF file downloaded" : "Word file downloaded",
        description: "Each set is on its own page.",
      });
    } catch (e) {
      toast({ title: "Download failed", description: String(e), variant: "destructive" });
    } finally {
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

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-b from-brand-50/60 via-background to-background">
      {/* হেডার */}
      <header className="border-b bg-white/80 backdrop-blur dark:bg-background/80">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-3 px-4 py-4">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-600 text-white shadow-sm">
            <Dices className="h-6 w-6" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-bold tracking-tight md:text-2xl">MCQ Shuffler Pro</h1>
            <p className="text-xs text-muted-foreground md:text-sm">
              Upload a file, pick a mode, and work — switch modes any time, your files come along
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
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
            onTextFileLoaded={loadAndDetect}
            rawText={rawText}
            onTextChange={handleTextChange}
            onDetect={handleDetect}
            busy={detecting}
          />
        ) : flowStep === "select" ? (
          /* ধাপ ২ — মোড-বাছাই: ৩টা মোড-বাটন শুধু এই ধাপেই দেখা যায়; মোডে ঢুকলেই আর দেখা যায় না */
          <>
            {stagedFiles && stagedFiles.length > 0 && (
              <StagedFilesCard files={stagedFiles} onClear={() => setStagedFiles(null)} />
            )}
            <ModeTabs mode={mode} onChange={changeMode} />
          </>
        ) : (
          <>
            {/* কাজ-চলাকালীন বার — ৩ মোড আর দেখানো হয় না; বাঁয়ে পেছনে (হোমে ফেরা) + Mode Change (অন্য মোডে ফাইলসহ সুইচ), ডানে আরও ফাইল */}
            <ModeWorkBar
              mode={mode}
              onBack={backToHome}
              onModeChange={changeMode}
              onAddFiles={handleAddMoreFiles}
              busy={shuffleLoading || docxLoading || serialLoading || rdLoading || detecting || shuffling || multiShuffling || multiMergedBusy || multiZipBusy || serialBusy || serialMergedBusy || serialZipBusy || serialPasteBusy || serialPasteFixing || serialPasteDlBusy || rdMergedBusy || rdZipBusy || fixing}
              filesCount={mode === "shuffle" ? shuffleFileCount : mode === "serial" ? serialFileCount : rdFileCount}
              maxFiles={mode === "shuffle" ? SHUFFLE_MAX_FILES : undefined}
            />
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
                  found={rdFoundStats}
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
                format={downloadFormat}
                onFormatChange={updateDownloadFormat}
              />
            )}

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
            <InputCard
              rawText={rawText}
              onTextChange={handleTextChange}
              onDetect={handleDetect}
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
                      Uploaded files ({shuffleItems.length})
                    </CardTitle>
                    <CardDescription>
                      Drag or use the arrows to reorder — merge/ZIP keeps exactly this order. Each file is shuffled within itself.
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
                  refReport={multiRefReport}
                  refMode={refMode}
                  onRefModeChange={setRefMode}
                />

                {/* আউটপুট ফাইলের ফন্ট-রিম্যাপ — মার্জ/ZIP ডাউনলোডে প্রয়োগ হয় */}
                <FontSettingsCard settings={fontSettings} onChange={updateFontSettings} />

                <div ref={resultsRef} className="scroll-mt-4">
                  {shuffleMultiSets && (
                    <MultiDownloadCard
                      title="Shuffle complete — download now"
                      description="Each file's sets on separate pages, serials 1,2,3…."
                      stats={`${shuffleItems.length} file(s) • ${multiEffectiveSets} set(s) per file`}
                      onDownloadMerged={handleMultiMergedDownload}
                      onDownloadZip={handleMultiZipDownload}
                      mergedBusy={multiMergedBusy}
                      zipBusy={multiZipBusy}
                      fileCount={shuffleItems.length}
                      format={downloadFormat}
                      onFormatChange={updateDownloadFormat}
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
                  refReport={docxRefReport}
                  refMode={refMode}
                  onRefModeChange={setRefMode}
                />

                {/* আউটপুট ফাইলের ফন্ট-রিম্যাপ — ডাউনলোড ও সিরিয়াল-ফিক্স দুটোতেই প্রয়োগ হয় */}
                <FontSettingsCard settings={fontSettings} onChange={updateFontSettings} />

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
                      format={downloadFormat}
                      onFormatChange={updateDownloadFormat}
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
                  lockReason={parsed ? gateReason : "Detect questions first"}
                  selectedCount={selected.size}
                  setCount={setCount}
                  onSetCountChange={setSetCount}
                  distribution={distribution}
                  onDistributionChange={setDistribution}
                  shuffleWithin={shuffleWithin}
                  onShuffleWithinChange={setShuffleWithin}
                  onShuffle={handleShuffle}
                  shuffling={shuffling}
                  refReport={null}
                  refMode={refMode}
                  onRefModeChange={setRefMode}
                />

                {/* আউটপুট ফাইলের ফন্ট-রিম্যাপ — .docx এক্সপোর্টে প্রয়োগ হয় */}
                <FontSettingsCard settings={fontSettings} onChange={updateFontSettings} />

                <div ref={resultsRef} className="scroll-mt-4">
                  {sets && (
                    <SetsResult
                      sets={sets}
                      sortedFlags={sortedFlags}
                      onToggleSort={toggleSort}
                      onReshuffleSet={reshuffleSet}
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
                      format={downloadFormat}
                      onFormatChange={updateDownloadFormat}
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
