import zipfile, re, html
from collections import Counter

P = "/home/z/my-project/upload/HSC'27 Premedical Question Physics (renumbered).docx"
z = zipfile.ZipFile(P)
print("== ZIP ENTRIES ==")
for n in z.namelist():
    print("  ", n, z.getinfo(n).file_size, "bytes")

xml = z.read('word/document.xml').decode('utf-8')
print("\n== document.xml chars:", len(xml))

print("\n== TAG COUNTS ==")
for tag in ['<w:tbl>', '<m:oMath', '<m:oMathPara', '<w:object', '<w:drawing', '<w:pict',
            '<w:tab/>', '<w:tabs>', 'w:vertAlign', '<w:sym ', '<w:br ', '<w:br/>',
            'lastRenderedPageBreak', '<w:sectPr', '<w:numPr>', 'Sutonny']:
    c = xml.count(tag)
    if c:
        print(f"  {tag}: {c}")

fonts = Counter(re.findall(r'w:ascii="([^"]*)"', xml))
print("\n== w:ascii fonts ==")
for f, c in fonts.most_common(12):
    print(f"  '{f}': {c}")

nonascii = Counter(ch for ch in xml if ord(ch) > 127)
print("\n== NON-ASCII CHARS (top 40) ==")
print([(ch, hex(ord(ch)), c) for ch, c in nonascii.most_common(40)])

bn_uni = sum(c for ch, c in nonascii.items() if 0x0980 <= ord(ch) <= 0x09FF)
print("\nUnicode Bengali chars in doc:", bn_uni)

paras = re.findall(r'<w:p\b[^>]*>.*?</w:p>|<w:p\b[^>]*/>', xml, re.S)
print("\n== PARAGRAPHS:", len(paras))

def ptext(px):
    out = []
    for m in re.finditer(r'<w:t(?:\s[^>]*)?>(.*?)</w:t>|<w:tab\s*/>|<w:br\s*/>|<m:oMath[\s>]|<w:sym\s+', px, re.S):
        s = m.group(0)
        if s.startswith('<w:t'):
            out.append(html.unescape(s[s.index('>') + 1:-6]))
        elif s.startswith('<w:tab'):
            out.append('<TAB>')
        elif s.startswith('<w:br'):
            out.append('<BR>')
        elif s.startswith('<m:oMath'):
            out.append('<MATH>')
        else:
            out.append('<SYM>')
    return ''.join(out)

print("\n== FIRST 8 PARAGRAPH TEXTS ==")
for i, px in enumerate(paras[:8]):
    print(f"P{i}: {repr(ptext(px))[:600]}")

print("\n== LAST 3 PARAGRAPHS ==")
for i, px in enumerate(paras[-3:]):
    print(f"P{len(paras)-3+i}: {repr(ptext(px))[:300]}")

starts = Counter()
for px in paras:
    t = ptext(px)
    if not t.strip():
        continue
    starts[t[:6]] += 1
print("\n== PARAGRAPH STARTS (top 25) ==")
for s, c in starts.most_common(25):
    print(f"  {repr(s)}: {c}")

print("\n== RAW XML P1 (first 3000) ==")
print(paras[1][:3000] if len(paras) > 1 else paras[0][:3000])

body = re.search(r'<w:body>(.*)</w:body>', xml, re.S).group(1)
kids = re.findall(r'<(w:p|w:tbl|w:sectPr)\b', body)
print("\n== BODY TOP-LEVEL TAGS total:", len(kids), " first 12:", kids[:12])

st = z.read('word/styles.xml').decode('utf-8', 'ignore')
m = re.search(r'<w:docDefaults>.*?</w:docDefaults>', st, re.S)
if m:
    print("\n== docDefaults (first 1200):\n", m.group(0)[:1200])
