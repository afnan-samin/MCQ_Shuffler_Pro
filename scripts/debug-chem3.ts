// chem3 ডিবাগ
const items3: Array<[kind: "h" | "q", color: string | null, text: string]> = [];
let q3 = 0;
const varsityNames = ["ঢাকা", "রাজশাহী", "চট্টগ্রাম", "খুলনা", "যবিপ্রবি", "জাবি", "ইবি", "কুবি", "রুবি", "সাবি", "নবি", "ববি"];
const chapterColor = ["111111", "222222", "333333"];
for (let ch = 0; ch < 3; ch++) {
  items3.push(["h", chapterColor[ch], `অধ্যায়-${ch + 1}`]);
  items3.push(["h", "BFBFBF", `Type-${ch + 1}`]);
  items3.push(["q", null, `${++q3}.ক-${q3}`]);
  for (let v = 0; v < 3; v++) {
    items3.push(["h", "D9D9D9", `${varsityNames[v]} বিশ্ববিদ্যালয়`]);
    items3.push(["q", null, `${++q3}.ক-${q3}`]);
  }
}

// wrapDoc/shadedP/q হেল্পার টেস্ট ফাইল থেকে কপি-স্টাইল
const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const shadedP = (text: string, fill: string) =>
  `<w:p><w:pPr><w:shd w:val="clear" w:color="auto" w:fill="${fill}"/></w:pPr><w:r><w:t>${text}</w:t></w:r></w:p>`;
const q = (text: string) => `<w:p><w:r><w:t>${text}</w:t></w:r></w:p>`;
const wrapDoc = (body: string) =>
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="${W}"><w:body>${body}<w:sectPr/></w:body></w:document>`;

const { analyzeColorDocx, planSerialByColor } = await import("../src/lib/mcq/color-serial");

const an3ch = analyzeColorDocx(wrapDoc(items3.map(([k, c, t]) => (k === "h" ? shadedP(t, c!) : q(t))).join("")));
console.log("colors:", an3ch.colors.map((c) => `${c.key}×${c.sections}`).join(", "), "| questions:", an3ch.questionCount);

for (const key of ["111111", "222222", "333333"]) {
  const plan = planSerialByColor(an3ch, { kind: "color", key });
  const nums = an3ch.paras.filter((p) => plan.has(p.idx)).map((p) => plan.get(p.idx)!);
  console.log(`plan ${key}: size=${plan.size} nums=[${nums.join(",")}]`);
}
// স্ট্যাক-সিমুলেশন ভিজ্যুয়ালাইজেশন: প্রতিটা হেডারে স্ট্যাক কী হয়
const countOf = new Map(an3ch.colors.map((c) => [c.key, c.sections] as const));
const stack: string[] = [];
const seen = new Map<string, number>();
const kids = new Map<string, Set<string>>();
for (const p of an3ch.paras) {
  if (!p.colorKey) continue;
  const C = p.colorKey;
  let at = -1;
  for (let s = stack.length - 1; s >= 0; s--) if (stack[s] === C) { at = s; break; }
  let note = "";
  if (at >= 0) {
    const cCount = countOf.get(C) ?? 0;
    let cut = at;
    for (let s = at + 1; s < stack.length; s++) if ((countOf.get(stack[s]) ?? 0) * 2 <= cCount) { cut = s + 1; break; }
    stack.length = cut;
    note = "restart";
  } else if (stack.length > 0) {
    const root = stack[0];
    const seenRoot = seen.get(root) ?? 0;
    const cN = countOf.get(C) ?? 0, rN = countOf.get(root) ?? 0;
    const hi = Math.max(cN, rN), lo = Math.min(cN, rN);
    const childEstablished = [...(kids.get(root) ?? [])].some((ch) => (seen.get(ch) ?? 0) >= 2);
    if (seenRoot === 1 && childEstablished && hi <= lo * 10) { stack.length = 0; note = "SWAP"; }
    else note = `fresh(no-swap: seenRoot=${seenRoot},est=${childEstablished},hi=${hi},lo=${lo})`;
    const parent = stack.length ? stack[stack.length - 1] : null;
    if (parent) { if (!kids.has(parent)) kids.set(parent, new Set()); kids.get(parent)!.add(C); }
  }
  seen.set(C, (seen.get(C) ?? 0) + 1);
  stack.push(C);
  if (note) console.log(`  ${C} "${p.text.slice(0, 14)}" → ${note} | stack=[${stack.join(",")}]`);
}
