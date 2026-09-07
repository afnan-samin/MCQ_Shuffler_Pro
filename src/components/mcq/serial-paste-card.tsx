"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertTriangle, CheckCircle2, Download, Info, Wrench } from "lucide-react";
import type { ParseOutput } from "@/lib/mcq/parser";
import type { DownloadFormat } from "@/lib/mcq/pdf-export";
import { DownloadFormatToggle } from "@/components/mcq/download-format-toggle";

interface SerialPasteCardProps {
  result: ParseOutput;
  /** "🔧 অটো নম্বরিং ঠিক করুন" চলছে */
  fixing: boolean;
  /** সিরিয়াল .docx ডাউনলোড চলছে */
  downloading: boolean;
  /** ভাঙা সিরিয়াল অটো-ফিক্স — পেজে autoFixNumbering চলে state আপডেট হয় */
  onFix: () => void;
  /** পজিশন-অনুযায়ী ১..N রিনাম্বার করে এক সেট .docx ডাউনলোড */
  onDownload: () => void;
  /** "Download as" ফরম্যাট (DOCX ডিফল্ট) — onFormatChange দিলেই টগল রেন্ডার হয় */
  format?: DownloadFormat;
  onFormatChange?: (f: DownloadFormat) => void;
}

const scriptLabelOf = (s: ParseOutput["numberScript"]) =>
  s === "bn"
    ? "Bengali numerals (১,২,৩)"
    : s === "en"
      ? "English numerals (1,2,3)"
      : s === "mixed"
        ? "Mixed Bengali + English"
        : "—";

/**
 * সিরিয়াল মোডের পেস্ট-ডিটেকশন রেজাল্ট কার্ড — ফাইল-ফ্লোর সাথে একসাথে
 * থাকে না (ফাইল লোড হলে এই কার্ড সরে যায়)। পেস্ট = টেক্সট পাইপলাইন —
 * এখানে রঙ-ডিটেকশন হয় না, তাই অ্যাম্বার নোটসহ .docx আপলোডের ইঙ্গিত দেখানো হয়।
 */
export function SerialPasteCard({ result, fixing, downloading, onFix, onDownload, format = "docx", onFormatChange }: SerialPasteCardProps) {
  const questions = result.questions;
  const withOptions = questions.filter((q) => q.options.length >= 2).length;
  const serial = result.serial;
  const serialOk = serial?.status === "ok";
  const lastNumber = questions.length ? questions[questions.length - 1].originalNumber : 0;

  return (
    <Card id="serial-paste-result">
      <CardHeader>
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-600 text-sm font-bold text-white">2</span>
          <CardTitle className="text-lg md:text-xl">Detection result (paste)</CardTitle>
        </div>
        <CardDescription>
          Questions detected from the pasted text — download one .docx with serials renumbered 1..N by position.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* স্ট্যাট — ডিটেকশন রেজাল্টের ৩টা মূল সংখ্যা */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          <div className="rounded-xl border bg-white p-3 text-center dark:bg-background">
            <div className="text-2xl font-bold text-brand-700 dark:text-brand-400">{questions.length}</div>
            <div className="text-xs text-muted-foreground">Total questions</div>
          </div>
          <div className="rounded-xl border bg-white p-3 text-center dark:bg-background">
            <div className="text-2xl font-bold text-brand-700 dark:text-brand-400">{withOptions}</div>
            <div className="text-xs text-muted-foreground">With options</div>
          </div>
          <div className="rounded-xl border bg-white p-3 text-center dark:bg-background">
            <div className="mt-1 text-sm font-semibold">{scriptLabelOf(result.numberScript)}</div>
            <div className="text-xs text-muted-foreground">Number style</div>
          </div>
        </div>

        {/* সিরিয়াল-স্ট্যাটাস — ok হলে সবুজ, ভাঙা হলে অ্যাম্বার + অটো-ফিক্স */}
        {serial && (
          <div
            className={`rounded-xl border p-4 ${
              serialOk
                ? "border-brand-300 bg-brand-50 dark:border-brand-800 dark:bg-brand-950/30"
                : "border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30"
            }`}
          >
            <div className="flex flex-wrap items-center gap-3">
              {serialOk ? (
                <CheckCircle2 className="h-6 w-6 shrink-0 text-brand-600" />
              ) : (
                <AlertTriangle className="h-6 w-6 shrink-0 text-amber-600" />
              )}
              <div className="min-w-0 flex-1">
                {serialOk ? (
                  <>
                    <div className="font-semibold text-brand-800 dark:text-brand-300">
                      ✅ Serial is correct — download enabled!
                    </div>
                    <div className="mt-0.5 text-sm text-brand-700/80 dark:text-brand-400/80">
                      Question numbers run consecutively from {serial.startAt} to {lastNumber}.
                      {!serial.startsAtOne && " (Note: doesn't start at 1, but the order is correct — 1..N will be applied on download)"}
                    </div>
                  </>
                ) : (
                  <>
                    <div className="font-semibold text-amber-800 dark:text-amber-300">
                      ⚠️ Found {serial.issues.length} problem(s) in the serial
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

            {!serialOk && (
              <div className="mt-3 flex flex-wrap items-center border-t border-amber-200 pt-3 dark:border-amber-800">
                <Button size="sm" className="gap-2 bg-amber-600 hover:bg-amber-700" onClick={onFix} disabled={fixing}>
                  <Wrench className="h-4 w-4" />
                  {fixing ? "Fixing..." : "🔧 Fix numbering automatically"}
                </Button>
              </div>
            )}
          </div>
        )}

        {/* পেস্ট-মোডের সীমা: রঙ-ডিটেকশন হয় না */}
        <div className="flex items-start gap-2 rounded-lg border border-amber-300/60 bg-amber-50 px-3 py-2 text-xs dark:border-amber-500/30 dark:bg-amber-950/30">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <p className="text-amber-800 dark:text-amber-200">
            Paste mode doesn't detect colors — upload a .docx file for color-based serials.
          </p>
        </div>

        {/* ফরম্যাট-টগল (DOCX ডিফল্ট / PDF) — ডাউনলোড বাটনের ঠিক উপরে */}
        {onFormatChange && (
          <DownloadFormatToggle value={format} onChange={onFormatChange} disabled={downloading} />
        )}

        {/* বড় ডাউনলোড বাটন — পজিশন-অনুযায়ী ১..N রিনাম্বার করে এক সেট */}
        <Button
          type="button"
          onClick={onDownload}
          disabled={questions.length === 0 || downloading}
          className="h-auto w-full flex-col items-center gap-1 rounded-xl bg-brand-600 p-4 text-white hover:bg-brand-700 sm:w-auto"
        >
          {downloading ? (
            <span className="flex items-center gap-2 text-sm font-semibold">Generating...</span>
          ) : (
            <span className="flex items-center gap-2 text-sm font-semibold">
              <Download /> Download serial .{format === "pdf" ? "pdf" : "docx"} (1..N)
            </span>
          )}
          <span className="text-xs opacity-80">
            Question order stays exactly the same — first-line numbers start at 1 by position
          </span>
        </Button>
      </CardContent>
    </Card>
  );
}
