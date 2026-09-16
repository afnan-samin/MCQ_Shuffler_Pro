// ============================================================
// Duplicate-question detection — একাধিক ফাইল merge করার আগে হুবহু/
// কাছাকাছি প্রশ্ন flag করার জন্য (Phase 3 #9)।
// ============================================================

import type { DocxQuestion } from "./docx-xml";

export interface DuplicateHit {
  fileId: string;
  fileName: string;
  questionId: number;
  qText: string;
}

/** একটা ডুপ্লিকেট-গ্রুপ — একই কি-র (নরমালাইজড প্রশ্ন + অপশন) একাধিক ফাইলে পাওয়া */
export interface DuplicateGroup {
  /** নরমালাইজড কি — টুলটিপ/ডিবাগে দেখানো যায় */
  key: string;
  questions: DuplicateHit[];
}

/** হুবহু-মিলের জন্য নরমালাইজেশন — ছোট হাতের, whitespace এক-স্পেসে, প্রান্ত-ট্রিম */
export function normalizeForDup(t: string): string {
  return t
    .toLowerCase()
    .replace(/[\u00a0\u2000-\u200b\t ]+/g, " ")
    .replace(/\s+$/g, "")
    .trim();
}

/**
 * একাধিক ফাইলের প্রশ্নের মধ্যে ডুপ্লিকেট খোঁজে। সাদা-space/কেস-স্বাধীন তুলনা;
 * প্রশ্ন-টেক্সট + (থাকলে) অপশন-টেক্সটসহ মিলানো হয়। ২ বা তার বেশি জায়গায়
 * একই কি-র প্রশ্ন থাকলে একটা গ্রুপ হয় — সবচেয়ে বেশি ম্যাচ আগে।
 * Text-mode-এর McqQuestion-ও একই ক্ষেত্র রাখে, তাই generic: যেকোনো
 * { qText, options: [{ text }] } আকারের প্রশ্নই চলে।
 */
export function findDuplicateQuestions<T extends { id: number; qText: string; options: Array<{ text: string }> }>(
  items: Array<{ fileId: string; fileName: string; questions: T[] }>
): DuplicateGroup[] {
  const byKey = new Map<string, DuplicateHit[]>();
  for (const it of items) {
    for (const q of it.questions) {
      const key = normalizeForDup(q.qText);
      if (!key) continue; // খালি প্রশ্ন — মিল বাদ
      const optsKey = q.options.map((o) => o.text).join(" | ");
      const fullKey = optsKey.trim() ? `${key} :: ${normalizeForDup(optsKey)}` : key;
      const arr = byKey.get(fullKey) ?? [];
      arr.push({ fileId: it.fileId, fileName: it.fileName, questionId: q.id, qText: q.qText });
      byKey.set(fullKey, arr);
    }
  }
  const groups: DuplicateGroup[] = [];
  for (const [key, arr] of byKey) {
    if (arr.length > 1) groups.push({ key, questions: arr });
  }
  groups.sort((a, b) => b.questions.length - a.questions.length);
  return groups;
}