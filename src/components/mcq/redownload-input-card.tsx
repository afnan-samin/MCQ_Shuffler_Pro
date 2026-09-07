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
  const pick = (files: File[], rej: { tooBig: File[] }) => {
    // সাইজ-সীমা ছাড়ানো ফাইল লোডারে না গিয়েই টোস্ট — লোডারের গার্ডের হুবহু মেসেজ
    for (const f of rej.tooBig) toast({ title: FILE_TOO_BIG_MSG, variant: "destructive" });
    if (!files.length) return;
    onFiles(files, items.length > 0);
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
        <FileDropzone
          variant="compact"
          accept=".docx"
          multiple
          busy={loading}
          disabled={loading}
          busyText="পড়া হচ্ছে..."
          promptText="ফাইল সিলেক্ট করতে ক্লিক করুন বা টেনে ছাড়ুন"
          hintText="সাপোর্টেড: .docx — প্রশ্ন, অপশন, উত্তর, ব্যাখ্যা অংশ অটো ডিটেক্ট হবে"
          ariaLabel="docx ফাইল সিলেক্ট করতে ক্লিক করুন বা টেনে ছাড়ুন"
          icon={Upload}
          maxSizeBytes={MAX_FILE_BYTES}
          onFiles={pick}
        />

        <MultiFileList items={items} onReorder={onReorder} onRemove={onRemove} disabled={loading} />
      </CardContent>
    </Card>
  );
}
