// HSC নমুনা ফাইলে রঙ-বিশ্লেষণ প্রোব
import { readFileSync } from "node:fs";
import JSZip from "jszip";
import { analyzeColorDocx } from "../src/lib/mcq/color-serial";

const buf = readFileSync("/home/z/my-project/public/sample/hsc27-physics-bijoy.docx");
const zip = await JSZip.loadAsync(buf);
const xml = await zip.file("word/document.xml")!.async("string");
const an = analyzeColorDocx(xml);
console.log("colors:", an.colors.map((c) => `${c.name}(${c.hex})x${c.sections}`));
console.log("shadedCount:", an.shadedCount, "questionCount:", an.questionCount);
