"use client";

import { useRef, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FileText, FileUp, ListOrdered, Loader2 } from "lucide-react";

interface SerialInputCardProps {
  onFile: (f: File) => void;
  loading: boolean;
  loadedName: string | null;
}

/** সিরিয়াল মোডের আপলোড কার্ড — শুধু .docx (রঙ-বিশ্লেষণের জন্য) */
export function SerialInputCard({ onFile, loading, loadedName }: SerialInputCardProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  const handleFile = (f: File) => {
    setError(null);
    if (!/\.docx$/i.test(f.name)) {
      setError("সিরিয়াল মোডে শুধু .docx ফাইল চলবে (রঙ ডিটেক্ট + XML প্রিজার্ভের জন্য)।");
      return;
    }
    onFile(f);
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <ListOrdered className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <CardTitle className="text-base md:text-lg">MCQ সিরিয়াল — ফাইল আপলোড</CardTitle>
            <CardDescription className="truncate">
              রঙ-দেওয়া হেডার (Word: Home → Paragraph → Shading) অটো ডিটেক্ট হবে — রঙ বাছলেই প্রতিটা সেকশন ১ থেকে নম্বর পাবে
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={loading}
          className="flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-emerald-300 bg-emerald-50/50 p-6 text-center transition hover:border-emerald-500 hover:bg-emerald-50 disabled:opacity-60 dark:border-emerald-800 dark:bg-emerald-950/20 dark:hover:border-emerald-600 sm:p-8"
        >
          {loading ? (
            <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
          ) : (
            <FileUp className="h-8 w-8 text-emerald-600" />
          )}
          <span className="text-sm font-medium">
            {loading ? "ফাইল পড়া ও রঙ-বিশ্লেষণ হচ্ছে..." : ".docx ফাইল সিলেক্ট করতে ক্লিক করুন"}
          </span>
          <span className="text-xs text-muted-foreground">
            শুধু .docx — হেডার, ইকুয়েশন, ছবি, ফন্ট সব হুবহু অক্ষত থাকবে; শুধু প্রশ্নের সিরিয়াল বদলাবে।
          </span>
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".docx"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
            e.target.value = "";
          }}
        />
        {loadedName && !error && (
          <div className="flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-400">
            <FileText className="h-4 w-4 shrink-0" /> <span className="min-w-0 truncate">{loadedName}</span>
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
