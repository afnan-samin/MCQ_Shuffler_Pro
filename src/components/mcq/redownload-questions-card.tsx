"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { ChevronDown, Droplets, FileText, ListChecks } from "lucide-react";
import { lineDominantOf, type Enc } from "@/lib/mcq/encoding";
import { TokText } from "@/components/mcq/tok-text";
import { type RdQuestion, type WatermarkInfo } from "@/lib/mcq/redownload";
import { digitsToNumber } from "@/lib/mcq/docx-xml";

const PAGE = 50;

/** একটা ফাইলের প্রশ্ন-বাছাই section (পেজ-লেভেল কলব্যাকসহ) — এক কার্ডে অনেক ফাইল */
export interface RdFileSectionProps {
  id: string;
  fileName: string;
  questions: RdQuestion[];
  selected: Set<number>;
  onToggle: (id: number) => void;
  onSelectAll: () => void;
  onSelectNone: () => void;
  onSelectRange: (fromPos: number, toPos: number) => void;
  watermark: WatermarkInfo | null;
  dominant?: Enc | null;
}

export interface RedownloadQuestionsCardProps {
  files: RdFileSectionProps[];
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

/** একটা ফাইলের প্রশ্ন-বাছাই বডি — সিলেকশন টুলবার + ওয়াটারমার্ক + তালিকা (পুরনো কার্ডের হুবহু ভেতর) */
function RdFileBody({ section }: { section: RdFileSectionProps }) {
  const [visible, setVisible] = useState(PAGE);
  const [rangeFrom, setRangeFrom] = useState("");
  const [rangeTo, setRangeTo] = useState("");
  const { questions, selected, watermark, onToggle, onSelectAll, onSelectNone, onSelectRange } = section;
  const dominant = section.dominant ?? null;

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
    <div className="space-y-3">
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
          Selected {selected.size}/{questions.length} q (position numbers, Bengali or English both work)
        </span>
      </div>
{/* প্রশ্ন-তালিকা — ওয়াটারমার্ক পেছনের লেয়ারে, প্রশ্ন তার উপর */}
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
    </div>
  );
}
/**
 * প্রশ্ন-বাছাই (রিডাউনলোড মোড) — এক কার্ডে সব ফাইল:
 * প্রতি ফাইলের নিজস্ব collapse-section (ডিফল্ট বন্ধ, ফন্ট-কার্ডের মতো);
 * arrow-বাটনে শুধু ওই ফাইলটা খোলে — বাকিরা বন্ধই থাকে।
 * খোলা section-এ RdFileBody (টুলবার + ওয়াটারমার্ক + প্রশ্ন-তালিকা)।
 */
export function RedownloadQuestionsCard({ files }: RedownloadQuestionsCardProps) {
  // একসাথে কোন কোন ফাইলের section খোলা (ডিফল্ট: সব বন্ধ)
  const [openIds, setOpenIds] = useState<Set<string>>(new Set());
  const toggleOpen = (id: string) =>
    setOpenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const totalQuestions = files.reduce((a, f) => a + f.questions.length, 0);
  const totalSelected = files.reduce((a, f) => a + f.selected.size, 0);

  return (
    <Card id="step-rd-questions">
      <CardHeader className="pb-2">
        <CardTitle className="text-base md:text-lg">3. Pick questions</CardTitle>
        <CardDescription>
          {files.length === 1
            ? "Only the ticked questions go into the new file — each shows its options and answer below."
            : `Each of the ${files.length} file(s) sits in its own section below — click the arrow to open it. Only the ticked questions go into the new file.`}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* সামগ্রিক সিলেকশন-সারাংশ — section না খুলেই কতটা বাছাই হয়েছে দেখা যায় */}
        <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
          <ListChecks className="h-4 w-4 text-brand-700 dark:text-brand-400" />
          <span>
            <b className="text-brand-800 dark:text-brand-300">{totalSelected}</b> / {totalQuestions} question(s) selected
          </span>
        </div>

        {files.map((f) => {
          const open = openIds.has(f.id);
          return (
            <div key={f.id} className="overflow-hidden rounded-xl border bg-card">
              <button
                type="button"
                data-testid="rd-file-section"
                aria-expanded={open}
                aria-controls={`rd-file-${f.id}`}
                onClick={() => toggleOpen(f.id)}
                className="flex w-full items-center gap-2 px-3 py-2.5 text-left transition hover:bg-muted/40"
              >
                <ChevronDown
                  aria-hidden="true"
                  className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : "-rotate-90"}`}
                />
                <FileText className="h-4 w-4 shrink-0 text-brand-600 dark:text-brand-400" />
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{f.fileName}</span>
                <Badge variant="secondary" className="shrink-0">
                  {f.questions.length} questions
                </Badge>
                <Badge className="shrink-0 border-transparent bg-brand-100 text-brand-800 dark:bg-brand-950/60 dark:text-brand-300">
                  {f.selected.size} selected
                </Badge>
              </button>
              {open && (
                <div id={`rd-file-${f.id}`} className="border-t p-3">
                  <RdFileBody section={f} />
                </div>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}