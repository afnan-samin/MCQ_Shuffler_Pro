"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { AlertTriangle, CheckCircle2, ChevronDown, Wrench, ListChecks, ScanText } from "lucide-react";
import type { ParseOutput } from "@/lib/mcq/parser";
import { digitsToNumber } from "@/lib/mcq/docx-xml";
import { lineDominantOf, type Enc, type EncodingStats } from "@/lib/mcq/encoding";
import { TokText } from "@/components/mcq/tok-text";

interface DetectCardProps {
  parsed: ParseOutput | null;
  selected: Set<number>;
  onToggle: (id: number) => void;
  onSelectAll: () => void;
  onSelectNone: () => void;
  onSelectRange: (fromPos: number, toPos: number) => void;
  onAutoFix: () => void;
  allowBroken: boolean;
  onAllowBrokenChange: (v: boolean) => void;
  fixing: boolean;
  /** শব্দ-ধরে এনকোডিং ডিটেক্টরের ফলাফল */
  encStats: EncodingStats | null;
  /** ডকুমেন্টের প্রধান লেখার ধরন */
  dominant: Enc | null;
}

const PAGE = 100;
const DETECT_PREVIEW_LINES = 30;

export function DetectCard({
  parsed,
  selected,
  onToggle,
  onSelectAll,
  onSelectNone,
  onSelectRange,
  onAutoFix,
  allowBroken,
  onAllowBrokenChange,
  fixing,
  encStats,
  dominant,
}: DetectCardProps) {
  const [visible, setVisible] = useState(PAGE);
  const [rangeFrom, setRangeFrom] = useState("");
  const [rangeTo, setRangeTo] = useState("");

  const stats = useMemo(() => {
    if (!parsed) return null;
    const withOptions = parsed.questions.filter((q) => q.options.length >= 2).length;
    return { total: parsed.questions.length, withOptions };
  }, [parsed]);

  // ডিটেক্টর প্রিভিউ — প্রথম কয়েকটি লাইন শব্দ-ধরে রঙসহ
  const previewLines = useMemo(() => {
    if (!parsed) return [] as { text: string; kind: "preamble" | "q" | "o" }[];
    const out: { text: string; kind: "preamble" | "q" | "o" }[] = [];
    for (const p of parsed.preamble.slice(0, 4)) out.push({ text: p, kind: "preamble" });
    for (const q of parsed.questions) {
      for (let i = 0; i < q.lines.length; i++) {
        out.push({ text: q.lines[i], kind: i === 0 ? "q" : "o" });
      }
      if (out.length >= DETECT_PREVIEW_LINES) break;
    }
    return out.slice(0, DETECT_PREVIEW_LINES);
  }, [parsed]);

  if (!parsed || !stats) return null;

  const serial = parsed.serial;
  const questions = parsed.questions;
  const shown = questions.slice(0, visible);

  const scriptLabel =
    parsed.numberScript === "bn" ? "Bengali numerals (১,২,৩)" : parsed.numberScript === "en" ? "English numerals (1,2,3)" : parsed.numberScript === "mixed" ? "Mixed Bengali + English" : "—";

  const applyRange = () => {
    // বাংলা ও English — দুই ডিজিটেই রেঞ্জ চলে (parseInt("৫")=NaN হতো — বাংলা রেঞ্জ নীরবে নো-অপ হতো)
    const f = digitsToNumber(rangeFrom.trim());
    const t = digitsToNumber(rangeTo.trim());
    if (f && t && f.num >= 1 && t.num >= f.num && t.num <= questions.length) {
      onSelectRange(f.num - 1, t.num - 1);
    }
  };

  return (
    <Card id="step-detect">
      <CardHeader>
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-600 text-sm font-bold text-white">2</span>
          <CardTitle className="text-lg md:text-xl">Detection result & question selection</CardTitle>
        </div>
        <CardDescription>Tick the questions you want to shuffle.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* স্ট্যাটস */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <div className="rounded-xl border bg-white p-3 text-center dark:bg-background">
            <div className="text-2xl font-bold text-emerald-700 dark:text-emerald-400">{stats.total}</div>
            <div className="text-xs text-muted-foreground">Questions detected</div>
          </div>
          <div className="rounded-xl border bg-white p-3 text-center dark:bg-background">
            <div className="text-2xl font-bold text-emerald-700 dark:text-emerald-400">{stats.withOptions}</div>
            <div className="text-xs text-muted-foreground">With options</div>
          </div>
          <div className="rounded-xl border bg-white p-3 text-center dark:bg-background">
            <div className="mt-1 text-sm font-semibold">{scriptLabel}</div>
            <div className="text-xs text-muted-foreground">Number style</div>
          </div>
          <div className="rounded-xl border bg-white p-3 text-center dark:bg-background">
            <div className="text-2xl font-bold text-emerald-700 dark:text-emerald-400">
              {selected.size}
            </div>
            <div className="text-xs text-muted-foreground">Selected</div>
          </div>
        </div>

        {/* শব্দ-ধরে এনকোডিং ডিটেক্টর */}
        {encStats && encStats.total > 0 && (
          <div className="rounded-xl border border-sky-200 bg-sky-50/50 p-4 dark:border-sky-900 dark:bg-sky-950/20">
            <div className="flex flex-wrap items-center gap-2">
              <ScanText className="h-5 w-5 text-sky-700 dark:text-sky-400" />
              <span className="font-semibold text-sky-900 dark:text-sky-200">Word-by-word detector</span>
              <span className="text-xs text-sky-700/80 dark:text-sky-400/80">
                — every word checked: Bijoy, Unicode, or English
              </span>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-4">
              <div className="rounded-lg border bg-white p-2 text-center dark:bg-background">
                <div className="text-lg font-bold">{encStats.total}</div>
                <div className="text-[11px] text-muted-foreground">Words checked</div>
              </div>
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-2 text-center dark:border-amber-900 dark:bg-amber-950/30">
                <div className="text-lg font-bold text-amber-800 dark:text-amber-300">
                  {encStats.bijoy} <span className="text-xs font-medium">({Math.round((encStats.bijoy / encStats.total) * 100)}%)</span>
                </div>
                <div className="text-[11px] text-amber-700 dark:text-amber-400">Bijoy (SutonnyMJ)</div>
              </div>
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-2 text-center dark:border-emerald-900 dark:bg-emerald-950/30">
                <div className="text-lg font-bold text-emerald-800 dark:text-emerald-300">
                  {encStats.unicode} <span className="text-xs font-medium">({Math.round((encStats.unicode / encStats.total) * 100)}%)</span>
                </div>
                <div className="text-[11px] text-emerald-700 dark:text-emerald-400">Unicode Bengali (Avro)</div>
              </div>
              <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-2 text-center dark:border-indigo-900 dark:bg-indigo-950/30">
                <div className="text-lg font-bold text-indigo-800 dark:text-indigo-300">
                  {encStats.english} <span className="text-xs font-medium">({Math.round((encStats.english / encStats.total) * 100)}%)</span>
                </div>
                <div className="text-[11px] text-indigo-700 dark:text-indigo-400">English</div>
              </div>
            </div>

            {/* প্রিভিউ — শব্দ ধরে রঙ ও ফন্ট */}
            <div className="mt-3 space-y-1 rounded-lg border bg-white p-3 text-[13px] leading-relaxed dark:bg-background">
              {previewLines.map((ln, i) => (
                <div key={i} className={ln.kind === "preamble" ? "font-medium text-muted-foreground" : ""}>
                  <TokText line={ln.text} dominant={lineDominantOf(ln.text) ?? dominant} />
                </div>
              ))}
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span className="tok tok-bijoy px-1">Avi evsjv</span> = Bijoy → shown in SutonnyMJ font
              </span>
              <span className="flex items-center gap-1.5">
                <span className="tok tok-unicode px-1">বাংলা</span> = Unicode
              </span>
              <span className="flex items-center gap-1.5">
                <span className="tok tok-english px-1">English</span> = English
              </span>
            </div>
          </div>
        )}

        {/* সিরিয়াল স্ট্যাটাস */}
        {serial && (
          <div
            className={`rounded-xl border p-4 ${
              serial.status === "ok"
                ? "border-emerald-300 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/30"
                : "border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30"
            }`}
          >
            <div className="flex flex-wrap items-center gap-3">
              {serial.status === "ok" ? (
                <CheckCircle2 className="h-6 w-6 shrink-0 text-emerald-600" />
              ) : (
                <AlertTriangle className="h-6 w-6 shrink-0 text-amber-600" />
              )}
              <div className="min-w-0 flex-1">
                {serial.status === "ok" ? (
                  <>
                    <div className="font-semibold text-emerald-800 dark:text-emerald-300">
                      ✅ Serial is correct — ready to shuffle!
                    </div>
                    <div className="mt-0.5 text-sm text-emerald-700/80 dark:text-emerald-400/80">
                      Question numbers run consecutively from {serial.startAt} to {questions[questions.length - 1].originalNumber}.
                      {!serial.startsAtOne && " (Note: doesn't start at 1, but the order is correct)"}
                    </div>
                  </>
                ) : (
                  <>
                    <div className="font-semibold text-amber-800 dark:text-amber-300">
                      ⚠️ Found {Math.min(serial.issues.length, 30)} problem(s) in the serial
                    </div>
                    <div className="mt-1 text-sm text-amber-700/90 dark:text-amber-400/90">
                      {serial.issues.slice(0, 3).map((is, i) => (
                        <div key={i}>
                          Question #{is.index + 1}: expected number {is.expected}, found {is.found}
                        </div>
                      ))}
                      {serial.issues.length > 3 && <div>...and {serial.issues.length - 3} more</div>}
                    </div>
                  </>
                )}
              </div>
            </div>

            {serial.status === "broken" && (
              <div className="mt-3 flex flex-wrap items-center gap-4 border-t border-amber-200 pt-3 dark:border-amber-800">
                <Button size="sm" className="gap-2 bg-amber-600 hover:bg-amber-700" onClick={onAutoFix} disabled={fixing}>
                  <Wrench className="h-4 w-4" />
                  {fixing ? "Fixing..." : "🔧 Fix numbering automatically"}
                </Button>
                <div className="flex items-center gap-2">
                  <Switch id="allow-broken" checked={allowBroken} onCheckedChange={onAllowBrokenChange} />
                  <Label htmlFor="allow-broken" className="text-sm cursor-pointer">
                    Run as-is
                  </Label>
                </div>
              </div>
            )}
          </div>
        )}

        {/* সিলেকশন টুলবার */}
        <div className="flex flex-wrap items-center gap-3 rounded-xl border bg-muted/40 p-3">
          <ListChecks className="h-4 w-4 text-emerald-700 dark:text-emerald-400" />
          <Button size="sm" variant="outline" onClick={onSelectAll}>
            Select all
          </Button>
          <Button size="sm" variant="outline" onClick={onSelectNone}>
            Deselect all
          </Button>
          <div className="flex items-center gap-1.5">
            <Input
              value={rangeFrom}
              onChange={(e) => setRangeFrom(e.target.value)}
              className="h-8 w-16 text-center"
              placeholder="From"
              inputMode="numeric"
            />
            <span className="text-sm text-muted-foreground">—</span>
            <Input
              value={rangeTo}
              onChange={(e) => setRangeTo(e.target.value)}
              className="h-8 w-16 text-center"
              placeholder="To"
              inputMode="numeric"
            />
            <Button size="sm" variant="outline" onClick={applyRange}>
              Select range
            </Button>
          </div>
          <span className="text-xs text-muted-foreground">(position numbers, e.g. 1 to 50)</span>
        </div>

        {/* প্রশ্ন লিস্ট — Bijoy শব্দ SutonnyMJ ফন্টে */}
        <div className="max-h-[420px] space-y-1 overflow-y-auto rounded-xl border p-3 mcq-scroll">
          {shown.map((q, pos) => (
            <label
              key={q.id}
              className="flex cursor-pointer items-start gap-2.5 rounded-lg px-2 py-1.5 transition hover:bg-emerald-50 dark:hover:bg-emerald-950/30"
            >
              <Checkbox
                checked={selected.has(q.id)}
                onCheckedChange={() => onToggle(q.id)}
                className="mt-0.5"
              />
              <span className="min-w-0 flex-1 text-sm leading-snug">
                <span className="mr-1.5 inline-block min-w-[2.2rem] text-right font-semibold text-emerald-700 dark:text-emerald-400">
                  {q.originalNumber}.
                </span>
                <span className="text-foreground/90">
                  <TokText
                    line={q.lines[0].replace(/^[\s০-৯0-9.।):–\-—]+/, "")}
                    dominant={lineDominantOf(q.lines[0]) ?? dominant}
                    colored={false}
                  />
                </span>
                {q.options.length > 0 && (
                  <Badge variant="secondary" className="ml-2 h-5 px-1.5 text-[10px]">
                    {q.options.length} options
                  </Badge>
                )}
                {q.lines.length > 1 + q.options.length && (
                  <span className="ml-2 text-xs text-muted-foreground">(+{q.lines.length - 1 - q.options.length} lines)</span>
                )}
              </span>
              <span className="sr-only">Question position {pos + 1}</span>
            </label>
          ))}
          {visible < questions.length && (
            <Button
              variant="ghost"
              size="sm"
              className="w-full gap-1 text-emerald-700 dark:text-emerald-400"
              onClick={() => setVisible((v) => v + PAGE)}
            >
              <ChevronDown className="h-4 w-4" />
              Show more ({questions.length - visible} remaining)
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
