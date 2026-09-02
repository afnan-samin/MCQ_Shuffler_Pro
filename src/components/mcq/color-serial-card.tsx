"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Download, PaintBucket, Shuffle, Info } from "lucide-react";
import type { ColorAnalysis, DetectedColor, SerialScheme } from "@/lib/mcq/color-serial";
import { cn } from "@/lib/utils";

interface ColorSerialCardProps {
  analysis: ColorAnalysis;
  fileName: string;
  busy: boolean;
  /** সিলেক্ট করা স্কিমে সিরিয়াল চালিয়ে .docx ডাউনলোড */
  onSerial: (scheme: SerialScheme, label: string) => void;
}

/** সোয়াচ — থিম-কী হলে নিরপেক্ষ ধূসর গ্রেডিয়েন্ট */
function Swatch({ hex, size = "h-5 w-5" }: { hex: string | null; size?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-block shrink-0 rounded-md border border-border shadow-sm",
        size,
        !hex && "bg-gradient-to-br from-slate-200 to-slate-400 dark:from-slate-600 dark:to-slate-800"
      )}
      style={hex ? { backgroundColor: `#${hex}` } : undefined}
    />
  );
}

export function schemeLabelOf(scheme: SerialScheme, colors: DetectedColor[]): string {
  if (scheme.kind === "continuous") return "continuous";
  const c = colors.find((x) => x.key === scheme.key);
  if (!c) return "color";
  if (c.name === "কাস্টম রঙ" && c.hex) return `custom-${c.hex}`;
  return c.name; // প্যালেট কোড (B1/A3…)
}

export function ColorSerialCard({ analysis, fileName, busy, onSerial }: ColorSerialCardProps) {
  const [sel, setSel] = useState<SerialScheme | null>(null);

  const selLabel = sel ? schemeLabelOf(sel, analysis.colors) : "";
  const selSections =
    sel?.kind === "color" ? (analysis.colors.find((c) => c.key === sel.key)?.sections ?? 0) : 0;

  return (
    <Card className="border-primary/30">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <PaintBucket className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <CardTitle className="text-base md:text-lg">রঙ-ভিত্তিক সিরিয়াল (স্ট্রাকচার্ড ফাইল)</CardTitle>
            <CardDescription className="truncate">{fileName}</CardDescription>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* শাফল বন্ধ নোটিশ */}
        <div className="flex items-start gap-2 rounded-lg border border-amber-300/60 bg-amber-50 px-3 py-2 text-xs dark:border-amber-500/30 dark:bg-amber-950/30">
          <Shuffle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <p className="text-amber-800 dark:text-amber-200">
            এই ফাইলে <b>রঙ-দেওয়া হেডার</b> ({analysis.shadedCount} টি) পাওয়া গেছে — তাই <b>শাফল বন্ধ</b>।
            শুধু সিরিয়াল ঠিক হবে; হেডার, ইকুয়েশন, ছবি, ফন্ট — সব হুবহু অক্ষত থাকবে।
          </p>
        </div>

        {/* রঙ চিপস */}
        <div className="space-y-2">
          <p className="text-sm font-medium">
            কোন রঙ অনুযায়ী সিরিয়াল করবেন? <span className="text-muted-foreground">(সেকশন = ওই রঙের হেডার)</span>
          </p>
          <div className="flex flex-wrap gap-2">
            {analysis.colors.map((c) => {
              const active = sel?.kind === "color" && sel.key === c.key;
              return (
                <button
                  key={c.key}
                  type="button"
                  onClick={() => setSel({ kind: "color", key: c.key })}
                  className={cn(
                    "flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors",
                    active
                      ? "border-primary bg-primary/10 font-semibold ring-1 ring-primary"
                      : "bg-background hover:bg-muted/60"
                  )}
                >
                  <Swatch hex={c.hex} />
                  <span className={cn("font-mono font-semibold", !c.hex && "font-sans")}>{c.name}</span>
                  <Badge variant="secondary" className="px-1.5 py-0 text-[11px]">
                    {c.sections} সেকশন
                  </Badge>
                  {active && <CheckCircle2 className="h-4 w-4 text-primary" />}
                </button>
              );
            })}

            {/* একটানা অপশন */}
            <button
              type="button"
              onClick={() => setSel({ kind: "continuous" })}
              className={cn(
                "flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors",
                sel?.kind === "continuous"
                  ? "border-primary bg-primary/10 font-semibold ring-1 ring-primary"
                  : "bg-background hover:bg-muted/60"
              )}
            >
              <span className="inline-block h-5 w-5 shrink-0 rounded-md border border-border bg-gradient-to-r from-emerald-400 to-sky-500 shadow-sm" />
              পুরো ফাইলে একটানা
              <Badge variant="secondary" className="px-1.5 py-0 text-[11px]">
                {analysis.questionCount} প্রশ্ন
              </Badge>
              {sel?.kind === "continuous" && <CheckCircle2 className="h-4 w-4 text-primary" />}
            </button>
          </div>
        </div>

        {/* ব্যাখ্যা */}
        <div className="flex items-start gap-2 rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <p>
            {sel?.kind === "continuous" ? (
              <>পুরো ফাইলে প্রশ্নগুলো পরপর ১,২,৩… নম্বর পাবে — রঙ যাই থাকুক।</>
            ) : sel ? (
              <>
                প্রতিটা <b>{sel.kind === "color" ? selLabel : ""}</b> হেডারের পরেই নম্বর <b>১ থেকে</b> শুরু হবে; এই
                রঙের <b>{selSections}</b> টি সেকশন পাওয়া গেছে। ভিতরের ছোট হেডার (অন্য রঙ) নম্বর থামাবে না, কিন্তু
                বড় হেডারের সীমানায় ক্রম শেষ হবে — দুই জায়গার প্রশ্ন কখনো মিশবে না। একই স্তরের অন্য রঙের
                হেডার (যেমন পরের অধ্যায়ের ভিন্ন রঙ) এলেও এই ক্রম শেষ হবে; সেই সেকশনের ভিতরের প্রশ্ন
                পুরনো নম্বরেই থাকবে।
              </>
            ) : (
              <>রঙ সিলেক্ট করলে দেখা যাবে: প্রতিটা ওই-রঙ-হেডারের পরে নম্বর ১ থেকে শুরু, উপরের লেভেলের সীমানায় থেমে নতুন সেকশনে আবার ১।</>
            )}
          </p>
        </div>

        {/* অ্যাকশন */}
        <Button className="w-full sm:w-auto" disabled={!sel || busy} onClick={() => sel && onSerial(sel, selLabel)}>
          <Download className="mr-2 h-4 w-4" />
          {busy ? "প্রসেস হচ্ছে…" : `সিরিয়াল করে .docx ডাউনলোড${selLabel ? ` (${selLabel})` : ""}`}
        </Button>
      </CardContent>
    </Card>
  );
}
