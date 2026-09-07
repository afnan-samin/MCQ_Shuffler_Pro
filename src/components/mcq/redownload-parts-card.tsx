"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { PART_LABELS, type PartKind, type PartSel } from "@/lib/mcq/redownload";
import { FileCheck2, Hash, Sparkles } from "lucide-react";

export interface RedownloadPartsCardProps {
  /** সব ফাইল মিলিয়ে প্রতি অংশের প্যারা-সংখ্যা */
  counts: Record<PartKind, number>;
  sel: PartSel;
  onChange: (kind: PartKind, v: boolean) => void;
  renumber: boolean;
  onRenumberChange: (v: boolean) => void;
  filesCount: number;
  questionsCount: number;
}

const KIND_ORDER: PartKind[] = ["serial", "question", "reference", "options", "answer", "bekkha"];

const KIND_HINTS: Record<Exclude<PartKind, "other">, string> = {
  serial: "Numbers kept / renumbered",
  question: "The question text itself",
  reference: "Stimulus / reference paragraph",
  options: "ক খ গ ঘ — the four options",
  answer: "Answer (উঃ ক / answer key)",
  bekkha: "Explanation / solution part",
};

/** অংশ-বাছাই কার্ড — কোন অংশগুলো নতুন ফাইলে থাকবে (ডিফল্ট: সিরিয়াল + প্রশ্ন) */
export function RedownloadPartsCard({
  counts,
  sel,
  onChange,
  renumber,
  onRenumberChange,
  filesCount,
  questionsCount,
}: RedownloadPartsCardProps) {
  const expansionActive = !sel.options && sel.answer;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-100 text-brand-700 dark:bg-brand-950/50 dark:text-brand-400">
            <FileCheck2 className="h-5 w-5" />
          </span>
          <div>
            <CardTitle className="text-base md:text-lg">2. Pick parts — what goes into the new file</CardTitle>
            <CardDescription>
              Found {questionsCount} question(s) in {filesCount} file(s) — only the ticked parts get downloaded (format kept intact).
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* ছয় অংশের চেকবক্স */}
        <div className="grid gap-2 sm:grid-cols-2">
          {KIND_ORDER.map((k) => (
            <label
              key={k}
              className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors ${
                sel[k] ? "border-brand-400 bg-brand-50/60 dark:border-brand-700 dark:bg-brand-950/20" : "border-border hover:bg-muted/50"
              }`}
            >
              <Checkbox
                checked={sel[k]}
                onCheckedChange={(v) => onChange(k, v === true)}
                className="mt-0.5"
                aria-label={PART_LABELS[k]}
              />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2 text-sm font-semibold">
                  {PART_LABELS[k]}
                  {counts[k] > 0 && (
                    <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
                      {counts[k]} lines
                    </Badge>
                  )}
                </span>
                <span className="mt-0.5 block text-xs text-muted-foreground">{KIND_HINTS[k]}</span>
              </span>
            </label>
          ))}
        </div>

        {/* রিনাম্বার সুইচ */}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-muted/40 p-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Hash className="h-4 w-4 text-brand-700 dark:text-brand-400" />
              Renumber serials 1, 2, 3…
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Selected questions get numbered 1..N in order — in the file's own digit style. Off = original numbers kept.
            </p>
          </div>
          <Switch checked={renumber} onCheckedChange={onRenumberChange} aria-label="Serial renumber toggle" />
        </div>

        {/* উত্তর-বিস্তার হিন্ট */}
        {expansionActive && (
          <div className="flex items-start gap-2 rounded-xl border border-sky-200 bg-sky-50/60 p-3 text-sm text-sky-900 dark:border-sky-800 dark:bg-sky-950/30 dark:text-sky-200">
            <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-sky-600 dark:text-sky-400" />
            <p>
              <b>Answer expansion on:</b> You dropped options but kept answers — so &quot;উঃ ক&quot;-style answers expand into the full option text (e.g. উঃ ক) পানির ঘনত্ব…).
            </p>
          </div>
        )}
      </CardContent>
      <Label className="sr-only">Part selection</Label>
    </Card>
  );
}
