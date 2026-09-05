"use client";

import { Dices, FileOutput, ListOrdered } from "lucide-react";
import { cn } from "@/lib/utils";

export type McqMode = "shuffle" | "serial" | "redownload";

interface ModeTabsProps {
  mode: McqMode;
  onChange: (m: McqMode) => void;
}

const TABS: { id: McqMode; title: string; sub: string }[] = [
  { id: "shuffle", title: "🔀 MCQ শাফল", sub: "প্রশ্ন শাফল + সেট তৈরি" },
  { id: "serial", title: "🔢 MCQ সিরিয়াল", sub: "রঙ-অনুযায়ী নম্বর বসানো" },
  { id: "redownload", title: "📥 MCQ রিডাউনলোড", sub: "অংশ বাছাই করে নতুন ফাইল" },
];

const ICONS: Record<McqMode, typeof Dices> = {
  shuffle: Dices,
  serial: ListOrdered,
  redownload: FileOutput,
};

const ARIA_LABELS: Record<McqMode, string> = {
  shuffle: "শাফল মোড",
  serial: "সিরিয়াল মোড",
  redownload: "রিডাউনলোড মোড",
};

/** উপরের তিনটা মোড-বাটন — শাফল, সিরিয়াল আর রিডাউনলোডের কাজ সম্পূর্ণ আলাদা */
export function ModeTabs({ mode, onChange }: ModeTabsProps) {
  return (
    <div
      role="tablist"
      aria-label="মোড বাছাই — শাফল, সিরিয়াল বা রিডাউনলোড"
      className="grid grid-cols-1 gap-2 sm:grid-cols-3 sm:gap-3"
    >
      {TABS.map((t) => {
        const active = mode === t.id;
        const Icon = ICONS[t.id];
        return (
          <button
            key={t.id}
            role="tab"
            aria-selected={active}
            aria-label={ARIA_LABELS[t.id]}
            type="button"
            onClick={() => onChange(t.id)}
            className={cn(
              "flex min-h-[44px] items-center gap-3 rounded-xl border-2 p-3 text-left transition-all",
              active
                ? "border-emerald-600 bg-emerald-600 text-white shadow-md"
                : "border-border bg-card hover:border-emerald-400 hover:bg-emerald-50/60 dark:hover:border-emerald-600 dark:hover:bg-emerald-950/20"
            )}
          >
            <span
              className={cn(
                "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg",
                active ? "bg-white/20 text-white" : "bg-emerald-600/10 text-emerald-600 dark:text-emerald-400"
              )}
            >
              <Icon className="h-5 w-5" />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-bold leading-tight sm:text-base">{t.title}</span>
              <span
                className={cn(
                  "mt-0.5 block text-xs",
                  active ? "text-white/85" : "text-muted-foreground"
                )}
              >
                {t.sub}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
