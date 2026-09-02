"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Download, ListOrdered, PaintBucket } from "lucide-react";
import type { ColorAnalysis } from "@/lib/mcq/color-serial";

interface ColorFileShuffleNoticeProps {
  analysis: ColorAnalysis;
  fileName: string;
  /** ফাইলসহ সিরিয়াল মোডে যাও */
  onOpenSerial: () => void;
}

/** শাফল মোডে রঙ-স্ট্রাকচার্ড ফাইল উঠলে — শাফল বন্ধ, সিরিয়াল মোডে হাত-অফ */
export function ColorFileShuffleNotice({ analysis, fileName, onOpenSerial }: ColorFileShuffleNoticeProps) {
  return (
    <Card className="border-amber-300/70 dark:border-amber-500/30">
      <CardHeader className="pb-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-400">
            <AlertTriangle className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <CardTitle className="text-base md:text-lg">
              এই ফাইল রঙ-স্ট্রাকচার্ড — শাফল মোডে করা যাবে না
            </CardTitle>
            <CardDescription className="truncate">{fileName}</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          ফাইলে <b>{analysis.shadedCount}</b> টি রঙ-দেওয়া হেডার আছে ({analysis.colors.length} টি রঙ) — এই
          ধরনের ফাইলের কাজ হলো <b>রঙ-অনুযায়ী সিরিয়াল</b>, শাফল নয়। শাফল করলে অধ্যায়/টাইপ-স্ট্রাকচার এলোমেলো হয়ে
          যেত।
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary" className="gap-1">
            <PaintBucket className="h-3 w-3" /> {analysis.colors.length} রঙ
          </Badge>
          <Badge variant="secondary">{analysis.questionCount} প্রশ্ন</Badge>
        </div>
        <Button onClick={onOpenSerial} className="w-full sm:w-auto">
          <ListOrdered className="mr-2 h-4 w-4" />
          🔢 সিরিয়াল মোডে এই ফাইল খুলুন
        </Button>
      </CardContent>
    </Card>
  );
}

interface NoColorSerialCardProps {
  questionCount: number;
  busy: boolean;
  /** একটানা (continuous) সিরিয়াল চালিয়ে ডাউনলোড */
  onContinuous: () => void;
}

/** সিরিয়াল মোডে রঙ না পেলে — একটানা ১..N অপশন */
export function NoColorSerialCard({ questionCount, busy, onContinuous }: NoColorSerialCardProps) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted text-muted-foreground">
            <ListOrdered className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <CardTitle className="text-base md:text-lg">এই ফাইলে রঙ-হেডার পাওয়া যায়নি</CardTitle>
            <CardDescription>রঙ-ভিত্তিক সেকশন সিরিয়ালে হেডারে শেডিং রঙ থাকতে হয়</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {questionCount > 0 ? (
          <>
            <p className="text-sm text-muted-foreground">
              তবে <b>{questionCount}</b> টি প্রশ্ন-লাইন পাওয়া গেছে — চাইলে পুরো ফাইলে{" "}
              <b>একটানা ১,২,৩…</b> সিরিয়াল দেওয়া যাবে। রঙ-স্ট্রাকচার চাইলে Word-এ হেডারগুলোতে Home →
              Paragraph → Shading দিয়ে রঙ বসিয়ে আবার আপলোড করুন।
            </p>
            <Button onClick={onContinuous} disabled={busy} className="w-full sm:w-auto">
              <Download className="mr-2 h-4 w-4" />
              {busy ? "প্রসেস হচ্ছে…" : "একটানা ১..N সিরিয়াল করে .docx ডাউনলোড"}
            </Button>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            কোনো প্রশ্ন-লাইনও পাওয়া যায়নি — ফাইলটা সঠিক .docx কিনা আর প্রশ্নগুলো সিরিয়াল দিয়ে শুরু কিনা
            (যেমন: 1. / ১. / 01.) দেখে নিন।
          </p>
        )}
      </CardContent>
    </Card>
  );
}
