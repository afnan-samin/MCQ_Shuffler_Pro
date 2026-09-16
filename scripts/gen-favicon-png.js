/**
 * Generate PNG favicons from src/app/icon.svg
 *  - icon.png       → 512x512 (fallback favicon)
 *  - apple-icon.png → 180x180 (iOS home screen)
 * Next.js App Router auto-serves these with the correct basePath.
 */
import sharp from "sharp";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const svg = readFileSync(join(ROOT, "src/app/icon.svg"));

const targets = [
  { out: join(ROOT, "src/app/icon.png"), size: 512 },
  { out: join(ROOT, "src/app/apple-icon.png"), size: 180 },
];

for (const t of targets) {
  await sharp(svg, { density: 512 }).resize(t.size, t.size).png().toFile(t.out);
  console.log(`✅ ${t.out} (${t.size}x${t.size})`);
}
