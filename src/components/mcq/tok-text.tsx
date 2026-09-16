"use client";

import { useMemo } from "react";
import { tokenizeWithContext, type Enc } from "@/lib/mcq/encoding";
import type { DocxTable } from "@/lib/mcq/docx-xml";

interface TokTextProps {
  line: string;
  /** ডকুমেন্ট/লাইনের প্রধান ধরন (কনটেক্সট) */
  dominant: Enc | null;
  /** true হলে রঙিন হাইলাইট, false হলে শুধু সঠিক ফন্ট */
  colored?: boolean;
}

/**
 * শব্দ ধরে ধরে রেন্ডার করে:
 * - Bijoy শব্দ → SutonnyMJ ফন্টে (ব্রাউজারে Bijoy ফন্ট ইনস্টল থাকলে সেটাই ব্যবহার হয়,
 *   না থাকলে সাইটে এমবেড করা SutonnyMJ ওয়েব-ফন্ট)
 * - ইউনিকোড বাংলা / English → সাইটের ফন্ট (Kalpurush)
 * - colored=true হলে শব্দের ধরন অনুযায়ী হালকা রঙ দেখায় (ডিটেক্টর ভিউ)
 */
/**
 * প্রশ্ন-ব্লকের টেবিল-প্রিভিউ — <table> হিসেবে (সেল-টেক্সট TokText-এ)।
 * আউটপুট-ফাইলে টেবিল আগেই অক্ষত ছিল (test 19); এটা শুধু UI-প্রিভিউ —
 * কোনো ডাউনলোড/এক্সপোর্ট-পাথে হাত দেয় না।
 */
export function TablePreview({ tables, dominant }: { tables: DocxTable[]; dominant: Enc | null }) {
  if (!tables.length) return null;
  return (
    <span className="mt-1.5 block space-y-1.5 pl-1">
      {tables.map((t, ti) => (
        <span key={ti} className="block overflow-x-auto rounded-md border border-border bg-muted/20">
          <table className="w-full border-collapse text-[12px] leading-snug">
            <tbody>
              {t.rows.map((row, ri) => (
                <tr key={ri}>
                  {row.map((cell, ci) => (
                    <td
                      key={ci}
                      className="min-w-[3rem] whitespace-pre-wrap border border-border/70 px-1.5 py-1 align-top text-foreground/85"
                    >
                      <TokText line={cell.text} dominant={dominant} colored={false} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </span>
      ))}
    </span>
  );
}
export function TokText({ line, dominant, colored = true }: TokTextProps) {
  const toks = useMemo(() => tokenizeWithContext(line, dominant), [line, dominant]);
  return (
    <>
      {toks.map((t, i) => {
        if (!t.text) return null;
        if (t.enc === "neutral") return <span key={i}>{t.text}</span>;
        return (
          <span
            key={i}
            className={
              colored
                ? `tok tok-${t.enc}`
                : t.enc === "bijoy"
                  ? "tokfont-bijoy"
                  : undefined
            }
          >
            {t.text}
          </span>
        );
      })}
    </>
  );
}
