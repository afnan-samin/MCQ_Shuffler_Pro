import type { Metadata } from "next";
import { Geist, Geist_Mono, Noto_Sans_Bengali } from "next/font/google";
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

export const metadata: Metadata = {
  title: "MCQ Shuffler Pro — MCQ শাফল ও সেট তৈরির ফ্রি টুল",
  description:
    "MCQ প্রশ্ন শাফল করুন, একাধিক সেটে ভাগ করুন, সিরিয়াল ডিটেক্ট ও অটো-ফিক্স করুন। Bijoy ও Unicode বাংলা ফন্ট সাপোর্ট, Word (.docx) এক্সপোর্ট — প্রতি সেট আলাদা পেজে। একদম ফ্রি।",
  keywords: ["MCQ shuffle", "MCQ set maker", "Bijoy font", "বাংলা MCQ", "exam set generator", "question shuffle", "Word export"],
  icons: {
    icon: "https://z-cdn.chatglm.cn/z-ai/static/logo.svg",
  },
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
    <html lang="bn" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${notoBengali.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
