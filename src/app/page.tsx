"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { InputCard } from "@/components/mcq/input-card";
import { DetectCard } from "@/components/mcq/detect-card";
import { ShuffleCard } from "@/components/mcq/shuffle-card";
import { SetsResult } from "@/components/mcq/sets-result";
import { Badge } from "@/components/ui/badge";
import {
  autoFixNumbering,
  parseMcq,
  type ParseOutput,
} from "@/lib/mcq/parser";
import { buildSets, shuffled, type Distribution } from "@/lib/mcq/set-engine";
import {
  allSetsClipboardText,
  copyToClipboard,
  exportDocHtml,
  exportDocx,
  printSets,
  DEFAULT_EXPORT_OPTIONS,
  type ExportOptions,
} from "@/lib/mcq/exporter";
import { SAMPLE_MCQ } from "@/lib/mcq/sample";
import { toast } from "@/hooks/use-toast";
import { Dices, ShieldCheck, Zap } from "lucide-react";

const STORAGE_KEY = "mcq-shuffler-text";

export default function Home() {
  // ---- ইনপুট ----
  const [rawText, setRawText] = useState("");
  const [hydrated, setHydrated] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const [parsed, setParsed] = useState<ParseOutput | null>(null);

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
  const [sortedFlags, setSortedFlags] = useState<boolean[]>([]);
  const [exportOpts, setExportOpts] = useState<ExportOptions>(DEFAULT_EXPORT_OPTIONS);
  const [busy, setBusy] = useState<string | null>(null);
  const [copiedSet, setCopiedSet] = useState<number | null>(null);

  const resultsRef = useRef<HTMLDivElement>(null);

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

  // হেডার অটো-প্রি-ফিল (প্রথমবার ডিটেক্টে)
  useEffect(() => {
    if (parsed && exportOpts.headerText === "" && parsed.preamble.length) {
      setExportOpts((o) => ({ ...o, headerText: parsed.preamble.join("\n") }));
    }
  }, [parsed]);

  const handleTextChange = (t: string) => {
    setRawText(t);
    // টেক্সট বদলালে পুরনো রেজাল্ট বাতিল
    if (parsed) {
      setParsed(null);
      setSelected(new Set());
      setSets(null);
    }
  };

  const handleDetect = () => {
    if (!rawText.trim()) return;
    setDetecting(true);
    setSets(null);
    try {
      const result = parseMcq(rawText);
      setParsed(result);
      setSelected(new Set(result.questions.map((q) => q.id)));
      setAllowBroken(false);
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
    } finally {
      setDetecting(false);
    }
  };

  const handleSample = () => {
    setRawText(SAMPLE_MCQ);
    setParsed(null);
    setSelected(new Set());
    setSets(null);
    toast({ title: "নমুনা প্রশ্ন লোড হয়েছে", description: "এখন 'প্রশ্ন ডিটেক্ট করুন' চাপুন।" });
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

  const selectAll = () => {
    if (!parsed) return;
    setSelected(new Set(parsed.questions.map((q) => q.id)));
  };

  const selectNone = () => setSelected(new Set());

  const selectRange = (fromPos: number, toPos: number) => {
    if (!parsed) return;
    const next = new Set<number>();
    for (let i = fromPos; i <= toPos && i < parsed.questions.length; i++) next.add(parsed.questions[i].id);
    setSelected(next);
  };

  // ---- শাফল গেট ----
  const serialOk = parsed?.serial?.status === "ok";
  const gateReason = useMemo(() => {
    if (!parsed) return "প্রথমে প্রশ্ন ডিটেক্ট করুন";
    if (parsed.questions.length === 0) return "কোনো প্রশ্ন পাওয়া যায়নি";
    if (!serialOk && !allowBroken) return "সিরিয়াল ঠিক নেই — অটো নম্বরিং ঠিক করুন অথবা 'যেভাবে আছে তেভাবে চালান' চালু করুন";
    if (selected.size === 0) return "অন্তত একটি প্রশ্ন সিলেক্ট করুন";
    if (selected.size < 2) return "অন্তত ২ টি প্রশ্ন সিলেক্ট করুন";
    return null;
  }, [parsed, serialOk, allowBroken, selected.size]);

  const canShuffle = gateReason === null;

  const handleShuffle = () => {
    if (!parsed || !canShuffle) return;
    setShuffling(true);
    try {
      const pool = parsed.questions.filter((q) => selected.has(q.id));
      const result = buildSets(pool, { setCount, distribution, shuffleWithin });
      setSets(result);
      setSortedFlags(result.map((_, i) => distribution === "chunk" && !shuffleWithin));
      setTimeout(() => {
        resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 80);
      toast({
        title: `🔀 ${setCount} টি সেট তৈরি হয়েছে!`,
        description: `${pool.length} টি প্রশ্ন ভাগ হয়েছে। এখন Word ফাইল ডাউনলোড করতে পারেন।`,
      });
    } finally {
      setShuffling(false);
    }
  };

  // ---- সেট অ্যাকশন ----
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

  const reshuffleSet = (si: number) => toggleSort(si);

  // ---- এক্সপোর্ট ----
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
              MCQ শাফল • সেট তৈরি • সিরিয়াল ডিটেক্ট — Bijoy ও English ফন্ট সাপোর্ট
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
      <main className="mx-auto w-full max-w-5xl flex-1 space-y-5 px-4 py-6">
        <InputCard
          rawText={rawText}
          onTextChange={handleTextChange}
          onDetect={handleDetect}
          onSample={handleSample}
          detecting={detecting}
          detected={parsed !== null && parsed.questions.length > 0}
        />

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
            />
          )}
        </div>
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
