"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChevronDown, FileText, Files, Hash, Loader2 } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { TokText } from "@/components/mcq/tok-text";
import { SerialSpan } from "@/components/mcq/docx-detect-card";
import { englishSetName } from "@/lib/mcq/docx-exporter";
import { lineDominantOf } from "@/lib/mcq/encoding";
import type { DocxQuestion } from "@/lib/mcq/docx-xml";

/** একটা ফাইলের শাফল্ড সেট — প্রিভিউ + আলাদা-ডাউনলোড */
export interface ShuffleFileSets {
  id: string;
  fileName: string;
  /** এই ফাইলের সেটগুলো (প্রতি সেটে প্রশ্ন-id ক্রম) */
  setIds: number[][];
  questions: DocxQuestion[];
  /** এই ফাইলের serial-replace (ডিফল্ট ON — ১, ২, ৩…) */
  renumber: boolean;
}

interface ShuffleMultiSetsCardProps {
  files: ShuffleFileSets[];
  /** কোন ফাইলের sets-ডাউনলোড চলছে (spinner ওই ফাইলে) */
  busyFileId: string | null;
  disabled?: boolean;
  /** প্রতি ফাইলের sets-separately ডাউনলোড (১ সেট=সরাসরি, বেশি=ওই ফাইলের ZIP) */
  onDownloadFileSets: (id: string) => void;
  /** প্রতি ফাইলের serial-replace টগল (শুধু ওই ফাইলে) */
  onRenumberChange: (id: string, v: boolean) => void;
}

/**
 * মাল্টি-শাফলের সেট-প্রিভিউ — redownload-এর মতো প্রতি ফাইল collapse/expand
 * section; খোলা section-এ প্রতি সেটের প্রশ্ন-তালিকা + ওই ফাইলের sets-separately
 * ডাউনলোড বাটন। ডিফল্টে প্রথম ফাইল খোলা থাকে।
 */
export function ShuffleMultiSetsCard({
  files,
  busyFileId,
  disabled = false,
  onDownloadFileSets,
  onRenumberChange,
}: ShuffleMultiSetsCardProps) {
  const [openIds, setOpenIds] = useState<Set<string>>(
    () => new Set(files.slice(0, 1).map((f) => f.id))
  );
  const toggleOpen = (id: string) =>
    setOpenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const totalSets = files.reduce((a, f) => a + f.setIds.length, 0);
  const totalQuestions = files.reduce((a, f) => a + f.questions.length, 0);

  return (
    <Card id="step-multi-sets">
      <CardHeader className="pb-2">
        <CardTitle className="text-base md:text-lg">Shuffled sets — per file</CardTitle>
        <CardDescription>
          {files.length === 1
            ? "Open the section to see every set — download this file's sets separately below."
            : `Each of the ${files.length} file(s) sits in its own section below — click the arrow to open it.`}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
          <Files className="h-4 w-4 text-brand-700 dark:text-brand-400" />
          <span>
            <b className="text-brand-800 dark:text-brand-300">{files.length}</b> file(s) •{" "}
            <b className="text-brand-800 dark:text-brand-300">{totalSets}</b> set(s) •{" "}
            <b className="text-brand-800 dark:text-brand-300">{totalQuestions}</b> question(s) in total
          </span>
        </div>

        {files.map((f) => {
          const open = openIds.has(f.id);
          const byId = new Map(f.questions.map((q) => [q.id, q]));
          const fileBusy = busyFileId === f.id;
          return (
            <div key={f.id} className="overflow-hidden rounded-xl border bg-card">
              <div className="flex w-full items-center gap-2 px-3 py-2.5">
                <button
                  type="button"
                  data-testid="shuffle-file-section"
                  aria-expanded={open}
                  aria-controls={`shuffle-file-${f.id}`}
                  onClick={() => toggleOpen(f.id)}
                  className="flex min-w-0 flex-1 items-center gap-2 text-left transition hover:bg-muted/40 rounded-lg px-1 py-0.5"
                >
                  <ChevronDown
                    aria-hidden="true"
                    className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : "-rotate-90"}`}
                  />
                  <FileText className="h-4 w-4 shrink-0 text-brand-600 dark:text-brand-400" />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{f.fileName}</span>
                  <Badge variant="secondary" className="shrink-0">
                    {f.setIds.length} {f.setIds.length === 1 ? "set" : "sets"}
                  </Badge>
                  <Badge
                    className={
                      f.renumber
                        ? "shrink-0 gap-1 bg-brand-100 text-brand-800 hover:bg-brand-100"
                        : "shrink-0 gap-1 bg-amber-100 text-amber-800 hover:bg-amber-100"
                    }
                  >
                    {f.renumber ? "Serial: 1,2,3…" : "Serial: original"}
                  </Badge>
                </button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 shrink-0 gap-1 px-2 text-xs"
                  onClick={() => onDownloadFileSets(f.id)}
                  disabled={disabled || busyFileId !== null}
                  title={f.setIds.length > 1 ? "Download this file's sets as one ZIP" : "Download this file's set directly"}
                >
                  {fileBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Files className="h-3 w-3" />}
                  {fileBusy ? "Zipping…" : f.setIds.length > 1 ? "Sets (.zip)" : "Set (.docx)"}
                </Button>
              </div>
              {open && (
                <div id={`shuffle-file-${f.id}`} className="space-y-3 border-t p-3">
                  {/* এই ফাইলের serial-replace — শুধু ওই ফাইলে (ডিফল্ট ON); নিচের নম্বরে ক্লিকেও টগল হয় */}
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-muted/40 p-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 text-sm font-medium">
                        <Hash className="h-4 w-4 text-brand-700 dark:text-brand-400" />
                        Serial replace {f.renumber ? "ON — 1, 2, 3…" : "OFF — original numbers"}
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        Clicking a serial number in any set below also toggles this
                      </p>
                    </div>
                    <Switch
                      id={`renumber-${f.id}`}
                      checked={f.renumber}
                      onCheckedChange={(v) => onRenumberChange(f.id, v)}
                      disabled={disabled || busyFileId !== null}
                    />
                  </div>
                  {/* সেটগুলো পাশাপাশি (single-file view-এর মতো ২-কলাম গ্রিড) */}
                  <div className="grid gap-4 lg:grid-cols-2">
                  {f.setIds.map((ids, si) => (
                    <div key={si} className="rounded-xl border bg-white dark:bg-background">
                      <div className="flex flex-wrap items-center gap-2 border-b bg-brand-50/70 px-4 py-2 dark:bg-brand-950/20">
                        <span className="font-bold text-brand-800 dark:text-brand-300">{englishSetName(si)}</span>
                        <Badge variant="secondary" className="gap-1">
                          {ids.length} questions
                        </Badge>
                      </div>
                      <div className="max-h-64 space-y-0.5 overflow-y-auto p-3 mcq-scroll">
                        {ids.map((qid, qi) => {
                          const q = byId.get(qid);
                          if (!q) return null;
                          const shownSerial = f.renumber ? String(qi + 1) : q.serialDigits;
                          return (
                            <div key={`${si}-${qid}-${qi}`} className="flex items-start gap-2 text-[13px] leading-snug">
                              <button
                                type="button"
                                onClick={() => onRenumberChange(f.id, !f.renumber)}
                                title="Click to toggle serial replace"
                                className="min-w-[2rem] shrink-0 cursor-pointer rounded px-0.5 text-right font-semibold text-brand-700 hover:bg-brand-100 dark:text-brand-400 dark:hover:bg-brand-950/40"
                              >
                                <SerialSpan q={q} text={shownSerial} />
                              </button>
                              <span className="text-foreground/90">
                                <TokText line={q.qText} dominant={lineDominantOf(q.text)} colored={false} />
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
