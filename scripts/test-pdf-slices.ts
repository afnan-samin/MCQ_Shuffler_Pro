// PDF পেজ-স্লাইস কাট-স্ন্যাপিং টেস্ট — টেক্সট-লাইনের মাঝে কাট পড়ে ছিঁড়বে না
// রান: bun run scripts/test-pdf-slices.ts (DOM লাগে না — ভুয়া canvas stub)
import { sliceCountOf, snapSliceCut } from "../src/lib/mcq/pdf-export";

let pass = 0;
let fail = 0;
const ok = (cond: boolean, name: string, extra = "") => {
  if (cond) {
    pass++;
    console.log(`  ✓ ${name}`);
  } else {
    fail++;
    console.log(`  ✗ FAIL: ${name} ${extra}`);
  }
};

// ---- ভুয়া canvas: gapRows-এর সারি সাদা (255), বাকি সব কালো (0) ----
type FakeCtx = { getImageData: (x: number, y: number, w: number, h: number) => { data: Uint8ClampedArray } };
function fakeCanvas(w: number, h: number, gapRows: Set<number>, ctxImpl?: FakeCtx | null | "throw") {
  return {
    width: w,
    height: h,
    getContext: (_type: string, _opts?: unknown) => {
      if (ctxImpl === "throw") throw new Error("tainted");
      if (ctxImpl === null || ctxImpl === undefined) return ctxImpl ?? null;
      return ctxImpl;
    },
  } as unknown as HTMLCanvasElement;
}
function ctxWithGaps(w: number, gapRows: Set<number>): FakeCtx {
  return {
    getImageData: (_x: number, y: number, ww: number, _h: number) => {
      const data = new Uint8ClampedArray(ww * 4);
      const v = gapRows.has(y) ? 255 : 0;
      data.fill(v);
      return { data };
    },
  };
}
const gapSet = (rows: number[]) => new Set(rows);

console.log("== sliceCountOf ==");
ok(sliceCountOf(100, 100) === 1, "A4-অনুপাতে ছোট canvas → ১ পেজ");
ok(sliceCountOf(100, 142) === 2, "উচ্চতা A4-অনুপাত ছাড়ালে → ২ পেজ (100×1.414=141.4)");
ok(sliceCountOf(100, 300) === 3, "লম্বা canvas → ceil(h/pageSliceH)");

console.log("== snapSliceCut: গ্যাপে স্ন্যাপ ==");
{
  // ideal=500, 520-তে সাদা গ্যাপ (জোড় সারি — ২-স্টেপ স্ক্যানে ধরা পড়ে)
  const gaps = gapSet([520]);
  const c = fakeCanvas(100, 1000, gaps, ctxWithGaps(100, gaps));
  ok(snapSliceCut(c, 500) === 520, "ideal-এর ২০px নিচের গ্যাপে স্ন্যাপ", `got ${snapSliceCut(c, 500)}`);
}
{
  // ideal=500, গ্যাপ 440-এ (উপরে) — নিচে কোনো গ্যাপ নেই
  const gaps = gapSet([440]);
  const c = fakeCanvas(100, 1000, gaps, ctxWithGaps(100, gaps));
  ok(snapSliceCut(c, 500) === 440, "উপরের গ্যাপেও স্ন্যাপ (ব্যান্ড ±৯০)", `got ${snapSliceCut(c, 500)}`);
}
{
  // ব্যান্ডের বাইরের গ্যাপ (ideal±৯০-এর বাইরে) — ধরা পড়বে না, ideal-ই থাকবে
  const gaps = gapSet([200]);
  const c = fakeCanvas(100, 1000, gaps, ctxWithGaps(100, gaps));
  ok(snapSliceCut(c, 500) === 500, "ব্যান্ডের বাইরের গ্যাপ উপেক্ষা → ideal", `got ${snapSliceCut(c, 500)}`);
}

console.log("== snapSliceCut: ফলব্যাক ==");
{
  // পুরো canvas টেক্সট (গ্যাপ শূন্য) → ideal
  const gaps = gapSet([]);
  const c = fakeCanvas(100, 1000, gaps, ctxWithGaps(100, gaps));
  ok(snapSliceCut(c, 500) === 500, "ঘন টেক্সটে ideal-কাটই থাকে", `got ${snapSliceCut(c, 500)}`);
}
{
  // getContext null → ideal
  const c = fakeCanvas(100, 1000, gapSet([520]), null);
  ok(snapSliceCut(c, 500) === 500, "context null → ideal", `got ${snapSliceCut(c, 500)}`);
}
{
  // tainted canvas (throw) → ideal
  const c = fakeCanvas(100, 1000, gapSet([520]), "throw");
  ok(snapSliceCut(c, 500) === 500, "tainted canvas → ideal", `got ${snapSliceCut(c, 500)}`);
}
{
  // সীমা: ideal canvas-এর বাইরে → clamp
  const gaps = gapSet([520]);
  const c = fakeCanvas(100, 1000, gaps, ctxWithGaps(100, gaps));
  ok(snapSliceCut(c, -50) === 0, "ঋণাত্মক ideal → ০", `got ${snapSliceCut(c, -50)}`);
  ok(snapSliceCut(c, 5000) === 1000, "উচ্চতা-ছাড়ানো ideal → h", `got ${snapSliceCut(c, 5000)}`);
}

console.log(`\n==== PDF স্লাইস টেস্ট: ${pass} পাস, ${fail} ফেল ====`);
process.exit(fail ? 1 : 0);
