"use client";

import { ArrowRight, ListOrdered, Dices, FileOutput } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { McqMode } from "@/components/mcq/mode-tabs";

interface NextModesCardProps {
  /** যে মোডে এখন কাজ হয়েছে */
  current: McqMode;
  /** বহন হওয়া ফাইল সংখ্যা */
  filesCount: number;
  /** অন্য মোডে ফাইল নিয়ে যাওয়া */
  onOpen: (m: McqMode) => void;
}

const MODE_META: Record<McqMode, { title: string; sub: string; Icon: typeof Dices }> = {
  shuffle: { title: "🔀 MCQ শাফল", sub: "প্রশ্ন শাফল + সেট তৈরি", Icon: Dices },
  serial: { title: "🔢 MCQ সিরিয়াল", sub: "রঙ-অনুযায়ী নম্বর বসানো", Icon: ListOrdered },
  redownload: { title: "📥 MCQ রিডাউনলোড", sub: "অংশ বাছাই করে নতুন ফাইল", Icon: FileOutput },
};

/**
 * ডাউনলোড-কার্ডের ঠিক নিচে দেখা যায় — বাকি ২টা মোডের বাটন।
 * ক্লিক করলে বর্তমান মোডের ফাইলগুলো সরাসরি ওই মোডে চলে যায় (আবার আপলোড লাগে না)।
 */
export function NextModesCard({ current, filesCount, onOpen }: NextModesCardProps) {
  const others = (Object.keys(MODE_META) as McqMode[]).filter((m) => m !== current);
  if (filesCount === 0) return null;

  return (
    <Card className="border-dashed border-emerald-300 bg-emerald-50/40 dark:border-emerald-800 dark:bg-emerald-950/10">
      <CardHeader className="pb-2">
        <CardTitle className="text-base md:text-lg">✅ এই ফাইলগুলো দিয়ে আরও কাজ করুন</CardTitle>
        <CardDescription>
          {filesCount} টি ফাইল নিয়ে অন্য মোডে সরাসরি কাজ করুন — ফাইলগুলো ওই মোডে নিজে নিজেই খুলে যাবে, আবার আপলোড লাগবে না।
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-2 sm:grid-cols-2 sm:gap-3">
          {others.map((m) => {
            const { title, sub, Icon } = MODE_META[m];
            return (
              <button
                key={m}
                type="button"
                onClick={() => onOpen(m)}
                className="flex min-h-[44px] items-center gap-3 rounded-xl border-2 border-border bg-card p-3 text-left transition-all hover:border-emerald-500 hover:bg-emerald-50 dark:hover:border-emerald-600 dark:hover:bg-emerald-950/20"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-600/10 text-emerald-600 dark:text-emerald-400">
                  <Icon className="h-5 w-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-bold leading-tight sm:text-base">{title}</span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">{sub}</span>
                </span>
                <ArrowRight className="h-4 w-4 shrink-0 text-emerald-600" />
              </button>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
