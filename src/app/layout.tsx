import type { Metadata } from "next";
import { Geist, Geist_Mono, Noto_Sans_Bengali } from "next/font/google";
import localFont from "next/font/local";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

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
  title: "MCQ Shuffler Pro — MCQ শাফল ও সেট তৈরির ফ্রি টুল",
  description:
    "MCQ প্রশ্ন শাফল করুন, একাধিক সেটে ভাগ বা প্রতি সেটে সব প্রশ্ন (Original Shuffle) করুন। শব্দ ধরে ধরে Bijoy/ইউনিকোড/English ডিটেক্টর, সিরিয়াল ডিটেক্ট ও অটো-ফিক্স। Kalpurush + Bijoy (SutonnyMJ) ফন্ট সাপোর্ট, Word (.docx) এক্সপোর্ট — প্রতি সেট আলাদা পেজে, প্লেইন টেক্সট সিরিয়াল। একদম ফ্রি।",
  keywords: ["MCQ shuffle", "MCQ set maker", "Original Shuffle", "Bijoy font", "SutonnyMJ", "Kalpurush", "বাংলা MCQ", "exam set generator", "question shuffle", "Word export"],
  // favicon: src/app/icon.svg|icon.png|apple-icon.png — App Router অটো-সার্ভ করে (basePath-সহ)
  openGraph: {
    title: "MCQ Shuffler Pro",
    description: "MCQ শাফল, সেট তৈরি ও সিরিয়াল ডিটেক্ট — একদম ফ্রি",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="bn"
      suppressHydrationWarning
      className={`${kalpurush.variable} ${sutonny.variable}`}
    >
      <body
        className={`${geistSans.variable} ${notoBengali.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
