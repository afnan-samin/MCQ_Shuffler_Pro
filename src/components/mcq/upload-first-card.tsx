"use client";

import { useState, type Ref } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { FileDropzone, type DropzoneRejection, type DropzoneTrigger } from "@/components/mcq/file-dropzone";
import { FileText, FileUp, Loader2, Search, ClipboardPaste, FolderOpen, FolderPlus, X, TriangleAlert } from "lucide-react";

interface UploadFirstCardProps {
  /** একাধিক .docx — স্টেজে উঠবে, তারপর ইউজার মোড বেছে নিবে */
  onFiles: (files: File[]) => void;
  /** .txt — ব্রাউজারেই পড়ে টেক্সট-ফ্লোতে (শাফল) যাবে */
  onTextFileLoaded: (t: string) => void;
  rawText: string;
  onTextChange: (t: string) => void;
  onDetect: () => void;
  busy: boolean;
}

/** .txt/.csv ইনপুটের সাইজ-সীমা — বড় টেক্সট ফাইল ব্রাউজার ফ্রিজ করে (১০০MB) */
const TEXT_MAX_BYTES = 100 * 1024 * 1024; // 100MB

/**
 * ধাপ ১ — সবার আগে ফাইল আপলোড (মোড-বাটন তখনো দেখায় না)।
 * আপলোড হলে পেজে ৩টা মোড-বাটন দেখা যাবে — ইউজার যেকোনো একটায় ক্লিক করে কাজ শুরু করবে।
 */
export function UploadFirstCard({
  onFiles,
  onTextFileLoaded,
  rawText,
  onTextChange,
  onDetect,
  busy,
}: UploadFirstCardProps) {
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const busyTotal = busy || uploading;

  const handleFiles = async (list: File[]) => {
    setUploadError(null);
    if (!list.length) return;
    const docxFiles = list.filter((f) => /\.docx$/i.test(f.name));
    const textFile = list.find((f) => /\.(txt|csv)$/i.test(f.name));
    if (docxFiles.length) {
      setUploading(true);
      try {
        onFiles(docxFiles);
      } finally {
        setUploading(false);
      }
      return;
    }
    if (textFile) {
      if (textFile.size > TEXT_MAX_BYTES) {
        setUploadError(`Text file too large (${TEXT_MAX_BYTES / 1048576}MB max)`);
        return;
      }
      setUploading(true);
      try {
        const text = await textFile.text();
        onTextFileLoaded(text);
      } catch {
        setUploadError("Could not read the file");
      } finally {
        setUploading(false);
      }
    }
  };

  const onDropzoneFiles = (list: File[], rej: { notAccepted: File[] }) => {
    setUploadError(null);
    if (!list.length) {
      // কোনো বৈধ ফাইলই না হলে (docx/txt কোনোটাই না) — আজকের মতোই এরর
      if (rej.notAccepted.length) setUploadError("Supported files: .docx or .txt");
      return;
    }
    void handleFiles(list);
  };

  const lineCount = rawText ? rawText.split("\n").filter((l) => l.trim()).length : 0;

  return (
    <Card id="step-upload" className="border-brand-200 dark:border-brand-900">
      <CardHeader>
        <CardTitle className="text-lg md:text-xl">Upload a file first</CardTitle>
        <CardDescription>
          Word (.docx) uploads keep the formatting exactly — tabs, equations, Bijoy fonts intact.
          After upload, click a mode below to work with the file.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Tabs defaultValue="upload">
          <TabsList className="grid w-full grid-cols-2 max-w-md">
            <TabsTrigger value="upload" className="gap-1.5">
              <FileUp className="h-4 w-4" /> Upload file
            </TabsTrigger>
            <TabsTrigger value="paste" className="gap-1.5">
              <ClipboardPaste className="h-4 w-4" /> Paste text
            </TabsTrigger>
          </TabsList>

          <TabsContent value="upload" className="mt-3 space-y-3">
            <FileDropzone
              accept=".docx,.txt,.csv"
              multiple
              busy={busyTotal}
              disabled={busyTotal}
              busyText="Reading file..."
              promptText="Click to select a file or drag & drop"
              hintText="Supported: .docx (format kept exactly), .txt — select multiple .docx files at once"
              variant="lg"
              onFiles={onDropzoneFiles}
            />
            {uploadError && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-400">
                {uploadError}
              </div>
            )}
          </TabsContent>

          <TabsContent value="paste" className="mt-3 space-y-3">
            <Textarea
              value={rawText}
              onChange={(e) => onTextChange(e.target.value)}
              placeholder={`Paste your questions here...

Example:
1. What is the capital of Bangladesh?
a) Chattogram  b) Dhaka  c) Khulna  d) Rajshahi

1. What is the capital of Japan?
a) Beijing  b) Tokyo  c) Seoul  d) Bangkok`}
              className="min-h-[200px] font-mono text-sm leading-relaxed"
            />
          </TabsContent>
        </Tabs>

        <div className="flex flex-wrap items-center gap-3">
          <Button
            onClick={onDetect}
            disabled={busy || !rawText.trim()}
            size="lg"
            className="gap-2 bg-brand-600 hover:bg-brand-700"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            {busy ? "Detecting..." : "Detect questions (paste mode)"}
          </Button>
          {rawText.trim() && (
            <Badge variant="secondary" className="gap-1">
              {lineCount} lines
            </Badge>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

/** স্টেজড প্রতি-ফাইলের ডিটেকশন-সারসংক্ষেপ — প্রশ্ন/৬-অংশের টেবিলে দেখায়।
 *  স্ট্যাটাস: parsing চলছে / ready (সংখ্যাসহ) / error (ফাইল পড়া যায়নি)।
 *  NOTE: মোড-লোডাররা পরে নিজেদের পার্স চালায় — এটা শুধু প্রিভিউ-সংখ্যা। */
export interface StagedFileStats {
  questions: number;
  serial: number;
  question: number;
  reference: number;
  options: number;
  optionsTotal: number;
  /** পূর্ণ ৪-অপশনের সত্যিকারের MCQ (questions ≠ MCQ — ০-অপশন ফাইলে প্রশ্ন থাকেও MCQ নেই) */
  mcq: number;
  answer: number;
  bekkha: number;
}

/** validation-পাস করা ফাইল + তার ডিটেকশন-অবস্থা */
export interface StagedFile {
  file: File;
  /** অপেক্ষা/চলছে — সংখ্যা এখনো আসেনি; ready হলে stats আছে; error হলে message */
  status: "parsing" | "ready" | "error";
  stats?: StagedFileStats | null;
  error?: string | null;
}

interface StagedFilesCardProps {
  files: StagedFile[];
  onClear: () => void;
  /** প্রতি-সারির ক্রস — ওই একটা ফাইল কেটে ফেলে (কনফার্ম পপআপসহ) */
  onRemoveFile?: (index: number) => void;
  /** আরও ফাইল যোগ করার জন্য — ঐচ্ছিক */
  addFilesTriggerRef?: Ref<DropzoneTrigger | null>;
  onAddFiles?: (files: File[], rejections: DropzoneRejection) => void;
  addFilesDisabled?: boolean;
  maxSizeBytes?: number;
}

/**
 * স্টেজ হওয়া ফাইলের তালিকা — আপলোড হয়েছে, কিন্তু কোনো মোডে খোলা হয়নি।
 * নিচের মোড-বাটনে ক্লিক করলেই এই ফাইলগুলো ওই মোডে চলে যাবে।
 */
export function StagedFilesCard({ files, onClear, onRemoveFile, addFilesTriggerRef, onAddFiles, addFilesDisabled, maxSizeBytes }: StagedFilesCardProps) {
  const openAddFiles = () => {
    if (addFilesTriggerRef && typeof addFilesTriggerRef === "object" && "current" in addFilesTriggerRef) {
      addFilesTriggerRef.current?.open();
    }
  };
  return (
    <Card className="border-brand-300 bg-brand-50/60 dark:border-brand-800 dark:bg-brand-950/20">
      <CardHeader className="pb-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-100 text-brand-700 dark:bg-brand-950/50 dark:text-brand-400">
            <FolderOpen className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <CardTitle className="text-base md:text-lg">
              {files.length} files ready — pick a mode now
            </CardTitle>
            <CardDescription>
              Click any mode below and these files open straight into it — no re-upload needed.
            </CardDescription>
          </div>
          {onAddFiles && addFilesTriggerRef && (
            <FileDropzone
              accept=".docx"
              multiple
              maxSizeBytes={maxSizeBytes}
              triggerRef={addFilesTriggerRef}
              onFiles={onAddFiles}
            >
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={openAddFiles}
                disabled={addFilesDisabled}
              >
                <FolderPlus className="h-4 w-4" />
                Add files
              </Button>
            </FileDropzone>
          )}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Clear files"
            className="h-9 w-9 shrink-0 text-muted-foreground hover:text-red-600"
            onClick={onClear}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* ফাইল-প্রতি এক-লাইন + ৬-অংশের ডিটেকশন-টেবিল — মোডে ঢোকার আগেই সংখ্যা দেখা যায় */}
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full min-w-[640px] border-collapse text-xs">
            <thead>
              <tr className="bg-muted/60 text-left text-muted-foreground">
                <th className="px-2.5 py-2 font-semibold">File</th>
                <th className="px-2 py-2 text-center font-semibold">Total MCQ</th>
                <th className="px-2 py-2 text-center font-semibold">Question</th>
                <th className="px-2 py-2 text-center font-semibold">Reference</th>
                <th className="px-2 py-2 text-center font-semibold">Options</th>
                <th className="px-2 py-2 text-center font-semibold">Answer</th>
                <th className="px-2 py-2 text-center font-semibold">Expl.</th>
                <th className="px-1 py-2 font-semibold">
                  <span className="sr-only">Remove</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {files.map((s, i) => {
                const st = s.stats;
                return (
                  <tr key={`${s.file.name}-${i}`} className="border-t">
                    <td className="max-w-[220px] px-2.5 py-2">
                      <span className="flex min-w-0 items-center gap-1.5">
                        <FileText className="h-3.5 w-3.5 shrink-0 text-brand-600" />
                        <span className="truncate font-medium">{s.file.name}</span>
                      </span>
                    </td>
                    {s.status === "parsing" || !st ? (
                      <td colSpan={6} className="px-2 py-2 text-center text-muted-foreground">
                        {s.status === "error" ? (
                          <span className="inline-flex items-center gap-1 text-red-600 dark:text-red-400">
                            <TriangleAlert className="h-3.5 w-3.5" />
                            {s.error ?? "Could not read the file"}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5">
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            Detecting…
                          </span>
                        )}
                      </td>
                    ) : (
                      <>
                        <td
                          className="px-2 py-2 text-center font-bold"
                          title={
                            st.mcq > 0
                              ? `${st.questions} question block(s) detected — ${st.mcq} of them have a full 4 options`
                              : `No complete MCQ (question + 4 options) found. ${st.questions} question block(s) detected, but none has 4 options — the file may be an answer sheet or option-less handout.`
                          }
                        >
                          <span className={st.mcq > 0 ? "text-brand-700 dark:text-brand-300" : "text-red-600 dark:text-red-400"}>
                            {st.mcq}
                          </span>
                          {st.questions !== st.mcq ? (
                            <span className="font-normal text-muted-foreground"> ({st.questions})</span>
                          ) : null}
                        </td>
                        <td className="px-2 py-2 text-center">{st.question}</td>
                        <td className="px-2 py-2 text-center">{st.reference}</td>
                        <td className="px-2 py-2 text-center" title={st.optionsTotal ? `${st.optionsTotal} option(s) in total` : undefined}>
                          {st.options}
                          {st.optionsTotal ? <span className="text-muted-foreground"> ({st.optionsTotal})</span> : null}
                        </td>
                        <td className="px-2 py-2 text-center">{st.answer}</td>
                        <td className="px-2 py-2 text-center">{st.bekkha}</td>
                      </>
                    )}
                    {/* প্রতি-সারির ক্রস — শুধু এই ফাইলটা কেটে ফেলে (ভুলে চাপলে ফেরানোর উপায় নেই, তাই কনফার্ম) */}
                    {onRemoveFile && (
                      <td className="px-1 py-1.5 text-center">
                        <button
                          type="button"
                          aria-label={`Remove ${s.file.name}`}
                          title="Remove this file"
                          className="inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40"
                          onClick={() => {
                            if (window.confirm(`Remove this file?\n\n${s.file.name}\n\nIt will be dropped from the list — you can upload it again any time.`)) {
                              onRemoveFile(i);
                            }
                          }}
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="text-[11px] text-muted-foreground">
          Same counting as inside every mode — <b>Total MCQ</b> = question blocks with a full set of 4
          options (brackets = raw question blocks detected, so an option-less file shows 0 MCQ);
          Question / Reference / Options / Answer / Expl. = in how many of those blocks the part was
          found (Options also shows the total option count in brackets).
        </p>
      </CardContent>
    </Card>
  );
}
