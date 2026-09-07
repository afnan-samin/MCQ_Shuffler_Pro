"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Lock, Shuffle, Tags } from "lucide-react";
import type { Distribution } from "@/lib/mcq/set-engine";
import type { RefMode, RefReport } from "@/lib/mcq/reference";

interface ShuffleCardProps {
  enabled: boolean;
  lockReason: string | null;
  selectedCount: number;
  setCount: number;
  onSetCountChange: (n: number) => void;
  distribution: Distribution;
  onDistributionChange: (d: Distribution) => void;
  shuffleWithin: boolean;
  onShuffleWithinChange: (v: boolean) => void;
  onShuffle: () => void;
  shuffling: boolean;
  /** ডিটেক্ট হওয়া রেফারেন্স-রিপোর্ট — null হলে সেকশন লুকানো */
  refReport: RefReport | null;
  refMode: RefMode;
  onRefModeChange: (m: RefMode) => void;
}

const QUICK_SETS = [3, 4, 5, 10];

export function ShuffleCard({
  enabled,
  lockReason,
  selectedCount,
  setCount,
  onSetCountChange,
  distribution,
  onDistributionChange,
  shuffleWithin,
  onShuffleWithinChange,
  onShuffle,
  shuffling,
  refReport,
  refMode,
  onRefModeChange,
}: ShuffleCardProps) {
  const isOriginal = distribution === "original";
  const perSet = setCount > 0 ? Math.floor(selectedCount / setCount) : 0;
  const remainder = setCount > 0 ? selectedCount % setCount : 0;
  const countInvalid =
    setCount < 1 || setCount > 10 || (isOriginal ? false : setCount > selectedCount);

  return (
    <Card id="step-shuffle" className={enabled ? "border-emerald-300 dark:border-emerald-700" : ""}>
      <CardHeader>
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-600 text-sm font-bold text-white">3</span>
          <CardTitle className="text-lg md:text-xl">Shuffle settings & start</CardTitle>
        </div>
        <CardDescription>
          Enter how many sets you want (1–10). Original Shuffle keeps every question in each set; the other styles split the questions up.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-5 md:grid-cols-2">
          {/* সেট সংখ্যা */}
          <div className="space-y-2">
            <Label htmlFor="set-count" className="font-medium">
              How many sets?
            </Label>
            <div className="flex items-center gap-2">
              <Input
                id="set-count"
                type="number"
                min={1}
                max={10}
                value={setCount}
                onChange={(e) =>
                  onSetCountChange(Math.min(10, parseInt(e.target.value, 10) || 1))
                }
                className="w-24 text-center text-lg font-semibold"
              />
              <div className="flex flex-wrap gap-1.5">
                {QUICK_SETS.map((n) => (
                  <Button
                    key={n}
                    size="sm"
                    variant={setCount === n ? "default" : "outline"}
                    className={`h-8 w-12 px-0 ${setCount === n ? "bg-emerald-600 hover:bg-emerald-700" : ""}`}
                    onClick={() => onSetCountChange(n)}
                  >
                    {n}
                  </Button>
                ))}
              </div>
            </div>
            {countInvalid && (
              <p className="text-xs text-red-600 dark:text-red-400">
                Enter a number from 1 to 10{!isOriginal && " — can't exceed the number of selected questions"}.
              </p>
            )}
            {enabled && !countInvalid && isOriginal && (
              <p className="text-xs text-muted-foreground">
                Every set gets <span className="font-semibold text-emerald-700 dark:text-emerald-400">all {selectedCount}</span> questions — but each set's serial order differs (e.g. A: 1,2,3,4… / B: 4,1,2,5,3…)
              </p>
            )}
            {enabled && !countInvalid && !isOriginal && (
              <p className="text-xs text-muted-foreground">
                ≈ <span className="font-semibold text-emerald-700 dark:text-emerald-400">{perSet}</span> questions per set
                {remainder > 0 && ` (first ${remainder} set(s) get one extra)`}
              </p>
            )}
          </div>

          {/* ভাগ করার স্টাইল */}
          <div className="space-y-2">
            <Label className="font-medium">Split style</Label>
            <RadioGroup value={distribution} onValueChange={(v) => onDistributionChange(v as Distribution)} className="gap-2">
              <div className="flex items-start gap-2">
                <RadioGroupItem value="original" id="dist-original" className="mt-0.5" />
                <Label htmlFor="dist-original" className="cursor-pointer text-sm leading-snug flex-col items-start gap-0.5">
                  <span className="font-medium">⭐ Original Shuffle — all questions in every set</span>
                  <span className="block text-xs text-muted-foreground">
                    100 questions × 5 sets = 100 questions per set, but the serial order differs per set — Set A: 1,2,3,4… Set B: 4,1,2,5,3… Questions and options stay exactly unchanged. (Note: with very few questions — say 2 — the possible distinct orders are limited, so some sets may end up identical.)
                  </span>
                </Label>
              </div>
              <div className="flex items-start gap-2">
                <RadioGroupItem value="interleaved" id="dist-inter" className="mt-0.5" />
                <Label htmlFor="dist-inter" className="cursor-pointer text-sm leading-snug flex-col items-start gap-0.5">
                  <span className="font-medium">Round-robin (interleaved)</span>
                  <span className="block text-xs text-muted-foreground">Q1→Set A, Q2→Set B, Q3→Set C... an even mix in every set</span>
                </Label>
              </div>
              <div className="flex items-start gap-2">
                <RadioGroupItem value="chunk" id="dist-chunk" className="mt-0.5" />
                <Label htmlFor="dist-chunk" className="cursor-pointer text-sm leading-snug flex-col items-start gap-0.5">
                  <span className="font-medium">Sequential blocks</span>
                  <span className="block text-xs text-muted-foreground">Set A = questions 1–25, Set B = 26–50 (with shuffle-within off, each set keeps serial order)</span>
                </Label>
              </div>
              <div className="flex items-start gap-2">
                <RadioGroupItem value="random" id="dist-random" className="mt-0.5" />
                <Label htmlFor="dist-random" className="cursor-pointer text-sm leading-snug flex-col items-start gap-0.5">
                  <span className="font-medium">Fully random split</span>
                  <span className="block text-xs text-muted-foreground">The whole pool is shuffled first, then split into sets</span>
                </Label>
              </div>
            </RadioGroup>
          </div>
        </div>

        {/* সেটের ভেতরে শাফল — Original Shuffle-এ দরকার নেই (ক্রম ইতিমধ্যেই সেটপ্রতি আলাদা) */}
        {!isOriginal && (
          <div className="flex items-center justify-between rounded-xl border bg-muted/40 p-3">
            <div>
              <Label htmlFor="shuffle-within" className="cursor-pointer font-medium">
                Shuffle questions within each set
              </Label>
              <p className="text-xs text-muted-foreground">Off = questions keep their original serial order inside each set</p>
            </div>
            <Switch id="shuffle-within" checked={shuffleWithin} onCheckedChange={onShuffleWithinChange} />
          </div>
        )}

        {/* রেফারেন্স-ট্যাগ হ্যান্ডলিং — ডিটেক্ট হলেই দেখাবে */}
        {refReport && (
          <div className="space-y-3 rounded-xl border border-violet-200 bg-violet-50/60 p-3 dark:border-violet-900 dark:bg-violet-950/30">
            <div className="flex items-start gap-2">
              <Tags className="mt-0.5 h-4 w-4 shrink-0 text-violet-600 dark:text-violet-400" />
              <div>
                <Label className="font-medium">
                  Handle reference tags
                </Label>
                <p className="text-xs text-muted-foreground">
                  <span className="font-semibold text-violet-700 dark:text-violet-400">{refReport.questionCount}</span> question(s) have
                  source tags (e.g. {refReport.samples.slice(0, 2).join(", ")}) — detected no matter how the university/board/year is written.
                </p>
              </div>
            </div>
            <RadioGroup
              value={refMode}
              onValueChange={(v) => onRefModeChange(v as RefMode)}
              className="gap-2"
              data-testid="ref-mode-group"
            >
              <div className="flex items-start gap-2">
                <RadioGroupItem value="keep" id="ref-keep" className="mt-0.5" />
                <Label htmlFor="ref-keep" className="cursor-pointer text-sm leading-snug flex-col items-start gap-0.5">
                  <span className="font-medium">Keep as-is</span>
                  <span className="block text-xs text-muted-foreground">References stay with the question (current behavior)</span>
                </Label>
              </div>
              <div className="flex items-start gap-2">
                <RadioGroupItem value="strip" id="ref-strip" className="mt-0.5" />
                <Label htmlFor="ref-strip" className="cursor-pointer text-sm leading-snug flex-col items-start gap-0.5">
                  <span className="font-medium">Strip references — clean question paper</span>
                  <span className="block text-xs text-muted-foreground">All [source] tags removed; questions and options stay exactly intact</span>
                </Label>
              </div>
              <div className="flex items-start gap-2">
                <RadioGroupItem value="endline" id="ref-endline" className="mt-0.5" />
                <Label htmlFor="ref-endline" className="cursor-pointer text-sm leading-snug flex-col items-start gap-0.5">
                  <span className="font-medium">Move to a separate line after each question</span>
                  <span className="block text-xs text-muted-foreground">The tag goes on its own line at the very bottom of the question block</span>
                </Label>
              </div>
            </RadioGroup>
          </div>
        )}

        {/* বড় বাটন */}
        <div className="flex flex-col items-stretch gap-2">
          <Button
            size="lg"
            disabled={!enabled || countInvalid || shuffling}
            onClick={onShuffle}
            className={`h-14 gap-3 text-base font-bold ${enabled ? "bg-emerald-600 hover:bg-emerald-700" : ""}`}
          >
            {enabled ? <Shuffle className="h-5 w-5" /> : <Lock className="h-5 w-5" />}
            {shuffling ? "Shuffling..." : "🔀 Shuffle & build sets"}
          </Button>
          {lockReason ? (
            <p className="flex items-center justify-center gap-1.5 text-center text-sm text-amber-700 dark:text-amber-400">
              <Lock className="h-3.5 w-3.5" /> {lockReason}
            </p>
          ) : isOriginal ? (
            <p className="text-center text-sm text-emerald-700 dark:text-emerald-400">
              Ready! One click builds {setCount} set(s) — each with all {selectedCount} questions, a distinct serial order, one set per page.
            </p>
          ) : (
            <p className="text-center text-sm text-emerald-700 dark:text-emerald-400">
              Ready! One click builds {setCount} set(s) — each on its own page.
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
