"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { ListChecks, Droplets } from "lucide-react";
import { lineDominantOf, type Enc } from "@/lib/mcq/encoding";
import { TokText } from "@/components/mcq/tok-text";
import { type RdQuestion, type WatermarkInfo } from "@/lib/mcq/redownload";
import { digitsToNumber } from "@/lib/mcq/docx-xml";

const PAGE = 50;

export interface RedownloadQuestionsCardProps {
  fileName: string;
  questions: RdQuestion[];
  selected: Set<number>;
  onToggle: (id: number) => void;
  onSelectAll: () => void;
  onSelectNone: () => void;
  onSelectRange: (fromPos: number, toPos: number) => void;
  watermark: WatermarkInfo | null;
  dominant: Enc | null;
}

/** প্রশ্নের লেখায় \t-কে ফিক্সড-উইডথ গ্যাপ হিসেবে দেখায় — Word-এর ট্যাবের মত */
function TabbedText({ text, dominant, colored = false }: { text: string; dominant: Enc | null; colored?: boolean }) {
  const parts = text.split("\t");
  return (
    <>
      {parts.map((seg, i) => (
        <span key={i}>
          {i > 0 && <span className="tab-gap" aria-hidden="true" />}
          {seg && <TokText line={seg} dominant={dominant} colored={colored} />}
        </span>
      ))}
    </>
  );
}

/**
 * প্রশ্ন-বাছাই লিস্ট (রিডাউনলোড মোড) — প্রতি প্রশ্নে একই বিন্যাস:
 * প্রশ্ন (এক লাইন) → নিচের লাইনে অপশনগুলো → তার নিচে উত্তর।
 * বাংলা পজিশন-নম্বর, সব সিলেক্ট/সব বাদ/রেঞ্জ, ট্যাব ও ওয়াটারমার্ক-প্রিভিউসহ।
 */
export function RedownloadQuestionsCard({
  fileName,
  questions,
  selected,
  onToggle,
  onSelectAll,
  onSelectNone,
  onSelectRange,
  watermark,
  dominant,
}: RedownloadQuestionsCardProps) {
  const [visible, setVisible] = useState(PAGE);
  const [rangeFrom, setRangeFrom] = useState("");
  const [rangeTo, setRangeTo] = useState("");

  const shown = useMemo(() => questions.slice(0, visible), [questions, visible]);

  const applyRange = () => {
    // বাংলা ও English — দুই ডিজিটেই রেঞ্জ চলে
    const f = digitsToNumber(rangeFrom.trim());
    const t = digitsToNumber(rangeTo.trim());
    if (f && t && f.num >= 1 && t.num >= f.num && t.num <= questions.length) {
      onSelectRange(f.num - 1, t.num - 1);
    }
  };

  return (
    <Card id="step-rd-questions">
      <CardHeader className="pb-2">
        <CardTitle className="text-base md:text-lg">3. Pick questions — {fileName}</CardTitle>
        <CardDescription>
          Only the ticked questions go into the new file — each shows its options and answer below.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* সিলেকশন টুলবার */}
        <div className="flex flex-wrap items-center gap-3 rounded-xl border bg-muted/40 p-3">
          <ListChecks className="h-4 w-4 text-brand-700 dark:text-brand-400" />
          <Button size="sm" variant="outline" onClick={onSelectAll}>
            Select all
          </Button>
          <Button size="sm" variant="outline" onClick={onSelectNone}>
            Deselect all
          </Button>
          <div className="flex items-center gap-1.5">
            <Input
              value={rangeFrom}
              onChange={(e) => setRangeFrom(e.target.value)}
              className="h-8 w-16 text-center"
              placeholder="From"
              inputMode="numeric"
            />
            <span className="text-sm text-muted-foreground">—</span>
            <Input
              value={rangeTo}
              onChange={(e) => setRangeTo(e.target.value)}
              className="h-8 w-16 text-center"
              placeholder="To"
              inputMode="numeric"
            />
            <Button size="sm" variant="outline" onClick={applyRange}>
              Select range
            </Button>
          </div>
          <span className="text-xs text-muted-foreground">
            Selected {selected.size}/{questions.length} — (position numbers, Bengali or English both work)
          </span>
        </div>

        {/* প্রশ্ন-লিস্ট — প্রশ্ন → অপশন → উত্তর, ওয়াটারমার্ক-ওভারলেসহ */}
        <div className="relative max-h-[520px] space-y-2 overflow-y-auto rounded-xl border p-3 mcq-scroll">
          {watermark && (
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 z-0 select-none overflow-hidden"
            >
              <div className="absolute inset-0 flex items-center justify-center">
                <span
                  className="flex rotate-[-24deg] items-center gap-1.5 whitespace-nowrap text-5xl font-bold opacity-[0.07] sm:text-6xl"
                  style={{ color: watermark.color }}
                >
                  <Droplets className="h-12 w-12" />
                  {watermark.text}
                </span>
              </div>
            </div>
          )}

          <div className={watermark ? "relative z-10 space-y-2" : "space-y-2"}>
            {shown.map((q) => {
              const pos = q.pos;
              const qDom = lineDominantOf(q.qText) ?? dominant;
              return (
                <label
                  key={q.id}
                  className={`flex cursor-pointer items-start gap-2.5 rounded-lg border px-3 py-2.5 transition hover:border-brand-300 hover:bg-brand-50/40 dark:hover:border-brand-800 dark:hover:bg-brand-950/20 ${
                    selected.has(q.id) ? "border-brand-300 bg-brand-50/50 dark:border-brand-800 dark:bg-brand-950/20" : "border-transparent"
                  }`}
                >
                  <Checkbox
                    checked={selected.has(q.id)}
                    onCheckedChange={() => onToggle(q.id)}
                    className="mt-1"
                  />
                  <span className="mt-0.5 w-7 shrink-0 text-right text-xs font-bold text-brand-700/80 dark:text-brand-400/80" title={`Position ${q.pos}`}>
                    {pos}
                  </span>
                  <span className="min-w-0 flex-1 text-sm leading-relaxed">
                    {/* প্রশ্ন — এক লাইন */}
                    <span className="block">
                      <span className={`mr-1.5 font-semibold ${q.serialFontBijoy ? "tokfont-bijoy" : ""}`}>
                        {q.serialDigits}
                        {q.serialSeparator}
                      </span>
                      <span className="text-foreground/90">
                        <TabbedText text={q.qText} dominant={qDom} />
                      </span>
                    </span>
                    {/* অপশন — নিচের লাইনে */}
                    {q.options.length > 0 && (
                      <span className="mt-1 flex flex-wrap gap-x-5 gap-y-0.5 pl-1 text-[13px] text-foreground/80">
                        {q.options.map((o, oi) => (
                          <span key={oi} className="min-w-0">
                            <span className={`font-semibold ${q.serialFontBijoy && /[KLMN]/.test(o.label) ? "tokfont-bijoy" : ""}`}>
                              {o.label})
                            </span>{" "}
                            <TabbedText text={o.text} dominant={qDom} />
                          </span>
                        ))}
                      </span>
                    )}
                    {/* উত্তর — তার নিচে */}
                    {q.answer && (
                      <span className="mt-1 block pl-1 text-[13px]">
                        <span className="font-medium text-brand-800 dark:text-brand-300">Answer: </span>
                        <span className={`font-semibold text-brand-700 dark:text-brand-400 ${q.serialFontBijoy && /[KLMN]/.test(q.answer) ? "tokfont-bijoy" : ""}`}>
                          {q.answer}
                        </span>
                      </span>
                    )}
                    {/* ব্যাখ্যা — প্রথম লাইন */}
                    {q.bekkha && (
                      <span className="mt-1 block pl-1 text-[13px] text-muted-foreground">
                        <span className="font-medium text-sky-800 dark:text-sky-300">Explanation: </span>
                        <span className={`${q.serialFontBijoy ? "tokfont-bijoy" : ""}`}>
                          {(() => {
                            const first = q.bekkha.split("\n").find((l) => l.trim()) ?? "";
                            return first.length > 110 ? first.slice(0, 110) + "…" : first;
                          })()}
                        </span>
                      </span>
                    )}
                  </span>
                </label>
              );
            })}
            {visible < questions.length && (
              <Button
                variant="ghost"
                size="sm"
                className="w-full gap-1 text-brand-700 dark:text-brand-400"
                onClick={() => setVisible((v) => v + PAGE)}
              >
                Show more ({questions.length - visible} remaining)
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
