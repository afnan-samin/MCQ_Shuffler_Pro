// ============================================================
// Serial-Paste — সিরিয়াল মোডের পেস্ট-পাইপলাইনের হেল্পার
// পেস্ট = টেক্সট পাইপলাইন (docx-প্রিজার্ভ লাগে না):
//   parseMcq → renumberQuestionsByPosition → exportDocx (এক সেট)
// ============================================================

import { formatNumberByScript, type McqQuestion } from "./parser";

/**
 * পেস্ট-মোডের প্রশ্নগুলো পজিশন-অনুযায়ী ১..N রিনাম্বার করে নতুন
 * McqQuestion[] রিটার্ন করে (অরিজিনাল অ্যারে mutate হয় না)।
 *
 * প্রথম লাইনের লিডিং নম্বর-টোকেন প্রশ্নের নিজের স্ক্রিপ্টে (bn/en)
 * প্রতিস্থাপিত হয় — parser-এর autoFixNumbering-এর হুবহু প্যাটার্ন:
 * rawPrefix বাদ দিয়ে "নম্বর + সেপারেটর (fallback ".") + স্পেস" বসানো।
 */
export function renumberQuestionsByPosition(
  questions: McqQuestion[],
  startFrom = 1
): McqQuestion[] {
  return questions.map((q, i) => {
    const script: "bn" | "en" = q.numberScript === "bn" ? "bn" : "en";
    const token = formatNumberByScript(startFrom + i, script) + (q.separator || ".") + " ";
    const firstLine = q.lines[0];
    const rest = firstLine.slice(q.rawPrefix.length);
    return { ...q, lines: [token + rest, ...q.lines.slice(1)] };
  });
}
