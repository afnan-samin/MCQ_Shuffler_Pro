#!/usr/bin/env python3
# Chemistry B1-আউটপুট কঠোর যাচাই:
#  ১) document.xml কঠোর XML পার্স (lxml)
#  ২) অরিজিনালের সাথে তুলনা: শুধু সিরিয়াল-প্যারার ডিজিট/সেপারেটর বদলেছে কিনা
#  ৩) zip ইন্টিগ্রিটি + অন্য সব এন্ট্রি byte-identical
import sys, zipfile, re
from lxml import etree

SRC = "upload/Final Chemistry 1st paper only varsity Question (1-5).docx"
OUT = "download/Chemistry (color serial - B1).docx"

z1 = zipfile.ZipFile(SRC)
z2 = zipfile.ZipFile(OUT)

# ৩) zip ইন্টিগ্রিটি
bad = z2.testzip()
print("zip integrity:", "OK" if bad is None else f"CORRUPT: {bad}")
assert bad is None

# অন্য সব এন্ট্রি byte-identical
names1 = set(z1.namelist()); names2 = set(z2.namelist())
print("entry sets equal:", names1 == names2)
diff_entries = []
for n in sorted(names1 & names2):
    if n == "word/document.xml":
        continue
    if z1.read(n) != z2.read(n):
        diff_entries.append(n)
print("non-document.xml diffs:", diff_entries or "NONE (সব byte-identical)")
assert not diff_entries

# ১) কঠোর XML পার্স
x2 = z2.read("word/document.xml")
root = etree.fromstring(x2)  # raises on malformed
print("lxml strict parse: OK, root =", root.tag.split('}')[-1])

x1 = z1.read("word/document.xml")
x2p = etree.fromstring(x2)
x1p = etree.fromstring(x1)

# ২) প্যারা-প্রতি তুলনা: w:t স্ট্রিমে শুধু প্রথম সিরিয়াল-স্প্যান বদলানোর কথা
NS = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}
t1 = etree.fromstring(x1)
SER = re.compile(r"^\s*([0-9\u09e6-\u09ef\u00f8\u00ab\u00c2\u00b5\u220f\u00cf\u00be\u02dc\u00d9\u0153]{1,4})\s*([.\u0964):|\-\u2013\u2014:]?)")

def paras(root):
    body = root.find("w:body", NS)
    return [p for p in body if etree.QName(p).localname == "p"]

def wt_texts(p):
    out = []
    for t in p.iter("{%s}t" % NS["w"]):
        # skip math (m:t has different ns anyway since we query w ns)
        out.append(t.text or "")
    return out

p1, p2 = paras(x1p), paras(x2p)
print("para count:", len(p1), "==", len(p2))
assert len(p1) == len(p2)

changed = 0
mismatch = []
for i, (a, b) in enumerate(zip(p1, p2)):
    ta, tb = wt_texts(a), wt_texts(b)
    if ta != tb:
        # অনুমোদিত পার্থক্য: শুধু প্রথম w:t-তে লিডিং ডিজিট+সেপ বদল
        ja, jb = "".join(ta), "".join(tb)
        ma, mb = SER.match(ja), SER.match(jb)
        ok = bool(ma) and bool(mb)
        if ok:
            rest_a = ja[ma.end():]
            rest_b = jb[mb.end():]
            ok = rest_a == rest_b
        if ok:
            changed += 1
        else:
            mismatch.append((i, ja[:60], jb[:60]))
print("serial-only changed paras:", changed)
print("UNEXPECTED diffs:", len(mismatch))
for m in mismatch[:5]:
    print("  para", m[0], "\n   A:", m[1], "\n   B:", m[2])
assert not mismatch
print("\n✅ সব যাচাই পাস — শুধু সিরিয়াল বদলেছে, বাকি সব byte-identical")
