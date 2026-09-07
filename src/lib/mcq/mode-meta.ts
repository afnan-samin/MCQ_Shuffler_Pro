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
    title: "MCQ Shuffle",
    tabTitle: "🔀 MCQ Shuffle",
    description: "Shuffle questions + build sets",
    ariaLabel: "Shuffle mode",
    Icon: Dices,
  },
  serial: {
    id: "serial",
    emoji: "🔢",
    title: "MCQ Serial",
    tabTitle: "🔢 MCQ Serial",
    description: "Color-based numbering",
    ariaLabel: "Serial mode",
    Icon: ListOrdered,
  },
  redownload: {
    id: "redownload",
    emoji: "📥",
    title: "MCQ Redownload",
    tabTitle: "📥 MCQ Redownload",
    description: "Pick parts into a new file",
    ariaLabel: "Redownload mode",
    Icon: FileOutput,
  },
};

/** মোড-তালিকা (ট্যাব/next-modes-এর রেন্ডার-অর্ডার) */
export const MODE_IDS = Object.keys(MODE_META) as McqMode[];
