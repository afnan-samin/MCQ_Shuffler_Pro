"use client";

import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { ArrowLeft, FolderPlus, Loader2 } from "lucide-react";
import type { McqMode } from "@/components/mcq/mode-tabs";

const MODE_META: Record<McqMode, { icon: string; title: string }> = {
  shuffle: { icon: "🔀", title: "MCQ শাফল" },
  serial: { icon: "🔢", title: "MCQ সিরিয়াল" },
  redownload: { icon: "📥", title: "MCQ রিডাউনলোড" },
};

const bn = (n: number) => String(n).replace(/\d/g, (d) => "০১২৩৪৫৬৭৮৯"[Number(d)]);

interface ModeWorkBarProps {
  mode: McqMode;
  /** "পেছনে" (শুধু অ্যারো) — হোমে ফেরা (আপলোড-কার্ড); লোড করা সব ডেটা রিসেট হয় */
  onBack: () => void;
  /** নতুন ফাইল এই মোডেই যোগ হবে (append) */
  onAddFiles: (files: File[]) => void;
  busy?: boolean;
  /** বর্তমান মোডে থাকা ফাইল-সংখ্যা (দেখাতে চাইলে) */
  filesCount?: number;
  /** সর্বোচ্চ ফাইল-সীমা (শাফলে ৫০) — পূর্ণ হলে যোগ-বাটন বন্ধ */
  maxFiles?: number;
}

/**
 * কাজ-চলাকালীন উপরের পাতলা বার — মোড সিলেক্ট হয়ে গেলে ৩টা মোড-বাটন আর দেখানো হয় না।
 * বাঁয়ে অ্যারো-বাটন (হোমে ফেরা), ডানে "আরও ফাইল" — নতুন ফাইল এই মোডেই যুক্ত হয়।
 */
export function ModeWorkBar({ mode, onBack, onAddFiles, busy, filesCount, maxFiles }: ModeWorkBarProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const meta = MODE_META[mode];
  const capped = maxFiles !== undefined && filesCount !== undefined && filesCount >= maxFiles;

  return (
    <div data-testid="mode-work-bar" className="flex flex-wrap items-center gap-2 rounded-xl border bg-card p-2 shadow-sm">
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="px-2"
        onClick={onBack}
        disabled={busy}
        aria-label="পেছনে — হোমে ফিরুন"
        title="হোমে ফিরুন — লোড করা ফাইল মুছে নতুন শুরু"
      >
        <ArrowLeft className="h-4 w-4" />
      </Button>

      <div className="min-w-0 flex-1 text-center">
        <span className="text-sm font-bold sm:text-base">{meta.icon} {meta.title}</span>
        <span className="ml-2 hidden text-xs text-muted-foreground sm:inline">— হোমে ফিরতে অ্যারো চাপুন</span>
      </div>

      {maxFiles !== undefined && filesCount !== undefined && (
        <span
          className={
            "rounded-full px-2.5 py-0.5 text-xs font-medium " +
            (capped
              ? "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400"
              : "bg-muted text-muted-foreground")
          }
        >
          {bn(filesCount)}/{bn(maxFiles)} ফাইল
        </span>
      )}

      <Button
        type="button"
        variant="outline"
        size="sm"
        className="gap-1.5"
        disabled={busy || capped}
        title={capped ? `সর্বোচ্চ ${bn(maxFiles!)} টি ফাইল নেওয়া যায়` : undefined}
        onClick={() => fileRef.current?.click()}
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FolderPlus className="h-4 w-4" />}
        আরও ফাইল
      </Button>
      <input
        ref={fileRef}
        type="file"
        accept=".docx"
        multiple
        className="hidden"
        data-testid="mode-work-bar-input"
        onChange={(e) => {
          onAddFiles(Array.from(e.target.files ?? []).filter((f) => /\.docx$/i.test(f.name)));
          e.target.value = "";
        }}
      />
    </div>
  );
}
