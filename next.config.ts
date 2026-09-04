import type { NextConfig } from "next";

/**
 * STATIC_EXPORT=1 হলে GitHub Pages-এর জন্য পিওর স্ট্যাটিক এক্সপোর্ট (out/ ডিরেক্টরি)।
 * নাহলে আগের মতো standalone সার্ভার-বিল্ড — স্যান্ডবক্স-প্রিভিউ অক্ষত থাকে।
 */
const isStaticExport = process.env.STATIC_EXPORT === "1";

const nextConfig: NextConfig = {
  ...(isStaticExport
    ? {
        output: "export" as const,
        images: { unoptimized: true },
        // চলমান dev-এর .next ক্যাশ যেন কলুদা না হয়
        distDir: ".next-static",
      }
    : {
        output: "standalone",
      }),
  // সব মোডে সেট — খালি হলে আচরণ অপরিবর্তিত (রুট-পাথ ডিপ্লয়)
  basePath: process.env.NEXT_PUBLIC_BASE_PATH ?? "",
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
};

export default nextConfig;
