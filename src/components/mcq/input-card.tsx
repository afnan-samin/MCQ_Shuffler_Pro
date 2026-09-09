"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { FileDropzone, type DropzoneRejection } from "@/components/mcq/file-dropzone";
import { FileText, FileUp, Loader2, Search, ClipboardPaste } from "lucide-react";

interface InputCardProps {
  rawText: string;
  onTextChange: (t: string) => void;
  onDetect: () => void;
  /** .docx আপলোড — XML হুবহু প্রিজার্ভ পাইপলাইনে যাবে */
  onDocxFile: (f: File) => void;
  /** একাধিক .docx — মাল্টি-ফাইল পাইপলাইনে যাবে; দিলে input-এ multiple চালু হয় */
  onDocxFiles?: (files: File[]) => void;
  /** .txt — ব্রাউজারেই পড়া, অটো-ডিটেক্টসহ */
  onTextFileLoaded?: (t: string) => void;
  detecting: boolean;
  detected: boolean;
  /** .docx প্রসেস হচ্ছে */
  docxLoading: boolean;
}

export function InputCard({
  rawText,
  onTextChange,
  onDetect,
  onDocxFile,
  onDocxFiles,
  onTextFileLoaded,
  detecting,
  detected,
  docxLoading,
}: InputCardProps) {
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadName, setUploadName] = useState<string | null>(null);

  const busy = uploading || docxLoading;

  /** একাধিক ফাইল — .docx গুলো মাল্টি/সিঙ্গেল পাইপলাইনে, .txt/.csv ব্রাউজারেই পড়ে */
  const handleFiles = async (list: File[]) => {
    setUploadError(null);
    if (!list.length) return;
    const docxFiles = list.filter((f) => /\.docx$/i.test(f.name));
    const textFile = list.find((f) => /\.(txt|csv)$/i.test(f.name));
    if (docxFiles.length) {
      setUploading(true);
      try {
        if (onDocxFiles) onDocxFiles(docxFiles);
        else onDocxFile(docxFiles[0]);
      } finally {
        setUploading(false);
      }
      return;
    }
    if (textFile) {
      setUploading(true);
      setUploadName(textFile.name);
      try {
        // ব্রাউজারেই পড়া — কোনো সার্ভার লাগে না
        const text = await textFile.text();
        if (onTextFileLoaded) onTextFileLoaded(text);
        else onTextChange(text);
      } catch {
        setUploadError("Could not read the file");
      } finally {
        setUploading(false);
      }
    }
  };

  /** কোনো বৈধ ফাইলই না হলে (docx/txt কোনোটাই না) — আজকের মতোই এরর */
  const handleRejected = ({ notAccepted }: DropzoneRejection) => {
    if (notAccepted.length) setUploadError("Supported files: .docx or .txt");
  };

  const onDropzoneFiles = (list: File[], rej: DropzoneRejection) => {
    setUploadError(null);
    if (!list.length) {
      handleRejected(rej);
      return;
    }
    void handleFiles(list);
  };

  const lineCount = rawText ? rawText.split("\n").filter((l) => l.trim()).length : 0;

  return (
    <Card id="step-input">
      <CardHeader>
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-600 text-sm font-bold text-white">1</span>
          <CardTitle className="text-lg md:text-xl">Add questions — upload a file or paste</CardTitle>
        </div>
        <CardDescription>
          Upload a Word (.docx) file and its formatting stays identical — tabs, equations (math), sub/superscript, Bijoy (SutonnyMJ) font, nothing breaks. Paste mode also handles Bengali (Bijoy/Unicode) and English.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
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
              accept=".docx,.txt,.csv"
              multiple={!!onDocxFiles}
              busy={busy}
              disabled={busy}
              busyText="Reading file..."
              promptText="Click to select a file or drag & drop"
              hintText="Supported: .docx (format kept exactly), .txt — select multiple .docx files at once. The detector runs automatically after upload."
              variant="lg"
              onFiles={onDropzoneFiles}
              chips={
                /* .docx হলে মূল পেজে ফাইল-লিস্ট দেখায় — এখানে শুধু .txt-এর নাম */
                uploadName && !uploadError ? (
                  <div className="flex items-center gap-2 text-sm text-brand-700 dark:text-brand-400">
                    <FileText className="h-4 w-4" /> {uploadName} loaded
                  </div>
                ) : null
              }
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
              className="min-h-[220px] font-mono text-sm leading-relaxed"
            />
          </TabsContent>
        </Tabs>

        <div className="flex flex-wrap items-center gap-3">
          <Button
            onClick={onDetect}
            disabled={detecting || !rawText.trim()}
            size="lg"
            className="gap-2 bg-brand-600 hover:bg-brand-700"
          >
            {detecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            {detecting ? "Detecting..." : "Detect questions"}
          </Button>
          {rawText.trim() && (
            <Badge variant="secondary" className="gap-1">
              {lineCount} lines
            </Badge>
          )}
          {detected && <Badge className="bg-brand-100 text-brand-800 hover:bg-brand-100">Detected ✓</Badge>}
        </div>
      </CardContent>
    </Card>
  );
}
