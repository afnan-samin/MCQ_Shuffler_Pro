"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlignLeft,
  ArrowDownToLine,
  Check,
  ClipboardCopy,
  FileDown,
  Loader2,
  Printer,
  Settings2,
  Shuffle,
  Star,
} from "lucide-react";
import type { McqQuestion } from "@/lib/mcq/parser";
import { getSetName, type NameStyle } from "@/lib/mcq/set-engine";
import type { ExportOptions, FontMode } from "@/lib/mcq/exporter";
import { lineDominantOf, type Enc } from "@/lib/mcq/encoding";
import { TokText } from "@/components/mcq/tok-text";

interface SetsResultProps {
  sets: McqQuestion[][];
  sortedFlags: boolean[];
  onToggleSort: (si: number) => void;
  onReshuffleSet: (si: number) => void;
  exportOpts: ExportOptions;
  onExportOptsChange: (o: ExportOptions) => void;
  onExportDocx: () => void;
  onExportDoc: () => void;
  onPrint: () => void;
  onCopySet: (si: number) => void;
  onCopyAll: () => void;
  busy: string | null;
  copiedSet: number | null;
  /** ডকুমেন্টের প্রধান লেখার ধরন (প্রিভিউতে সঠিক ফন্টের জন্য) */
  dominant: Enc | null;
}

const LEGACY_FONT_SUGGESTIONS = ["SutonnyMJ", "SutonnyOMJ", "SutonnyEMJ", "BijoyClassic", "SushreeMJ", "ShiblyMJ"];
const UNICODE_FONT_SUGGESTIONS = ["Nirmala UI", "Kalpurush", "SolaimanLipi", "Nikosh", "Shonar Bangla"];
const ENGLISH_FONT_SUGGESTIONS = ["Times New Roman", "Arial", "Calibri", "Cambria", "Georgia"];

export function SetsResult({
  sets,
  sortedFlags,
  onToggleSort,
  onReshuffleSet,
  exportOpts,
  onExportOptsChange,
  onExportDocx,
  onExportDoc,
  onPrint,
  onCopySet,
  onCopyAll,
  busy,
  copiedSet,
  dominant,
}: SetsResultProps) {
  const [showSettings, setShowSettings] = useState(false);
  const totalQ = sets.reduce((a, s) => a + s.length, 0);

  const patch = (p: Partial<ExportOptions>) => onExportOptsChange({ ...exportOpts, ...p });

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
          Each set goes on its own page. You can re-sort any set back to serial order or reshuffle it.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* ফন্ট সেটিংস টগল */}
        <div className="flex justify-center">
          <Button variant="outline" size="sm" onClick={() => setShowSettings((s) => !s)} className="gap-2">
            <Settings2 className="h-4 w-4" />
            {showSettings ? "Hide font/header settings" : "⚙️ Font & header settings (Bijoy/Unicode)"}
          </Button>
        </div>

        {showSettings && (
          <div className="space-y-4 rounded-xl border bg-muted/30 p-4">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <div className="space-y-1.5">
                <Label className="text-sm">Font mode</Label>
                <Select value={exportOpts.fontMode} onValueChange={(v) => patch({ fontMode: v as FontMode })}>
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto">Auto — font per word</SelectItem>
                    <SelectItem value="legacy">Bijoy / legacy font</SelectItem>
                    <SelectItem value="unicode">Unicode Bengali</SelectItem>
                    <SelectItem value="english">English</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-[11px] leading-snug text-muted-foreground">
                  Auto mode picks fonts word-by-word: Bijoy→{exportOpts.legacyFont}, Unicode→{exportOpts.unicodeFont}, English→{exportOpts.englishFont}
                </p>
              </div>

              <div className="space-y-1.5">
                <Label className="text-sm">Bijoy font (used in Word)</Label>
                <Input
                  list="legacy-fonts"
                  value={exportOpts.legacyFont}
                  onChange={(e) => patch({ legacyFont: e.target.value })}
                  className="h-9"
                />
                <datalist id="legacy-fonts">
                  {LEGACY_FONT_SUGGESTIONS.map((f) => (
                    <option key={f} value={f} />
                  ))}
                </datalist>
                <p className="text-[11px] text-muted-foreground">A Bijoy font installed on your PC</p>
              </div>

              <div className="space-y-1.5">
                <Label className="text-sm">Unicode Bengali font</Label>
                <Input
                  list="unicode-fonts"
                  value={exportOpts.unicodeFont}
                  onChange={(e) => patch({ unicodeFont: e.target.value })}
                  className="h-9"
                />
                <datalist id="unicode-fonts">
                  {UNICODE_FONT_SUGGESTIONS.map((f) => (
                    <option key={f} value={f} />
                  ))}
                </datalist>
              </div>

              <div className="space-y-1.5">
                <Label className="text-sm">English font</Label>
                <Input
                  list="english-fonts"
                  value={exportOpts.englishFont}
                  onChange={(e) => patch({ englishFont: e.target.value })}
                  className="h-9"
                />
                <datalist id="english-fonts">
                  {ENGLISH_FONT_SUGGESTIONS.map((f) => (
                    <option key={f} value={f} />
                  ))}
                </datalist>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-1.5">
                <Label className="text-sm">Font size (pt)</Label>
                <Input
                  type="number"
                  min={8}
                  max={24}
                  value={exportOpts.fontSize}
                  onChange={(e) => patch({ fontSize: Math.max(8, Math.min(24, parseInt(e.target.value, 10) || 12)) })}
                  className="h-9"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm">Set name style</Label>
                <Select value={exportOpts.nameStyle} onValueChange={(v) => patch({ nameStyle: v as NameStyle })}>
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="letter">Bengali label — সেট A, সেট B, সেট C…</SelectItem>
                    <SelectItem value="bangla">Bengali letters — সেট ক, সেট খ, সেট গ…</SelectItem>
                    <SelectItem value="number">Bengali digits — সেট ১, সেট ২, সেট ৩…</SelectItem>
                    <SelectItem value="setn">English — Set 1, Set 2, Set 3…</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-end">
                <div className="flex items-center gap-2 pb-1.5">
                  <Switch id="include-header" checked={exportOpts.includeHeader} onCheckedChange={(v) => patch({ includeHeader: v })} />
                  <Label htmlFor="include-header" className="cursor-pointer text-sm">
                    Put a header on each set's page
                  </Label>
                </div>
              </div>
            </div>

            {exportOpts.includeHeader && (
              <div className="space-y-1.5">
                <Label className="text-sm">Header text (institute name, time, marks etc. — top of every page)</Label>
                <Textarea
                  value={exportOpts.headerText}
                  onChange={(e) => patch({ headerText: e.target.value })}
                  placeholder={"Example:\nXYZ College, Dhaka\nExam: Subject code 101\nTime: 1 hour | Marks: 50"}
                  className="min-h-[70px] text-sm"
                />
              </div>
            )}
          </div>
        )}

        {/* এক্সপোর্ট বার */}
        <div className="sticky top-2 z-10 flex flex-wrap items-center justify-center gap-2 rounded-xl border bg-white/95 p-3 shadow-sm backdrop-blur dark:bg-background/95">
          <Button className="gap-2 bg-brand-600 hover:bg-brand-700" onClick={onExportDocx} disabled={busy !== null}>
            {busy === "docx" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
            ⬇️ Word (.docx) — one set per page
          </Button>
          <Button variant="outline" className="gap-2" onClick={onExportDoc} disabled={busy !== null}>
            <ArrowDownToLine className="h-4 w-4" />
            .doc (legacy Word)
          </Button>
          <Button variant="outline" className="gap-2" onClick={onPrint} disabled={busy !== null}>
            <Printer className="h-4 w-4" /> 🖨️ Print
          </Button>
          <Button variant="outline" className="gap-2" onClick={onCopyAll} disabled={busy !== null}>
            {busy === "copyall" ? <Loader2 className="h-4 w-4 animate-spin" /> : <ClipboardCopy className="h-4 w-4" />}
            📋 Copy all sets
          </Button>
        </div>

        {/* সেট কার্ডগুলো */}
        <div className="grid gap-4 lg:grid-cols-2">
          {sets.map((qs, si) => (
            <div key={si} className="rounded-xl border bg-white dark:bg-background">
              <div className="flex flex-wrap items-center gap-2 border-b bg-brand-50/70 px-4 py-2.5 dark:bg-brand-950/20">
                <span className="font-bold text-brand-800 dark:text-brand-300">{getSetName(si, exportOpts.nameStyle)}</span>
                <Badge variant="secondary" className="gap-1">
                  {qs.length} questions
                </Badge>
                {sortedFlags[si] ? (
                  <Badge className="gap-1 bg-brand-100 text-brand-800 hover:bg-brand-100">
                    <AlignLeft className="h-3 w-3" /> Serial
                  </Badge>
                ) : (
                  <Badge className="gap-1 bg-amber-100 text-amber-800 hover:bg-amber-100">
                    <Shuffle className="h-3 w-3" /> Shuffled
                  </Badge>
                )}
                <div className="ml-auto flex gap-1.5">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 gap-1 px-2 text-xs"
                    onClick={() => onToggleSort(si)}
                    title={sortedFlags[si] ? "Reshuffle this set" : "Restore original serial order"}
                  >
                    {sortedFlags[si] ? <Shuffle className="h-3 w-3" /> : <AlignLeft className="h-3 w-3" />}
                    {sortedFlags[si] ? "Shuffle" : "Sort serial"}
                  </Button>
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
              <div className="max-h-64 space-y-0.5 overflow-y-auto p-3 mcq-scroll">
                {qs.map((q) => (
                  <div key={q.id} className="flex items-start gap-2 text-[13px] leading-snug">
                    <span className="min-w-[2rem] shrink-0 text-right font-semibold text-brand-700 dark:text-brand-400">
                      {q.originalNumber}.
                    </span>
                    <span className="text-foreground/90">
                      <TokText
                        line={q.lines[0].replace(/^[\s০-৯0-9.।):–\-—]+/, "")}
                        dominant={lineDominantOf(q.lines[0]) ?? dominant}
                        colored={false}
                      />
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="rounded-lg border bg-muted/30 px-3 py-2 text-center text-xs text-muted-foreground">
          ✍️ Serials are <span className="font-medium text-foreground/80">plain text</span> — no bullets or Word auto-numbering. Each set is split onto its own page/segment.
        </div>

        <div className="flex items-center justify-center gap-1.5 pt-2 text-xs text-muted-foreground">
          <Star className="h-3.5 w-3.5 text-amber-500" />
          Tip: in the downloaded Word file each set sits on its own page — you can print directly.
        </div>
      </CardContent>
    </Card>
  );
}
