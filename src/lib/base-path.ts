/**
 * GitHub Pages প্রজেক্ট-সাইটের সাবপাথ (যেমন /mcq-shuffler-pro) বিল্ড-টাইমে ইনলাইন হয়।
 * রুট-ডোমেইনে ডিপ্লয় (username.github.io) বা লোকাল ডেভে BASE_PATH = "" — আচরণ অপরিবর্তিত।
 */
export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

/** পাবলিক-অ্যাসেট/লিংকের আপেক্ষিক পাথে basePath প্রিফিক্স বসায় */
export const withBase = (p: string) => `${BASE_PATH}${p}`;
