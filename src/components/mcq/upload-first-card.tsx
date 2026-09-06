"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
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
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

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
      setUploading(true);
      try {
        const text = await textFile.text();
        onTextFileLoaded(text);
      } catch {
        setUploadError("ফাইল পড়া যায়নি");
      } finally {
        setUploading(false);
      }
      return;
    }
    setUploadError("সাপোর্টেড ফাইল: .docx বা .txt");
  };

  const lineCount = rawText ? rawText.split("\n").filter((l) => l.trim()).length : 0;

  return (
    <Card id="step-upload" className="border-emerald-200 dark:border-emerald-900">
      <CardHeader>
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-600 text-sm font-bold text-white">১</span>
          <CardTitle className="text-lg md:text-xl">প্রথমে ফাইল আপলোড করুন</CardTitle>
        </div>
        <CardDescription>
          Word (.docx) আপলোড করলে ফরম্যাট হুবহু থাকবে — ট্যাব, ইকুয়েশন (math), sub/superscript, Bijoy (SutonnyMJ) কিছুই ভাঙবে না।
          আপলোডের পরেই নিচে ৩টা মোড দেখা যাবে — যেটা দিয়ে কাজ করতে চান সেটায় ক্লিক করুন।
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Tabs defaultValue="upload">
          <TabsList className="grid w-full grid-cols-2 max-w-md">
            <TabsTrigger value="upload" className="gap-1.5">
              <FileUp className="h-4 w-4" /> ফাইল আপলোড
            </TabsTrigger>
            <TabsTrigger value="paste" className="gap-1.5">
              <ClipboardPaste className="h-4 w-4" /> টেক্সট পেস্ট
            </TabsTrigger>
          </TabsList>

          <TabsContent value="upload" className="mt-3 space-y-3">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={busy || uploading}
              onDragOver={(e) => {
                e.preventDefault();
                if (!busy && !uploading) setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                if (!busy && !uploading) handleFiles(Array.from(e.dataTransfer?.files ?? []));
              }}
              className={
                "flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-8 text-center transition disabled:opacity-60 sm:p-10 " +
                (dragOver
                  ? "border-emerald-500 bg-emerald-100 dark:border-emerald-500 dark:bg-emerald-900/40"
                  : "border-emerald-300 bg-emerald-50/50 hover:border-emerald-500 hover:bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/20 dark:hover:border-emerald-600")
              }
            >
              {busy || uploading ? (
                <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
              ) : (
                <FileUp className="h-8 w-8 text-emerald-600" />
              )}
              <span className="text-sm font-medium">
                {busy || uploading ? "ফাইল পড়া হচ্ছে..." : "ফাইল সিলেক্ট করতে ক্লিক করুন বা টেনে ছাড়ুন"}
              </span>
              <span className="text-xs text-muted-foreground">
                সাপোর্টেড: .docx (ফরম্যাট হুবহু থাকবে), .txt — একসাথে একাধিক .docx সিলেক্ট করা যাবে
              </span>
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".docx,.txt,.csv"
              multiple
              className="hidden"
              onChange={(e) => {
                handleFiles(Array.from(e.target.files ?? []));
                e.target.value = "";
              }}
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
              placeholder={`এখানে প্রশ্নগুলো পেস্ট করুন...

যেমন:
১. বাংলাদেশের রাজধানী কোনটি?
ক) চট্টগ্রাম  খ) ঢাকা  গ) খুলনা  ঘ) রাজশাহী

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
            className="gap-2 bg-emerald-600 hover:bg-emerald-700"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            {busy ? "ডিটেক্ট হচ্ছে..." : "🔍 প্রশ্ন ডিটেক্ট করুন (পেস্ট মোড)"}
          </Button>
          {rawText.trim() && (
            <Badge variant="secondary" className="gap-1">
              {lineCount} লাইন
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
    <Card className="border-emerald-300 bg-emerald-50/60 dark:border-emerald-800 dark:bg-emerald-950/20">
      <CardHeader className="pb-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400">
            <FolderOpen className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <CardTitle className="text-base md:text-lg">
              📁 {files.length} টি ফাইল প্রস্তুত — এখন মোড বেছে নিন
            </CardTitle>
            <CardDescription>
              নিচের যেকোনো মোডে ক্লিক করলে এই ফাইলগুলো সরাসরি ওই মোডে খুলে যাবে — আবার আপলোড লাগবে না।
            </CardDescription>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="ফাইল বাতিল"
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
              <FileText className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
              <span className="truncate">{f.name}</span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
