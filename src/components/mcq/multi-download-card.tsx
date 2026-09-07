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
  /** ফাইল সংখ্যা — ঠিক ১ হলে ZIP বাটন লুকায়, একটাই ডাউনলোড বাটন দেখায় */
  fileCount?: number;
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
  fileCount,
}: MultiDownloadCardProps) {
  const single = fileCount === 1;
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
            <Label className="font-medium">How should serials work in the merged file?</Label>
            <RadioGroup
              value={serialStrategy}
              onValueChange={(v) => onSerialStrategyChange?.(v as SerialStrategy)}
              disabled={disabled}
              className="gap-2"
            >
              <div className="flex items-start gap-3 rounded-xl border p-3">
                <RadioGroupItem value="per-file" id="mf-serial-per-file" className="mt-0.5" />
                <Label htmlFor="mf-serial-per-file" className="cursor-pointer text-sm leading-snug flex-col items-start gap-0.5">
                  <span className="font-semibold">Restart from 1 in each file</span>
                  <span className="block text-xs text-muted-foreground">
                    Each file's questions get 1, 2, 3… inside itself — the merged file keeps file-by-file sections.
                  </span>
                </Label>
              </div>
              <div className="flex items-start gap-3 rounded-xl border p-3">
                <RadioGroupItem value="global" id="mf-serial-global" className="mt-0.5" />
                <Label htmlFor="mf-serial-global" className="cursor-pointer text-sm leading-snug flex-col items-start gap-0.5">
                  <span className="font-semibold">One continuous serial — start to finish</span>
                  <span className="block text-xs text-muted-foreground">
                    The 2nd file continues where the 1st ended — e.g. if file 1 has 50 questions, file 2 starts at 51.
                  </span>
                </Label>
              </div>
            </RadioGroup>
          </div>
        )}

        {/* ডাউনলোড বাটন — এক ফাইল হলে একটাই, একাধিক হলে .docx + ZIP দুটোই */}
        <div className={single ? "grid gap-3" : "grid gap-3 sm:grid-cols-2"}>
          {/* এক .docx ডাউনলোড — প্রাইমারি সবুজ */}
          <Button
            type="button"
            onClick={onDownloadMerged}
            disabled={disabled || mergedBusy}
            className="h-auto flex-col items-center gap-1 rounded-xl bg-emerald-600 p-4 text-white hover:bg-emerald-700"
          >
            {mergedBusy ? (
              <span className="flex items-center gap-2 text-sm font-semibold">
                <Loader2 className="animate-spin" /> Generating...
              </span>
            ) : (
              <span className="flex items-center gap-2 text-sm font-semibold">
                <FileText /> {single ? "Download (.docx)" : "Download as one file (.docx)"}
              </span>
            )}
            <span className="text-xs opacity-80">
              {single ? "One file — downloads directly" : "All files in order — page breaks between files"}
            </span>
          </Button>

          {/* ZIP ডাউনলোড — আউটলাইন (একাধিক ফাইলেই শুধু) */}
          {!single && (
            <Button
              type="button"
              variant="outline"
              onClick={onDownloadZip}
              disabled={disabled || zipBusy}
              className="h-auto flex-col items-center gap-1 rounded-xl p-4"
            >
              {zipBusy ? (
                <span className="flex items-center gap-2 text-sm font-semibold">
                  <Loader2 className="animate-spin" /> Zipping...
                </span>
              ) : (
                <span className="flex items-center gap-2 text-sm font-semibold">
                  <Archive /> Download separately (.zip)
                </span>
              )}
              <span className="text-xs text-muted-foreground opacity-80">One click ZIP — all files inside, separate</span>
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
