"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, CheckCircle2, ChevronDown, Copy } from "lucide-react";
import type { DuplicateGroup } from "@/lib/mcq/duplicates";

/**
 * "Duplicate questions" — লাল/সবুজ এক্সপ্যান্ডেবল কার্ড (shuffle মোড, মাল্টি-ফাইল)।
 * একাধিক ফাইলে হুবহু/কাছাকাছি প্রশ্ন থাকলে flag করে — merge/question-bank
 * করার আগে চেনা যায়। ডিফল্ট বন্ধ-খোলা (কার্ড বড় হলেও স্পেস নষ্ট হয় না)।
 */
export function DuplicateQuestionsCard({ groups }: { groups: DuplicateGroup[] }) {
  const [open, setOpen] = useState(groups.length > 0);
  const hasDuplicates = groups.length > 0;
  const totalAffected = groups.reduce((a, g) => a + g.questions.length, 0);
  return (
    <Card
      data-testid="duplicate-questions-card"
      className={hasDuplicates ? "border-red-300 dark:border-red-900" : "border-emerald-200 dark:border-emerald-900"}
    >
      <CardHeader
        className="cursor-pointer select-none pb-2"
        onClick={() => setOpen((v) => !v)}
      >
        <div className="flex min-w-0 items-center gap-2">
          <span
            className={
              hasDuplicates
                ? "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-400"
                : "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400"
            }
          >
            {hasDuplicates ? <Copy className="h-5 w-5" /> : <CheckCircle2 className="h-5 w-5" />}
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-sm font-semibold">
              {hasDuplicates
                ? `Duplicate questions - ${groups.length} group${groups.length === 1 ? "" : "s"}, ${totalAffected} cross-file copy${totalAffected === 1 ? "" : "ies"}`
                : "Duplicate questions - none across files"}
            </h3>
            <p className="truncate text-xs text-muted-foreground">
              {hasDuplicates
                ? "The same question (normalized text + options) appears in more than one file"
                : "No repeated questions were found across the uploaded files"}
            </p>
          </div>
          <button
            type="button"
            aria-label={open ? "Collapse duplicate list" : "Expand duplicate list"}
            className="rounded-md p-1 text-muted-foreground hover:bg-muted"
            onClick={(e) => {
              e.stopPropagation();
              setOpen((v) => !v);
            }}
          >
            <ChevronDown className={`h-5 w-5 transition-transform ${open ? "rotate-180" : ""}`} />
          </button>
        </div>
      </CardHeader>

      {open && (
        <CardContent className="space-y-2">
          {hasDuplicates ? (
            <>
              <p className="rounded-xl border bg-muted/40 p-3 text-xs leading-relaxed text-muted-foreground">
                Each group is a question (question text + options, ignoring case and extra spaces) found in
                two or more files. When building a merged set / question-bank, you may want to keep only one
                copy — mark the others in the file list.
              </p>
              {groups.map((g, gi) => (
                <div
                  key={`${gi}-${g.key}`}
                  className="rounded-xl border border-red-200 bg-red-50/60 p-3 text-sm dark:border-red-900 dark:bg-red-950/30"
                >
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge variant="secondary" className="shrink-0">
                      {g.questions.length} copies
                    </Badge>
                    <span className="min-w-0 flex-1 truncate text-xs text-foreground/90">
                      “{g.questions[0].qText}”
                    </span>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {g.questions.map((h, hi) => (
                      <span
                        key={`${h.fileId}-${h.questionId}`}
                        className="inline-flex items-center gap-1 rounded-full border bg-card px-2 py-0.5 text-[11px] text-muted-foreground"
                      >
                        <AlertTriangle className="h-3 w-3 text-red-700 dark:text-red-400" />
                        <span className="max-w-[220px] truncate">{h.fileName}</span>
                        <span className="rounded bg-muted px-1 text-[10px]">Q{h.questionId + 1}</span>
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </>
          ) : (
            <p className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3 text-xs leading-relaxed text-muted-foreground dark:border-emerald-900 dark:bg-emerald-950/30">
              Question text + options are compared across the uploaded files (case- and whitespace-insensitive).
              If the same question ever appears in two files, this card turns{" "}
              <b className="text-foreground">red</b> so you can deduplicate before merging.
            </p>
          )}
        </CardContent>
      )}
    </Card>
  );
}