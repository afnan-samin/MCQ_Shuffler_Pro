"use client";

import { useRef, useState, type DragEvent } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { MultiFileList, type MultiFileItem } from "@/components/mcq/multi-file-list";
import { FileOutput, Upload } from "lucide-react";

export interface RedownloadInputCardProps {
  onFiles: (files: File[], append: boolean) => void;
  loading: boolean;
  items: MultiFileItem[];
  onReorder: (from: number, to: number) => void;
  onRemove: (id: string) => void;
}

/** রিডাউনলোড মোডের ইনপুট — একাধিক .docx আপলোড + ক্রম-লিস্ট */
export function RedownloadInputCard({ onFiles, loading, items, onReorder, onRemove }: RedownloadInputCardProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const pick = (fl: FileList | null) => {
    if (!fl?.length) return;
    const files = Array.from(fl).filter((f) => /\.docx$/i.test(f.name));
    if (!files.length) return;
    onFiles(files, items.length > 0);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    if (!loading) pick(e.dataTransfer.files);
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400">
            <FileOutput className="h-5 w-5" />
          </span>
          <div>
            <CardTitle className="text-base md:text-lg">১. ফাইল আপলোড — MCQ রিডাউনলোড</CardTitle>
            <CardDescription>
              যে .docx থেকে অংশ বাছাই করে নতুন ফাইল নামাবেন সেটা/সেগুলো দিন — একসাথে একাধিক নেওয়া যায়।
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div
          role="button"
          tabIndex={0}
          aria-label="docx ফাইল সিলেক্ট করতে ক্লিক করুন বা টেনে ছাড়ুন"
          onClick={() => !loading && inputRef.current?.click()}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
          }}
          onDragOver={(e) => {
            e.preventDefault();
            if (!loading) setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          className={`flex min-h-[110px] cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-5 text-center transition-colors ${
            dragOver ? "border-emerald-600 bg-emerald-50" : "border-border hover:border-emerald-400 hover:bg-emerald-50/50 dark:hover:bg-emerald-950/20"
          } ${loading ? "pointer-events-none opacity-60" : ""}`}
        >
          <Upload className="h-7 w-7 text-emerald-600" />
          <p className="text-sm font-medium">
            {loading ? "পড়া হচ্ছে..." : "ফাইল সিলেক্ট করতে ক্লিক করুন বা টেনে ছাড়ুন"}
          </p>
          <p className="text-xs text-muted-foreground">
            সাপোর্টেড: .docx — প্রশ্ন, অপশন, উত্তর, ব্যাখ্যা অংশ অটো ডিটেক্ট হবে
          </p>
          <input
            ref={inputRef}
            type="file"
            accept=".docx"
            multiple
            className="hidden"
            onChange={(e) => {
              pick(e.target.files);
              e.target.value = "";
            }}
          />
        </div>

        <MultiFileList items={items} onReorder={onReorder} onRemove={onRemove} disabled={loading} />
      </CardContent>
    </Card>
  );
}
