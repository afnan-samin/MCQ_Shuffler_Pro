import zipfile, re, html, sys

P = "/home/z/Downloads/hsc27-physics-bijoy (shuffled, renumbered).docx"
z = zipfile.ZipFile(P)
xml = z.read('word/document.xml').decode('utf-8')

def ptext(px):
    out = []
    for m in re.finditer(r'<w:t(?:\s[^>]*)?>(.*?)</w:t>|<w:tab\s*/>|<m:oMath[\s>]', px, re.S):
        s = m.group(0)
        if s.startswith('<w:t'):
            out.append(html.unescape(s[s.index('>') + 1:-6]))
        elif s.startswith('<w:tab'):
            out.append('<TAB>')
        else:
            out.append('<MATH>')
    return ''.join(out)

print("== DOWNLOADED FILE CHECK ==")
print("entries:", len(z.namelist()), "| document.xml:", len(xml), "chars")
print("oMath:", xml.count('<m:oMath>'), "(expect 30 = শুধু সেট A-এর? না, ৩ সেট ইন্টারলিভড — ৬০ প্রশ্নে যত্র আছে)")
print("run tabs:", len(re.findall(r'<w:tab/>', xml)))
print("vertAlign:", xml.count('w:vertAlign'))
bn = len(re.findall(r'[\u0980-\u09FF]', xml))
print("Unicode Bengali chars:", bn, "(must be 0)")
print("Set headers:", re.findall(r'>Set ([A-Z])<', xml))
print("page breaks:", len(re.findall(r'<w:br w:type="page"', xml)))
print("sectPr at end:", xml.rstrip().endswith('</w:sectPr></w:body></w:document>') or '<w:sectPr' in xml[-2000:])

paras = re.findall(r'<w:p\b[^>]*>.*?</w:p>|<w:p\b[^>]*/>', xml, re.S)
print("\nFirst 8 paras:")
for i, px in enumerate(paras[:8]):
    t = ptext(px)
    print(f"  P{i}: {t[:80]!r}")

# প্রথম সেটের সিরিয়াল চেক: Set A-এর পর প্রশ্নগুলো 1. 2. 3. ... ক্রমে?
serials = []
for px in paras:
    t = ptext(px)
    m = re.match(r'^\s*(\d+)\s*\.', t)
    if m:
        serials.append(int(m.group(1)))
setA = serials[:20]
print("\nপ্রথম ২০টি সিরিয়াল (Set A):", setA)
print("1..60 পরপর?", serials[:60] == list(range(1, 61)))
print("Set B আবার 1 থেকে?", serials[60:63])
