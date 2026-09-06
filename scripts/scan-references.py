#!/usr/bin/env python3
"""সব আপলোড ফাইল স্ক্যান — সব ধরনের reference/bracket প্যাটার্ন ক্যাটালগ + স্ট্রাকচার"""
import re, zipfile, collections
from pathlib import Path

UP = Path("/home/z/my-project/upload")

def paras(path):
    with zipfile.ZipFile(path) as z:
        xml = z.read("word/document.xml").decode("utf-8", errors="replace")
    out = []
    for p in re.findall(r"<w:p[ >].*?</w:p>", xml, re.S):
        t = "".join(re.findall(r"<w:t[^>]*>([^<]*)</w:t>", p)).strip()
        if t:
            out.append(t)
    return out

files = sorted(UP.glob("Physics 1st Paper Chapter-*.docx"))
files += sorted(UP.glob("Chemistry 1st Paper Chapter-*.docx"))

bracket_re = re.compile(r"[\[\(]([^\[\]\(\)]{2,60})[\]\)]")
counter = collections.Counter()
per_file = collections.defaultdict(set)

for f in files:
    ps = paras(f)
    for t in ps:
        # standalone bracket line
        m = re.fullmatch(r"[\[\(]([^\[\]\(\)]{2,60})[\]\)]\.?", t)
        if m:
            counter["STANDALONE: " + m.group(1)] += 1
            per_file[f.name].add("SA: " + m.group(1))
        # inline at end of a question line
        for mm in bracket_re.findall(t):
            if re.search(r"\d{2}\s*[-–]\s*\d{2}", mm) or re.search(r"(বোর্ড|বি|Unit|Projukti|U\b)", mm, re.I):
                counter["INLINE: " + mm] += 1
                per_file[f.name].add("IN: " + mm)

print("=== সব ইউনিক reference (উপস্থিতি সংখ্যা) ===")
for k, v in sorted(counter.items()):
    print(f"{v:4d}  {k}")

print("\n=== ফাইলভিত্তিক স্যাম্পল (প্রথম ৫) ===")
for fn, refs in sorted(per_file.items()):
    print(f"\n{fn}: {len(refs)} ইউনিক")
    for r in sorted(refs)[:5]:
        print("   ", r)
