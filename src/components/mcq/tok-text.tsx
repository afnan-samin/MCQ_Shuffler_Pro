"use client";

import { useMemo } from "react";
import { tokenizeWithContext, type Enc } from "@/lib/mcq/encoding";

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
