// ============================================================
// Mode Meta — ৩ কাজ-মোডের এক রেজিস্ট্রি (ট্যাব / ওয়ার্ক-বার / next-modes সব এখান থেকে পড়ে)
// ============================================================

import { Dices, FileOutput, ListOrdered, type LucideIcon } from "lucide-react";

export type McqMode = "shuffle" | "serial" | "redownload";

export interface ModeMeta {
  id: McqMode;
  /** মোডের ইমোজি (ওয়ার্ক-বারের টাইটেল) */
  emoji: string;
  /** "MCQ শাফল" — মূল নাম */
  title: string;
  /** "🔀 MCQ শাফল" — ট্যাব/next-modes বাটনের টেক্সট */
  tabTitle: string;
  /** ট্যাব/next-modes-এর ছোট বর্ণনা */
  description: string;
  /** aria-label ("শাফল মোড") */
  ariaLabel: string;
  /** lucide আইকন-কম্পোনেন্ট */
  Icon: LucideIcon;
}

export const MODE_META: Record<McqMode, ModeMeta> = {
  shuffle: {
    id: "shuffle",
    emoji: "🔀",
    title: "MCQ শাফল",
    tabTitle: "🔀 MCQ শাফল",
    description: "প্রশ্ন শাফল + সেট তৈরি",
    ariaLabel: "শাফল মোড",
    Icon: Dices,
  },
  serial: {
    id: "serial",
    emoji: "🔢",
    title: "MCQ সিরিয়াল",
    tabTitle: "🔢 MCQ সিরিয়াল",
    description: "রঙ-অনুযায়ী নম্বর বসানো",
    ariaLabel: "সিরিয়াল মোড",
    Icon: ListOrdered,
  },
  redownload: {
    id: "redownload",
    emoji: "📥",
    title: "MCQ রিডাউনলোড",
    tabTitle: "📥 MCQ রিডাউনলোড",
    description: "অংশ বাছাই করে নতুন ফাইল",
    ariaLabel: "রিডাউনলোড মোড",
    Icon: FileOutput,
  },
};

/** মোড-তালিকা (ট্যাব/next-modes-এর রেন্ডার-অর্ডার) */
export const MODE_IDS = Object.keys(MODE_META) as McqMode[];
