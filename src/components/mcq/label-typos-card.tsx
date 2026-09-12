"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { AlertTriangle, ChevronDown } from "lucide-react";
import type { LabelTypo } from "@/lib/mcq/redownload";

/** per-file merged row (page.tsx attaches the source file name) */
export type LabelTypoRow = LabelTypo & { fileName: string };

export interface LabelTyposCardProps {
  typos: LabelTypoRow[];
  /** fix-typos toggle (persisted in page.tsx; default OFF = download as-is) */
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
}

const ARROW = "\u2192";

/**
 * "Option label typos" - red expandable card (redownload mode).
 * Lists questions whose 4 option labels repeat a letter (K.L.L.N should be
 * K.L.M.N). Switch ON = the one-letter fixes are applied at download;
 * OFF (default) = downloads keep the labels exactly as uploaded.
 */
export function LabelTyposCard({ typos, checked, onCheckedChange }: LabelTyposCardProps) {
  const [open, setOpen] = useState(true);
  const multiFile = new Set(typos.map((t) => t.fileName)).size > 1;
  const toggleOpen = () => setOpen((v) => !v);
  return (
    <Card data-testid="label-typos-card" className="border-red-300 dark:border-red-900">
      <CardHeader className="cursor-pointer select-none pb-2" onClick={toggleOpen}>
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-400">
            <AlertTriangle className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-sm font-semibold">
              Option label typos - {typos.length} question{typos.length === 1 ? "" : "s"} affected
            </h3>
            <p className="truncate text-xs text-muted-foreground">
              {checked
                ? `ON - downloads fix repeated labels (e.g. K.L.L.N ${ARROW} K.L.M.N)`
                : "Off - downloads keep the labels exactly as uploaded"}
            </p>
          </div>
          <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
            <Switch
              checked={checked}
              onCheckedChange={onCheckedChange}
              aria-label="Fix label typos toggle"
              data-testid="label-typos-toggle"
            />
          </div>
          <button
            type="button"
            aria-label={open ? "Collapse typo list" : "Expand typo list"}
            className="rounded-md p-1 text-muted-foreground hover:bg-muted"
            onClick={(e) => {
              e.stopPropagation();
              toggleOpen();
            }}
          >
            <ChevronDown className={`h-5 w-5 transition-transform ${open ? "rotate-180" : ""}`} />
          </button>
        </div>
      </CardHeader>

      {open && (
        <CardContent className="space-y-2">
          <p className="rounded-xl border bg-muted/40 p-3 text-xs leading-relaxed text-muted-foreground">
            Each row is a question whose option labels repeat a letter where the next label
            belongs. Turn the switch <b className="text-foreground">on</b> to replace the wrong
            letters at download; everything else in the file stays exactly as uploaded.
          </p>
          {typos.map((t, i) => (
            <div
              key={`${t.id}-${t.serial}-${i}`}
              className="rounded-xl border border-red-200 bg-red-50/60 p-3 text-sm dark:border-red-900 dark:bg-red-950/30"
            >
              <div className="font-medium">
                Question {t.serial}
                {multiFile ? (
                  <span className="text-muted-foreground"> {"\u2014"} {t.fileName}</span>
                ) : null}
              </div>
              <div className="mt-1 font-mono text-xs">
                <span className="text-red-700 dark:text-red-400">{t.actual.join(".")}</span>
                <span className="mx-2 text-muted-foreground">{ARROW}</span>
                <span className="text-emerald-700 dark:text-emerald-400">{t.expected.join(".")}</span>
                <span className="ml-2 text-muted-foreground">({t.family})</span>
              </div>
            </div>
          ))}
        </CardContent>
      )}
    </Card>
  );
}
