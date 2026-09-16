"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { AlertTriangle, CheckCircle2, ChevronDown } from "lucide-react";
import type { RdQuestion } from "@/lib/mcq/redownload";

/** per-file merged row (page.tsx attaches the source file name) */
export type AnswerConflictRow = {
  id: number;
  serial: number;
  star: string;
  tail: string;
  fileName: string;
};

/** parse-result থেকে conflict-rows (page.tsx-এর useMemo-এর কাজে) */
export function answerConflictRowsOf(
  questions: RdQuestion[],
  fileName: string
): AnswerConflictRow[] {
  return questions
    .filter((q) => q.answerConflict)
    .map((q) => ({
      id: q.id,
      serial: q.serial,
      star: q.answerConflict!.star,
      tail: q.answerConflict!.tail,
      fileName,
    }));
}

/**
 * "Answer conflicts" — লাল এক্সপ্যান্ডেবল কার্ড (redownload মোড)।
 * কোনো প্রশ্নে star-উত্তর (`*A. টেক্সট`) আর glued Dt-tail উত্তর ("…Dt K")
 * ভিন্ন অক্ষর বললে এখানে দেখায় — ইউজার সোর্স ফাইল মিলিয়ে ভুলটা ঠিক করে।
 * ডাউনলোডে tail-উত্তরটাই থাকে (আগের আচরণ); কার্ডটা শুধু সতর্ক করে।
 */
export function AnswerConflictsCard({ conflicts }: { conflicts: AnswerConflictRow[] }) {
  const [open, setOpen] = useState(conflicts.length > 0);
  const multiFile = new Set(conflicts.map((c) => c.fileName)).size > 1;
  const toggleOpen = () => setOpen((v) => !v);
  const hasConflicts = conflicts.length > 0;
  return (
    <Card
      data-testid="answer-conflicts-card"
      className={hasConflicts ? "border-red-300 dark:border-red-900" : "border-emerald-200 dark:border-emerald-900"}
    >
      <CardHeader className="cursor-pointer select-none pb-2" onClick={toggleOpen}>
        <div className="flex min-w-0 items-center gap-2">
          <span
            className={
              hasConflicts
                ? "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-400"
                : "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400"
            }
          >
            {hasConflicts ? <AlertTriangle className="h-5 w-5" /> : <CheckCircle2 className="h-5 w-5" />}
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-sm font-semibold">
              {hasConflicts
                ? `Answer conflicts - ${conflicts.length} question${conflicts.length === 1 ? "" : "s"} affected`
                : "Answer conflicts - none found"}
            </h3>
            <p className="truncate text-xs text-muted-foreground">
              {hasConflicts
                ? `Downloads keep the tail answer (e.g. "${conflicts[0].tail}") — check the source file`
                : "Star-marked and tail answers agree everywhere"}
            </p>
          </div>
          <button
            type="button"
            aria-label={open ? "Collapse conflict list" : "Expand conflict list"}
            className="rounded-md p-1 text-muted-foreground hover:bg-muted"
            onClick={(e) => {
              e.stopPropagation();
              toggleOpen();
            }}
          >
            <ChevronDown className={`h-5 w-5 transition-transform ${open ? "rotate-180" : ""}`} />
          </button>
        </div>
      </CardHeader>

      {open && (
        <CardContent className="space-y-2">
          {hasConflicts ? (
            <>
              <p className="rounded-xl border bg-muted/40 p-3 text-xs leading-relaxed text-muted-foreground">
                Each row is a question where the star-marked option (e.g.{" "}
                <span className="font-mono">*A. …</span>) and the glued tail answer (e.g.{" "}
                <span className="font-mono">…Dt K</span>) point to <b className="text-foreground">different</b>{" "}
                options — likely a typo in the source file. Downloads use the tail answer; please
                verify the original file.
              </p>
              {conflicts.map((c, i) => (
                <div
                  key={`${c.id}-${c.serial}-${i}`}
                  className="rounded-xl border border-red-200 bg-red-50/60 p-3 text-sm dark:border-red-900 dark:bg-red-950/30"
                >
                  <div className="font-medium">
                    Question {c.serial}
                    {multiFile ? (
                      <span className="text-muted-foreground"> {"\u2014"} {c.fileName}</span>
                    ) : null}
                  </div>
                  <div className="mt-1 font-mono text-xs">
                    <span className="text-muted-foreground">star:</span>{" "}
                    <span className="text-red-700 dark:text-red-400">{c.star}</span>
                    <span className="mx-2 text-muted-foreground">vs</span>
                    <span className="text-muted-foreground">tail:</span>{" "}
                    <span className="text-emerald-700 dark:text-emerald-400">{c.tail}</span>
                  </div>
                </div>
              ))}
            </>
          ) : (
            <p className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3 text-xs leading-relaxed text-muted-foreground dark:border-emerald-900 dark:bg-emerald-950/30">
              When a question carries both a star-marked answer (<span className="font-mono">*A.</span>) and a
              tail answer (<span className="font-mono">…Dt K</span>), both are compared. If they ever
              disagree, this card turns <b className="text-foreground">red</b> so the source file can be
              fixed before sharing.
            </p>
          )}
        </CardContent>
      )}
    </Card>
  );
}