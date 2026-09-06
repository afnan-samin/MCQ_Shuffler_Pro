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
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-600 text-sm font-bold text-white">৩</span>
          <CardTitle className="text-lg md:text-xl">শাফল সেটিংস ও শুরু</CardTitle>
        </div>
        <CardDescription>
          কতটা সেট চান লিখে দিন (১–১০)। Original Shuffle-এ প্রতি সেটে সবগুলো প্রশ্ন থাকে, বাকি স্টাইলে প্রশ্ন ভাগ হয়ে যায়।
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-5 md:grid-cols-2">
          {/* সেট সংখ্যা */}
          <div className="space-y-2">
            <Label htmlFor="set-count" className="font-medium">
              কয়টা সেট হবে?
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
                ১ থেকে ১০ এর মধ্যে দিন{!isOriginal && " — সিলেক্টেড প্রশ্নের সংখ্যার চেয়ে বেশি হতে পারবে না"}।
              </p>
            )}
            {enabled && !countInvalid && isOriginal && (
              <p className="text-xs text-muted-foreground">
                প্রতি সেটে <span className="font-semibold text-emerald-700 dark:text-emerald-400">সবগুলো {selectedCount}</span> টি প্রশ্ন — কিন্তু প্রতি সেটের সিরিয়াল ক্রম আলাদা (যেমন: A: ১,২,৩,৪… / B: ৪,১,২,৫,৩…)
              </p>
            )}
            {enabled && !countInvalid && !isOriginal && (
              <p className="text-xs text-muted-foreground">
                প্রতি সেটে ≈ <span className="font-semibold text-emerald-700 dark:text-emerald-400">{perSet}</span> টি প্রশ্ন
                {remainder > 0 && ` (প্রথম ${remainder} টি সেটে ১টা করে বেশি)`}
              </p>
            )}
          </div>

          {/* ভাগ করার স্টাইল */}
          <div className="space-y-2">
            <Label className="font-medium">ভাগ করার স্টাইল</Label>
            <RadioGroup value={distribution} onValueChange={(v) => onDistributionChange(v as Distribution)} className="gap-2">
              <div className="flex items-start gap-2">
                <RadioGroupItem value="original" id="dist-original" className="mt-0.5" />
                <Label htmlFor="dist-original" className="cursor-pointer text-sm leading-snug flex-col items-start gap-0.5">
                  <span className="font-medium">⭐ Original Shuffle — সব সেটে সব প্রশ্ন</span>
                  <span className="block text-xs text-muted-foreground">
                    ১০০ প্রশ্ন × ৫ সেট = প্রতি সেটেই ১০০টা প্রশ্ন, কিন্তু সিরিয়াল ক্রম সেটভেদে আলাদা — সেট A: ১,২,৩,৪… সেট B: ৪,১,২,৫,৩… প্রশ্ন-অপশন হুবহু অপরিবর্তিত। (বিঃদ্রঃ: খুব কম প্রশ্নে — যেমন ২টা — সম্ভাব্য সব ক্রম সীমিত হয়, তাই কিছু সেট একই ক্রমের হতে পারে।)
                  </span>
                </Label>
              </div>
              <div className="flex items-start gap-2">
                <RadioGroupItem value="interleaved" id="dist-inter" className="mt-0.5" />
                <Label htmlFor="dist-inter" className="cursor-pointer text-sm leading-snug flex-col items-start gap-0.5">
                  <span className="font-medium">পরপর ভাগ (রাউন্ড-রবিন)</span>
                  <span className="block text-xs text-muted-foreground">প্রশ্ন ১→সেটA, ২→সেটB, ৩→সেটC... প্রতি সেটে সমান মানের মিক্স</span>
                </Label>
              </div>
              <div className="flex items-start gap-2">
                <RadioGroupItem value="chunk" id="dist-chunk" className="mt-0.5" />
                <Label htmlFor="dist-chunk" className="cursor-pointer text-sm leading-snug flex-col items-start gap-0.5">
                  <span className="font-medium">ধারাবাহিক ব্লক</span>
                  <span className="block text-xs text-muted-foreground">সেটA = প্রশ্ন ১–২৫, সেটB = ২৬–৫০ (শাফল বন্ধ রাখলে প্রতি সেট সিরিয়াল থাকে)</span>
                </Label>
              </div>
              <div className="flex items-start gap-2">
                <RadioGroupItem value="random" id="dist-random" className="mt-0.5" />
                <Label htmlFor="dist-random" className="cursor-pointer text-sm leading-snug flex-col items-start gap-0.5">
                  <span className="font-medium">একদম এলোমেলো ভাগ</span>
                  <span className="block text-xs text-muted-foreground">পুরো পুল আগে শাফল হয়ে তারপর সেটে ভাগ হবে</span>
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
                সেটের ভেতরেও প্রশ্ন এলোমেলো
              </Label>
              <p className="text-xs text-muted-foreground">বন্ধ রাখলে সেটের ভেতরে প্রশ্নগুলো অরিজিনাল সিরিয়ালেই থাকবে</p>
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
                  রেফারেন্স ট্যাগ আলাদা করুন
                </Label>
                <p className="text-xs text-muted-foreground">
                  <span className="font-semibold text-violet-700 dark:text-violet-400">{refReport.questionCount}</span> টি প্রশ্নে
                  সোর্স-ট্যাগ পাওয়া গেছে (যেমন {refReport.samples.slice(0, 2).join(", ")}) — ভার্সিটি/বোর্ড/বছর যেভাবেই লেখা থাকুক, ধরা পড়ে।
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
                  <span className="font-medium">যেমন আছে তেমন রাখুন</span>
                  <span className="block text-xs text-muted-foreground">প্রশ্নের সাথেই রেফারেন্স থাকবে (বর্তমান আচরণ)</span>
                </Label>
              </div>
              <div className="flex items-start gap-2">
                <RadioGroupItem value="strip" id="ref-strip" className="mt-0.5" />
                <Label htmlFor="ref-strip" className="cursor-pointer text-sm leading-snug flex-col items-start gap-0.5">
                  <span className="font-medium">রেফারেন্স বাদ দিন — ক্লিন প্রশ্নপত্র</span>
                  <span className="block text-xs text-muted-foreground">সব [সোর্স] ট্যাগ মুছে যাবে; প্রশ্ন-অপশন হুবহু অক্ষত</span>
                </Label>
              </div>
              <div className="flex items-start gap-2">
                <RadioGroupItem value="endline" id="ref-endline" className="mt-0.5" />
                <Label htmlFor="ref-endline" className="cursor-pointer text-sm leading-snug flex-col items-start gap-0.5">
                  <span className="font-medium">প্রশ্নের শেষে আলাদা লাইনে সরান</span>
                  <span className="block text-xs text-muted-foreground">ট্যাগ প্রশ্ন-ব্লকের একেবারে নিচে নিজের লাইনে বসবে</span>
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
            {shuffling ? "শাফল হচ্ছে..." : "🔀 শাফল করুন ও সেট তৈরি করুন"}
          </Button>
          {lockReason ? (
            <p className="flex items-center justify-center gap-1.5 text-center text-sm text-amber-700 dark:text-amber-400">
              <Lock className="h-3.5 w-3.5" /> {lockReason}
            </p>
          ) : isOriginal ? (
            <p className="text-center text-sm text-emerald-700 dark:text-emerald-400">
              রেডি! ক্লিক করলেই {setCount} টি সেট — প্রতিটিতে সব {selectedCount} টি প্রশ্ন, সিরিয়াল ক্রম আলাদা, প্রতিটি সেট আলাদা পেজে।
            </p>
          ) : (
            <p className="text-center text-sm text-emerald-700 dark:text-emerald-400">
              রেডি! ক্লিক করলেই {setCount} টি সেট তৈরি হবে — প্রতিটি আলাদা পেজে।
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
