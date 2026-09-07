"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { MultiFileList, type MultiFileItem } from "@/components/mcq/multi-file-list";
import { FileDropzone } from "@/components/mcq/file-dropzone";
import { FileOutput, Upload } from "lucide-react";
import { MAX_FILE_BYTES } from "@/lib/mcq/limits";
import { FILE_TOO_BIG_MSG } from "@/lib/mcq/file-pipeline";
import { toast } from "@/hooks/use-toast";

export interface RedownloadInputCardProps {
  onFiles: (files: File[], append: boolean) => void;
  loading: boolean;
  items: MultiFileItem[];
  onReorder: (from: number, to: number) => void;
  onRemove: (id: string) => void;
}

/** রিডাউনলোড মোডের ইনপুট — একাধিক .docx আপলোড + ক্রম-লিস্ট */
export function RedownloadInputCard({ onFiles, loading, items, onReorder, onRemove }: RedownloadInputCardProps) {
  const pick = (files: File[], rej: { tooBig: File[]; notAccepted: File[] }) => {
    // সাইজ-সীমা ছাড়ানো ফাইল লোডারে না গিয়েই টোস্ট — লোডারের গার্ডের হুবহু মেসেজ
    for (const f of rej.tooBig) toast({ title: FILE_TOO_BIG_MSG, variant: "destructive" });
    // এক্সটেনশন-ফিল্টারে বাদ পড়া ফাইলের ফিডব্যাক — আগে নীরবে বাদ যেত
    if (rej.notAccepted.length) {
      toast({ title: `${rej.notAccepted.length} file(s) skipped — only .docx is supported`, variant: "destructive" });
    }
    if (!files.length) return;
    onFiles(files, items.length > 0);
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-100 text-brand-700 dark:bg-brand-950/50 dark:text-brand-400">
            <FileOutput className="h-5 w-5" />
          </span>
          <div>
            <CardTitle className="text-base md:text-lg">1. Upload files — MCQ Redownload</CardTitle>
            <CardDescription>
              Add the .docx file(s) you want to pick parts from — multiple at once is fine.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <FileDropzone
          variant="compact"
          accept=".docx"
          multiple
          busy={loading}
          disabled={loading}
          busyText="Reading..."
          promptText="Click to select a file or drag & drop"
          hintText="Supported: .docx — questions, options, answers and explanations are auto-detected"
          ariaLabel="Click to select docx files or drag & drop"
          icon={Upload}
          maxSizeBytes={MAX_FILE_BYTES}
          onFiles={pick}
        />

        <MultiFileList items={items} onReorder={onReorder} onRemove={onRemove} disabled={loading} />
      </CardContent>
    </Card>
  );
}
