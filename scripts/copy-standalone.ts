// ============================================================
// post-standalone copy — Windows-safe (cp -r এর বদলে)
// package.json "build": "next build && bun run scripts/copy-standalone.ts"
// GitHub Actions (ubuntu) + Windows PowerShell — দুটোতেই চলে।
// ============================================================
import { cpSync, existsSync } from "node:fs";

function copyDir(src: string, dest: string) {
  if (!existsSync(src)) {
    console.log(`[copy-standalone] skip (missing): ${src}`);
    return;
  }
  cpSync(src, dest, { recursive: true });
  console.log(`[copy-standalone] ${src} → ${dest}`);
}

copyDir(".next/static", ".next/standalone/.next/static");
copyDir("public", ".next/standalone/public");
console.log("[copy-standalone] done");