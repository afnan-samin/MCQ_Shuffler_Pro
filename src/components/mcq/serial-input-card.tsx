"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { ClipboardPaste, FileUp, ListOrdered, Loader2, Plus, Search } from "lucide-react";
import { FileDropzone, type DropzoneRejection, type DropzoneTrigger } from "@/components/mcq/file-dropzone";
import { MultiFileList, type MultiFileItem } from "@/components/mcq/multi-file-list";
import { MAX_FILE_BYTES } from "@/lib/mcq/limits";
import { FILE_TOO_BIG_MSG } from "@/lib/mcq/file-pipeline";
import { toast } from "@/hooks/use-toast";

interface SerialInputCardProps {
  /** নতুন ফাইল-বাছাই — আগের লিস্ট বদলে নতুন লিস্ট বসে */
  onFiles: (files: File[]) => void;
  /** "আরও ফাইল যোগ করুন" বাটনে — আগের লিস্টের শেষে যোগ হয় */
  onAddFiles?: (files: File[]) => void;
  loading: boolean;
  /** লোড হওয়া ফাইলগুলোর লিস্ট (MultiFileList-এ টেনে সাজানো যায়) */
  items: MultiFileItem[];
  onReorder: (from: number, to: number) => void;
  onRemove: (id: string) => void;
  /** পেস্ট-ট্যাবের টেক্সট — পেজের স্টেট (অটো-ফিক্সে পেজ নিজেই আপডেট করে) */
  pasteText: string;
  onPasteTextChange: (t: string) => void;
  /** "🔍 প্রশ্ন ডিটেক্ট করুন" — পেজে parseMcq চালিয়ে রেজাল্ট-কার্ডে যায় */
  onPasteDetect: () => void;
  pasteBusy: boolean;
}

/** সিরিয়াল মোডের ইনপুট কার্ড — ফাইল আপলোড বা পেস্ট; একাধিক .docx লিস্ট-ক্রমসহ */
export function SerialInputCard({
  onFiles,
  onAddFiles,
  loading,
  items,
  onReorder,
  onRemove,
  pasteText,
  onPasteTextChange,
  onPasteDetect,
  pasteBusy,
}: SerialInputCardProps) {
  const [error, setError] = useState<string | null>(null);
  const dzTrigger = useRef<DropzoneTrigger | null>(null);

  /** .docx-ফিল্টার-করা ফাইল + রিজেকশন — সঠিক হ্যান্ডলারে পাঠায়; ভুল এক্সটেনশন/সাইজে এরর/টোস্ট */
  const acceptFiles = (files: File[], rej: DropzoneRejection, add: boolean) => {
    setError(null);
    if (!files.length && !rej.notAccepted.length && !rej.tooBig.length) return;
    for (const f of rej.tooBig) toast({ title: FILE_TOO_BIG_MSG, variant: "destructive" });
    if (!files.length) {
      if (rej.notAccepted.length) setError("Serial mode accepts .docx files only (needed for color detection + XML preservation).");
      return;
    }
    if (rej.notAccepted.length) setError(`${rej.notAccepted.length} file(s) are not .docx — skipped.`);
    if (add && onAddFiles) onAddFiles(files);
    else onFiles(files);
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <ListOrdered className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <CardTitle className="text-base md:text-lg">MCQ Serial — upload files</CardTitle>
            <CardDescription className="truncate">
              Colored headers (Word: Home → Paragraph → Shading) are auto-detected — pick a color and every section gets numbered from 1
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* ইনার ট্যাব — ফাইল আপলোড / পেস্ট করুন (শাফল-মোডের ইনপুট-কার্ডের হুবহু প্যাটার্ন) */}
        <Tabs defaultValue="upload">
          <TabsList className="grid w-full grid-cols-2 max-w-md">
            <TabsTrigger value="upload" className="gap-1.5">
              <FileUp className="h-4 w-4" /> Upload file
            </TabsTrigger>
            <TabsTrigger value="paste" className="gap-1.5">
              <ClipboardPaste className="h-4 w-4" /> Paste
            </TabsTrigger>
          </TabsList>

          <TabsContent value="upload" className="mt-3 space-y-3">
            <FileDropzone
              accept=".docx"
              multiple
              busy={loading}
              disabled={loading}
              busyText="Reading files and analyzing colors..."
              promptText="Click to select .docx files or drag & drop"
              hintText="Select multiple .docx files at once — then merge them into one file (with page breaks) or download them separately in a ZIP."
              variant="md"
              inputTestId="serial-file-input"
              maxSizeBytes={MAX_FILE_BYTES}
              onFiles={(files, rej) => acceptFiles(files, rej, false)}
            />
          </TabsContent>

          <TabsContent value="paste" className="mt-3 space-y-3">
            <Textarea
              value={pasteText}
              onChange={(e) => onPasteTextChange(e.target.value)}
              placeholder={`Paste your questions here...

Example:
1. What is the capital of Bangladesh?
a) Chattogram  b) Dhaka  c) Khulna  d) Rajshahi

1. What is the capital of Japan?
a) Beijing  b) Tokyo  c) Seoul  d) Bangkok`}
              className="min-h-[220px] font-mono text-sm leading-relaxed"
            />
            <div className="flex flex-wrap items-center gap-3">
              <Button
                type="button"
                onClick={onPasteDetect}
                disabled={pasteBusy || !pasteText.trim()}
                className="gap-2 bg-brand-600 hover:bg-brand-700"
              >
                {pasteBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                {pasteBusy ? "Detecting..." : "🔍 Detect questions"}
              </Button>
              <span className="text-xs text-muted-foreground">
                Paste = text pipeline — detecting clears the uploaded file list (the two can't coexist).
              </span>
            </div>
          </TabsContent>
        </Tabs>

        {/* লোড হওয়া ফাইলের ক্রম-লিস্ট — টেনে উপরে/নিচে সাজানো যায় */}
        {items.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              Drag or use the arrow buttons to reorder — merge/ZIP keeps exactly this order.
            </p>
            <MultiFileList items={items} onReorder={onReorder} onRemove={onRemove} disabled={loading} />
            {/* “আরও ফাইল যোগ করুন” — শেয়ার্ড ড্রপজোনের লুকানো ইনপুট এই বাটন দিয়ে খোলে (ট্যাবের বাইরে — যে ট্যাবেই থাকুক কাজ করে) */}
            {onAddFiles && (
              <FileDropzone
                accept=".docx"
                multiple
                maxSizeBytes={MAX_FILE_BYTES}
                triggerRef={dzTrigger}
                onFiles={(files, rej) => acceptFiles(files, rej, true)}
              >
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => dzTrigger.current?.open()}
                  disabled={loading}
                >
                  <Plus className="h-4 w-4" /> Add more files
                </Button>
              </FileDropzone>
            )}
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-400">
            {error}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
