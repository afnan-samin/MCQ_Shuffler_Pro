"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { InputCard } from "@/components/mcq/input-card";
import { DetectCard } from "@/components/mcq/detect-card";
import { DocxDetectCard } from "@/components/mcq/docx-detect-card";
import { ShuffleCard } from "@/components/mcq/shuffle-card";
import { SetsResult } from "@/components/mcq/sets-result";
import { DocxSetsResult } from "@/components/mcq/docx-sets-result";
import { Badge } from "@/components/ui/badge";
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
  downloadColorSerialDocx,
  planSerialByColor,
  type ColorAnalysis,
  type SerialScheme,
} from "@/lib/mcq/color-serial";
import { ColorSerialCard } from "@/components/mcq/color-serial-card";
import { ModeTabs, type McqMode } from "@/components/mcq/mode-tabs";
import { SerialInputCard } from "@/components/mcq/serial-input-card";
import {
  ColorFileShuffleNotice,
  NoColorSerialCard,
} from "@/components/mcq/serial-extra-cards";
import {
  downloadSerialFixedDocx,
  downloadShuffledDocx,
  englishSetName,
} from "@/lib/mcq/docx-exporter";
import { SAMPLE_MCQ } from "@/lib/mcq/sample";
import { toast } from "@/hooks/use-toast";
import { Dices, ShieldCheck, Zap } from "lucide-react";

const STORAGE_KEY = "mcq-shuffler-text";
const MODE_KEY = "mcq-shuffler-mode";

interface DocxState {
  file: File;
  baseName: string;
  xml: string;
  /** রঙ-স্ট্রাকচার্ড ফাইলে null (ভারী DOM পার্স এড়াতে) — শাফল মোড তখন বন্ধই */
  parse: DocxParseResult | null;
  /** রঙ-স্ট্রাকচার্ড হলে বিশ্লেষণ — সিরিয়াল মোডে হাত-অফে পুনঃব্যবহৃত হয় */
  colorAn: ColorAnalysis | null;
}

/** সিরিয়াল মোডের আলাদা স্টেট — শাফলের সাথে কোনো মিল নেই */
interface SerialState {
  file: File;
  baseName: string;
  xml: string;
  analysis: ColorAnalysis;
}

export default function Home() {
  // ---- মোড (শাফল / সিরিয়াল — উপরের দুই বাটন) ----
  const [mode, setMode] = useState<McqMode>("shuffle");

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

  // ---- সিরিয়াল মোডের সম্পূর্ণ আলাদা স্টেট ----
  const [serialDoc, setSerialDoc] = useState<SerialState | null>(null);
  const [serialLoading, setSerialLoading] = useState(false);
  const [serialBusy, setSerialBusy] = useState(false);

  const resultsRef = useRef<HTMLDivElement>(null);

  // শেষ ব্যবহৃত মোড মনে রাখা
  useEffect(() => {
    try {
      const m = localStorage.getItem(MODE_KEY);
      if (m === "shuffle" || m === "serial") setMode(m);
    } catch {}
  }, []);

  const changeMode = (m: McqMode) => {
    setMode(m);
    try {
      localStorage.setItem(MODE_KEY, m);
    } catch {}
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
    try {
      const xml = await loadDocxXml(f);
      // রঙ-বিশ্লেষণ আগে (string-level, হালকা) — রঙ থাকলে ভারী DOM পার্স এড়ায়
      // (বিশাল ফাইলে DOMParser × একাধিকবার চললে মেমোরি ফুলে ফাইল করাপ্ট হতো)
      let colorAn: ColorAnalysis | null = null;
      try {
        colorAn = analyzeColorDocx(xml);
      } catch {}
      const hasColors = !!colorAn && colorAn.colors.length > 0;
      const parse = hasColors ? null : parseDocxXml(xml);
      setDocx({ file: f, baseName: f.name.replace(/\.docx$/i, ""), xml, parse, colorAn: hasColors ? colorAn : null });
      setParsed(null);
      resetResults();
      setSelected(new Set(parse?.questions.map((q) => q.id) ?? []));
      setAllowBroken(false);

      if (hasColors && colorAn) {
        toast({
          title: "🎨 রঙ-স্ট্রাকচার্ড ফাইল — এটা সিরিয়াল মোডের কাজ",
          description: `এই ফাইলে রঙ-দেওয়া হেডার আছে — শাফল মোডে করা যায় না। নিচের বাটনে সিরিয়াল মোডে খুলুন।${colorAn.questionCount ? ` (${colorAn.questionCount} টি প্রশ্ন পাওয়া গেছে)` : ""}`,
        });
        return;
      }

      if (!parse) {
        toast({
          title: "কোনো প্রশ্ন পাওয়া যায়নি",
          description: "প্রশ্নগুলো সিরিয়াল দিয়ে শুরু আছে কিনা দেখুন (যেমন: 32. / ১. / 1.)",
          variant: "destructive",
        });
        return;
      }

      const serialMsg =
        parse.serial?.status === "ok"
          ? "সিরিয়াল ঠিক আছে — শাফল রেডি!"
          : `সিরিয়ালে ${parse.serial?.issues.length ?? 0} টি জায়গায় সমস্যা — শাফলের সময় serial replace ON রাখলে ঠিক হয়ে যাবে।`;

      toast({
        title: `✅ ${parse.questions.length} টি প্রশ্ন ডিটেক্ট হয়েছে`,
        description: `${serialMsg}${parse.unicodeQuestionIds.length ? ` ⚠️ ${parse.unicodeQuestionIds.length} টি প্রশ্নে Unicode আছে (ডাউনলোডে অরিজিনালই থাকবে)।` : ""}`,
      });
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

  const handleSerialFile = async (f: File) => {
    setSerialLoading(true);
    try {
      const xml = await loadDocxXml(f);
      const analysis = analyzeColorDocx(xml);
      setSerialDoc({ file: f, baseName: f.name.replace(/\.docx$/i, ""), xml, analysis });
      if (analysis.colors.length > 0) {
        toast({
          title: `🎨 ${analysis.colors.length} টি রঙ পাওয়া গেছে`,
          description: `মোট ${analysis.questionCount} টি প্রশ্ন, ${analysis.shadedCount} টি রঙ-হেডার। নিচে রঙ বাছাই করে সিরিয়াল ডাউনলোড করুন।`,
        });
      } else {
        toast({
          title: "এই ফাইলে রঙ-হেডার নেই",
          description: analysis.questionCount
            ? `তবে ${analysis.questionCount} টি প্রশ্ন পাওয়া গেছে — চাইলে একটানা ১..N সিরিয়াল দেওয়া যাবে।`
            : "কোনো প্রশ্ন-লাইনও পাওয়া যায়নি — ফাইল চেক করুন।",
        });
      }
    } catch (e) {
      toast({
        title: "ফাইল পড়া যায়নি",
        description: String(e instanceof Error ? e.message : e),
        variant: "destructive",
      });
    } finally {
      setSerialLoading(false);
    }
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

  /** শাফল মোডে উঠা রঙ-ফাইল সিরিয়াল মোডে খোলা (ফাইল নিজেই চলে যায়, আবার আপলোড লাগে না) */
  const openInSerialMode = () => {
    if (!docx?.colorAn) return;
    setSerialDoc({
      file: docx.file,
      baseName: docx.baseName,
      xml: docx.xml,
      analysis: docx.colorAn,
    });
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
    if (docx) handleDocxShuffle();
    else handleTextShuffle();
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
              দুই আলাদা মোড — 🔀 শাফল+সেট তৈরি ও 🔢 রঙ-অনুযায়ী সিরিয়াল • .docx ফরম্যাট হুবহু প্রিজার্ভ (ট্যাব, ইকুয়েশন, Bijoy)
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
        {/* মোড-বাটন — শাফল আর সিরিয়ালের কাজ সম্পূর্ণ আলাদা */}
        <ModeTabs mode={mode} onChange={changeMode} />

        {mode === "serial" ? (
          <>
            <SerialInputCard
              onFile={handleSerialFile}
              loading={serialLoading}
              loadedName={serialDoc?.file.name ?? null}
            />

            {serialDoc &&
              (serialDoc.analysis.colors.length > 0 ? (
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
              ))}
          </>
        ) : (
          <>
            <InputCard
              rawText={rawText}
              onTextChange={handleTextChange}
              onDetect={handleDetect}
              onSample={handleSample}
              onDocxFile={handleDocxFile}
              onTextFileLoaded={loadAndDetect}
              detecting={detecting}
              detected={parsed !== null && parsed.questions.length > 0}
              docxLoading={docxLoading}
            />

            {docx ? (
              docx.colorAn ? (
                <ColorFileShuffleNotice
                  analysis={docx.colorAn}
                  fileName={docx.file.name}
                  onOpenSerial={openInSerialMode}
                />
              ) : (
                <>
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
                </>
              )
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
