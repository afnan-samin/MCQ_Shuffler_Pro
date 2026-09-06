// ============================================================
// Set Engine — প্রশ্ন শাফল করে একাধিক সেটে ভাগ করা
// ============================================================

import type { McqQuestion } from "./parser";

/** যেকোনো { id } থাকা অবজেক্ট শাফল হতে পারে — text-mode ও docx-mode দুটোতেই */
export interface PoolItem {
  id: number;
}

export type Distribution = "interleaved" | "chunk" | "random" | "original";

export type NameStyle = "letter" | "bangla" | "number" | "setn";

/** Fisher-Yates shuffle — অরিজিনাল অ্যারে না বদলে নতুন অ্যারে রিটার্ন করে */
export function shuffled<T>(arr: readonly T[]): T[] {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export interface BuildSetsOptions {
  setCount: number;
  distribution: Distribution;
  /** সেটের ভেতরের প্রশ্নগুলো এলোমেলো করা হবে কিনা */
  shuffleWithin: boolean;
}

/**
 * নির্বাচিত প্রশ্নগুলোকে setCount সংখ্যক সেটে ভাগ করে।
 *
 * - original (Original Shuffle): প্রতি সেটে সবগুলো প্রশ্ন থাকে — ভাগ হয় না।
 *   শুধু প্রশ্নের ক্রম (সিরিয়াল অর্ডার) সেটভেদে আলাদা হয় — যেমন
 *   সেট A: ১,২,৩,৪... সেট B: ৪,১,২,৫,৩... এক সেটের ক্রম আরেক সেটের সাথে
 *   কোনোভাবেই মিলবে না। অরিজিনাল প্রশ্ন ও অপশন হুবহু অপরিবর্তিত থাকে।
 * - interleaved: পরপর ভাগ (q1→সেটA, q2→সেটB, q3→সেটC, q4→সেটA ...)
 *   প্রতি সেটে সমান মানের মিশ্রণ থাকে — পরীক্ষার জন্য আদর্শ।
 * - chunk: ধারাবাহিক ব্লক (সেটA = 1-25, সেটB = 26-50 ...)
 *   shuffleWithin=false দিলে প্রতিটি সেট নিজেই একটি সিরিয়াল সেট হয়।
 * - random: পুরো পুল শাফল করে তারপর interleaved ভাগ।
 */
export function buildSets<T extends PoolItem>(pool: T[], opts: BuildSetsOptions): T[][] {
  const k = Math.max(1, Math.min(opts.setCount, pool.length));
  const sets: T[][] = Array.from({ length: k }, () => []);

  if (opts.distribution === "original") {
    // প্রতি সেটে সবগুলো প্রশ্ন — শুধু ক্রম সেটপ্রতি আলাদা হবে।
    // অরিজিনাল ক্রম ও আগের সেটগুলোর ক্রমের সাথে কোনো সেট মিলবে না।
    const keyOf = (arr: T[]) => arr.map((q) => q.id).join(",");
    const seen = new Set<string>([keyOf(pool)]);
    for (let s = 0; s < k; s++) {
      let arr = shuffled(pool);
      let tries = 0;
      while (tries < 16 && seen.has(keyOf(arr))) {
        arr = shuffled(pool);
        tries++;
      }
      seen.add(keyOf(arr));
      sets[s] = arr;
    }
    return sets;
  }

  if (opts.distribution === "chunk") {
    const base = Math.floor(pool.length / k);
    const rem = pool.length % k;
    let idx = 0;
    for (let s = 0; s < k; s++) {
      const count = base + (s < rem ? 1 : 0);
      if (count > 0) sets[s] = pool.slice(idx, idx + count);
      idx += count;
    }
  } else {
    const src = opts.distribution === "random" ? shuffled(pool) : pool;
    src.forEach((q, i) => sets[i % k].push(q));
  }

  if (opts.shuffleWithin) {
    for (let s = 0; s < k; s++) sets[s] = shuffled(sets[s]);
  }

  return sets;
}

// ---------- সেটের নাম ----------

const BN_LETTERS = ["ক", "খ", "গ", "ঘ", "ঙ", "চ", "ছ", "জ", "ঝ", "ঞ", "ট", "ঠ", "ড", "ঢ", "ণ", "ত", "থ", "দ", "ধ", "ন", "প", "ফ", "ব", "ভ", "ম", "য"];

export function getSetName(index: number, style: NameStyle): string {
  const n = index + 1;
  switch (style) {
    case "letter": {
      // A..Z, তারপর A2, B2 ...
      if (n <= 26) return `সেট ${String.fromCharCode(64 + n)}`;
      const cycle = Math.ceil(n / 26);
      return `সেট ${String.fromCharCode(64 + ((n - 1) % 26) + 1)}${cycle > 1 ? cycle : ""}`;
    }
    case "bangla":
      return `সেট ${BN_LETTERS[index % BN_LETTERS.length]}`;
    case "number": {
      const bn = String(n)
        .split("")
        .map((c) => "০১২৩৪৫৬৭৮৯"[Number(c)] ?? c)
        .join("");
      return `সেট ${bn}`;
    }
    case "setn":
      return `Set ${n}`;
  }
}

// ---------- সেট টেক্সট জেনারেটর (কপি/প্রিন্টের জন্য) ----------

export function setToText(
  setName: string,
  questions: McqQuestion[],
  headerLines: string[]
): string {
  const parts: string[] = [];
  parts.push(setName);
  for (const h of headerLines) parts.push(h);
  parts.push("");
  for (const q of questions) {
    parts.push(q.lines.join("\n"));
    parts.push("");
  }
  return parts.join("\n").trimEnd();
}
