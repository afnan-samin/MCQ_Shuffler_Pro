// ============================================================
// Option Labels unit tests — লেবেল-টোকেন শনাক্ত + রিলেবেল
// রান: bun run scripts/test-option-labels.ts
// ============================================================

import { JSDOM } from "jsdom";

// ---- ব্রাউজার DOM API emulation (jsdom) ----
const dom = new JSDOM("<!doctype html><html><body></body></html>");
(globalThis as unknown as Record<string, unknown>).DOMParser = dom.window.DOMParser;
(globalThis as unknown as Record<string, unknown>).XMLSerializer = dom.window.XMLSerializer;
(globalThis as unknown as Record<string, unknown>).Node = dom.window.Node;

const {
  relabelOptionPara,
  sanitizeOptionLabelSettings,
  DEFAULT_OPTION_LABEL_SETTINGS,
} = await import("../src/lib/mcq/option-labels");
import type { OptionLabelSettings } from "../src/lib/mcq/option-labels";

let passed = 0;
let failed = 0;
function ok(cond: boolean, name: string) {
  if (cond) {
    passed++;
    console.log("  ✓", name);
  } else {
    failed++;
    console.error("  ✗ FAIL:", name);
  }
}

const W_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";

/** মিনিমাল options-প্যারা XML → Element */
function paraOf(runs: string[]): Element {
  const inner = runs
    .map((t) => `<w:r><w:t xml:space="preserve">${t}</w:t></w:r>`)
    .join("");
  const xml = `<w:p xmlns:w="${W_NS}">${inner}</w:p>`;
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  if (doc.getElementsByTagName("parsererror").length) {
    throw new Error("fixture XML parse error");
  }
  return doc.documentElement;
}

/** রিলেবেল করে ফলাফল প্যারার পুরো টেক্সট */
function relabel(runs: string[], s: OptionLabelSettings): string {
  const p = paraOf(runs);
  relabelOptionPara(p, s);
  return p.textContent ?? "";
}

const A_DOT: OptionLabelSettings = { enabled: true, style: "A", separator: "." };
const KA_BR: OptionLabelSettings = { enabled: true, style: "ka", separator: ")" };
const KA_DOT: OptionLabelSettings = { enabled: true, style: "ka", separator: "." };
const A_BR: OptionLabelSettings = { enabled: true, style: "A", separator: ")" };
const I_DOT: OptionLabelSettings = { enabled: true, style: "i", separator: "." };
const A_LOWER: OptionLabelSettings = { enabled: true, style: "a", separator: "." };
const OFF: OptionLabelSettings = { ...A_DOT, enabled: false };

console.log("\n── বেসিক রিলেবেল ──");
ok(relabel(["ক. পানির ঘনত্ব"], A_DOT) === "A. পানির ঘনত্ব", "ক. → A. (এক রান)");
ok(relabel(["খ) কচু শাক"], A_DOT) === "B. কচু শাক", "খ) → B. (সেপারেটর আলাদা চয়েস)");
ok(relabel(["(ক) এক (খ) দুই"], A_DOT) === "A. এক B. দুই", "(ক) paren → A.");
ok(relabel(["[a] x [b] y"], KA_DOT) === "ক. x খ. y", "[a] bracket → ক. (ব্র্যাকেটসহ টোকেন বদলায়)");
ok(relabel(["a. লবণ b. চিনি"], KA_DOT) === "ক. লবণ খ. চিনি", "a./b. → ক./খ.");
ok(relabel(["A. x B. y C. z"], KA_BR) === "ক) x খ) y গ) z", "A./B./C. → ক)/খ)/গ)");
ok(relabel(["A. x B. y"], I_DOT) === "i. x ii. y", "A./B. → i./ii. (রোমান)");
ok(relabel(["A. x C. y"], KA_DOT) === "ক. x গ. y", "ইনডেক্স-ম্যাপিং (C → গ)");
ok(relabel(["ক. x"], A_LOWER) === "a. x", "ক. → a. (লোয়ার-ল্যাটিন)");

console.log("\n── এক লাইনে একাধিক অপশন ──");
ok(relabel(["ক. X\tখ. Y\tগ. Z"], A_DOT) === "A. X\tB. Y\tC. Z", "ট্যাব-সেপারেটেড ৩ অপশন");
ok(relabel(["(a) one (b) two"], A_BR) === "A) one B) two", "paren দুটো একসাথে");
ok(relabel(["ক) খ) গ) ঘ)"], A_DOT) === "A. B. C. D.", "খালি-লেবেল সারি");

console.log("\n── বাউন্ডারি-গার্ড (শব্দের ভিতরের অক্ষর) ──");
ok(relabel(["Md. Rahim a. x"], A_DOT) === "Md. Rahim A. x", '"Md." অক্ষত, "a." বদলায়');
ok(relabel(["U.S.A. map"], A_DOT) === "U.S.A. map", '"U.S.A." অক্ষত');
ok(relabel(["CO2. টেক্সট"], A_DOT) === "CO2. টেক্সট", '"CO2." অক্ষত (ডিজিট-পূর্ব)');
ok(relabel(["12.5 a) x"], A_DOT) === "12.5 A. x", '"12.5" অক্ষত, "a)" বদলায়');

console.log("\n── মাল্টি-রান (লেবেল রান-ভাগে ভাগ হয়ে থাকলে) ──");
ok(relabel(["ক", ". পানি"], A_DOT) === "A. পানি", 'লেবেল ২ রানে ("ক" + ". পানি")');
ok(relabel(["(ক", ") এক"], A_DOT) === "A. এক", "paren-লেবেল ২ রানে");
ok(relabel(["ক. ", "খ. ", "গ. "], A_DOT) === "A. B. C. ", "৩ রান ৩ লেবেল");

console.log("\n── OFF/ডিফল্ট ──");
ok(relabel(["ক. পানি"], OFF) === "ক. পানি", "enabled:false → অপরিবর্তিত");
ok(relabel(["ক. পানি"], DEFAULT_OPTION_LABEL_SETTINGS) === "ক. পানি", "ডিফল্ট (OFF) → অপরিবর্তিত");
ok(relabel(["উত্তর: ক"], A_DOT) === "উত্তর: ক", "উত্তর-লাইন ধরা হয় না");

console.log("\n── sanitize ──");
ok(sanitizeOptionLabelSettings({ enabled: true, style: "X", separator: ";" }).style === "A", "অজানা style → ডিফল্ট A");
ok(sanitizeOptionLabelSettings({ enabled: true, style: "ka", separator: ";" }).separator === ".", "অজানা separator → ডিফল্ট .");
ok(sanitizeOptionLabelSettings({ style: "i", separator: ")" }).separator === ")", "i + ) স্যানিটাইজে রক্ষা");
ok(sanitizeOptionLabelSettings(null).enabled === false, "null → ডিফল্ট (OFF)");
ok(sanitizeOptionLabelSettings({ enabled: true, style: "ka", separator: ")" }).enabled === true, "ভ্যালিড সেটিংস রক্ষা");

console.log("\n── w:tab-এলিমেন্ট + ডট-ছাড়া লেবেল + Bijoy-এনকোডিং ──");
/** রান-লেভেল <w:tab/>-সহ প্যারা (আসল ফাইলের মত — ট্যাব w:t-তে অদৃশ্য) */
function paraRunsXml(runs: string[]): Element {
  const xml = `<w:p xmlns:w="${W_NS}">${runs.join("")}</w:p>`;
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  if (doc.getElementsByTagName("parsererror").length) {
    throw new Error("fixture XML parse error");
  }
  return doc.documentElement;
}
const T = (text: string, font?: string) =>
  font
    ? `<w:r><w:rPr><w:rFonts w:ascii="${font}" w:hAnsi="${font}" w:cs="${font}" w:eastAsia="${font}"/></w:rPr><w:t xml:space="preserve">${text}</w:t></w:r>`
    : `<w:r><w:t xml:space="preserve">${text}</w:t></w:r>`;
const TAB = `<w:r><w:tab/></w:r>`;
function relabelXml(runs: string[], s: OptionLabelSettings): { text: string; xml: string } {
  const p = paraRunsXml(runs);
  const n = relabelOptionPara(p, s);
  return { text: p.textContent ?? "", xml: new XMLSerializer().serializeToString(p) + `||${n}` };
}
// মাঝ-সারির লেবেল (w:tab-এর পরে): দুটোই বদলায় — আগে ২য়টা বাদ পড়ত
// (textContent-এ w:tab-এলিমেন্ট আসে না, তাই দুই লেবেলের উপস্থিতি দেখা হয়)
{
  const p = paraRunsXml([T("A. x"), TAB, T("B. y")]);
  const n = relabelOptionPara(p, KA_DOT);
  const t = p.textContent ?? "";
  ok(n === 2 && t.includes("ক.") && t.includes("খ."), `w:tab-পরের "B." ও বদলায় (n=${n}, পেয়েছি ${JSON.stringify(t)})`);
}
// ডট-ছাড়া সারি-শুরু লেবেল ("A ivB" টাইপো): সেপারেটর বসে
// (textContent-এ w:tab-এলিমেন্ট আসে না)
{
  const r = relabelXml([TAB, T("A ivB")], A_DOT);
  ok(r.text === "A. ivB", `ডট-ছাড়া "A ivB" → "A. ivB" (পেয়েছি ${JSON.stringify(r.text)})`);
}
// Bijoy-ফন্ট রানে Bangla-স্টাইল → Bijoy-ASCII (SutonnyMJ-তে ক দেখায়; Unicode ক গার্বেজ হতো)
{
  const r = relabelXml([T("A.", "SutonnyMJ")], KA_DOT);
  ok(r.text === "K." && !/[\u0980-\u09FF]/.test(r.xml), `SutonnyMJ-রানে "A." → "K." (Unicode নয়)`);
  const r2 = relabelXml([T("K.", "SutonnyMJ")], KA_DOT);
  ok(r2.text === "K.", `SutonnyMJ-রানে "K." অপরিবর্তিত (ইতিমধ্যে ক)`);
}
// Bijoy-ফন্ট না হলে Bangla-স্টাইল → Unicode (আগের আচরণ)
{
  const r = relabelXml([T("A.", "Times New Roman")], KA_DOT);
  ok(r.text === "ক.", `Times-রানে "A." → "ক." Unicode`);
}

// ---------- ফলাফল ----------
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);