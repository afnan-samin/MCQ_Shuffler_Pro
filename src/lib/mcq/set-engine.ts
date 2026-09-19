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

/** অন্য সেটের order-key ("1,2,3,…") → id-অ্যারে — পজিশন-মিল হিসাবের জন্য */
function idsOfKey(key: string): number[] {
  if (!key) return [];
  return key
    .split(",")
    .map((s) => Number(s))
    .filter((n) => Number.isFinite(n));
}

/**
 * দুটো ক্রমে কতটা **পজিশন-মিল** — একই প্রশ্ন দুই সেটের হুবহু একই লাইনে বসেছে কতবার।
 * এর সাথে **হেড-উইন্ডো মিল** (ডিফল্ট প্রথম ৫টা প্রশ্ন) — সেট A-র ১–৫ নম্বরে যে
 * প্রশ্নগুলো, সেট B-র ১–৫-এও সেগুলো পড়ে গেলে দুটো সেট শুরু থেকেই "কপি" মনে
 * হয় — তাই এই মিল ভারী ওজনে (HEAD_WEIGHT) গোনা হয়। প্রতিটি নতুন সেট বাছাইয়ের
 * সময় আগের সেটগুলোর সাথে এই স্কোর যতটা সম্ভব শূন্য এমন ক্রমই বেছে নেওয়া হয়
 * (buildSets ও reshuffleDistinct দুটোতেই)।
 */
const HEAD_WINDOW = 5;
const HEAD_WEIGHT = 10;
export function positionalCollisions<T extends PoolItem>(a: readonly T[], b: readonly T[]): number {
  const n = Math.min(a.length, b.length);
  let c = 0;
  for (let i = 0; i < n; i++) if (a[i].id === b[i].id) c++;
  // হেড-উইন্ডো — একই প্রশ্ন দুই সেটেরই প্রথম ৫-এ পড়লে ভারী জরিমানা
  const headA = new Set<T>();
  for (let i = 0; i < Math.min(HEAD_WINDOW, a.length); i++) headA.add(a[i]);
  for (let i = 0; i < Math.min(HEAD_WINDOW, b.length); i++) if (headA.has(b[i])) c += HEAD_WEIGHT;
  return c;
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
      // Greedy pick — প্রতিটি সেট বাছাইয়ের সময় আগের সেটগুলোর সাথে পজিশন-মিল
      // সবচেয়ে কম এমন distinct permutation নেওয়া হয়। সম্পূর্ণ ক্রম distinct এমনিতেই
      // (filter), বাড়তি হিসেবে একই প্রশ্ন সব সেটের একই লাইনেও পড়ে না।
      const perms = shuffled(allPermutations(pool).filter((p) => !seen.has(keyOf(p))));
      const picked: T[][] = [];
      for (let s = 0; s < k && perms.length; s++) {
        let bestIdx = 0;
        let bestScore = Number.POSITIVE_INFINITY;
        for (let i = 0; i < perms.length; i++) {
          let sc = 0;
          for (const prevP of picked) sc += positionalCollisions(prevP, perms[i]);
          if (sc < bestScore) {
            bestScore = sc;
            bestIdx = i;
            if (sc === 0) break; // নিখুঁত — আর খোঁজার দরকার নেই
          }
        }
        picked.push(perms[bestIdx]);
        perms.splice(bestIdx, 1);
      }
      for (let s = 0; s < k; s++) sets[s] = picked[s] ?? shuffled(pool);
      return sets;
    }
    // বড় পুল: কনস্ট্রাকটিভ নতুন ক্রম (buildDistinctOrder) — রিপেয়ার-লুপে কলাইডিং
    // পজিশনগুলো swap করে **পজিশন-মিল শূন্যে** নামানো হয় এবং নতুন সেটের প্রথম ৫-এ
    // আগের কোনো সেটের প্রথম ৫-এর প্রশ্ন বসে না (১–৫ জানালা আলাদা থাকে)।
    // রিট্রাই-স্কোরিং যথেষ্ট নয় — ১০০ প্রশ্ন × ৪ সেটে স্কোর-অন্ধ বাছাইয়ে মিল
    // থেকেই যেত (প্রোব-প্রমাণিত); এখন গ্যারান্টেড শূন্য-মিল কনস্ট্রাক্ট হয়।
    // (seen/keyOf ওপরে ডিক্লেয়ার্ড — অরিজিনাল ক্রমসহ সব ব্যবহৃত ক্রম এড়ানো হয়)
    const picked: T[][] = [];
    for (let s = 0; s < k; s++) {
      const arr = buildDistinctOrder(pool, picked, seen);
      seen.add(keyOf(arr));
      picked.push(arr);
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
 * বড় পুলের জন্য **কনস্ট্রাকটিভ** নতুন ক্রম — শুধু এলোমেলো রিট্রাই-স্কোরিং নয়।
 * র‍্যান্ডম ক্রম নিয়ে রিপেয়ার-লুপে খারাপ পজিশনগুলো swap করে ঠিক করা হয়:
 *  ১) পজিশন-মিল — একই প্রশ্ন আগের কোনো সেটের হুবহু একই লাইনে বসে না
 *  ২) হেড-উইন্ডো — নতুন সেটের প্রথম ৫-এ আগের কোনো সেটের প্রথম ৫-এর প্রশ্ন বসে না
 *  ৩) ডুপ্লিকেট — seenKeys-এ থাকা ক্রম (আগের সেট/অরিজিনাল) ফেরত যায় না
 * ১০ বার চেষ্টার মধ্যে শূন্য-মিল না হলে (প্রায় অসম্ভব — বড় পুলে রিপেয়ার
 * কয়েক ডজন swap-এই শেষ হয়) সবচেয়ে কম-মিল ক্যান্ডিডেটই ফেরে।
 */
function buildDistinctOrder<T extends PoolItem>(
  pool: readonly T[],
  prevs: readonly (readonly T[])[],
  seenKeys: Set<string>
): T[] {
  // আগের সেটগুলোর হেড-উইন্ডোর (প্রথম HEAD_WINDOW) id — এদের নতুন সেটের
  // হেড-উইন্ডোতে বসা নিষেধ (১–৫ জানালা সেটপ্রতি আলাদা থাকবে)।
  const blockedHead = new Set<number>();
  for (const p of prevs)
    for (let i = 0; i < Math.min(HEAD_WINDOW, p.length); i++) blockedHead.add(p[i].id);

  const repair = (base: readonly T[]): T[] => {
    const arr = base.slice();
    const n = arr.length;
    const posBad = (i: number): boolean =>
      prevs.some((p) => i < p.length && p[i].id === arr[i].id);
    const headBad = (i: number): boolean => i < HEAD_WINDOW && blockedHead.has(arr[i].id);
    for (let iter = 0; iter < 600; iter++) {
      const bad: number[] = [];
      for (let i = 0; i < n; i++) if (posBad(i) || headBad(i)) bad.push(i);
      if (!bad.length) return arr; // নিখুঁত — শূন্য মিল
      const i = bad[Math.floor(Math.random() * bad.length)];
      // swap-পার্টনার — swap করলেই i ও j দুটো পজিশনই পরিষ্কার হয় এমন j
      let swapped = false;
      for (let t = 0; t < 40; t++) {
        const j = Math.floor(Math.random() * n);
        if (j === i) continue;
        [arr[i], arr[j]] = [arr[j], arr[i]];
        const clean = !posBad(i) && !headBad(i) && !posBad(j) && !headBad(j);
        if (clean) { swapped = true; break; }
        [arr[i], arr[j]] = [arr[j], arr[i]]; // না হলে ফিরিয়ে আনি
      }
      if (!swapped) {
        // নিখুঁত পার্টনার নেই — যেকোনো j-এর সাথে swap (progress আটকায় না)
        const j = Math.floor(Math.random() * n);
        if (j !== i) [arr[i], arr[j]] = [arr[j], arr[i]];
      }
    }
    return arr;
  };

  let best: T[] | null = null;
  let bestScore = Number.POSITIVE_INFINITY;
  for (let attempt = 0; attempt < 10; attempt++) {
    const arr = repair(shuffled(pool));
    if (seenKeys.has(orderKey(arr))) continue; // ডুপ্লিকেট সেট — নতুন করে
    const sc = prevs.reduce((acc, p) => acc + positionalCollisions(p, arr), 0);
    if (sc < bestScore) {
      best = arr;
      bestScore = sc;
      if (sc === 0) break; // নিখুঁত ক্রম পাওয়া গেছে
    }
  }
  return best ?? shuffled(pool);
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
  // অন্য সেটগুলোর id-ক্রম — duplicate-এড়ানোর পাশাপাশি এদের সাথে পজিশন-মিলও কমানো হয়
  // (রিশাফল করা সেট A-র ১–৫-এ যে প্রশ্ন, অন্য কোনো সেটের ১–৫-এও সেটা বসবে না)
  const otherIds = others.map(idsOfKey).filter((ids) => ids.length > 0);
  /** ক্যান্ডিডেট ক্রমের সব অন্য সেটের সাথে মোট পজিশন-মিল */
  const collisionOf = (cand: readonly T[]): number => {
    let sc = 0;
    for (const ids of otherIds) {
      const n = Math.min(ids.length, cand.length);
      for (let i = 0; i < n; i++) if (ids[i] === cand[i].id) sc++;
    }
    return sc;
  };
  if (cur.length <= 8) {
    const perms = allPermutations(cur).filter((p) => !seen.has(orderKey(p)));
    if (perms.length) {
      // distinct হওয়া নিশ্চিত (filter) — এর মধ্যে পজিশন-মিল সবচেয়ে কম ক্রমগুলো
      // থেকে এলোমেলোভাবে একটা নেওয়া হয়
      const scored = perms.map((p) => ({ p, sc: collisionOf(p) }));
      const minSc = Math.min(...scored.map((x) => x.sc));
      const bests = scored.filter((x) => x.sc === minSc).map((x) => x.p);
      return shuffled(bests)[0];
    }
    return cur; // সব সম্ভাব্য ক্রম already ব্যবহৃত
  }
  // বড় পুল: কনস্ট্রাকটিভ রিপেয়ার — পজিশন-মিল/হেড-উইন্ডো শূন্যে নামানো হয়
  // (prevs এখানে শুধু id-ক্রমের placeholder — buildDistinctOrder শুধু .id পড়ে,
  // তাই id-অবজেক্ট অ্যারেকে T[] হিসেবে cast করা নিরাপদ)
  const prevs = otherIds.map((ids) => ids.map((id) => ({ id })) as unknown as T[]);
  return buildDistinctOrder(cur, prevs, seen);
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
