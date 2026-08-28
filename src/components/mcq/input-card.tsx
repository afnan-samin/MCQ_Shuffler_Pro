"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { FileText, FileUp, Loader2, Search, Sparkles, ClipboardPaste } from "lucide-react";

interface InputCardProps {
  rawText: string;
  onTextChange: (t: string) => void;
  onDetect: () => void;
  onSample: () => void;
  detecting: boolean;
  detected: boolean;
}

export function InputCard({ rawText, onTextChange, onDetect, onSample, detecting, detected }: InputCardProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadName, setUploadName] = useState<string | null>(null);

  const handleFile = async (f: File) => {
    setUploadError(null);
    setUploading(true);
    setUploadName(f.name);
    try {
      const fd = new FormData();
      fd.append("file", f);
      const res = await fetch("/api/extract", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) {
        setUploadError(data.error || "ফাইল পড়া যায়নি");
      } else {
        onTextChange(data.text);
      }
    } catch {
      setUploadError("ফাইল আপলোডে সমস্যা হয়েছে");
    } finally {
      setUploading(false);
    }
  };

  const lineCount = rawText ? rawText.split("\n").filter((l) => l.trim()).length : 0;

  return (
    <Card id="step-input">
      <CardHeader>
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-600 text-sm font-bold text-white">১</span>
          <CardTitle className="text-lg md:text-xl">প্রশ্ন দিন — পেস্ট বা ফাইল আপলোড</CardTitle>
        </div>
        <CardDescription>
          MCQ প্রশ্নগুলো কপি-পেস্ট করুন অথবা Word (.docx) / .txt ফাইল আপলোড করুন। বাংলা (Bijoy/Unicode) ও English — দুটোই চলবে।
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Tabs defaultValue="paste">
          <TabsList className="grid w-full grid-cols-2 max-w-md">
            <TabsTrigger value="paste" className="gap-1.5">
              <ClipboardPaste className="h-4 w-4" /> পেস্ট করুন
            </TabsTrigger>
            <TabsTrigger value="upload" className="gap-1.5">
              <FileUp className="h-4 w-4" /> ফাইল আপলোড
            </TabsTrigger>
          </TabsList>

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
              className="min-h-[240px] font-mono text-sm leading-relaxed"
            />
          </TabsContent>

          <TabsContent value="upload" className="mt-3 space-y-3">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-emerald-300 bg-emerald-50/50 p-10 text-center transition hover:border-emerald-500 hover:bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/20 dark:hover:border-emerald-600"
            >
              {uploading ? (
                <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
              ) : (
                <FileUp className="h-8 w-8 text-emerald-600" />
              )}
              <span className="text-sm font-medium">
                {uploading ? "ফাইল পড়া হচ্ছে..." : "ফাইল সিলেক্ট করতে ক্লিক করুন"}
              </span>
              <span className="text-xs text-muted-foreground">সাপোর্টেড: .docx, .txt (সর্বোচ্চ ২০০০ প্রশ্ন)</span>
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".docx,.txt,.csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
                e.target.value = "";
              }}
            />
            {uploadName && !uploadError && (
              <div className="flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-400">
                <FileText className="h-4 w-4" /> {uploadName} লোড হয়েছে
              </div>
            )}
            {uploadError && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-400">
                {uploadError}
              </div>
            )}
          </TabsContent>
        </Tabs>

        <div className="flex flex-wrap items-center gap-3">
          <Button
            onClick={onDetect}
            disabled={detecting || !rawText.trim()}
            size="lg"
            className="gap-2 bg-emerald-600 hover:bg-emerald-700"
          >
            {detecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            {detecting ? "ডিটেক্ট হচ্ছে..." : "🔍 প্রশ্ন ডিটেক্ট করুন"}
          </Button>
          <Button variant="outline" onClick={onSample} className="gap-2">
            <Sparkles className="h-4 w-4" /> নমুনা প্রশ্ন লোড করুন
          </Button>
          {rawText.trim() && (
            <Badge variant="secondary" className="gap-1">
              {lineCount} লাইন
            </Badge>
          )}
          {detected && <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">ডিটেক্ট সম্পন্ন ✓</Badge>}
        </div>
      </CardContent>
    </Card>
  );
}
