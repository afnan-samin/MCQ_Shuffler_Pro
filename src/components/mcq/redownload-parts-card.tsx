"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PART_LABELS, type PartKind, type PartSel } from "@/lib/mcq/redownload";
import { FileCheck2, Hash, Save, Sparkles, X } from "lucide-react";

export interface RedownloadFoundStats {
  withReference: number;
  withOptions: number;
  optionsTotal: number;
  withAnswer: number;
  withBekkha: number;
}

export interface RedownloadPartsCardProps {
  /** সব ফাইল মিলিয়ে প্রতি অংশের প্যারা-সংখ্যা (legacy — ব্যাজে আর ব্যবহার হয় না) */
  counts: Record<PartKind, number>;
  sel: PartSel;
  onChange: (kind: PartKind, v: boolean) => void;
  renumber: boolean;
  onRenumberChange: (v: boolean) => void;
  filesCount: number;
  questionsCount: number;
  /** কয়টা প্রশ্নে কোন অংশ পাওয়া গেছে — ব্যাজে এটাই দেখায় */
  found?: RedownloadFoundStats;
  /** সেভ-করা preset apply — parts + renumber একসাথে বসে (page.tsx state আপডেট করে) */
  onApplyPreset?: (parts: PartSel, renumber: boolean) => void;
}

// ---------- Download presets (Phase 2 #6) ----------
/** প্রেসেট = অংশ-বাছাই + রিনাম্বার-টগল — localStorage-এ নাম দিয়ে সেভ-রিইউজ */
interface RdPreset {
  name: string;
  parts: PartSel;
  renumber: boolean;
}
const RD_PRESETS_KEY = "mcq-rd-presets";
function loadRdPresets(): RdPreset[] {
  try {
    const raw = typeof window === "undefined" ? null : window.localStorage.getItem(RD_PRESETS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed)
      ? parsed.filter(
          (p): p is RdPreset =>
            p && typeof p.name === "string" && p.parts && typeof p.parts === "object" && typeof p.renumber === "boolean"
        )
      : [];
  } catch {
    return [];
  }
}
function saveRdPresets(list: RdPreset[]) {
  try {
    window.localStorage.setItem(RD_PRESETS_KEY, JSON.stringify(list));
  } catch {
    /* quota/private-mode — নীরবে থাক */
  }
}

/** প্রেসেট-বার — বর্তমান বাছাই নাম দিয়ে সেভ, চিপে ক্লিকে apply, X-এ delete */
function RdPresetsBar({
  sel,
  renumber,
  onApply,
}: {
  sel: PartSel;
  renumber: boolean;
  onApply: (parts: PartSel, renumber: boolean) => void;
}) {
  const [presets, setPresets] = useState<RdPreset[]>([]);
  const [name, setName] = useState("");

  useEffect(() => {
    setPresets(loadRdPresets());
  }, []);

  const save = () => {
    const clean = name.trim();
    if (!clean) return;
    const next = [
      // একই নামে সেভ করলে আগেরটা replace হয়
      ...loadRdPresets().filter((p) => p.name !== clean),
      { name: clean, parts: { ...sel }, renumber },
    ];
    saveRdPresets(next);
    setPresets(next);
    setName("");
  };
  const remove = (n: string) => {
    const next = loadRdPresets().filter((p) => p.name !== n);
    saveRdPresets(next);
    setPresets(next);
  };

  return (
    <div className="rounded-xl border bg-muted/40 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Sparkles className="h-4 w-4 shrink-0 text-brand-700 dark:text-brand-400" />
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Presets
        </span>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") save();
          }}
          placeholder='Name this selection (e.g. "Student Copy")'
          className="h-8 min-w-[180px] flex-1 text-xs"
          maxLength={40}
          data-testid="rd-preset-name"
        />
        <Button size="sm" variant="outline" className="h-8 gap-1" onClick={save} disabled={!name.trim()}>
          <Save className="h-3.5 w-3.5" /> Save current
        </Button>
      </div>
      {presets.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {presets.map((p) => (
            <span
              key={p.name}
              className="flex items-center overflow-hidden rounded-full border bg-card text-xs"
            >
              <button
                type="button"
                className="px-2.5 py-1 font-medium transition-colors hover:bg-brand-50 dark:hover:bg-brand-950/30"
                title={`Apply "${p.name}"`}
                onClick={() => onApply(p.parts, p.renumber)}
              >
                {p.name}
              </button>
              <button
                type="button"
                aria-label={`Delete preset ${p.name}`}
                className="border-l px-1.5 py-1 text-muted-foreground transition-colors hover:text-red-600"
                onClick={() => remove(p.name)}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
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
  found,
  onApplyPreset,
}: RedownloadPartsCardProps) {
  const expansionActive = !sel.options && sel.answer;

  /** প্রতি অংশের ব্যাজ-টেক্সট — কয়টায় পাওয়া গেছে (০ হলেও দেখায়) */
  const badgeText = (k: PartKind): string => {
    switch (k) {
      case "serial":
        return `${questionsCount} found`;
      case "question":
        return `${questionsCount} found`;
      case "reference":
        return found ? `${found.withReference}/${questionsCount} qs` : `${counts[k]} lines`;
      case "options":
        return found ? `${found.optionsTotal} opts • ${found.withOptions}/${questionsCount} qs` : `${counts[k]} lines`;
      case "answer":
        return found ? `${found.withAnswer}/${questionsCount} qs` : `${counts[k]} lines`;
      case "bekkha":
        return found ? `${found.withBekkha}/${questionsCount} qs` : `${counts[k]} lines`;
      default:
        return `${counts[k]} lines`;
    }
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-100 text-brand-700 dark:bg-brand-950/50 dark:text-brand-400">
            <FileCheck2 className="h-5 w-5" />
          </span>
          <div>
            <CardTitle className="text-base md:text-lg">Pick parts — what goes into the new file</CardTitle>
            <CardDescription>
              Found {questionsCount} question(s) in {filesCount} file(s) — only the ticked parts get downloaded (format kept intact).
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Download presets — বারবার একই বাছাই নাম দিয়ে সেভ-রিইউজ (Phase 2 #6) */}
        {onApplyPreset && <RdPresetsBar sel={sel} renumber={renumber} onApply={onApplyPreset} />}
        {/* ছয় অংশের চেকবক্স — পুরো রো-তেই ক্লিক করলে টগল হয় */}
        <div className="grid gap-2 sm:grid-cols-2">
          {KIND_ORDER.map((k) => (
            <div
              key={k}
              role="checkbox"
              aria-checked={sel[k]}
              aria-label={PART_LABELS[k]}
              tabIndex={0}
              onClick={() => onChange(k, !sel[k])}
              onKeyDown={(e) => {
                if (e.key === " " || e.key === "Enter") {
                  e.preventDefault();
                  onChange(k, !sel[k]);
                }
              }}
              className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors ${
                sel[k] ? "border-brand-400 bg-brand-50/60 dark:border-brand-700 dark:bg-brand-950/20" : "border-border hover:bg-muted/50"
              }`}
            >
              <Checkbox
                checked={sel[k]}
                onCheckedChange={(v) => onChange(k, v === true)}
                onClick={(e) => e.stopPropagation()}
                className="mt-0.5"
                aria-label={PART_LABELS[k]}
                tabIndex={-1}
              />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2 text-sm font-semibold">
                  {PART_LABELS[k]}
                  <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
                    {badgeText(k)}
                  </Badge>
                </span>
                <span className="mt-0.5 block text-xs text-muted-foreground">{KIND_HINTS[k]}</span>
              </span>
            </div>
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
