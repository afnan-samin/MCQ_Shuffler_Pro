"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  AlignLeft,
  Check,
  ClipboardCopy,
  FileDown,
  Hash,
  Loader2,
  MousePointerClick,
  Star,
} from "lucide-react";
import type { DocxQuestion } from "@/lib/mcq/docx-xml";
import { englishSetName } from "@/lib/mcq/docx-exporter";
import { lineDominantOf, type Enc } from "@/lib/mcq/encoding";
import type { DownloadFormat } from "@/lib/mcq/pdf-export";
import { DownloadFormatToggle } from "@/components/mcq/download-format-toggle";
import { TokText } from "@/components/mcq/tok-text";
import { SerialSpan } from "@/components/mcq/docx-detect-card";

interface DocxSetsResultProps {
  /** প্রতি সেটে প্রশ্ন id-র ক্রম */
  sets: number[][];
  questions: DocxQuestion[];
  renumber: boolean;
  onRenumberChange: (v: boolean) => void;
  busy: string | null;
  copiedSet: number | null;
  /** renumber=true → ১,২,৩…; false → আসল নম্বরসহ */
  onDownload: (renumber: boolean) => void;
  onCopySet: (si: number) => void;
  dominant: Enc | null;
  /** "Download as" ফরম্যাট (DOCX ডিফল্ট) — onFormatChange দিলেই টগল রেন্ডার হয় */
  format?: DownloadFormat;
  onFormatChange?: (f: DownloadFormat) => void;
}

export function DocxSetsResult({
  sets,
  questions,
  renumber,
  onRenumberChange,
  busy,
  copiedSet,
  onDownload,
  onCopySet,
  dominant,
  format = "docx",
  onFormatChange,
}: DocxSetsResultProps) {
  const byId = new Map(questions.map((q) => [q.id, q]));
  const totalQ = sets.reduce((a, s) => a + s.length, 0);
  const fmtLabel = format === "pdf" ? "PDF (.pdf)" : "Word (.docx)";

  return (
    <Card id="step-result" className="border-brand-300 dark:border-brand-700">
      <CardHeader>
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-600 text-sm font-bold text-white">4</span>
          <CardTitle className="text-lg md:text-xl">
            Shuffle complete — {sets.length} {sets.length === 1 ? "set" : "sets"} ({totalQ} questions)
          </CardTitle>
        </div>
        <CardDescription>
          Each set sits on its own page in the downloaded Word file — tabs, equations, sub/superscript all intact.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* রিনাম্বার সুইচ */}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-muted/40 p-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 font-medium">
              <Hash className="h-4 w-4 text-brand-700 dark:text-brand-400" />
              Serial replace {renumber ? "ON — 1, 2, 3…" : "OFF — original numbers"}
            </div>
            <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
              <MousePointerClick className="h-3 w-3" />
              Clicking a serial number in any set below also toggles this
            </p>
          </div>
          <Switch id="renumber-switch" checked={renumber} onCheckedChange={onRenumberChange} />
        </div>

        {/* ফরম্যাট-টগল (DOCX ডিফল্ট / PDF) — এক্সপোর্ট বারের ঠিক উপরে */}
        {onFormatChange && (
          <DownloadFormatToggle value={format} onChange={onFormatChange} disabled={busy !== null} />
        )}

        {/* এক্সপোর্ট বার */}
        <div className="sticky top-2 z-10 flex flex-wrap items-center justify-center gap-2 rounded-xl border bg-white/95 p-3 shadow-sm backdrop-blur dark:bg-background/95">
          <Button className="gap-2 bg-brand-600 hover:bg-brand-700" onClick={() => onDownload(true)} disabled={busy !== null}>
            {busy === "docx-r" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
            ⬇️ {fmtLabel} — renumbered serials (1,2,3…)
          </Button>
          <Button variant="outline" className="gap-2" onClick={() => onDownload(false)} disabled={busy !== null}>
            {busy === "docx-o" ? <Loader2 className="h-4 w-4 animate-spin" /> : <AlignLeft className="h-4 w-4" />}
            ⬇️ {fmtLabel} — original numbers
          </Button>
        </div>

        {/* সেট কার্ডগুলো */}
        <div className="grid gap-4 lg:grid-cols-2">
          {sets.map((ids, si) => (
            <div key={si} className="rounded-xl border bg-white dark:bg-background">
              <div className="flex flex-wrap items-center gap-2 border-b bg-brand-50/70 px-4 py-2.5 dark:bg-brand-950/20">
                <span className="font-bold text-brand-800 dark:text-brand-300">{englishSetName(si)}</span>
                <Badge variant="secondary" className="gap-1">
                  {ids.length} questions
                </Badge>
                <Badge className={renumber ? "gap-1 bg-brand-100 text-brand-800 hover:bg-brand-100" : "gap-1 bg-amber-100 text-amber-800 hover:bg-amber-100"}>
                  {renumber ? "Serial: 1,2,3…" : "Serial: original"}
                </Badge>
                <div className="ml-auto">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 gap-1 px-2 text-xs"
                    onClick={() => onCopySet(si)}
                    disabled={busy !== null}
                  >
                    {copiedSet === si ? <Check className="h-3 w-3 text-brand-600" /> : <ClipboardCopy className="h-3 w-3" />}
                    {copiedSet === si ? "Copied" : "Copy"}
                  </Button>
                </div>
              </div>
              <div className="max-h-72 space-y-0.5 overflow-y-auto p-3 mcq-scroll">
                {ids.map((qid, qi) => {
                  const q = byId.get(qid);
                  if (!q) return null;
                  const shownSerial = renumber ? String(qi + 1) : q.serialDigits;
                  return (
                    <div key={`${si}-${qid}-${qi}`} className="flex items-start gap-2 text-[13px] leading-snug">
                      <button
                        type="button"
                        onClick={() => onRenumberChange(!renumber)}
                        title="Click to toggle serial replace"
                        className="min-w-[2rem] shrink-0 cursor-pointer rounded px-0.5 text-right font-semibold text-brand-700 hover:bg-brand-100 dark:text-brand-400 dark:hover:bg-brand-950/40"
                      >
                        <SerialSpan q={q} text={shownSerial} />
                      </button>
                      <span className="text-foreground/90">
                        <TokText line={q.qText} dominant={lineDominantOf(q.text) ?? dominant} colored={false} />
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <div className="rounded-lg border bg-muted/30 px-3 py-2 text-center text-xs text-muted-foreground">
          ✍️ Serials stay <span className="font-medium text-foreground/80">plain text</span> — no bullets/auto-numbering. Tabs, equations (math), sub/superscript, Bijoy (SutonnyMJ) fonts — all exactly like the original.
        </div>

        <div className="flex items-center justify-center gap-1.5 pt-2 text-xs text-muted-foreground">
          <Star className="h-3.5 w-3.5 text-amber-500" />
          Tip: download both versions — the renumbered one to hand out, the original-numbered one to cross-check.
        </div>

        <Label className="sr-only" htmlFor="renumber-switch">
          Serial renumber toggle
        </Label>
      </CardContent>
    </Card>
  );
}
