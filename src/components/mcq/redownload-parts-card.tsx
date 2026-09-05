"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { PART_LABELS, type PartKind, type PartSel } from "@/lib/mcq/redownload";
import { FileCheck2, Hash, Sparkles } from "lucide-react";

export interface RedownloadPartsCardProps {
  /** সব ফাইল মিলিয়ে প্রতি অংশের প্যারা-সংখ্যা */
  counts: Record<PartKind, number>;
  sel: PartSel;
  onChange: (kind: PartKind, v: boolean) => void;
  renumber: boolean;
  onRenumberChange: (v: boolean) => void;
  filesCount: number;
  questionsCount: number;
}

const KIND_ORDER: PartKind[] = ["serial", "question", "reference", "options", "answer", "bekkha"];

const KIND_HINTS: Record<Exclude<PartKind, "other">, string> = {
  serial: "নম্বর থাকবে / রিনাম্বার হবে",
  question: "প্রশ্নের মূল লেখা",
  reference: "উদ্দীপক / রেফারেন্স অনুচ্ছেদ",
  options: "ক খ গ ঘ — চারটি অপশন",
  answer: "উত্তর (উঃ ক / উত্তরমালা)",
  bekkha: "ব্যাখ্যা / সমাধান অংশ",
};

/** অংশ-বাছাই কার্ড — কোন অংশগুলো নতুন ফাইলে থাকবে (ডিফল্ট: সিরিয়াল + প্রশ্ন) */
export function RedownloadPartsCard({
  counts,
  sel,
  onChange,
  renumber,
  onRenumberChange,
  filesCount,
  questionsCount,
}: RedownloadPartsCardProps) {
  const expansionActive = !sel.options && sel.answer;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400">
            <FileCheck2 className="h-5 w-5" />
          </span>
          <div>
            <CardTitle className="text-base md:text-lg">২. অংশ বাছাই — নতুন ফাইলে কী কী থাকবে</CardTitle>
            <CardDescription>
              {filesCount} টি ফাইলে {questionsCount} টি প্রশ্ন পাওয়া গেছে — যে অংশগুলোর টিক দেবেন শুধু সেগুলোই ডাউনলোড হবে (ফরম্যাট হুবহু অক্ষত)।
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* ছয় অংশের চেকবক্স */}
        <div className="grid gap-2 sm:grid-cols-2">
          {KIND_ORDER.map((k) => (
            <label
              key={k}
              className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors ${
                sel[k] ? "border-emerald-400 bg-emerald-50/60 dark:border-emerald-700 dark:bg-emerald-950/20" : "border-border hover:bg-muted/50"
              }`}
            >
              <Checkbox
                checked={sel[k]}
                onCheckedChange={(v) => onChange(k, v === true)}
                className="mt-0.5"
                aria-label={PART_LABELS[k]}
              />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2 text-sm font-semibold">
                  {PART_LABELS[k]}
                  {counts[k] > 0 && (
                    <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
                      {counts[k]} লাইন
                    </Badge>
                  )}
                </span>
                <span className="mt-0.5 block text-xs text-muted-foreground">{KIND_HINTS[k]}</span>
              </span>
            </label>
          ))}
        </div>

        {/* রিনাম্বার সুইচ */}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-muted/40 p-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Hash className="h-4 w-4 text-emerald-700 dark:text-emerald-400" />
              সিরিয়াল নতুন করে ১, ২, ৩…
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              বাছাই করা প্রশ্নগুলো ক্রমে ১ থেকে নম্বর পাবে — ফাইলের নিজের ডিজিট-স্টাইলেই। OFF হলে আসল নম্বরই থাকে।
            </p>
          </div>
          <Switch checked={renumber} onCheckedChange={onRenumberChange} aria-label="সিরিয়াল রিনাম্বার টগল" />
        </div>

        {/* উত্তর-বিস্তার হিন্ট */}
        {expansionActive && (
          <div className="flex items-start gap-2 rounded-xl border border-sky-200 bg-sky-50/60 p-3 text-sm text-sky-900 dark:border-sky-800 dark:bg-sky-950/30 dark:text-sky-200">
            <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-sky-600 dark:text-sky-400" />
            <p>
              <b>উত্তর-বিস্তার চালু:</b> অপশন বাদ দিয়েছেন কিন্তু উত্তর রেখেছেন — তাই &quot;উঃ ক&quot;-টাইপ উত্তরের জায়গায় ওই অপশনের পুরো লেখা বসে যাবে (যেমন: উঃ ক) পানির ঘনত্ব…)।
            </p>
          </div>
        )}
      </CardContent>
      <Label className="sr-only">অংশ বাছাই</Label>
    </Card>
  );
}
