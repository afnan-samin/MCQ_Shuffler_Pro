"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { FileDropzone } from "@/components/mcq/file-dropzone";
import { FileText, FileUp, Loader2, Search, ClipboardPaste, FolderOpen, X } from "lucide-react";

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
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-600 text-sm font-bold text-white">1</span>
          <CardTitle className="text-lg md:text-xl">Upload a file first</CardTitle>
        </div>
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

interface StagedFilesCardProps {
  files: File[];
  onClear: () => void;
}

/**
 * স্টেজ হওয়া ফাইলের তালিকা — আপলোড হয়েছে, কিন্তু কোনো মোডে খোলা হয়নি।
 * নিচের মোড-বাটনে ক্লিক করলেই এই ফাইলগুলো ওই মোডে চলে যাবে।
 */
export function StagedFilesCard({ files, onClear }: StagedFilesCardProps) {
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
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Clear files"
            className="h-8 w-8 shrink-0 text-muted-foreground hover:text-red-600"
            onClick={onClear}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <ul className="flex flex-wrap gap-2">
          {files.map((f, i) => (
            <li
              key={`${f.name}-${i}`}
              className="flex max-w-full items-center gap-1.5 rounded-lg border bg-white px-2.5 py-1.5 text-xs dark:bg-background"
            >
              <FileText className="h-3.5 w-3.5 shrink-0 text-brand-600" />
              <span className="truncate">{f.name}</span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
