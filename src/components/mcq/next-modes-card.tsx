"use client";

import { ArrowRight } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { MODE_IDS, MODE_META, type McqMode } from "@/lib/mcq/mode-meta";

interface NextModesCardProps {
  /** যে মোডে এখন কাজ হয়েছে */
  current: McqMode;
  /** বহন হওয়া ফাইল সংখ্যা */
  filesCount: number;
  /** অন্য মোডে ফাইল নিয়ে যাওয়া */
  onOpen: (m: McqMode) => void;
}

/**
 * ডাউনলোড-কার্ডের ঠিক নিচে দেখা যায় — বাকি ২টা মোডের বাটন।
 * ক্লিক করলে বর্তমান মোডের ফাইলগুলো সরাসরি ওই মোডে চলে যায় (আবার আপলোড লাগে না)।
 */
export function NextModesCard({ current, filesCount, onOpen }: NextModesCardProps) {
  const others = MODE_IDS.filter((m) => m !== current);
  if (filesCount === 0) return null;

  return (
    <Card className="border-dashed border-brand-300 bg-brand-50/40 dark:border-brand-800 dark:bg-brand-950/10">
      <CardHeader className="pb-2">
        <CardTitle className="text-base md:text-lg">✅ Keep working with these files</CardTitle>
        <CardDescription>
          Take all {filesCount} file(s) straight into another mode — they open there automatically, no re-upload needed.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-2 sm:grid-cols-2 sm:gap-3">
          {others.map((m) => {
            const { tabTitle, description, Icon } = MODE_META[m];
            return (
              <button
                key={m}
                type="button"
                onClick={() => onOpen(m)}
                className="flex min-h-[44px] items-center gap-3 rounded-xl border-2 border-border bg-card p-3 text-left transition-all hover:border-brand-500 hover:bg-brand-50 dark:hover:border-brand-600 dark:hover:bg-brand-950/20"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-600/10 text-brand-600 dark:text-brand-400">
                  <Icon className="h-5 w-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-bold leading-tight sm:text-base">{tabTitle}</span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">{description}</span>
                </span>
                <ArrowRight className="h-4 w-4 shrink-0 text-brand-600" />
              </button>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
