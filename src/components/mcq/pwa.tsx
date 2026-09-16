"use client";

import { useEffect } from "react";

/**
 * PWA / offline রেজিস্ট্রার (Phase 3 #11)।
 * অ্যাপ ১০০% ব্রাউজারে চলে (কোনো ডেটা সার্ভারে যায় না) — একবার খুললে SW
 * ক্যাশ করে, পরেরবার অফলাইন/কম-ডেটায়ও কাজ করে। relative path ("./sw.js")
 * ব্যবহার করে যেন এটা basePath/GitHub-Pages subpath-এও ঠিক বসে; ব্যর্থ হলে
 * (এক্সটেনশন/অ-সমর্থিত ট্যাব) নীরবে বাদ যায় — অ্যাপ আগের মতই চলে।
 */
export function PwaRegistrar() {
  useEffect(() => {
    // SW রেজিস্ট্রেশন শুধু প্রোডাকশনে (ডেভ-মোডে এটা কনসোল-এরর দেখায়)।
    if (!("serviceWorker" in navigator) || !("caches" in self)) return;
    if (typeof window === "undefined") return;
    const proto = window.location.protocol;
    if (proto !== "https:" && proto !== "http:") return;
    // ডেভ-মোড স্কিপ (Next dev server সঠিকভাবে SW serve করে না)
    if (process.env.NODE_ENV !== "production") return;
    try {
      void navigator.serviceWorker.register("./sw.js").catch(() => {
        /* parse-error / scope-error — SW ছাড়াই অ্যাপ চলে */
      });
    } catch {
      /* no-op — SW-সাপোর্ট না থাকলে অ্যাপ আগের মতই চলে */
    }
  }, []);
  return null;
}