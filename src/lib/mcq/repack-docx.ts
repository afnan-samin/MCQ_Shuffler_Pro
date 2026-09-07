// ============================================================
// Repack DOCX — zip কপি + পার্ট-রিপ্লেস-এর এক কোর (সব ইঞ্জিন শেয়ার করে)
// ============================================================
// মূল নীতি: সোর্স docx-এর সব নন-ডিরেক্টরি এন্ট্রি byte-হুবহু কপি হয়; শুধু
// যে পার্টগুলো বদলানো হয় সেগুলো নতুন কনটেন্টে যায়। JSZip নিজে ফোল্ডার-এন্ট্রি
// বানায় বলে সরাসরি কপি-নির্মাণ (color-serial থেকে শুরু হওয়া প্রমাণিত প্যাটার্ন)।
// ============================================================

import JSZip from "jszip";

export const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

/**
 * docx (বা লোড-করা JSZip)-এর নির্দিষ্ট পার্ট বদলে নতুন blob —
 * বাকি সব নন-ডিরেক্টরি এন্ট্রি (styles/headers/media/settings) byte-হুবহু কপি।
 * `parts` = বদলে যাওয়া পার্ট (path → নতুন string/bytes); `extra` = নতুন যোগ হওয়া পার্ট
 * (মার্জে ব্যবহৃত — রিল-টার্গেট ছবি ইত্যাদি); আউটপুট-অর্ডার: parts → অন্যরা → extra।
 */
export async function repackDocx(
  source: Blob | JSZip,
  parts: Record<string, string | Uint8Array>,
  extra: Array<{ path: string; data: Uint8Array }> = [],
  mimeType: string = DOCX_MIME,
): Promise<Blob> {
  const src = source instanceof JSZip ? source : await JSZip.loadAsync(source);
  const replaced = new Set(Object.keys(parts));
  const others: Array<{ path: string; data: Promise<Uint8Array> }> = [];
  src.forEach((path, entry) => {
    if (!entry.dir && !replaced.has(path)) others.push({ path, data: entry.async("uint8array") });
  });
  const enc = new TextEncoder();
  const zip = new JSZip();
  for (const path of Object.keys(parts)) {
    const data = parts[path];
    zip.file(path, typeof data === "string" ? enc.encode(data) : data);
  }
  for (const o of others) zip.file(o.path, await o.data);
  for (const p of extra) zip.file(p.path, p.data);
  return zip.generateAsync({ type: "blob", mimeType, compression: "DEFLATE" });
}
