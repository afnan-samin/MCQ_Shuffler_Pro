"use client";

import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import type { DownloadFormat } from "@/lib/mcq/pdf-export";

interface DownloadFormatToggleProps {
  value: DownloadFormat;
  onChange: (f: DownloadFormat) => void;
  /** ডাউনলোড চলাকালীন টগল অপরিবর্তনীয় */
  disabled?: boolean;
  className?: string;
}

/**
 * "Download as" ফরম্যাট-টগল — DOCX (ডিফল্ট) / PDF দুটি পিল।
 * সব ডাউনলোড-কার্ডের বাটনের ঠিক উপরে বসে; এক ভিউতে ঠিক একবারই রেন্ডার হয়
 * (state page.tsx-এ লিফটেড — localStorage "mcq-download-format"-এ থাকে)।
 * Phase 5.1: PDF চালু — ব্রাউজারে রেন্ডার, বড় ফাইল auto-split
 * (pdf-export.ts ইতিমধ্যে -partN.pdf সাপোর্ট করে)।
 */
export function DownloadFormatToggle({ value, onChange, disabled = false, className }: DownloadFormatToggleProps) {
  const base =
    "flex-1 min-w-[76px] px-3 py-1.5 text-xs font-semibold rounded-md transition-colors disabled:cursor-not-allowed";
  // PDF temporarily unavailable — legacy "pdf" choice falls back to DOCX display
  const effectiveValue: DownloadFormat = value === "pdf" ? "docx" : value;
  const handlePdfClick = () => {
    toast({ title: "This feature is coming soon..." });
  };
  return (
    <div
      data-testid="download-format"
      className={cn("flex flex-wrap items-center gap-x-3 gap-y-1.5", className)}
    >
      <span className="text-sm font-medium">Download as</span>
      <div
        role="group"
        aria-label="Download format"
        className="flex gap-1 rounded-lg border bg-muted/40 p-1"
      >
        <button
          type="button"
          data-testid="format-docx"
          aria-pressed={effectiveValue === "docx"}
          disabled={disabled}
          onClick={() => onChange("docx")}
          className={cn(
            base,
            effectiveValue === "docx"
              ? "bg-brand-600 text-white shadow-sm hover:bg-brand-700"
              : "text-muted-foreground hover:bg-background hover:text-foreground"
          )}
        >
          DOCX
        </button>
        <button
          type="button"
          data-testid="format-pdf"
          aria-pressed={false}
          aria-disabled="true"
          disabled={disabled}
          title="PDF — coming soon"
          onClick={handlePdfClick}
          className={cn(
            base,
            "cursor-not-allowed opacity-50 text-muted-foreground hover:bg-background hover:text-foreground"
          )}
        >
          PDF
        </button>
      </div>
    </div>
  );
}
