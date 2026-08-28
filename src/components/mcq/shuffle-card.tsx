"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Lock, Shuffle } from "lucide-react";
import type { Distribution } from "@/lib/mcq/set-engine";

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
}: ShuffleCardProps) {
  const isOriginal = distribution === "original";
  const perSet = setCount > 0 ? Math.floor(selectedCount / setCount) : 0;
  const remainder = setCount > 0 ? selectedCount % setCount : 0;
  const countInvalid =
    setCount < 2 || setCount > 50 || (isOriginal ? false : setCount > selectedCount);

  return (
    <Card id="step-shuffle" className={enabled ? "border-emerald-300 dark:border-emerald-700" : ""}>
      <CardHeader>
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-600 text-sm font-bold text-white">৩</span>
          <CardTitle className="text-lg md:text-xl">শাফল সেটিংস ও শুরু</CardTitle>
        </div>
        <CardDescription>
          কতটা সেট চান লিখে দিন (২–৫০, সাধারণত ৩–১০)। Original Shuffle-এ প্রতি সেটে সবগুলো প্রশ্ন থাকে, বাকি স্টাইলে প্রশ্ন ভাগ হয়ে যায়।
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
                min={2}
                max={50}
                value={setCount}
                onChange={(e) => onSetCountChange(parseInt(e.target.value, 10) || 1)}
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
                ২ থেকে ৫০ এর মধ্যে দিন{!isOriginal && " — সিলেক্টেড প্রশ্নের সংখ্যার চেয়ে বেশি হতে পারবে না"}।
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
                    ১০০ প্রশ্ন × ৫ সেট = প্রতি সেটেই ১০০টা প্রশ্ন, কিন্তু সিরিয়াল ক্রম সেটভেদে আলাদা — সেট A: ১,২,৩,৪… সেট B: ৪,১,২,৫,৩… এক সেটের ক্রম আরেক সেটের সাথে মিলবে না। প্রশ্ন-অপশন হুবহু অপরিবর্তিত।
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
