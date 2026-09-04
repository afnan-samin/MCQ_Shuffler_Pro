"use client";

import { useRef, useState, type DragEvent } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { ClipboardPaste, FileUp, ListOrdered, Loader2, Plus, Search } from "lucide-react";
import { MultiFileList, type MultiFileItem } from "@/components/mcq/multi-file-list";

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
  const fileRef = useRef<HTMLInputElement>(null);
  const addRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  /** .docx ফিল্টার করে সঠিক হ্যান্ডলারে পাঠায়; ভুল এক্সটেনশন হলে এরর দেখায় */
  const acceptFiles = (list: FileList | null, add: boolean) => {
    setError(null);
    const all = list ? Array.from(list) : [];
    if (!all.length) return;
    const docx = all.filter((f) => /\.docx$/i.test(f.name));
    if (!docx.length) {
      setError("সিরিয়াল মোডে শুধু .docx ফাইল চলবে (রঙ ডিটেক্ট + XML প্রিজার্ভের জন্য)।");
      return;
    }
    if (docx.length < all.length) {
      setError(`${all.length - docx.length} টি ফাইল .docx না — বাদ দেওয়া হলো।`);
    }
    if (add && onAddFiles) onAddFiles(docx);
    else onFiles(docx);
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
        {/* ইনার ট্যাব — ফাইল আপলোড / পেস্ট করুন (শাফল-মোডের ইনপুট-কার্ডের হুবহু প্যাটার্ন) */}
        <Tabs defaultValue="upload">
          <TabsList className="grid w-full grid-cols-2 max-w-md">
            <TabsTrigger value="upload" className="gap-1.5">
              <FileUp className="h-4 w-4" /> ফাইল আপলোড
            </TabsTrigger>
            <TabsTrigger value="paste" className="gap-1.5">
              <ClipboardPaste className="h-4 w-4" /> পেস্ট করুন
            </TabsTrigger>
          </TabsList>

          <TabsContent value="upload" className="mt-3 space-y-3">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={loading}
              onDragOver={(e: DragEvent<HTMLButtonElement>) => {
                e.preventDefault();
                if (!loading) setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e: DragEvent<HTMLButtonElement>) => {
                e.preventDefault();
                setDragOver(false);
                if (!loading) acceptFiles(e.dataTransfer?.files ?? null, false);
              }}
              className={
                "flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-6 text-center transition disabled:opacity-60 sm:p-8 " +
                (dragOver
                  ? "border-emerald-500 bg-emerald-100 dark:border-emerald-500 dark:bg-emerald-900/40"
                  : "border-emerald-300 bg-emerald-50/50 hover:border-emerald-500 hover:bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/20 dark:hover:border-emerald-600")
              }
            >
              {loading ? (
                <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
              ) : (
                <FileUp className="h-8 w-8 text-emerald-600" />
              )}
              <span className="text-sm font-medium">
                {loading
                  ? "ফাইল পড়া ও রঙ-বিশ্লেষণ হচ্ছে..."
                  : ".docx ফাইল সিলেক্ট করতে ক্লিক করুন বা টেনে ছাড়ুন"}
              </span>
              <span className="text-xs text-muted-foreground">
                একসাথে একাধিক .docx সিলেক্ট করা যাবে — পরে মার্জ করে এক ফাইলে (পেজ ব্রেকসহ) বা ZIP-এ আলাদা আলাদা ডাউনলোড করুন।
              </span>
            </button>
          </TabsContent>

          <TabsContent value="paste" className="mt-3 space-y-3">
            <Textarea
              value={pasteText}
              onChange={(e) => onPasteTextChange(e.target.value)}
              placeholder={`এখানে প্রশ্নগুলো পেস্ট করুন...

যেমন:
১. বাংলাদেশের রাজধানী কোনটি?
ক) চট্টগ্রাম  খ) ঢাকা  গ) খুলনা  ঘ) রাজশাহী

1. What is the capital of Japan?
a) Beijing  b) Tokyo  c) Seoul  d) Bangkok`}
              className="min-h-[220px] font-mono text-sm leading-relaxed"
            />
            <div className="flex flex-wrap items-center gap-3">
              <Button
                type="button"
                onClick={onPasteDetect}
                disabled={pasteBusy || !pasteText.trim()}
                className="gap-2 bg-emerald-600 hover:bg-emerald-700"
              >
                {pasteBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                {pasteBusy ? "ডিটেক্ট হচ্ছে..." : "🔍 প্রশ্ন ডিটেক্ট করুন"}
              </Button>
              <span className="text-xs text-muted-foreground">
                পেস্ট = টেক্সট পাইপলাইন — ডিটেক্ট করলে আপলোড করা ফাইল-লিস্ট মুছে যাবে (দুটো একসাথে থাকে না)।
              </span>
            </div>
          </TabsContent>
        </Tabs>

        {/* লুকানো ফাইল-ইনপুট — ট্যাবের বাইরে (সবসময় DOM-এ থাকে: যে ট্যাবেই থাকুক আপলোড ও ‘আরও ফাইল যোগ করুন’ কাজ করে) */}
        <input
          ref={fileRef}
          type="file"
          accept=".docx"
          multiple
          className="hidden"
          onChange={(e) => {
            acceptFiles(e.target.files, false);
            e.target.value = "";
          }}
        />
        <input
          ref={addRef}
          type="file"
          accept=".docx"
          multiple
          className="hidden"
          onChange={(e) => {
            acceptFiles(e.target.files, true);
            e.target.value = "";
          }}
        />

        {/* লোড হওয়া ফাইলের ক্রম-লিস্ট — টেনে উপরে/নিচে সাজানো যায় */}
        {items.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              ফাইলের ক্রম বদলাতে টেনে ধরুন বা তীর-বাটন চাপুন — মার্জ/ZIP-এ ঠিক এই ক্রমেই আসবে।
            </p>
            <MultiFileList items={items} onReorder={onReorder} onRemove={onRemove} disabled={loading} />
            {onAddFiles && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => addRef.current?.click()}
                disabled={loading}
              >
                <Plus className="h-4 w-4" /> আরও ফাইল যোগ করুন
              </Button>
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
