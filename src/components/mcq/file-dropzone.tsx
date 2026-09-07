"use client";

// ============================================================
// FileDropzone — শেয়ার্ড আপলোড-সারফেস (ড্র্যাগ-ড্রপ + ক্লিক-টু-ব্রাউজ)
// ============================================================
// ইনপুট-কার্ড, সিরিয়াল-ইনপুট, রিডাউনলোড-ইনপুট আর ওয়ার্ক-বারের "আরও ফাইল" —
// চারটা আপলোড-সারফেস একই কম্পোনেন্ট ব্যবহার করে (ভিজ্যুয়াল হুবহু এক):
//   • variant "lg"/"md" — বড় ড্যাশড বাটন (শাফল/সিরিয়াল/স্টেজ আপলোড)
//   • variant "compact" — ছোট ড্রপ-এরিয়া (রিডাউনলোড)
//   • children render-prop — নিজের ট্রিগার + লুকানো ইনপুট (ওয়ার্ক-বার)
// এক্সটেনশন/সাইজ/কাউন্ট-সীমা: limits.ts-এর কনস্ট্যান্ট; সীমা ছাড়ানো ফাইল
// onFiles-এর rejected আর্গুমেন্টে রিপোর্ট হয় — টোস্ট/ইনলাইন-এরর কলারেই।
// ============================================================

import { useCallback, useImperativeHandle, useRef, useState, type DragEvent, type ReactNode, type Ref } from "react";
import { FileUp, Loader2, type LucideIcon } from "lucide-react";

/** ইম্পেরেটিভ ট্রিগার — নিজের বাটন থেকে ড্রপজোন খুলতে (useImperativeHandle-নিরাপদ) */
export interface DropzoneTrigger {
  open: () => void;
}

export interface DropzoneRejection {
  /** accept-এর বাইরের এক্সটেনশন */
  notAccepted: File[];
  /** maxSizeBytes ছাড়িয়ে যাওয়া (লোডের আগেই বাদ) */
  tooBig: File[];
  /** maxFiles ছাড়িয়ে যাওয়া */
  overMax: File[];
}

export interface FileDropzoneProps {
  /** ব্রাউজ-ইনপুটের accept (ডিফল্ট ".docx") */
  accept?: string;
  /** একাধিক সিলেকশন (ডিফল্ট true) */
  multiple?: boolean;
  /** ইন্টারঅ্যাকশন বন্ধ (ড্র্যাগ/ক্লিক গার্ডও এটা থেকেই) */
  disabled?: boolean;
  /** লোড চলছে — স্পিনার + busyText (compact-এ ডিম + busyText) */
  busy?: boolean;
  busyText?: string;
  promptText?: string;
  hintText?: string;
  /** ড্রপ-এরিয়ার আইকন (ডিফল্ট FileUp) */
  icon?: LucideIcon;
  /** "lg" = p-8/sm:p-10, "md" = p-6/sm:p-8, "compact" = রিডাউনলোডের ছোট ড্রপ */
  variant?: "lg" | "md" | "compact";
  /** compact ভ্যারিয়েন্টের role=button aria-label */
  ariaLabel?: string;
  /** লুকানো ইনপুটের data-testid */
  inputTestId?: string;
  /** প্রতি-ফাইল সাইজ-সীমা (limits.MAX_FILE_BYTES) — ছাড়িয়ে গেলে rejected.tooBig */
  maxSizeBytes?: number;
  /** ফাইল-সংখ্যা-সীমা — প্রথম maxFiles-টা onFiles-এ যায়, বাকিটা rejected.overMax */
  maxFiles?: number;
  /** ফিল্টার-করা ফাইল + রিজেকশন-রিপোর্ট (খালি সিলেকশনেও ডাকা হয়) */
  onFiles: (files: File[], rejected: DropzoneRejection) => void;
  /** ইম্পেরেটিভ ট্রিগার-হ্যান্ডেল — children-ব্যবহারকারী নিজের বাটনের onClick-এ dzTrigger.current?.open() ডাকে */
  triggerRef?: Ref<DropzoneTrigger | null>;
  /** ড্রপ-এরিয়ার ঠিক নিচে সিলেক্ট-হওয়া ফাইল-চিপ/অতিরিক্ত UI */
  chips?: ReactNode;
  /** ড্রপ-এরিয়া ছাড়া ব্যবহার — নিজের ট্রিগার রেন্ডার করে (ওয়ার্ক-বারের বাটন); triggerRef-এর সাথে ব্যবহার করুন */
  children?: ReactNode | (() => ReactNode);
}

/** accept-অ্যাট্রিবিউট → এক্সটেনশন-রেজেক্স (".docx,.txt" → /\.(?:docx|txt)$/i) */
function acceptToRe(accept: string): RegExp {
  const exts = accept
    .split(",")
    .map((s) => s.trim().replace(/^\./, ""))
    .filter(Boolean);
  return new RegExp(`\\.(?:${exts.join("|")})$`, "i");
}

export function FileDropzone({
  accept = ".docx",
  multiple = true,
  disabled = false,
  busy = false,
  busyText,
  promptText,
  hintText,
  icon: Icon = FileUp,
  variant = "lg",
  ariaLabel,
  inputTestId,
  maxSizeBytes,
  maxFiles,
  onFiles,
  triggerRef,
  chips,
  children,
}: FileDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const open = useCallback(() => inputRef.current?.click(), []);
  useImperativeHandle(triggerRef, () => ({ open }), [open]);

  /** সিলেকশন ফিল্টার (এক্সটেনশন → সাইজ → কাউন্ট) + কলারকে রিপোর্ট */
  const emit = (list: FileList | null) => {
    const all = Array.from(list ?? []);
    const re = acceptToRe(accept);
    const accepted = all.filter((f) => re.test(f.name));
    const notAccepted = all.filter((f) => !re.test(f.name));
    const tooBig = maxSizeBytes !== undefined ? accepted.filter((f) => f.size > maxSizeBytes) : [];
    const sizeOk = maxSizeBytes !== undefined ? accepted.filter((f) => f.size <= maxSizeBytes) : accepted;
    const pass = maxFiles !== undefined ? sizeOk.slice(0, maxFiles) : sizeOk;
    const overMax = maxFiles !== undefined ? sizeOk.slice(maxFiles) : [];
    onFiles(pass, { notAccepted, tooBig, overMax });
  };

  const input = (
    <input
      ref={inputRef}
      type="file"
      accept={accept}
      multiple={multiple}
      className="hidden"
      data-testid={inputTestId}
      onChange={(e) => {
        emit(e.target.files);
        e.target.value = "";
      }}
    />
  );

  // children স্লট — নিজের ট্রিগার + লুকানো ইনপুট (ওয়ার্ক-বার; ট্রিগারের জন্য triggerRef)
  if (children) {
    return (
      <>
        {typeof children === "function" ? children() : children}
        {input}
      </>
    );
  }

  const onDragOver = (e: DragEvent) => {
    e.preventDefault();
    if (!disabled) setDragOver(true);
  };
  const onDragLeave = () => setDragOver(false);
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (!disabled) emit(e.dataTransfer?.files ?? null);
  };

  // compact — রিডাউনলোড-ইনপুটের ছোট ড্রপ-এরিয়া (div role=button)
  if (variant === "compact") {
    return (
      <>
        <div
          role="button"
          tabIndex={0}
          aria-label={ariaLabel}
          onClick={() => !disabled && open()}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") open();
          }}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          className={`flex min-h-[110px] cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-5 text-center transition-colors ${
            dragOver
              ? "border-brand-600 bg-brand-50"
              : "border-border hover:border-brand-400 hover:bg-brand-50/50 dark:hover:bg-brand-950/20"
          } ${busy ? "pointer-events-none opacity-60" : ""}`}
        >
          <Icon className="h-7 w-7 text-brand-600" />
          <p className="text-sm font-medium">{busy ? busyText : promptText}</p>
          <p className="text-xs text-muted-foreground">{hintText}</p>
        </div>
        {input}
        {chips}
      </>
    );
  }

  // lg / md — একই গঠন, প্যাডিং আলাদা
  const pad = variant === "lg" ? "p-8 text-center transition disabled:opacity-60 sm:p-10" : "p-6 text-center transition disabled:opacity-60 sm:p-8";
  return (
    <>
      <button
        type="button"
        onClick={open}
        disabled={disabled}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        className={
          "flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed " +
          pad +
          " " +
          (dragOver
            ? "border-brand-500 bg-brand-100 dark:border-brand-500 dark:bg-brand-900/40"
            : "border-brand-300 bg-brand-50/50 hover:border-brand-500 hover:bg-brand-50 dark:border-brand-800 dark:bg-brand-950/20 dark:hover:border-brand-600")
        }
      >
        {busy ? <Loader2 className="h-8 w-8 animate-spin text-brand-600" /> : <Icon className="h-8 w-8 text-brand-600" />}
        <span className="text-sm font-medium">{busy ? busyText : promptText}</span>
        <span className="text-xs text-muted-foreground">{hintText}</span>
      </button>
      {input}
      {chips}
    </>
  );
}
