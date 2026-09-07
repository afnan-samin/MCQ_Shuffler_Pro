# MCQ Shuffler Pro — Free MCQ Shuffler & Exam Set Generator

A completely free web tool that shuffles MCQ questions into multiple exam sets. It reads questions from Word (.docx), text and CSV files, detects and auto-fixes serial numbers, and exports exam-ready Word files. **100% client-side** — no file ever leaves your browser.

## Key features

- **Shuffle + set building** — Fisher-Yates shuffle; multiple sets with interleaved / chunk / random distributions, or all questions in every set (Original Shuffle)
- **Color serial** — serializes questions per colored header section; per-file serial schemes with merge/ZIP export
- **Multi-file merge + ZIP** — process several .docx files at once and download one merged .docx or a ZIP of separate files
- **Redownload** — pick questions/parts (serial, question, options, answer, explanation) from uploaded files into a new .docx
- **Bijoy ↔ Unicode detection** — word-by-word detection of Bijoy (ANSI) / Unicode Bengali / English with color preview; broken-serial detection + one-click auto-fix
- **Reference tags** — keep, strip, or move `[CU-A: 22-23]`-style source tags when shuffling
- **Privacy** — the whole pipeline runs in the browser; no API routes, no uploads

## Local development

```bash
bun install
bun run dev        # http://localhost:3000
```

## Tech stack

Next.js 16 (App Router, Turbopack) + Tailwind CSS v4 + shadcn/ui + TypeScript. Fonts: Kalpurush and SutonnyMJ (embedded via `next/font/local`).

## Notes for developers

- The UI is English, but **functional Bengali stays**: the parser understands Bengali exam markers (`১.`, `ক)`, `উত্তর`, `উঃ`), Bengali digits (`০১২৩৪৫৬৭৮৯`), and output .docx files keep Bengali set-name styles (`সেট A/ক/১`) and `উত্তরমালা` headers — these are product decisions.
- Unit tests live in `scripts/test-*.ts` (run with `bun run scripts/test-mcq.ts` etc.); browser E2E scripts are `scripts/e2e-*.ts` and expect the dev server on `localhost:3000`.
