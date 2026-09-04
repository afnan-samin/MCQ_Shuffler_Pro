"use client";

import { useState, type DragEvent } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, ChevronUp, GripVertical, Loader2, X } from "lucide-react";
import { numberToDigits } from "@/lib/mcq/docx-xml";

export interface MultiFileItem {
  id: string;
  name: string;
  status: "loading" | "ready" | "error";
  error?: string | null;
  /** ready হলে সবুজ ব্যাজে দেখাও */
  questionCount?: number | null;
}

export interface MultiFileListProps {
  items: MultiFileItem[];
  /** from-ইনডেক্স থেকে to-ইনডেক্সে সরানো — ড্র্যাগ-ড্রপ ও তীর-বাটন দুটোই এটাই ডাকে */
  onReorder: (from: number, to: number) => void;
  onRemove: (id: string) => void;
  disabled?: boolean;
}

/** মাল্টি-ফাইল অর্ডার লিস্ট — ডেস্কটপে ড্র্যাগ-ড্রপ, মোবাইলে উপরে/নিচে তীর-বাটন */
export function MultiFileList({ items, onReorder, onRemove, disabled = false }: MultiFileListProps) {
  // কোন রো ধরে টানা হচ্ছে (from-ইনডেক্স) আর কোন রোর উপরে হোভার হচ্ছে (to-ইনডেক্স)
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  // খালি তালিকা → কিছুই রেন্ডার নয়
  if (items.length === 0) return null;

  /** ড্র্যাগ শেষ — সব টেম্পোরারি অবস্থা রিসেট */
  const resetDrag = () => {
    setDragFrom(null);
    setHoverIndex(null);
  };

  const handleDragStart = (i: number) => {
    if (disabled) return;
    setDragFrom(i);
  };

  // ড্রপ সম্ভব করতে preventDefault জরুরি + হোভার-ইনডেক্স ট্র্যাক
  const handleDragOver = (i: number) => (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (disabled || dragFrom === null || dragFrom === i) return;
    setHoverIndex(i);
  };

  const handleDrop = (i: number) => {
    if (disabled || dragFrom === null) {
      resetDrag();
      return;
    }
    const to = hoverIndex ?? i;
    // একই জায়গায় ছাড়লে কিছু করার নেই
    if (dragFrom !== to) onReorder(dragFrom, to);
    resetDrag();
  };

  return (
    <div className={"space-y-2 " + (disabled ? "pointer-events-none opacity-60" : "")}>
      {items.map((item, i) => (
        <div
          key={item.id}
          draggable={!disabled}
          onDragStart={() => handleDragStart(i)}
          onDragOver={handleDragOver(i)}
          onDrop={() => handleDrop(i)}
          onDragEnd={resetDrag}
          className={
            "flex min-w-0 items-center gap-2 rounded-lg border bg-card px-3 py-2 transition-shadow " +
            (item.status === "error" ? "border-red-300 dark:border-red-900 " : "") +
            (dragFrom === i ? "opacity-50 " : "") +
            (hoverIndex === i && dragFrom !== null && dragFrom !== i ? "ring-2 ring-emerald-500 " : "")
          }
        >
          {/* ড্র্যাগ হ্যান্ডেল (শুধু দেখার জন্য — পুরো রো-ই draggable) */}
          <GripVertical aria-hidden="true" className="h-4 w-4 shrink-0 cursor-grab text-muted-foreground" />

          {/* বাংলা সিরিয়াল নম্বর */}
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-emerald-100 text-xs font-semibold text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
            {numberToDigits(i + 1, "bn")}
          </span>

          {/* ফাইলের নাম — লম্বা হলে কাটা পড়বে */}
          <span className="min-w-0 flex-1 truncate text-sm">{item.name}</span>

          {/* স্টেটাস: লোডিং / প্রস্তুত / এরর */}
          {item.status === "loading" && (
            <Loader2 aria-hidden="true" className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
          )}
          {item.status === "ready" &&
            (typeof item.questionCount === "number" ? (
              <Badge
                variant="secondary"
                className="shrink-0 border-transparent bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300"
              >
                {numberToDigits(item.questionCount, "bn")} টি প্রশ্ন
              </Badge>
            ) : (
              <Badge variant="secondary" className="shrink-0">
                প্রস্তুত
              </Badge>
            ))}
          {item.status === "error" && (
            <span className="min-w-0 max-w-[45%] truncate text-xs text-red-600 dark:text-red-400">
              {item.error ?? "ফাইলটা পড়া যায়নি"}
            </span>
          )}

          {/* মোবাইল-ফ্রেন্ডলি রি-অর্ডার + রিমুভ বাটন */}
          <div className="flex shrink-0 items-center">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              aria-label="উপরে তুলুন"
              disabled={disabled || i === 0}
              onClick={() => onReorder(i, i - 1)}
            >
              <ChevronUp />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              aria-label="নিচে নামান"
              disabled={disabled || i === items.length - 1}
              onClick={() => onReorder(i, i + 1)}
            >
              <ChevronDown />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-red-600 dark:hover:text-red-400"
              aria-label="তালিকা থেকে বাদ দিন"
              disabled={disabled}
              onClick={() => onRemove(item.id)}
            >
              <X />
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}
