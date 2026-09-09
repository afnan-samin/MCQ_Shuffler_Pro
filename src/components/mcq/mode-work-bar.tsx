"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ArrowLeftRight, ChevronDown, FolderPlus, Loader2 } from "lucide-react";
import { FileDropzone, type DropzoneTrigger } from "@/components/mcq/file-dropzone";
import { MODE_META, MODE_IDS, type McqMode } from "@/lib/mcq/mode-meta";
import { toast } from "@/hooks/use-toast";

interface ModeWorkBarProps {
  mode: McqMode;
  /** "পেছনে" (শুধু অ্যারো) — হোমে ফেরা (আপলোড-কার্ড); লোড করা সব ডেটা রিসেট হয় */
  onBack: () => void;
  /** "Mode Change" — অন্য মোডে সরাসরি সুইচ (আপলোড করা ফাইল নিজে থেকেই বহন হয়) */
  onModeChange: (m: McqMode) => void;
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
 * বাঁয়ে অ্যারো-বাটন (হোমে ফেরা) + তার পরেই "Mode Change" ড্রপডাউন (বাকি ২ মোডে
 * সরাসরি সুইচ — ফাইল বহন হয়), ডানে "আরও ফাইল" — নতুন ফাইল এই মোডেই যুক্ত হয়।
 */
export function ModeWorkBar({ mode, onBack, onModeChange, onAddFiles, busy, filesCount, maxFiles }: ModeWorkBarProps) {
  const meta = MODE_META[mode];
  const capped = maxFiles !== undefined && filesCount !== undefined && filesCount >= maxFiles;
  const dzTrigger = useRef<DropzoneTrigger | null>(null);
  const menuWrapRef = useRef<HTMLDivElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  // মেনুর বাইরে ক্লিক / Escape — বন্ধ (ব্রাউজার-only লিসেনার, মেনু খোলা থাকলেই)
  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: PointerEvent) => {
      if (menuWrapRef.current && !menuWrapRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  const others = MODE_IDS.filter((m) => m !== mode);

  return (
    <div data-testid="mode-work-bar" className="flex flex-wrap items-center gap-2 rounded-xl border bg-card p-2 shadow-sm">
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="px-2"
        onClick={onBack}
        disabled={busy}
        aria-label="Back — return home"
        title="Back home — loaded files are cleared for a fresh start"
      >
        <ArrowLeft className="h-4 w-4" />
      </Button>

      {/* Mode Change — ব্যাক-বাটনের ঠিক পরেই; বাকি ২ মোডে ফাইলসহ সরাসরি সুইচ */}
      <div ref={menuWrapRef} className="relative">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-1.5"
          onClick={() => setMenuOpen((o) => !o)}
          disabled={busy}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          aria-label="Mode Change — switch to another mode"
          title="Switch to another mode — your uploaded files come along"
          data-testid="mode-change-btn"
        >
          <ArrowLeftRight className="h-4 w-4" />
          Mode Change
          <ChevronDown className="h-3.5 w-3.5 opacity-70" />
        </Button>
        {menuOpen && (
          <div
            role="menu"
            aria-label="Switch to another mode"
            data-testid="mode-change-menu"
            className="absolute left-0 top-full z-50 mt-1.5 min-w-[250px] rounded-xl border bg-card p-1.5 shadow-lg"
          >
            <div className="px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Switch mode — files come along
            </div>
            {others.map((m) => {
              const om = MODE_META[m];
              const Icon = om.Icon;
              return (
                <button
                  key={m}
                  role="menuitem"
                  type="button"
                  data-testid={`mode-change-${m}`}
                  className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-brand-50 dark:hover:bg-brand-950/30"
                  onClick={() => {
                    setMenuOpen(false);
                    onModeChange(m);
                  }}
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-600/10 text-brand-600 dark:text-brand-400">
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold leading-tight">{om.tabTitle}</span>
                    <span className="block text-xs text-muted-foreground">{om.description}</span>
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="min-w-0 flex-1 text-center">
        <span className="text-sm font-bold sm:text-base">{meta.title}</span>
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
          {filesCount}/{maxFiles} files
        </span>
      )}

      {/* আরও ফাইল — শেয়ার্ড ড্রপজোনের লুকানো ইনপুট এই বাটন দিয়ে খোলে (শাফল/সিরিয়াল/রিডাউনলোড তিন মোডেই) */}
      <FileDropzone
        accept=".docx"
        inputTestId="mode-work-bar-input"
        triggerRef={dzTrigger}
        onFiles={(fs, rej) => {
          // রিজেক্টেড বাকেটের ফিডব্যাক — accept-ফিল্টারে বাদ পড়া ফাইল নীরবে না গুমিয়ে জানাই
          if (rej.notAccepted.length) {
            toast({ title: `${rej.notAccepted.length} file(s) skipped — only .docx is supported`, variant: "destructive" });
          }
          onAddFiles(fs);
        }}
      >
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-1.5"
          disabled={busy || capped}
          title={capped ? `Max ${maxFiles!} files` : undefined}
          onClick={() => dzTrigger.current?.open()}
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FolderPlus className="h-4 w-4" />}
          Add files
        </Button>
      </FileDropzone>
    </div>
  );
}
