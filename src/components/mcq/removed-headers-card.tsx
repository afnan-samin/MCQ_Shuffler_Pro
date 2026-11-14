"use client";

/**
 * Removed-headers card — visible only while the Header part is unticked.
 * Lists exactly the body-level elements the engine drops outside MCQ blocks
 * (paragraph or table, document order), rendered like Word: bold, italic,
 * underline, strike, colour, highlight, shading, alignment, relative font
 * size, sup/sub, Bijoy fonts. Look and feel follows BlockedLinesCard.
 */

import { useMemo, useState, type CSSProperties } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChevronDown, ChevronUp, FileText, Trash2 } from "lucide-react";
import { runsText, type ParaRun } from "@/lib/mcq/docx-xml";
import { type HeaderEntry, type HeaderTableCell } from "@/lib/mcq/redownload";
import { lineDominantOf, type Enc } from "@/lib/mcq/encoding";
import { RunText, TokText } from "@/components/mcq/tok-text";

/** Header entries of one uploaded file — the card's input rows */
export interface RemovedHeadersDoc {
  fileName: string;
  entries: HeaderEntry[];
}

interface RemovedHeadersCardProps {
  docs: RemovedHeadersDoc[];
}

/** Long lists: first 5 per file, then the Show-all toggle (BlockedLinesCard pattern) */
const PREVIEW_COUNT = 5;

/** Word named highlight colours → CSS hex */
const HIGHLIGHT_HEX: Record<string, string> = {
  yellow: "#FFFF00",
  green: "#00FF00",
  cyan: "#00FFFF",
  magenta: "#FF00FF",
  blue: "#0000FF",
  red: "#FF0000",
  darkBlue: "#000080",
  darkCyan: "#008080",
  darkGreen: "#008000",
  darkMagenta: "#800080",
  darkRed: "#800000",
  darkYellow: "#808000",
  darkGray: "#808080",
  lightGray: "#C0C0C0",
  black: "#000000",
  white: "#FFFFFF",
};

/** w:jc values → CSS text-align */
const ALIGN_CSS: Record<string, CSSProperties["textAlign"]> = {
  left: "left",
  start: "left",
  center: "center",
  right: "right",
  end: "right",
  both: "justify",
  distribute: "justify",
};

/** Word default body text is 22 half-points (11pt) — sizes render relative to it */
const BASE_HALF_POINTS = 22;

/** one run as Word shows it — style wrapper + RunText for fonts and sup/sub */
function runStyle(r: ParaRun): CSSProperties {
  const style: CSSProperties = {};
  if (r.bold) style.fontWeight = 700;
  if (r.italic) style.fontStyle = "italic";
  const deco = [r.underline ? "underline" : "", r.strike ? "line-through" : ""].filter(Boolean).join(" ");
  if (deco) style.textDecoration = deco;
  if (r.color) style.color = `#${r.color}`;
  if (r.highlight) {
    const hex = HIGHLIGHT_HEX[r.highlight];
    if (hex) style.backgroundColor = hex;
  }
  if (r.size) style.fontSize = `${(r.size / 2) / (BASE_HALF_POINTS / 2)}em`;
  return style;
}

/** rich runs — equations are not rendered, the badge stands in for them */
function RichRuns({ runs, dominant }: { runs: readonly ParaRun[]; dominant: Enc | null }) {
  const shown = runs.filter((r) => !r.math);
  return (
    <>
      {shown.map((r, i) => (
        <span key={i} style={runStyle(r)}>
          <RunText runs={[r]} dominant={dominant} />
        </span>
      ))}
    </>
  );
}

/** small inline placeholder badge for images and equations */
function InlineBadge({ label }: { label: string }) {
  return (
    <Badge variant="secondary" className="mx-0.5 h-5 px-1.5 text-[10px] align-middle">
      {label}
    </Badge>
  );
}

/** header table preview — TablePreview markup, but cells render their rich runs */
function HeaderTablePreview({ rows }: { rows: HeaderTableCell[][] }) {
  if (!rows.length) return null;
  return (
    <span className="block overflow-x-auto rounded-md border border-border bg-muted/20">
      <table className="w-full border-collapse text-[12px] leading-snug">
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri}>
              {row.map((cell, ci) => (
                <td
                  key={ci}
                  style={cell.shading ? { backgroundColor: `#${cell.shading}` } : undefined}
                  className="min-w-[3rem] whitespace-pre-wrap border border-border/70 px-1.5 py-1 align-top text-foreground/85"
                >
                  {cell.runs?.length ? (
                    <RichRuns runs={cell.runs} dominant={lineDominantOf(runsText(cell.runs))} />
                  ) : (
                    <TokText line={cell.text} dominant={lineDominantOf(cell.text)} colored={false} />
                  )}
                  {cell.hasImage && <InlineBadge label="image" />}
                  {cell.hasEquation && <InlineBadge label="equation" />}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </span>
  );
}

/** one header paragraph entry — shading band, alignment, badges, rich runs */
function HeaderParaView({ entry }: { entry: Extract<HeaderEntry, { kind: "para" }> }) {
  return (
    <span
      className="block rounded px-1 py-0.5"
      style={{
        textAlign: entry.align ? ALIGN_CSS[entry.align] : undefined,
        backgroundColor: entry.shading ? `#${entry.shading}` : undefined,
      }}
    >
      {entry.hasImage && <InlineBadge label="image" />}
      {entry.hasEquation && <InlineBadge label="equation" />}
      <RichRuns runs={entry.runs} dominant={lineDominantOf(runsText(entry.runs))} />
    </span>
  );
}

/** blank header paragraph — collapsed into the "+N blank lines" count line */
function isBlankEntry(e: HeaderEntry): boolean {
  return e.kind === "para" && !e.hasImage && !e.hasEquation && !runsText(e.runs).trim();
}

export function RemovedHeadersCard({ docs }: RemovedHeadersCardProps) {
  const [expanded, setExpanded] = useState(false);
  const groups = useMemo(
    () =>
      docs
        .map((d) => {
          const listed = d.entries.filter((e) => !isBlankEntry(e));
          return { fileName: d.fileName, listed, blanks: d.entries.length - listed.length };
        })
        .filter((g) => g.listed.length > 0 || g.blanks > 0),
    [docs]
  );
  if (!groups.length) return null;

  const totalListed = groups.reduce((a, g) => a + g.listed.length, 0);
  const totalBlanks = groups.reduce((a, g) => a + g.blanks, 0);
  const hidden = groups.reduce((a, g) => a + Math.max(0, g.listed.length - PREVIEW_COUNT), 0);
  const showFileNames = groups.length > 1;

  return (
    <Card className="border-amber-300/70 dark:border-amber-500/30">
      <CardHeader className="pb-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-400">
            <Trash2 className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <CardTitle className="text-base md:text-lg">Removed headers</CardTitle>
            <CardDescription>
              Header is unticked — these elements are left out of the new file. Tick Header to keep them.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary" className="gap-1">
            <Trash2 className="h-3 w-3" /> {totalListed} removed
          </Badge>
          {totalBlanks > 0 && <Badge variant="secondary">{totalBlanks} blank line(s)</Badge>}
          {showFileNames && <Badge variant="secondary">{groups.length} files</Badge>}
        </div>

        {groups.map((g, gi) => {
          const visible = expanded ? g.listed : g.listed.slice(0, PREVIEW_COUNT);
          return (
            <div key={`${g.fileName}-${gi}`} className="space-y-1.5">
              {showFileNames && (
                <div className="flex min-w-0 items-center gap-2">
                  <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="truncate text-sm font-medium">{g.fileName}</span>
                </div>
              )}
              {visible.length > 0 && (
                <ol className="max-h-72 list-decimal list-outside space-y-1 overflow-y-auto rounded-lg border bg-muted/40 p-2 pl-7 text-sm">
                  {visible.map((e, i) => (
                    <li key={i} className="min-w-0 break-all">
                      {e.kind === "table" ? <HeaderTablePreview rows={e.rows} /> : <HeaderParaView entry={e} />}
                    </li>
                  ))}
                </ol>
              )}
              {g.blanks > 0 && (
                <p className="text-sm text-muted-foreground">
                  +{g.blanks} blank {g.blanks === 1 ? "line is" : "lines are"} also removed
                </p>
              )}
            </div>
          );
        })}

        {hidden > 0 && (
          <Button variant="ghost" size="sm" className="w-full" onClick={() => setExpanded((v) => !v)}>
            {expanded ? (
              <>
                <ChevronUp className="mr-1 h-4 w-4" /> Show less
              </>
            ) : (
              <>
                <ChevronDown className="mr-1 h-4 w-4" /> Show all ({hidden} more)
              </>
            )}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
