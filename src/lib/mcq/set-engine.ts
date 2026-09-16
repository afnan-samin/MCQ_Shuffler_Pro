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
 * Original Shuffle-এ সর্বোচ্চ কতগুলো **distinct ক্রম** সম্ভব — n! (original ক্রম
 * বাদ দিলে n!−1)। n বড় হলে null (গণনা overflow-সুরক্ষার জন্য থ্রেশোল্ডের উপরে)।
 * UI-warning-এর কাজে লাগে: সেট-সংখ্যা এর বেশি হলে duplicate সেট অনিবার্য।
 */
export function originalUniqueOrders(n: number): number | null {
  if (n < 2) return 1; // ১-প্রশ্নের পুলে একটাই ক্রম
  let f = 1;
  for (let i = 2; i <= n; i++) {
    f *= i;
    if (f > 1_000_000) return null; // যথেষ্ট বড় — সতর্কতার দরকার নেই
  }
  return f;
}

/** সব ক্রম (permutation) জেনারেট — শুধু ছোট পুলে (n ≤ 8) ডাকা হয় */
function allPermutations<T>(arr: readonly T[]): T[][] {
  const out: T[][] = [];
  const cur = arr.slice();
  const n = cur.length;
  const c = new Array<number>(n).fill(0);
  out.push(cur.slice());
  let i = 1;
  while (i < n) {
    if (c[i] < i) {
      const j = i % 2 === 0 ? 0 : c[i];
      [cur[i], cur[j]] = [cur[j], cur[i]];
      out.push(cur.slice());
      c[i]++;
      i = 1;
    } else {
      c[i] = 0;
      i++;
    }
  }
  return out;
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
    const keyOf = orderKey;
    const seen = new Set<string>([keyOf(pool)]);
    // ছোট পুলে সম্ভাব্য ক্রম খুবই সীমিত (২ প্রশ্নে মাত্র ২টা ক্রম) — রিট্রাইট
    // ১৬ বার ব্যর্থ হলে ডুপ্লিকেট সেট নীরবে বসে যেত। এখন n ≤ 8 হলে সব
    // permutation **exhaustively** জেনারেট করে distinct-গুলো থেকেই নেওয়া হয়
    // — সম্ভব সীমা পর্যন্ত কোনো ডুপ্লিকেট হবে না; সীমা ছাড়ালে তখনই ডুপ্লিকেট
    // (তখন UI-warning দেখায়)।
    const total = originalUniqueOrders(pool.length);
    if (pool.length <= 8 && total !== null && k <= total - 1) {
      const perms = allPermutations(pool).filter((p) => !seen.has(keyOf(p)));
      const picked = shuffled(perms).slice(0, k);
      for (let s = 0; s < k; s++) sets[s] = picked[s] ?? shuffled(pool);
      return sets;
    }
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

/** পুলের ক্রম-কী — সেট দুটো একই ক্রমে আছে কিনা মেলাতে (buildSets + reshuffleDistinct দুটোতেই) */
export function orderKey<T extends PoolItem>(arr: readonly T[]): string {
  return arr.map((q) => q.id).join(",");
}

/**
 * একটা সেটকে আবার শাফল — কিন্তু `others`-এ দেওয়া ক্রমগুলোর সাথে মিলে যাওয়া চলবে না।
 * (Phase 1.2: "Reshuffle" বাটন আগে plain shuffled() ডাকত — অন্য সেটের হুবহু ক্রম
 *  বেরিয়ে আসতে পারত, দুটো সেট এক হয়ে যেত।)
 *
 * - ছোট পুল (n ≤ 8): সব permutation exhaustively — সম্ভাব্য সীমার ভিতরে
 *   ডুপ্লিকেট অনিবার্য নয়, তাই ফেরত-দেওয়া ক্রম **অবশ্যই** ভিন্ন (নাহলে সব ক্রম
 *   আগেই ব্যবহৃত — তখন নিজের পুরনো ক্রমই ফেরে, যা সবচেয়ে কম ক্ষতিকর)।
 * - বড় পুল: ১৬ বার রিট্রাই; ১৬ বারেও duplicate পেলে শেষ চেষ্টাটাই ফেরে
 *   (তখনեր সেট-সংখ্যা n! ছাড়িয়ে গেছে — UI-তে আগেই warning দেখানো হয়)।
 */
export function reshuffleDistinct<T extends PoolItem>(pool: readonly T[], others: readonly string[]): T[] {
  const cur = pool.slice();
  if (cur.length < 2) return cur;
  const seen = new Set<string>(others);
  if (cur.length <= 8) {
    const perms = allPermutations(cur).filter((p) => !seen.has(orderKey(p)));
    if (perms.length) return shuffled(perms)[0];
    return cur; // সব সম্ভাব্য ক্রম already ব্যবহৃত
  }
  let arr = shuffled(cur);
  let tries = 0;
  while (tries < 16 && seen.has(orderKey(arr))) {
    arr = shuffled(cur);
    tries++;
  }
  return arr;
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
