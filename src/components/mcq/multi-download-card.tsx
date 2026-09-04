"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Archive, FileDown, FileText, Loader2 } from "lucide-react";

/** মার্জ করা .docx-এ সিরিয়াল কোন নিয়মে বসবে */
export type SerialStrategy = "per-file" | "global";

export interface MultiDownloadCardProps {
  title: string;
  description?: string;
  /** যেমন "৫ টি ফাইল • ২৩০ টি প্রশ্ন" */
  stats?: string | null;
  /** সিরিয়াল মোডে মার্জ করার সময় দুই ধরনের সিরিয়াল-বাছাই দেখাও */
  showSerialChoice?: boolean;
  serialStrategy?: SerialStrategy;
  onSerialStrategyChange?: (s: SerialStrategy) => void;
  onDownloadMerged: () => void;
  onDownloadZip: () => void;
  mergedBusy?: boolean;
  zipBusy?: boolean;
  disabled?: boolean;
}

/** মাল্টি-ফাইল ডাউনলোড কার্ড — এক .docx-এ মার্জ বা ZIP-এ আলাদা আলাদা */
export function MultiDownloadCard({
  title,
  description,
  stats,
  showSerialChoice = false,
  serialStrategy = "per-file",
  onSerialStrategyChange,
  onDownloadMerged,
  onDownloadZip,
  mergedBusy = false,
  zipBusy = false,
  disabled = false,
}: MultiDownloadCardProps) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex min-w-0 items-center gap-2">
          {/* সবুজ আইকন-টাইল (serial-input-card-এর মতোই স্টাইল) */}
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400">
            <FileDown className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <CardTitle className="text-base md:text-lg">{title}</CardTitle>
            {description && <CardDescription className="truncate">{description}</CardDescription>}
            {stats && <p className="text-xs text-muted-foreground">{stats}</p>}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* সিরিয়াল-মোড মার্জে দুই ধরনের সিরিয়াল বাছাই */}
        {showSerialChoice && (
          <div className="space-y-2">
            <Label className="font-medium">মার্জ করা ফাইলে সিরিয়াল কেমন হবে</Label>
            <RadioGroup
              value={serialStrategy}
              onValueChange={(v) => onSerialStrategyChange?.(v as SerialStrategy)}
              disabled={disabled}
              className="gap-2"
            >
              <div className="flex items-start gap-3 rounded-xl border p-3">
                <RadioGroupItem value="per-file" id="mf-serial-per-file" className="mt-0.5" />
                <Label htmlFor="mf-serial-per-file" className="cursor-pointer text-sm leading-snug flex-col items-start gap-0.5">
                  <span className="font-semibold">প্রতি ফাইলে নতুন করে ১ থেকে সিরিয়াল</span>
                  <span className="block text-xs text-muted-foreground">
                    প্রতিটা ফাইলের প্রশ্ন নিজের ভিতরে ১, ২, ৩… পাবে — মার্জ করা ফাইলেও ফাইল-ভিত্তিক ভাগ থাকবে।
                  </span>
                </Label>
              </div>
              <div className="flex items-start gap-3 rounded-xl border p-3">
                <RadioGroupItem value="global" id="mf-serial-global" className="mt-0.5" />
                <Label htmlFor="mf-serial-global" className="cursor-pointer text-sm leading-snug flex-col items-start gap-0.5">
                  <span className="font-semibold">একটানা এক সিরিয়াল — শুরু থেকে শেষ পর্যন্ত</span>
                  <span className="block text-xs text-muted-foreground">
                    ১ম ফাইল শেষ হলে ২য় ফাইল সেখান থেকেই নম্বর ধরবে — যেমন ১ম ফাইলে ৫০ প্রশ্ন হলে ২য় ফাইল শুরু হবে ৫১ থেকে।
                  </span>
                </Label>
              </div>
            </RadioGroup>
          </div>
        )}

        {/* দুই বড় ডাউনলোড বাটন */}
        <div className="grid gap-3 sm:grid-cols-2">
          {/* মার্জ করা এক .docx — প্রাইমারি সবুজ */}
          <Button
            type="button"
            onClick={onDownloadMerged}
            disabled={disabled || mergedBusy}
            className="h-auto flex-col items-center gap-1 rounded-xl bg-emerald-600 p-4 text-white hover:bg-emerald-700"
          >
            {mergedBusy ? (
              <span className="flex items-center gap-2 text-sm font-semibold">
                <Loader2 className="animate-spin" /> তৈরি হচ্ছে...
              </span>
            ) : (
              <span className="flex items-center gap-2 text-sm font-semibold">
                <FileText /> এক ফাইলে ডাউনলোড (.docx)
              </span>
            )}
            <span className="text-xs opacity-80">সব ফাইল পরপর — ফাইলের মাঝে পেজ ব্রেক</span>
          </Button>

          {/* ZIP ডাউনলোড — আউটলাইন */}
          <Button
            type="button"
            variant="outline"
            onClick={onDownloadZip}
            disabled={disabled || zipBusy}
            className="h-auto flex-col items-center gap-1 rounded-xl p-4"
          >
            {zipBusy ? (
              <span className="flex items-center gap-2 text-sm font-semibold">
                <Loader2 className="animate-spin" /> ZIP হচ্ছে...
              </span>
            ) : (
              <span className="flex items-center gap-2 text-sm font-semibold">
                <Archive /> আলাদা আলাদা ডাউনলোড (.zip)
              </span>
            )}
            <span className="text-xs text-muted-foreground opacity-80">এক ক্লিকে ZIP — ভিতরে সবগুলো ফাইল আলাদা</span>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
