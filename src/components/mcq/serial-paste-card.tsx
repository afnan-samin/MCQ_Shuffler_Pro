"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertTriangle, CheckCircle2, Download, Info, Wrench } from "lucide-react";
import type { ParseOutput } from "@/lib/mcq/parser";

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
}

const scriptLabelOf = (s: ParseOutput["numberScript"]) =>
  s === "bn"
    ? "বাংলা সংখ্যা (১,২,৩)"
    : s === "en"
      ? "English সংখ্যা (1,2,3)"
      : s === "mixed"
        ? "বাংলা + English মিক্স"
        : "—";

/**
 * সিরিয়াল মোডের পেস্ট-ডিটেকশন রেজাল্ট কার্ড — ফাইল-ফ্লোর সাথে একসাথে
 * থাকে না (ফাইল লোড হলে এই কার্ড সরে যায়)। পেস্ট = টেক্সট পাইপলাইন —
 * এখানে রঙ-ডিটেকশন হয় না, তাই অ্যাম্বার নোটসহ .docx আপলোডের ইঙ্গিত দেখানো হয়।
 */
export function SerialPasteCard({ result, fixing, downloading, onFix, onDownload }: SerialPasteCardProps) {
  const questions = result.questions;
  const withOptions = questions.filter((q) => q.options.length >= 2).length;
  const serial = result.serial;
  const serialOk = serial?.status === "ok";
  const lastNumber = questions.length ? questions[questions.length - 1].originalNumber : 0;

  return (
    <Card id="serial-paste-result">
      <CardHeader>
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-600 text-sm font-bold text-white">২</span>
          <CardTitle className="text-lg md:text-xl">ডিটেকশন রেজাল্ট (পেস্ট)</CardTitle>
        </div>
        <CardDescription>
          পেস্ট করা টেক্সট থেকে ডিটেক্ট হওয়া প্রশ্ন — পজিশন-অনুযায়ী ১..N সিরিয়াল বসিয়ে এক সেট .docx নামানো যায়।
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* স্ট্যাট — ডিটেকশন রেজাল্টের ৩টা মূল সংখ্যা */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          <div className="rounded-xl border bg-white p-3 text-center dark:bg-background">
            <div className="text-2xl font-bold text-emerald-700 dark:text-emerald-400">{questions.length}</div>
            <div className="text-xs text-muted-foreground">মোট প্রশ্ন</div>
          </div>
          <div className="rounded-xl border bg-white p-3 text-center dark:bg-background">
            <div className="text-2xl font-bold text-emerald-700 dark:text-emerald-400">{withOptions}</div>
            <div className="text-xs text-muted-foreground">অপশনসহ প্রশ্ন</div>
          </div>
          <div className="rounded-xl border bg-white p-3 text-center dark:bg-background">
            <div className="mt-1 text-sm font-semibold">{scriptLabelOf(result.numberScript)}</div>
            <div className="text-xs text-muted-foreground">নম্বরের ধরন</div>
          </div>
        </div>

        {/* সিরিয়াল-স্ট্যাটাস — ok হলে সবুজ, ভাঙা হলে অ্যাম্বার + অটো-ফিক্স */}
        {serial && (
          <div
            className={`rounded-xl border p-4 ${
              serialOk
                ? "border-emerald-300 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/30"
                : "border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30"
            }`}
          >
            <div className="flex flex-wrap items-center gap-3">
              {serialOk ? (
                <CheckCircle2 className="h-6 w-6 shrink-0 text-emerald-600" />
              ) : (
                <AlertTriangle className="h-6 w-6 shrink-0 text-amber-600" />
              )}
              <div className="min-w-0 flex-1">
                {serialOk ? (
                  <>
                    <div className="font-semibold text-emerald-800 dark:text-emerald-300">
                      ✅ সিরিয়াল ঠিক আছে — ডাউনলোড বাটন চালু!
                    </div>
                    <div className="mt-0.5 text-sm text-emerald-700/80 dark:text-emerald-400/80">
                      প্রশ্ন নম্বর {serial.startAt} থেকে {lastNumber} পর্যন্ত পরপর সাজানো।
                      {!serial.startsAtOne && " (নোট: নম্বর ১ থেকে শুরু হয়নি, কিন্তু ক্রম ঠিক আছে — ডাউনলোডে ১..N বসবে)"}
                    </div>
                  </>
                ) : (
                  <>
                    <div className="font-semibold text-amber-800 dark:text-amber-300">
                      ⚠️ সিরিয়ালে {serial.issues.length} টি জায়গায় সমস্যা পাওয়া গেছে
                    </div>
                    <div className="mt-1 text-sm text-amber-700/90 dark:text-amber-400/90">
                      {serial.issues.slice(0, 3).map((is, i) => (
                        <div key={i}>
                          প্রশ্ন #{is.index + 1}: নম্বর {is.expected} হওয়ার কথা, কিন্তু পাওয়া গেছে {is.found}
                        </div>
                      ))}
                      {serial.issues.length > 3 && <div>...আরও {serial.issues.length - 3} টি</div>}
                    </div>
                  </>
                )}
              </div>
            </div>

            {!serialOk && (
              <div className="mt-3 flex flex-wrap items-center border-t border-amber-200 pt-3 dark:border-amber-800">
                <Button size="sm" className="gap-2 bg-amber-600 hover:bg-amber-700" onClick={onFix} disabled={fixing}>
                  <Wrench className="h-4 w-4" />
                  {fixing ? "ঠিক করা হচ্ছে..." : "🔧 অটো নম্বরিং ঠিক করুন"}
                </Button>
              </div>
            )}
          </div>
        )}

        {/* পেস্ট-মোডের সীমা: রঙ-ডিটেকশন হয় না */}
        <div className="flex items-start gap-2 rounded-lg border border-amber-300/60 bg-amber-50 px-3 py-2 text-xs dark:border-amber-500/30 dark:bg-amber-950/30">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <p className="text-amber-800 dark:text-amber-200">
            পেস্ট মোডে রঙ-ডিটেকশন হয় না — রঙ-ভিত্তিক সিরিয়ালের জন্য .docx ফাইল আপলোড করুন।
          </p>
        </div>

        {/* বড় ডাউনলোড বাটন — পজিশন-অনুযায়ী ১..N রিনাম্বার করে এক সেট */}
        <Button
          type="button"
          onClick={onDownload}
          disabled={questions.length === 0 || downloading}
          className="h-auto w-full flex-col items-center gap-1 rounded-xl bg-emerald-600 p-4 text-white hover:bg-emerald-700 sm:w-auto"
        >
          {downloading ? (
            <span className="flex items-center gap-2 text-sm font-semibold">তৈরি হচ্ছে...</span>
          ) : (
            <span className="flex items-center gap-2 text-sm font-semibold">
              <Download /> সিরিয়াল করে .docx ডাউনলোড (১..N)
            </span>
          )}
          <span className="text-xs opacity-80">
            প্রশ্নের ক্রম হুবহু থাকবে, প্রথম লাইনের নম্বর পজিশন-অনুযায়ী ১ থেকে বসবে
          </span>
        </Button>
      </CardContent>
    </Card>
  );
}
