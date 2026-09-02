"use client";

import { Dices, ListOrdered } from "lucide-react";
import { cn } from "@/lib/utils";

export type McqMode = "shuffle" | "serial";

interface ModeTabsProps {
  mode: McqMode;
  onChange: (m: McqMode) => void;
}

const TABS: { id: McqMode; title: string; sub: string }[] = [
  { id: "shuffle", title: "🔀 MCQ শাফল", sub: "প্রশ্ন শাফল + সেট তৈরি" },
  { id: "serial", title: "🔢 MCQ সিরিয়াল", sub: "রঙ-অনুযায়ী নম্বর বসানো" },
];

/** উপরের দুইটা মোড-বাটন — শাফল আর সিরিয়ালের কাজ সম্পূর্ণ আলাদা */
export function ModeTabs({ mode, onChange }: ModeTabsProps) {
  return (
    <div
      role="tablist"
      aria-label="মোড বাছাই — শাফল বা সিরিয়াল"
      className="grid grid-cols-1 gap-2 sm:grid-cols-2 sm:gap-3"
    >
      {TABS.map((t) => {
        const active = mode === t.id;
        const Icon = t.id === "shuffle" ? Dices : ListOrdered;
        return (
          <button
            key={t.id}
            role="tab"
            aria-selected={active}
            type="button"
            onClick={() => onChange(t.id)}
            className={cn(
              "flex min-h-[44px] items-center gap-3 rounded-xl border-2 p-3 text-left transition-all sm:p-4",
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
