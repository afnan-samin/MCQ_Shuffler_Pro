"use client";

import { cn } from "@/lib/utils";
import { MODE_IDS, MODE_META, type McqMode } from "@/lib/mcq/mode-meta";

export type { McqMode } from "@/lib/mcq/mode-meta";

interface ModeTabsProps {
  mode: McqMode;
  onChange: (m: McqMode) => void;
}

/** উপরের তিনটা মোড-বাটন — শাফল, সিরিয়াল আর রিডাউনলোডের কাজ সম্পূর্ণ আলাদা */
export function ModeTabs({ mode, onChange }: ModeTabsProps) {
  return (
    <div
      role="tablist"
      aria-label="Mode selection — shuffle, serial, or redownload"
      className="grid grid-cols-1 gap-2 sm:grid-cols-3 sm:gap-3"
    >
      {MODE_IDS.map((id) => {
        const meta = MODE_META[id];
        const active = mode === id;
        const Icon = meta.Icon;
        return (
          <button
            key={id}
            role="tab"
            aria-selected={active}
            aria-label={meta.ariaLabel}
            type="button"
            onClick={() => onChange(id)}
            className={cn(
              "flex min-h-[44px] items-center gap-3 rounded-xl border-2 p-3 text-left transition-all",
              active
                ? "border-brand-600 bg-brand-600 text-white shadow-md"
                : "border-border bg-card hover:border-brand-400 hover:bg-brand-50/60 dark:hover:border-brand-600 dark:hover:bg-brand-950/20"
            )}
          >
            <span
              className={cn(
                "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg",
                active ? "bg-white/20 text-white" : "bg-brand-600/10 text-brand-600 dark:text-brand-400"
              )}
            >
              <Icon className="h-5 w-5" />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-bold leading-tight sm:text-base">{meta.tabTitle}</span>
              <span
                className={cn(
                  "mt-0.5 block text-xs",
                  active ? "text-white/85" : "text-muted-foreground"
                )}
              >
                {meta.description}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
