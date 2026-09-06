#!/usr/bin/env python3
"""আপলোড করা ফাইলের গঠন দেখা — reference প্যাটার্ন খুঁজি"""
import sys, zipfile, re, json, unicodedata
from pathlib import Path

UP = Path("/home/z/my-project/upload")

def extract_doc_text(path, max_paras=80):
    """docx থেকে paragraph টেক্সট বের করা (কাঁচা)"""
    out = []
    with zipfile.ZipFile(path) as z:
        xml = z.read("word/document.xml").decode("utf-8", errors="replace")
    # paragraph ভাগ
    paras = re.findall(r"<w:p[ >].*?</w:p>", xml, re.S)
    for p in paras:
        texts = re.findall(r"<w:t[^>]*>([^<]*)</w:t>", p)
        t = "".join(texts).strip()
        if t:
            out.append(t)
    return out

def show(fname, head=40):
    fp = UP / fname
    paras = extract_doc_text(fp)
    print(f"\n{'='*70}\nFILE: {fname}  ({len(paras)} paragraphs)\n{'='*70}")
    for i, t in enumerate(paras[:head]):
        print(f"{i:4d}| {t[:150]}")

if __name__ == "__main__":
    name = sys.argv[1] if len(sys.argv) > 1 else "Physics 1st Paper Chapter-10 (Raw).docx"
    show(name, int(sys.argv[2]) if len(sys.argv) > 2 else 40)
