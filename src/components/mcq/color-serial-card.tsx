"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, ChevronDown, Download, PaintBucket, Shuffle, Info, ListTree } from "lucide-react";
import type { ColorAnalysis, DetectedColor, SerialScheme, SectionOutlineItem } from "@/lib/mcq/color-serial";
import { sectionOutlineOf } from "@/lib/mcq/color-serial";
import type { DownloadFormat } from "@/lib/mcq/pdf-export";
import { DownloadFormatToggle } from "@/components/mcq/download-format-toggle";
import { cn } from "@/lib/utils";

interface ColorSerialCardProps {
  analysis: ColorAnalysis;
  fileName: string;
  busy: boolean;
  /** সিলেক্ট করা স্কিমে সিরিয়াল চালিয়ে .docx ডাউনলোড */
  onSerial: (scheme: SerialScheme, label: string) => void;
  /** "Download as" ফরম্যাট (DOCX ডিফল্ট) — onFormatChange দিলেই টগল রেন্ডার হয় */
  format?: DownloadFormat;
  onFormatChange?: (f: DownloadFormat) => void;
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
  if (c.name === "Custom color" && c.hex) return `custom-${c.hex}`;
  return c.name; // প্যালেট কোড (B1/A3…)
}

export function ColorSerialCard({ analysis, fileName, busy, onSerial, format = "docx", onFormatChange }: ColorSerialCardProps) {
  const [sel, setSel] = useState<SerialScheme | null>(null);
  const [outlineOpen, setOutlineOpen] = useState(false);
  const outline = sectionOutlineOf(analysis);

  const selLabel = sel ? schemeLabelOf(sel, analysis.colors) : "";
  const selSections =
    sel?.kind === "color" ? (analysis.colors.find((c) => c.key === sel.key)?.sections ?? 0) : 0;

  return (
    <Card className="border-primary/30">
      <CardHeader className="pb-3">
        <div className="flex min-w-0 items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <PaintBucket className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <CardTitle className="text-base md:text-lg">Color-based serial (structured file)</CardTitle>
            <CardDescription className="truncate">{fileName}</CardDescription>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* শাফল বন্ধ নোটিশ */}
        <div className="flex items-start gap-2 rounded-lg border border-amber-300/60 bg-amber-50 px-3 py-2 text-xs dark:border-amber-500/30 dark:bg-amber-950/30">
          <Shuffle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <p className="text-amber-800 dark:text-amber-200">
            Found <b>colored header(s)</b> ({analysis.shadedCount}) in this file — so <b>shuffling is disabled</b>.
            Only serials get fixed; headers, equations, images, fonts — everything stays exactly intact.
          </p>
        </div>

        {/* রঙ চিপস */}
        <div className="space-y-2">
          <p className="text-sm font-medium">
            Serial by which color? <span className="text-muted-foreground">(section = one header of that color)</span>
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
                    {c.sections} sections
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
              <span className="inline-block h-5 w-5 shrink-0 rounded-md border border-border bg-gradient-to-r from-brand-400 to-sky-500 shadow-sm" />
              Continuous across the file
              <Badge variant="secondary" className="px-1.5 py-0 text-[11px]">
                {analysis.questionCount} questions
              </Badge>
              {sel?.kind === "continuous" && <CheckCircle2 className="h-4 w-4 text-primary" />}
            </button>
          </div>
        </div>

        {/* রঙ-নেস্টিং প্রিভিউ — ডকুমেন্টের সেকশন-ক্রমের ছোট tree-view (Phase 3 #10) */}
        <div className="rounded-xl border bg-muted/40 p-3">
          <button
            type="button"
            onClick={() => setOutlineOpen((v) => !v)}
            className="flex w-full items-center gap-2 text-left"
          >
            <ListTree className="h-4 w-4 shrink-0 text-brand-700 dark:text-brand-400" />
            <span className="min-w-0 flex-1 text-sm font-medium">
              Section structure preview
              <span className="block text-xs text-muted-foreground">
                {outline.length} section{outline.length === 1 ? "" : "s"} — which color block follows which, and how many questions each holds
              </span>
            </span>
            <span className="rounded-md p-1 text-muted-foreground hover:bg-muted">
              <ChevronDown className={`h-4 w-4 transition-transform ${outlineOpen ? "rotate-180" : ""}`} />
            </span>
          </button>
          {outlineOpen && (
            <div className="mt-2 space-y-1.5">
              {outline.map((o, i) => (
                <div
                  key={`${i}-${o.colorKey}`}
                  className="flex items-center gap-2 rounded-md border bg-card px-2.5 py-1.5 text-xs"
                  style={{ borderLeft: "3px solid" }}
                >
                  <span
                    aria-hidden
                    className="inline-block h-3.5 w-3.5 shrink-0 rounded border border-border shadow-sm"
                    style={
                      o.hex
                        ? { backgroundColor: `#${o.hex}`, borderLeft: "3px solid rgba(0,0,0,0)" }
                        : { background: "linear-gradient(135deg,#cbd5e1,#94a3b8)" }
                    }
                  />
                  <span className="min-w-0 flex-1 truncate font-mono font-semibold">{o.name}</span>
                  <Badge variant="secondary" className="px-1.5 py-0 text-[10px]">
                    {o.questionCount} question{o.questionCount === 1 ? "" : "s"}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ব্যাখ্যা */}
        <div className="flex items-start gap-2 rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <p>
            {sel?.kind === "continuous" ? (
              <>Every question in the file gets consecutive 1,2,3… numbers — whatever the colors.</>
            ) : sel ? (
              <>
                After each <b>{sel.kind === "color" ? selLabel : ""}</b> header, numbering restarts <b>from 1</b>; found
                <b>{selSections}</b> section(s) of this color. Inner small headers (other colors) don't stop the numbering, but the
                run ends at the boundary of the bigger header — questions from the two sides never mix. A same-level header of a
                different color (e.g. the next chapter in another color) also ends this run; questions inside that section keep
                their old numbers.
              </>
            ) : (
              <>Pick a color to preview: numbering restarts at 1 after each header of that color, pausing at upper-level boundaries and starting a new section.</>
            )}
          </p>
        </div>

        {/* অ্যাকশন */}
        {onFormatChange && (
          <DownloadFormatToggle value={format} onChange={onFormatChange} disabled={busy} />
        )}
        <Button className="w-full sm:w-auto" disabled={!sel || busy} onClick={() => sel && onSerial(sel, selLabel)}>
          <Download className="mr-2 h-4 w-4" />
          {busy ? "Processing…" : `Download serial .${format === "pdf" ? "pdf" : "docx"}${selLabel ? ` (${selLabel})` : ""}`}
        </Button>
      </CardContent>
    </Card>
  );
}
