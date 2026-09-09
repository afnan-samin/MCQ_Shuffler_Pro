"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { AlertTriangle, CheckCircle2, ChevronDown, Download, ListChecks, ScanText, TriangleAlert } from "lucide-react";
import type { DocxParseResult, DocxQuestion } from "@/lib/mcq/docx-xml";
import { DIGIT_ENC_LABEL, digitsToNumber } from "@/lib/mcq/docx-xml";
import { lineDominantOf, type Enc, type EncodingStats } from "@/lib/mcq/encoding";
import { TokText } from "@/components/mcq/tok-text";

interface DocxDetectCardProps {
  parse: DocxParseResult;
  fileName: string;
  selected: Set<number>;
  onToggle: (id: number) => void;
  onSelectAll: () => void;
  onSelectNone: () => void;
  onSelectRange: (fromPos: number, toPos: number) => void;
  /** সিরিয়াল ঠিক করে (১..N) অরিজিনাল অর্ডারে .docx ডাউনলোড */
  onSerialFix: () => void;
  fixing: boolean;
  allowBroken: boolean;
  onAllowBrokenChange: (v: boolean) => void;
  encStats: EncodingStats | null;
  dominant: Enc | null;
}

const PAGE = 50;
const PREVIEW_LINES = 24;

/** সিরিয়াল ডিজিট Word-এ যেমন দেখায় (SutonnyMJ → ১,২,৩) ওয়েবেও তেমন */
export function SerialSpan({ q, text, className = "" }: { q: DocxQuestion; text: string; className?: string }) {
  const bijoyLook = q.serialEnc === "bijoy" || (q.serialEnc === "en" && q.serialFontBijoy);
  return (
    <span className={`${bijoyLook ? "tokfont-bijoy" : ""} ${className}`}>{text}</span>
  );
}

export function DocxDetectCard({
  parse,
  fileName,
  selected,
  onToggle,
  onSelectAll,
  onSelectNone,
  onSelectRange,
  onSerialFix,
  fixing,
  allowBroken,
  onAllowBrokenChange,
  encStats,
  dominant,
}: DocxDetectCardProps) {
  const [visible, setVisible] = useState(PAGE);
  const [rangeFrom, setRangeFrom] = useState("");
  const [rangeTo, setRangeTo] = useState("");

  const questions = parse.questions;
  const stats = useMemo(() => {
    const withOptions = questions.filter((q) => q.options.length >= 2).length;
    const withAnswer = questions.filter((q) => q.answer).length;
    const withBekkha = questions.filter((q) => q.bekkha).length;
    return { total: questions.length, withOptions, withAnswer, withBekkha };
  }, [questions]);

  const serialEncLabel = questions.length
    ? DIGIT_ENC_LABEL[questions[0].serialEnc]
    : "—";

  const previewLines = useMemo(() => {
    const out: string[] = [];
    for (const q of questions) {
      for (const p of q.paras) {
        out.push(p);
        if (out.length >= PREVIEW_LINES) return out;
      }
    }
    return out;
  }, [questions]);

  if (!questions.length) return null;

  const serial = parse.serial;
  const shown = questions.slice(0, visible);

  const applyRange = () => {
    // বাংলা/Bijoy ও English — সব ডিজিটেই রেঞ্জ চলে (parseInt শুধু English পারত — বাকিগুলো নীরব নো-অপ হতো)
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
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-600 text-sm font-bold text-white">2</span>
          <CardTitle className="text-lg md:text-xl">Detection result — {fileName}</CardTitle>
        </div>
        <CardDescription>
          Read straight from the file's XML — tabs, equations, sub/superscript, Bijoy fonts all intact. Shuffling only changes the question order.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* স্ট্যাটস */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          <div className="rounded-xl border bg-white p-3 text-center dark:bg-background">
            <div className="text-2xl font-bold text-brand-700 dark:text-brand-400">{stats.total}</div>
            <div className="text-xs text-muted-foreground">Questions detected</div>
          </div>
          <div className="rounded-xl border bg-white p-3 text-center dark:bg-background">
            <div className="text-2xl font-bold text-brand-700 dark:text-brand-400">{stats.withOptions}</div>
            <div className="text-xs text-muted-foreground">With options</div>
          </div>
          <div className="rounded-xl border bg-white p-3 text-center dark:bg-background">
            <div className="text-2xl font-bold text-brand-700 dark:text-brand-400">{stats.withAnswer}</div>
            <div className="text-xs text-muted-foreground">With answers</div>
          </div>
          <div className="rounded-xl border bg-white p-3 text-center dark:bg-background">
            <div className="text-2xl font-bold text-brand-700 dark:text-brand-400">{stats.withBekkha}</div>
            <div className="text-xs text-muted-foreground">With explanations</div>
          </div>
          <div className="rounded-xl border bg-white p-3 text-center dark:bg-background">
            <div className="mt-1 text-[13px] font-semibold leading-snug">{serialEncLabel}</div>
            <div className="text-xs text-muted-foreground">Serial style</div>
          </div>
          <div className="rounded-xl border bg-white p-3 text-center dark:bg-background">
            <div className="text-2xl font-bold text-brand-700 dark:text-brand-400">{selected.size}</div>
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
                — Bijoy / Unicode / English identified separately
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
              <div className="rounded-lg border border-brand-200 bg-brand-50 p-2 text-center dark:border-brand-900 dark:bg-brand-950/30">
                <div className="text-lg font-bold text-brand-800 dark:text-brand-300">
                  {encStats.unicode} <span className="text-xs font-medium">({Math.round((encStats.unicode / encStats.total) * 100)}%)</span>
                </div>
                <div className="text-[11px] text-brand-700 dark:text-brand-400">Unicode Bengali (Avro)</div>
              </div>
              <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-2 text-center dark:border-indigo-900 dark:bg-indigo-950/30">
                <div className="text-lg font-bold text-indigo-800 dark:text-indigo-300">
                  {encStats.english} <span className="text-xs font-medium">({Math.round((encStats.english / encStats.total) * 100)}%)</span>
                </div>
                <div className="text-[11px] text-indigo-700 dark:text-indigo-400">English</div>
              </div>
            </div>

            <div className="mt-3 space-y-1 rounded-lg border bg-white p-3 text-[13px] leading-relaxed dark:bg-background">
              {previewLines.map((ln, i) => (
                <div key={i} className="whitespace-pre-wrap break-words">
                  <TokText line={ln} dominant={lineDominantOf(ln) ?? dominant} />
                </div>
              ))}
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span className="tok tok-bijoy px-1">Avi evsjv</span> = Bijoy → SutonnyMJ font
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

        {/* Unicode warning (ডাউনলোডে অরিজিনালই থাকবে) */}
        {parse.unicodeQuestionIds.length > 0 && (
          <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/30">
            <div className="flex items-start gap-3">
              <TriangleAlert className="h-5 w-5 shrink-0 text-amber-600" />
              <div className="text-sm text-amber-800 dark:text-amber-300">
                <span className="font-semibold">{parse.unicodeQuestionIds.length} question(s) contain Unicode Bengali (Avro-style) text.</span>{" "}
                They'll be kept as-is in the downloaded file — everything else stays Bijoy (SutonnyMJ) and English.
              </div>
            </div>
          </div>
        )}

        {/* সিরিয়াল স্ট্যাটাস */}
        {serial && (() => {
          const restartOnly =
            serial.status === "broken" &&
            serial.issues.length > 0 &&
            serial.issues.every((is) => is.restart);
          return (
            <div
              className={`rounded-xl border p-4 ${
                serial.status === "ok"
                  ? "border-brand-300 bg-brand-50 dark:border-brand-800 dark:bg-brand-950/30"
                  : restartOnly
                    ? "border-sky-300 bg-sky-50 dark:border-sky-800 dark:bg-sky-950/30"
                    : "border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30"
              }`}
            >
              <div className="flex flex-wrap items-center gap-3">
                {serial.status === "ok" ? (
                  <CheckCircle2 className="h-6 w-6 shrink-0 text-brand-600" />
                ) : restartOnly ? (
                  <ListChecks className="h-6 w-6 shrink-0 text-sky-600" />
                ) : (
                  <AlertTriangle className="h-6 w-6 shrink-0 text-amber-600" />
                )}
                <div className="min-w-0 flex-1">
                  {serial.status === "ok" ? (
                    <>
                      <div className="font-semibold text-brand-800 dark:text-brand-300">
                        Serial is correct — ready to shuffle!
                      </div>
                      <div className="mt-0.5 text-sm text-brand-700/80 dark:text-brand-400/80">
                        {questions.length} question(s) in consecutive order (starting at {serial.startAt}).
                      </div>
                    </>
                  ) : restartOnly ? (
                    <>
                      <div className="font-semibold text-sky-800 dark:text-sky-300">
                        Multiple sections/exams in one file — numbering restarts at 1 in {serial.issues.length} place(s)
                      </div>
                      <div className="mt-0.5 text-sm text-sky-700/90 dark:text-sky-400/90">
                        That's not an error — each section has its own numbering (starting at {serial.startAt}). To shuffle, enable "Run as-is" below.
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="font-semibold text-amber-800 dark:text-amber-300">
                        {Math.min(serial.issues.length, 30)} serial problem(s) (duplicates/jumps)
                      </div>
                      <div className="mt-1 text-sm text-amber-700/90 dark:text-amber-400/90">
                        {serial.issues.slice(0, 3).map((is, i) => (
                          <div key={i}>
                            Question #{is.index + 1}: expected number {is.expected}, found {is.found}
                            {is.restart ? " (new section)" : ""}
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
                  <Button size="sm" className="gap-2 bg-amber-600 hover:bg-amber-700" onClick={onSerialFix} disabled={fixing}>
                    <Download className="h-4 w-4" />
                    {fixing ? "Building..." : "Fix serial & download .docx (1..N)"}
                  </Button>
                  <div className="flex items-center gap-2">
                    <Switch id="docx-allow-broken" checked={allowBroken} onCheckedChange={onAllowBrokenChange} />
                    <Label htmlFor="docx-allow-broken" className="cursor-pointer text-sm">
                      Run as-is
                    </Label>
                  </div>
                </div>
              )}
            </div>
          );
        })()}

        {/* সিলেকশন টুলবার */}
        <div className="flex flex-wrap items-center gap-3 rounded-xl border bg-muted/40 p-3">
          <ListChecks className="h-4 w-4 text-brand-700 dark:text-brand-400" />
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

        {/* প্রশ্ন লিস্ট — Bijoy সিরিয়াল ও লেখা Word-এর মত ফন্টে */}
        <div className="max-h-[420px] space-y-1 overflow-y-auto rounded-xl border p-3 mcq-scroll">
          {shown.map((q, pos) => (
            <label
              key={q.id}
              className="flex cursor-pointer items-start gap-2.5 rounded-lg px-2 py-1.5 transition hover:bg-brand-50 dark:hover:bg-brand-950/30"
            >
              <Checkbox
                checked={selected.has(q.id)}
                onCheckedChange={() => onToggle(q.id)}
                className="mt-0.5"
              />
              <span className="min-w-0 flex-1 text-sm leading-snug">
                <SerialSpan
                  q={q}
                  text={q.serialDigits}
                  className="mr-1.5 inline-block min-w-[2.2rem] text-right font-semibold text-brand-700 dark:text-brand-400"
                />
                <span className="text-foreground/90">
                  <TokText line={q.qText} dominant={lineDominantOf(q.text) ?? dominant} colored={false} />
                </span>
                {q.options.length > 0 && (
                  <Badge variant="secondary" className="ml-2 h-5 px-1.5 text-[10px]">
                    {q.options.length} options
                  </Badge>
                )}
                {q.answer && (
                  <Badge variant="outline" className="ml-1 h-5 px-1.5 text-[10px]">
                    Answer:{" "}
                    <span className={q.serialEnc === "bijoy" || q.serialEnc === "en" ? "tokfont-bijoy ml-0.5" : "ml-0.5"}>
                      {q.answer}
                    </span>
                  </Badge>
                )}
                {q.bekkha && (
                  <Badge variant="outline" className="ml-1 h-5 px-1.5 text-[10px]">
                    Explanation ✓
                  </Badge>
                )}
                {q.paras.length > 1 && (
                  <span className="ml-2 text-xs text-muted-foreground">(+{q.paras.length - 1} lines)</span>
                )}
                <span className="sr-only">Question position {pos + 1}</span>
              </span>
            </label>
          ))}
          {visible < questions.length && (
            <Button
              variant="ghost"
              size="sm"
              className="w-full gap-1 text-brand-700 dark:text-brand-400"
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
