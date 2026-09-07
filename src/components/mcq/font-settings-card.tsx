"use client";

import { useEffect, useRef, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import { CheckCircle2, ChevronDown, RotateCcw, Type } from "lucide-react";
import { DEFAULT_FONT_REMAP_SETTINGS, FONT_CHOICES, type FontSettings } from "@/lib/mcq/font-remap";

export interface FontSettingsCardProps {
  /** বর্তমানে প্রয়োগ করা সেটিংস (page.tsx-এ persisted) */
  settings: FontSettings;
  /** "Use fonts" / "Reset" কনফার্ম করলে কল হয় */
  onChange: (s: FontSettings) => void;
}

const FONT_SELECT_FIELDS = [
  {
    key: "englishFont" as const,
    id: "font-english",
    label: "English fonts",
    choices: FONT_CHOICES.english,
    aria: "English output font",
  },
  {
    key: "bijoyFont" as const,
    id: "font-bijoy",
    label: "Bijoy-ANSI fonts",
    choices: FONT_CHOICES.bijoy,
    aria: "Bijoy output font",
  },
  {
    key: "unicodeFont" as const,
    id: "font-unicode",
    label: "Unicode-Bengali fonts",
    choices: FONT_CHOICES.unicode,
    aria: "Unicode output font",
  },
];

/**
 * "Fonts in the output file" — collapsible font-remap card.
 * Three dropdowns (English / Bijoy-ANSI / Unicode-Bengali) fed from FONT_CHOICES,
 * an ON/OFF remap switch, and a "Use fonts" confirm + "Reset" pair.
 * The draft stays local until "Use fonts" commits it (persisted by the page).
 */
export function FontSettingsCard({ settings, onChange }: FontSettingsCardProps) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<FontSettings>(settings);
  const [savedFlash, setSavedFlash] = useState(false);
  // savedFlash-টাইমারের id ref-এ — unmount-এ ক্লিয়ার (state-আপডেট-অন-আনমাউন্টেড এড়াতে)
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (savedTimerRef.current !== null) clearTimeout(savedTimerRef.current);
    },
    []
  );

  /** খোলার সময় ড্রাফট প্রয়োগ-করা সেটিংস থেকে সিঙ্ক (confirm/reset-এর পরেও সঠিক) */
  const toggleOpen = () => {
    if (!open) setDraft(settings);
    setOpen(!open);
  };

  const patch = (p: Partial<FontSettings>) => setDraft((d) => ({ ...d, ...p }));

  const confirm = () => {
    onChange(draft);
    setSavedFlash(true);
    // আগের টাইমার থাকলে বাতিল — দ্রুত পরপর কনফার্মে ফ্ল্যাশ আগেভাগে নিভে যায় না
    if (savedTimerRef.current !== null) clearTimeout(savedTimerRef.current);
    savedTimerRef.current = setTimeout(() => {
      savedTimerRef.current = null;
      setSavedFlash(false);
    }, 1800);
  };

  const reset = () => {
    setDraft(DEFAULT_FONT_REMAP_SETTINGS);
    onChange(DEFAULT_FONT_REMAP_SETTINGS);
  };

  return (
    <Card data-testid="font-settings-card">
      <CardHeader
        className="cursor-pointer select-none pb-2"
        onClick={toggleOpen}
      >
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-100 text-brand-700 dark:bg-brand-950/50 dark:text-brand-400">
            <Type className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <CardTitle className="text-base md:text-lg">Fonts in the output file</CardTitle>
            <CardDescription className="truncate">
              {settings.enabled
                ? `Remap ON — Unicode → ${settings.unicodeFont}, Bijoy → ${settings.bijoyFont}, English → ${settings.englishFont}`
                : "Remap is OFF — the output keeps the original fonts"}
            </CardDescription>
          </div>
          <button
            type="button"
            aria-expanded={open}
            aria-controls="font-settings-content"
            aria-label={open ? "Collapse font settings" : "Expand font settings"}
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
        <CardContent id="font-settings-content" className="space-y-4">
          {/* কী রিম্যাপ হয় — তথ্য-লাইন */}
          <p className="rounded-xl border bg-muted/40 p-3 text-xs leading-relaxed text-muted-foreground">
            Bengali (Unicode) text runs get <b className="text-foreground">{draft.unicodeFont}</b>,
            Bijoy/ANSI text runs get <b className="text-foreground">{draft.bijoyFont}</b>, and
            everything else (English, numbers, symbols) gets{" "}
            <b className="text-foreground">{draft.englishFont}</b>. Fonts are applied to the
            downloaded .docx after all other edits — text and formatting stay untouched.
          </p>

          {/* রিম্যাপ ON/OFF */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-muted/40 p-3">
            <div className="min-w-0">
              <div className="text-sm font-semibold">Remap fonts in the output file</div>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Off = downloads keep the original fonts exactly as they are now.
              </p>
            </div>
            <Switch
              checked={draft.enabled}
              onCheckedChange={(v) => patch({ enabled: v })}
              aria-label="Font remap toggle"
            />
          </div>

          {/* তিনটা ফন্ট-ড্রপডাউন */}
          <div className="grid gap-4 sm:grid-cols-3">
            {FONT_SELECT_FIELDS.map((f) => (
              <div key={f.key} className="space-y-1.5">
                <Label htmlFor={f.id} className="text-sm">
                  {f.label}
                </Label>
                <Select value={draft[f.key]} onValueChange={(v) => patch({ [f.key]: v })}>
                  <SelectTrigger id={f.id} aria-label={f.aria} className="h-9 w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {f.choices.map((font) => (
                      <SelectItem key={font} value={font}>
                        {font}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ))}
          </div>

          {/* কনফার্ম + রিসেট */}
          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="button"
              onClick={confirm}
              className="bg-brand-600 text-white hover:bg-brand-700"
            >
              Use fonts
            </Button>
            <Button type="button" variant="outline" onClick={reset}>
              <RotateCcw className="h-4 w-4" />
              Reset
            </Button>
            {savedFlash && (
              <span className="flex items-center gap-1 text-sm font-medium text-brand-700 dark:text-brand-400">
                <CheckCircle2 className="h-4 w-4" /> Applied — downloads will use these fonts
              </span>
            )}
          </div>
        </CardContent>
      )}
    </Card>
  );
}
