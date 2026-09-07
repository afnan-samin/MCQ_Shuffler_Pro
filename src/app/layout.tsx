import type { Metadata } from "next";
import { Geist, Geist_Mono, Noto_Sans_Bengali } from "next/font/google";
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

/* Kalpurush — সাইটের মূল ফন্ট (next/font/local দিয়ে এমবেড; GitHub Pages সাবপাথেও কাজ করে) */
const kalpurush = localFont({
  src: "../../public/fonts/kalpurush.woff2",
  variable: "--font-kalpurush",
  display: "swap",
});

/* SutonnyMJ — Bijoy (ANSI লিগ্যাসি) টেক্সট ওয়েবে দেখানোর ওয়েব-ফন্ট */
const sutonny = localFont({
  src: "../../public/fonts/SutonnyMJ.woff",
  variable: "--font-sutonny",
  display: "swap",
});

export const metadata: Metadata = {
  title: "MCQ Shuffler Pro — Free MCQ Shuffler & Exam Set Generator",
  description:
    "Shuffle MCQ questions into multiple sets, or keep all questions per set (Original Shuffle). Word-by-word Bijoy/Unicode/English detection, serial detection & auto-fix. Kalpurush + Bijoy (SutonnyMJ) font support, Word (.docx) export — one set per page, plain-text serials. Completely free.",
  keywords: ["MCQ shuffle", "MCQ set maker", "Original Shuffle", "Bijoy font", "SutonnyMJ", "Kalpurush", "বাংলা MCQ", "exam set generator", "question shuffle", "Word export"],
  // favicon: src/app/icon.svg|icon.png|apple-icon.png — App Router অটো-সার্ভ করে (basePath-সহ)
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
      className={`${kalpurush.variable} ${sutonny.variable} ${geistSans.variable} ${geistMono.variable} ${notoBengali.variable}`}
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
