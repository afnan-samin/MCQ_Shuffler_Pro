"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, ChevronDown, ChevronUp, Download, FileText, Info, ListOrdered, PaintBucket, ShieldX } from "lucide-react";
import { colorKeyHex, colorKeyName, type BlockedLine, type ColorAnalysis, type SerialScheme } from "@/lib/mcq/color-serial";
import type { DownloadFormat } from "@/lib/mcq/pdf-export";
import { lineDominantOf } from "@/lib/mcq/encoding";
import { DownloadFormatToggle } from "@/components/mcq/download-format-toggle";
import { cn } from "@/lib/utils";

interface ColorShuffleInfoCardProps {
  analysis: ColorAnalysis;
  /** শাফল-পাইপলাইন থেকে বাদ পড়া হেডার সংখ্যা */
  headersStripped: number;
  fileName: string;
  /** বরং রঙ-অনুযায়ী সিরিয়াল করতে চাইলে ফাইলসহ সিরিয়াল মোডে যাও */
  onOpenSerial: () => void;
}

/** শাফল মোডে রঙ-ফাইল উঠলে — শাফল চলবেই, শুধু জানানো হয় হেডার বাদ যাবে */
export function ColorShuffleInfoCard({ analysis, headersStripped, fileName, onOpenSerial }: ColorShuffleInfoCardProps) {
  return (
    <Card className="border-sky-300/70 dark:border-sky-500/30">
      <CardHeader className="pb-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-sky-100 text-sky-700 dark:bg-sky-950/50 dark:text-sky-400">
            <Info className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <CardTitle className="text-base md:text-lg">
              This file has colored headers — they'll be stripped for shuffling
            </CardTitle>
            <CardDescription className="truncate">{fileName}</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          While shuffling, <b>{headersStripped}</b> colored header(s) are <b>stripped</b> and all{" "}
          <b>{analysis.questionCount}</b> questions — treated as <b>one serial</b> — are shuffled per your set settings.
          The output has no headers; each set gets serials 1,2,3… If the file's original serial restarts per section, that's fine for shuffling.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary" className="gap-1">
            <PaintBucket className="h-3 w-3" /> {analysis.colors.length} colors
          </Badge>
          <Badge variant="secondary">{headersStripped} headers stripped</Badge>
          <Badge variant="secondary">{analysis.questionCount} questions will shuffle</Badge>
        </div>
        <Button onClick={onOpenSerial} variant="outline" className="w-full sm:w-auto">
          <ListOrdered className="mr-2 h-4 w-4" />
          Prefer color-based serials? Open in Serial mode
        </Button>
      </CardContent>
    </Card>
  );
}

interface NoColorSerialCardProps {
  questionCount: number;
  busy: boolean;
  /** একটানা (continuous) সিরিয়াল চালিয়ে ডাউনলোড */
  onContinuous: () => void;
  /** "Download as" ফরম্যাট (DOCX ডিফল্ট) — onFormatChange দিলেই টগল রেন্ডার হয় */
  format?: DownloadFormat;
  onFormatChange?: (f: DownloadFormat) => void;
}

/** সিরিয়াল মোডে রঙ না পেলে — একটানা ১..N অপশন */
export function NoColorSerialCard({ questionCount, busy, onContinuous, format = "docx", onFormatChange }: NoColorSerialCardProps) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted text-muted-foreground">
            <ListOrdered className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <CardTitle className="text-base md:text-lg">No colored headers found in this file</CardTitle>
            <CardDescription>Color-based section serials need a shading color on the headers</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {questionCount > 0 ? (
          <>
            <p className="text-sm text-muted-foreground">
              But <b>{questionCount}</b> question line(s) were found — you can still give the whole file{" "}
              <b>one continuous 1,2,3…</b> serial. For color structure, add shading to the headers in Word (Home →
              Paragraph → Shading) and re-upload.
            </p>
            {onFormatChange && (
              <DownloadFormatToggle value={format} onChange={onFormatChange} disabled={busy} />
            )}
            <Button onClick={onContinuous} disabled={busy} className="w-full sm:w-auto">
              <Download className="mr-2 h-4 w-4" />
              {busy ? "Processing…" : `Download continuous 1..N serial .${format === "pdf" ? "pdf" : "docx"}`}
            </Button>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            No question lines found — check the file is a valid .docx and that questions start with a serial
            (e.g. 1. / ১. / 01.).
          </p>
        )}
      </CardContent>
    </Card>
  );
}

// ---------- বাদ-পড়া লাইনের আলাদা লিস্ট-কার্ড (ইউজারের অনুরোধ: "kon kon line block hyce show kro") ----------

const PREVIEW_COUNT = 8;

/** Bijoy (ANSI লিগ্যাসি) টেক্সট হলে SutonnyMJ ফন্টে দেখাতে হয় — নাহলে অর্থহীন অক্ষর */
function isBijoyText(t: string): boolean {
  return lineDominantOf(t) === "bijoy";
}

interface BlockedLinesCardProps {
  blocked: BlockedLine[];
}

/** শাফল-পাইপলাইন থেকে বাদ পড়া সব লাইন — রঙ-হেডার ও নন-MCQ (টেক্সট-প্যাটার্ন), কারণসহ কলাপ্সিবল লিস্ট */
export function BlockedLinesCard({ blocked }: BlockedLinesCardProps) {
  const [expanded, setExpanded] = useState(false);
  const colorCount = blocked.reduce((n, b) => (b.reason === "color" ? n + 1 : n), 0);
  const patternCount = blocked.length - colorCount;
  const visible = expanded ? blocked : blocked.slice(0, PREVIEW_COUNT);

  return (
    <Card className="border-amber-300/70 dark:border-amber-500/30">
      <CardHeader className="pb-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-400">
            <ShieldX className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <CardTitle className="text-base md:text-lg">
              Stripped lines — {blocked.length} (not going into the shuffle)
            </CardTitle>
            <CardDescription>
              These lines aren't MCQs (headers/titles) — stripped before the shuffle
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          {colorCount > 0 && (
            <Badge variant="secondary" className="gap-1">
              <PaintBucket className="h-3 w-3" /> {colorCount} color headers
            </Badge>
          )}
          {patternCount > 0 && (
            <Badge variant="secondary" className="gap-1">
              <ShieldX className="h-3 w-3" /> {patternCount} non-MCQ (text pattern)
            </Badge>
          )}
        </div>

        <ul className="max-h-72 space-y-1 overflow-y-auto rounded-lg border bg-muted/40 p-2 text-sm">
          {visible.map((b, i) => (
            <li key={i} className="flex min-w-0 items-start gap-2">
              <span
                className={
                  "mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium leading-4 " +
                  (b.reason === "color"
                    ? "bg-sky-100 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300"
                    : "bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300")
                }
              >
                {b.reason === "color" ? "Color header" : "Non-MCQ"}
              </span>
              <span className={"min-w-0 break-all " + (isBijoyText(b.text) ? "tokfont-bijoy" : "")}>
                {b.text || "(empty line)"}
              </span>
            </li>
          ))}
        </ul>

        {blocked.length > PREVIEW_COUNT && (
          <Button variant="ghost" size="sm" className="w-full" onClick={() => setExpanded((v) => !v)}>
            {expanded ? (
              <>
                <ChevronUp className="mr-1 h-4 w-4" /> Show less
              </>
            ) : (
              <>
                <ChevronDown className="mr-1 h-4 w-4" /> Show {blocked.length - PREVIEW_COUNT} more lines
              </>
            )}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

// ---------- প্রতি ফাইলের সিরিয়াল-স্কিম (মাল্টি-ফাইল সিরিয়াল মোড) ----------

interface MultiSchemeDoc {
  id: string;
  name: string;
  analysis: ColorAnalysis;
}

interface MultiSerialSchemeCardProps {
  docs: MultiSchemeDoc[];
  /** কী = doc.id — বাছাই করা স্কিম; না থাকলে { kind: "continuous" } ধরা হয় */
  schemes: Record<string, SerialScheme>;
  onSchemeChange: (id: string, scheme: SerialScheme) => void;
}

/** সোয়াচ — color-serial-card-এর হুবহু স্টাইল (থিম-কী হলে নিরপেক্ষ গ্রেডিয়েন্ট) */
function SchemeSwatch({ hex, size = "h-4 w-4" }: { hex: string | null; size?: string }) {
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

/**
 * মাল্টি-ফাইল সিরিয়ালে প্রতি ফাইলের সিরিয়াল-স্কিম বাছাই — ডিফল্ট একটানা
 * (আগের আচরণ হুবহু); রঙ-হেডারওয়ালা ফাইলে রঙ বেছে নিলে ওই ফাইলের প্রতি
 * সেকশনে নম্বর ১ থেকে রিস্টার্ট হয়। চিপ-টগল স্টাইল color-serial-card অনুযায়ী।
 */
export function MultiSerialSchemeCard({ docs, schemes, onSchemeChange }: MultiSerialSchemeCardProps) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <PaintBucket className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <CardTitle className="text-base md:text-lg">Per-file serial scheme</CardTitle>
            <CardDescription>
              Default is continuous — for files with colored headers, pick a color and each section restarts at 1
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {docs.map((d) => {
          const scheme = schemes[d.id] ?? { kind: "continuous" as const };
          const hasColors = d.analysis.colors.length > 0;
          return (
            <div key={d.id} className="space-y-2 rounded-xl border p-3">
              {/* ফাইল-রো — নাম + প্রশ্ন-সংখ্যা (span.flex-1.truncate নয়: মাল্টি-লিস্ট কাউন্টার ভাঙে না) */}
              <div className="flex min-w-0 items-center gap-2">
                <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{d.name}</span>
                </div>
                <Badge variant="secondary" className="shrink-0">
                  {d.analysis.questionCount} questions
                </Badge>
              </div>

              {hasColors ? (
                <div className="flex flex-wrap gap-2">
                  {/* একটানা চিপ */}
                  <button
                    type="button"
                    onClick={() => onSchemeChange(d.id, { kind: "continuous" })}
                    className={cn(
                      "flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors",
                      scheme.kind === "continuous"
                        ? "border-primary bg-primary/10 font-semibold ring-1 ring-primary"
                        : "bg-background hover:bg-muted/60"
                    )}
                  >
                    <span className="inline-block h-4 w-4 shrink-0 rounded-md border border-border bg-gradient-to-r from-brand-400 to-sky-500 shadow-sm" />
                    Continuous
                    {scheme.kind === "continuous" && <CheckCircle2 className="h-4 w-4 text-primary" />}
                  </button>

                  {/* প্রতি রঙের চিপ — সোয়াচ + নাম + সেকশন-ব্যাজ */}
                  {d.analysis.colors.map((c) => {
                    const active = scheme.kind === "color" && scheme.key === c.key;
                    const hex = colorKeyHex(c.key);
                    return (
                      <button
                        key={c.key}
                        type="button"
                        onClick={() => onSchemeChange(d.id, { kind: "color", key: c.key })}
                        className={cn(
                          "flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors",
                          active
                            ? "border-primary bg-primary/10 font-semibold ring-1 ring-primary"
                            : "bg-background hover:bg-muted/60"
                        )}
                      >
                        <SchemeSwatch hex={hex} />
                        <span className={cn("font-mono font-semibold", !hex && "font-sans")}>{colorKeyName(c.key)}</span>
                        <Badge variant="secondary" className="px-1.5 py-0 text-[11px]">
                          {c.sections} sections
                        </Badge>
                        {active && <CheckCircle2 className="h-4 w-4 text-primary" />}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">No colors — continuous</p>
              )}
            </div>
          );
        })}

        <div className="flex items-start gap-2 rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <p>
            <b>Continuous</b> = 1,2,3… across the whole file; <b>Color</b> = restart at 1 in each header-section of that color. Applies to both downloads — the merged (.docx) and the ZIP.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
