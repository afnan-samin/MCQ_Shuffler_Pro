import type { Metadata } from "next";
import { Geist, Geist_Mono, Noto_Sans_Bengali, Noto_Serif_Bengali } from "next/font/google";
import localFont from "next/font/local";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { themeCss } from "@/config/theme-css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const notoBengali = Noto_Sans_Bengali({
  variable: "--font-bengali",
  subsets: ["bengali"],
});

/* Noto Serif Bengali — the site's main premium font (Google Fonts, self-hosted
   at build time by next/font; works on GitHub Pages subpaths too) */
const displaySerif = Noto_Serif_Bengali({
  variable: "--font-display",
  subsets: ["bengali", "latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

/* SutonnyMJ — web font for rendering legacy Bijoy (ANSI) text */
const sutonny = localFont({
  src: "../../public/fonts/SutonnyMJ.woff",
  variable: "--font-sutonny",
  display: "swap",
});

export const metadata: Metadata = {
  title: "MCQ Shuffler Pro — Free MCQ Shuffler & Exam Set Generator",
  description:
    "Shuffle MCQ questions into multiple sets, or keep all questions per set (Original Shuffle). Word-by-word Bijoy/Unicode/English detection, serial detection & auto-fix. Noto Serif Bengali + Bijoy (SutonnyMJ) font support, Word (.docx) export — one set per page, plain-text serials. Completely free.",
  keywords: ["MCQ shuffle", "MCQ set maker", "Original Shuffle", "Bijoy font", "SutonnyMJ", "Bengali MCQ", "exam set generator", "question shuffle", "Word export"],
  // favicon: src/app/icon.svg|icon.png|apple-icon.png — auto-served by App Router (with basePath)
  openGraph: {
    title: "MCQ Shuffler Pro",
    description: "MCQ shuffle, set building & serial detection — completely free",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    /* All next/font CSS variables live on <html> (=:root) so the injected
       theme tokens (--st-font-*, from src/config/theme.ts) can reference
       them. Do not move them back to <body>. */
    <html
      lang="en"
      suppressHydrationWarning
      className={`${displaySerif.variable} ${sutonny.variable} ${geistSans.variable} ${geistMono.variable} ${notoBengali.variable}`}
    >
      <body className="antialiased bg-background text-foreground">
        {/* Site theme tokens (fonts/colors/radius/popups) — generated from
            src/config/theme.ts, the ONE place that controls the whole look. */}
        <style dangerouslySetInnerHTML={{ __html: themeCss }} />
        {children}
        <Toaster />
      </body>
    </html>
  );
}
