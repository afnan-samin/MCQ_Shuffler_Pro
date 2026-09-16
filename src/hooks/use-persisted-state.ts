"use client";

import { useCallback, useEffect, useState } from "react";

/** localStorage পড়া — কোটা/প্রাইভেসি-মোডে নীরবে null (আগের আচরণ হুবহু)। */
function readStored(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** localStorage লেখা — ব্যর্থ হলে নীরবে উপেক্ষা (আগের আচরণ হুবহু)। */
function writeStored(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // কোটা/প্রাইভেসি-মোড — নীরবে উপেক্ষা
  }
}

/**
 * String-ভ্যালুর persisted state — প্রথম রেন্ডারে ডিফল্ট (SSR-নিরাপদ),
 * মাউন্টের পর একবার localStorage থেকে হাইড্রেট; setter state + storage দুটোতেই লেখে।
 */
export function usePersistedString<T extends string>(
  key: string,
  initialValue: T,
  isValid?: (raw: string) => raw is T
): [T, (v: T) => void] {
  const [value, setValue] = useState<T>(initialValue);
  useEffect(() => {
    const raw = readStored(key);
    // localStorage-hydration মাউন্টের পরেই হতে হবে (SSR/SSG প্রথম-রেন্ডার ডিফল্ট থাকে) —
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (raw !== null && (!isValid || isValid(raw))) setValue(raw as T);
  }, [key]);
  const commit = useCallback(
    (v: T) => {
      setValue(v);
      writeStored(key, v);
    },
    [key]
  );
  return [value, commit];
}

/**
 * Object-ভ্যালুর persisted state (JSON) — ভাঙা JSON হলে ডিফল্টই থাকে;
 * sanitize থাকলে পুরনো/হাতে-এডিট করা সেভ গার্ড করে ফেরায়।
 */
export function usePersistedJson<T>(
  key: string,
  initialValue: T,
  sanitize?: (raw: unknown) => T
): [T, (v: T) => void] {
  const [value, setValue] = useState<T>(initialValue);
  useEffect(() => {
    const raw = readStored(key);
    if (!raw) return;
    try {
      const parsed: unknown = JSON.parse(raw);
      // localStorage-hydration মাউন্টের পরেই হতে হবে (SSR/SSG প্রথম-রেন্ডার ডিফল্ট থাকে) —
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setValue(sanitize ? sanitize(parsed) : (parsed as T));
    } catch {
      // ভাঙা JSON — ডিফল্টেই থাকুক
    }
  }, [key]);
  const commit = useCallback(
    (v: T) => {
      setValue(v);
      try {
        writeStored(key, JSON.stringify(v));
      } catch {
        // JSON.stringify ব্যর্থ — state তবু আপডেট থাকে
      }
    },
    [key]
  );
  return [value, commit];
}
