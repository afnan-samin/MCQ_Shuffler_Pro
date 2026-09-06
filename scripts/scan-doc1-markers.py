#!/usr/bin/env python3
"""Doc1.docx মার্কার-ভ্যারিয়েন্ট স্ক্যান — উত্তর/ব্যাখ্যা/টাইটেল প্যাটার্ন খুঁজি"""
import re, sys
from collections import Counter

with open('/home/z/my-project/tmp/doc1/word/document.xml', encoding='utf-8') as f:
    xml = f.read()
paras = re.findall(r'<w:p\b.*?</w:p>', xml, re.S)
texts = []
for p in paras:
    t = ''.join(re.findall(r'<w:t[^>]*>([^<]*)</w:t>', p))
    texts.append(t.replace('\t', '\\t'))

# 1) উত্তর-মার্কার ভ্যারিয়েন্ট: ট্যাব/স্পেসের পরে একক-অক্ষর + বিরাম
ans_pat = re.compile(r'(?:^|\t|\s)([A-Za-z]{1,4}|উঃ|উত্তর)\s*[:.]\s*[KLMNklmn](?:\s*\+\s*[KLMNklmn])?\s*$')
ans_forms = Counter()
for t in texts:
    m = ans_pat.search(t)
    if m:
        ans_forms[m.group(0).strip()] += 1
print("== উত্তর-মার্কার ফর্ম (শেষ ৬০):")
for form, c in ans_forms.most_common(60):
    print(f"  {c:4d}  {form!r}")

# 2) Dt / Cvw স্টাইল
dt = Counter()
for t in texts:
    for m in re.finditer(r'(Dt|Cvw|wU)\s*[:.]?\s*[KLMNklmn](?:\s*\+\s*[KLMNklmn])?\s*$', t):
        dt[m.group(0)] += 1
print("\n== Dt/Cvw/wU ফর্ম:")
for form, c in dt.most_common(20):
    print(f"  {c:4d}  {form!r}")

# 3) ব্যাখ্যা-মার্কার (লাইন-শুরু)
bek = Counter()
for t in texts:
    m = re.match(r'\s*(e¨vL¨v|e¨vLªv|evl¨v|we‡kl|ব্যাখ্যা|সমাধান|explanation|D\w*¨vL¨v)\s*[:.\-—]?', t)
    if m:
        bek[m.group(0).strip()] += 1
print("\n== ব্যাখ্যা-মার্কার (লাইন-শুরু):")
for form, c in bek.most_common(20):
    print(f"  {c:4d}  {form!r}")

# ব্যাখ্যা কি সবসময় নতুন প্যারায়? মাঝে লাইনে থাকলে
mid = [t for t in texts if '\t' in t and re.search(r'\te¨vL¨v', t)]
print(f"\nমাঝ-লাইনে (ট্যাবের পরে) e¨vL¨v: {len(mid)}")
for t in mid[:3]: print(f"   {t[:100]!r}")

# 4) সেকশন-টাইটেল (Zg ... cix¶v)
titles = Counter()
for t in texts:
    ts = t.strip()
    if re.match(r'^\d{1,3}Zg\b', ts) or re.search(r'cix[¶ÿ]v$', ts):
        titles[ts] += 1
print("\n== সেকশন-টাইটেল:")
for form, c in titles.most_common(30):
    print(f"  {c:4d}  {form!r}")

# 5) উত্তর-মার্কার ভিন্ন জায়গায়? একা-লাইন উত্তর
solo = [t for t in texts if re.match(r'^\s*(Dt|D|Cvw)\s*[:.]?\s*[KLMNklmn](\s*\+\s*[KLMNklmn])?\s*$', t)]
print(f"\n== একা-লাইন উত্তর: {len(solo)}")
for t in solo[:5]: print(f"   {t!r}")

# 6) প্রশ্ন-সংখ্যা কি কি আছে, অপশন-লেবেল বাইরে K/L/M/N ছাড়া আরও?
labels = Counter()
for t in texts:
    for m in re.finditer(r'(?:^|\t)([A-Za-z])\s*[.):]', t):
        labels[m.group(1)] += 1
print("\n== অপশন-লেবেল ডিস্ট্রিবিউশন:", dict(labels))
