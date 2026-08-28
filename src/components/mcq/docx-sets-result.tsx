"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  AlignLeft,
  Check,
  ClipboardCopy,
  FileDown,
  Hash,
  Loader2,
  MousePointerClick,
  Star,
} from "lucide-react";
import type { DocxQuestion } from "@/lib/mcq/docx-xml";
import { englishSetName } from "@/lib/mcq/docx-exporter";
import { lineDominantOf, type Enc } from "@/lib/mcq/encoding";
import { TokText } from "@/components/mcq/tok-text";
import { SerialSpan } from "@/components/mcq/docx-detect-card";

interface DocxSetsResultProps {
  /** প্রতি সেটে প্রশ্ন id-র ক্রম */
  sets: number[][];
  questions: DocxQuestion[];
  renumber: boolean;
  onRenumberChange: (v: boolean) => void;
  busy: string | null;
  copiedSet: number | null;
  /** renumber=true → ১,২,৩…; false → আসল নম্বরসহ */
  onDownload: (renumber: boolean) => void;
  onCopySet: (si: number) => void;
  dominant: Enc | null;
}

export function DocxSetsResult({
  sets,
  questions,
  renumber,
  onRenumberChange,
  busy,
  copiedSet,
  onDownload,
  onCopySet,
  dominant,
}: DocxSetsResultProps) {
  const byId = new Map(questions.map((q) => [q.id, q]));
  const totalQ = sets.reduce((a, s) => a + s.length, 0);

  return (
    <Card id="step-result" className="border-emerald-300 dark:border-emerald-700">
      <CardHeader>
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-600 text-sm font-bold text-white">৪</span>
          <CardTitle className="text-lg md:text-xl">
            শাফল সম্পন্ন — {sets.length} টি সেট ({totalQ} প্রশ্ন)
          </CardTitle>
        </div>
        <CardDescription>
          প্রতিটি সেট ডাউনলোড করা Word ফাইলে আলাদা পেজে থাকবে — tab, ইকুয়েশন, sub/superscript সব হুবহু অক্ষত।
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* রিনাম্বার সুইচ */}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-muted/40 p-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 font-medium">
              <Hash className="h-4 w-4 text-emerald-700 dark:text-emerald-400" />
              সিরিয়াল replace {renumber ? "ON — ১, ২, ৩…" : "OFF — আসল নম্বর"}
            </div>
            <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
              <MousePointerClick className="h-3 w-3" />
              নিচের যেকোনো সেটে সিরিয়াল লেখায় ক্লিক করলেও টগল হবে
            </p>
          </div>
          <Switch id="renumber-switch" checked={renumber} onCheckedChange={onRenumberChange} />
        </div>

        {/* এক্সপোর্ট বার */}
        <div className="sticky top-2 z-10 flex flex-wrap items-center justify-center gap-2 rounded-xl border bg-white/95 p-3 shadow-sm backdrop-blur dark:bg-background/95">
          <Button className="gap-2 bg-emerald-600 hover:bg-emerald-700" onClick={() => onDownload(true)} disabled={busy !== null}>
            {busy === "docx-r" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
            ⬇️ Word (.docx) — রিনাম্বার সিরিয়াল (১,২,৩…)
          </Button>
          <Button variant="outline" className="gap-2" onClick={() => onDownload(false)} disabled={busy !== null}>
            {busy === "docx-o" ? <Loader2 className="h-4 w-4 animate-spin" /> : <AlignLeft className="h-4 w-4" />}
            ⬇️ Word (.docx) — আসল নম্বরসহ
          </Button>
        </div>

        {/* সেট কার্ডগুলো */}
        <div className="grid gap-4 lg:grid-cols-2">
          {sets.map((ids, si) => (
            <div key={si} className="rounded-xl border bg-white dark:bg-background">
              <div className="flex flex-wrap items-center gap-2 border-b bg-emerald-50/70 px-4 py-2.5 dark:bg-emerald-950/20">
                <span className="font-bold text-emerald-800 dark:text-emerald-300">{englishSetName(si)}</span>
                <Badge variant="secondary" className="gap-1">
                  {ids.length} প্রশ্ন
                </Badge>
                <Badge className={renumber ? "gap-1 bg-emerald-100 text-emerald-800 hover:bg-emerald-100" : "gap-1 bg-amber-100 text-amber-800 hover:bg-amber-100"}>
                  {renumber ? "সিরিয়াল: ১,২,৩…" : "সিরিয়াল: আসল"}
                </Badge>
                <div className="ml-auto">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 gap-1 px-2 text-xs"
                    onClick={() => onCopySet(si)}
                    disabled={busy !== null}
                  >
                    {copiedSet === si ? <Check className="h-3 w-3 text-emerald-600" /> : <ClipboardCopy className="h-3 w-3" />}
                    {copiedSet === si ? "কপি হয়েছে" : "কপি"}
                  </Button>
                </div>
              </div>
              <div className="max-h-72 space-y-0.5 overflow-y-auto p-3 mcq-scroll">
                {ids.map((qid, qi) => {
                  const q = byId.get(qid);
                  if (!q) return null;
                  const shownSerial = renumber ? String(qi + 1) : q.serialDigits;
                  return (
                    <div key={`${si}-${qid}-${qi}`} className="flex items-start gap-2 text-[13px] leading-snug">
                      <button
                        type="button"
                        onClick={() => onRenumberChange(!renumber)}
                        title="ক্লিক করলে সিরিয়াল replace টগল হবে"
                        className="min-w-[2rem] shrink-0 cursor-pointer rounded px-0.5 text-right font-semibold text-emerald-700 hover:bg-emerald-100 dark:text-emerald-400 dark:hover:bg-emerald-950/40"
                      >
                        <SerialSpan q={q} text={shownSerial} />
                      </button>
                      <span className="text-foreground/90">
                        <TokText line={q.qText} dominant={lineDominantOf(q.text) ?? dominant} colored={false} />
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <div className="rounded-lg border bg-muted/30 px-3 py-2 text-center text-xs text-muted-foreground">
          ✍️ সিরিয়াল <span className="font-medium text-foreground/80">প্লেইন টেক্সটেই</span> থাকে — কোনো বুলেট/অটো-নম্বরিং নেই। ট্যাব, ইকুয়েশন (math), sub/superscript, Bijoy (SutonnyMJ) ফন্ট — সব হুবহু অরিজিনালের মত।
        </div>

        <div className="flex items-center justify-center gap-1.5 pt-2 text-xs text-muted-foreground">
          <Star className="h-3.5 w-3.5 text-amber-500" />
          টিপস: দুটো ভার্সনই নামান — রিনাম্বারডটা পরীক্ষায় দেওয়ার জন্য, আসল-নম্বরডটা মিলিয়ে দেখার জন্য।
        </div>

        <Label className="sr-only" htmlFor="renumber-switch">
          সিরিয়াল রিনাম্বার টগল
        </Label>
      </CardContent>
    </Card>
  );
}
