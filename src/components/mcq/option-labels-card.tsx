"use client";

import { useEffect, useRef, useState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CheckCircle2, ChevronDown, ListOrdered, RotateCcw } from "lucide-react";
import {
  DEFAULT_OPTION_LABEL_SETTINGS,
  OPTION_LABEL_SEQ,
  OPTION_LABEL_STYLE_CHOICES,
  type OptionLabelSeparator,
  type OptionLabelSettings,
} from "@/lib/mcq/option-labels";

export interface OptionLabelsCardProps {
  /** বর্তমানে প্রয়োগ করা সেটিংস (page.tsx-এ persisted) */
  settings: OptionLabelSettings;
  /** "Use labels" / "Reset" কনফার্ম করলে কল হয় */
  onChange: (s: OptionLabelSettings) => void;
}

const SEPARATOR_CHOICES: ReadonlyArray<{ value: OptionLabelSeparator; label: string }> = [
  { value: ".", label: "Dot  (ক. / A.)" },
  { value: ")", label: "Bracket  (ক) / A)" },
];

/**
 * "MCQ option labels" — collapsible option-label card (redownload mode).
 * Label-style + separator dropdowns, an ON/OFF switch, and a
 * "Use labels" confirm + "Reset" pair. Only the option labels change —
 * everything else in the output stays exactly as uploaded.
 */
export function OptionLabelsCard({ settings, onChange }: OptionLabelsCardProps) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<OptionLabelSettings>(settings);
  const [savedFlash, setSavedFlash] = useState(false);
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (savedTimerRef.current !== null) clearTimeout(savedTimerRef.current);
    },
    []
  );

  const toggleOpen = () => {
    if (!open) setDraft(settings);
    setOpen(!open);
  };

  const patch = (p: Partial<OptionLabelSettings>) => setDraft((d) => ({ ...d, ...p }));

  const confirm = () => {
    onChange(draft);
    setSavedFlash(true);
    if (savedTimerRef.current !== null) clearTimeout(savedTimerRef.current);
    savedTimerRef.current = setTimeout(() => {
      savedTimerRef.current = null;
      setSavedFlash(false);
    }, 1800);
  };

  const reset = () => {
    setDraft(DEFAULT_OPTION_LABEL_SETTINGS);
    onChange(DEFAULT_OPTION_LABEL_SETTINGS);
  };

  const example = OPTION_LABEL_SEQ[draft.style].map((l) => `${l}${draft.separator}`).join("  ");

  return (
    <Card data-testid="option-labels-card">
      <CardHeader className="cursor-pointer select-none pb-2" onClick={toggleOpen}>
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-100 text-brand-700 dark:bg-brand-950/50 dark:text-brand-400">
            <ListOrdered className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-sm font-semibold">MCQ option labels</h3>
            <p className="truncate text-xs text-muted-foreground">
              {draft.enabled
                ? `ON — option labels become ${example}`
                : "Off — downloads keep the original option labels"}
            </p>
          </div>
          <button
            type="button"
            aria-label={open ? "Collapse option label settings" : "Expand option label settings"}
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
        <CardContent id="option-labels-content" className="space-y-4">
          {/* কী বদলায় — তথ্য-লাইন */}
          <p className="rounded-xl border bg-muted/40 p-3 text-xs leading-relaxed text-muted-foreground">
            Rewrites the <b className="text-foreground">MCQ option labels</b> of the downloaded
            file — e.g. <b className="text-foreground">ক. খ. গ. ঘ.</b> becomes{" "}
            <b className="text-foreground">{example}</b>. Only the labels change — question text,
            serials, fonts and all other formatting stay exactly as uploaded. The{" "}
            <b className="text-foreground">Options</b> part must be ticked in step&nbsp;2 for the
            labels to appear in the output.
          </p>

          {/* ON/OFF */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-muted/40 p-3">
            <div className="min-w-0">
              <div className="text-sm font-semibold">Customize option labels</div>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Off = downloads keep the uploaded file&apos;s labels exactly as they are now.
              </p>
            </div>
            <Switch
              checked={draft.enabled}
              onCheckedChange={(v) => patch({ enabled: v })}
              aria-label="Option labels toggle"
            />
          </div>

          {/* লেবেল-স্টাইল + সেপারেটর */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="option-label-style" className="text-sm">
                Label style
              </Label>
              <Select
                value={draft.style}
                onValueChange={(v) => patch({ style: v as OptionLabelSettings["style"] })}
              >
                <SelectTrigger id="option-label-style" aria-label="Option label style" className="h-9 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {OPTION_LABEL_STYLE_CHOICES.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="option-label-separator" className="text-sm">
                Separator
              </Label>
              <Select
                value={draft.separator}
                onValueChange={(v) => patch({ separator: v as OptionLabelSeparator })}
              >
                <SelectTrigger
                  id="option-label-separator"
                  aria-label="Option label separator"
                  className="h-9 w-full"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SEPARATOR_CHOICES.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* কনফার্ম + রিসেট */}
          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="button"
              onClick={confirm}
              className="bg-brand-600 text-white hover:bg-brand-700"
            >
              Use labels
            </Button>
            <Button type="button" variant="outline" onClick={reset}>
              <RotateCcw className="h-4 w-4" />
              Reset
            </Button>
            {savedFlash && (
              <span className="flex items-center gap-1 text-sm font-medium text-brand-700 dark:text-brand-400">
                <CheckCircle2 className="h-4 w-4" /> Applied — downloads will use these labels
              </span>
            )}
          </div>
        </CardContent>
      )}
    </Card>
  );
}