import zipfile, re, html

P = "/home/z/my-project/upload/HSC'27 Premedical Question Physics (renumbered).docx"
z = zipfile.ZipFile(P)
xml = z.read('word/document.xml').decode('utf-8')

paras = re.findall(r'<w:p\b[^>]*>.*?</w:p>|<w:p\b[^>]*/>', xml, re.S)

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

# 1. serials in order
serials = []
for i, px in enumerate(paras):
    t = ptext(px)
    m = re.match(r'^\s*(\d+)\s*\.', t)
    if m:
        serials.append((i, int(m.group(1)), t[:45]))
print("== SERIAL PARAGRAPHS (idx, serial, text) ==")
print("count:", len(serials))
for s in serials:
    print("  ", s)

# 2. tabs per paragraph
print("\n== PARAS WITH TABS (first 12) ==")
cnt = 0
for i, px in enumerate(paras):
    c = len(re.findall(r'<w:tab\s*/>', px))
    if c and cnt < 12:
        print(f"  P{i}: tabs={c}  text={repr(ptext(px))[:100]}")
        cnt += 1
total_tab_paras = sum(1 for px in paras if re.findall(r'<w:tab\s*/>', px))
print("  paras containing <w:tab/>:", total_tab_paras)

# 3. P0 raw
print("\n== P0 RAW (first 900):\n", paras[0][:900])
print("\n== P2 RAW (first 2600):\n", paras[2][:2600])

# 4. vertAlign sample
va = re.findall(r'<w:rPr>(?:(?!</w:rPr>).)*w:vertAlign(?:(?!</w:rPr>).)*</w:rPr>', xml, re.S)
print("\n== vertAlign runs:", len(va), " sample:", va[0][:400] if va else None)

# 5. oMath text content sample
om = re.findall(r'<m:oMath>.*?</m:oMath>', xml, re.S)
print("\n== oMath count:", len(om))
if om:
    for j, o in enumerate(om[:5]):
        ts = re.findall(r'<m:t(?:\s[^>]*)?>(.*?)</m:t>', o, re.S)
        print(f"  MATH{j}: {''.join(html.unescape(t) for t in ts)!r}")

# 6. PHYSIC paragraphs
print("\n== PARAS starting with PHYSIC ==")
for i, px in enumerate(paras):
    t = ptext(px)
    if t.startswith('PHYSIC'):
        print(f"  P{i}: {repr(t[:60])}")

# 7. paragraph after each serial (option para structure)
print("\n== OPTION PARA SAMPLE (P3 raw, first 2000):\n", paras[3][:2000])
