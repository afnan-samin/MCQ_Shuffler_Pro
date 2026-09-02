#!/usr/bin/env python3
"""Detect paragraph/run shading (background color behind text) in the real Agri MCQ docx.
Word's Home > Paragraph > Shading is stored as w:pPr/w:shd @w:fill (hex color).
Run-level highlight/shading: w:rPr/w:shd or w:rPr/w:highlight. Also check styles.xml.
"""
import zipfile
from collections import Counter
from lxml import etree

DOCX = '/home/z/my-project/upload/Agri MCQ Botany 997 mcq - Copy - type serial.docx'
W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
NS = {'w': W}

def w(tag):
    return f'{{{W}}}{tag}'

with zipfile.ZipFile(DOCX) as z:
    doc = etree.fromstring(z.read('word/document.xml'))
    styles = etree.fromstring(z.read('word/styles.xml'))

body = doc.find('w:body', NS)
paras = body.findall('.//w:p', NS)

# ---------- 1. styles.xml: shading defined in named styles ----------
print('=== styles.xml: w:shd inside style definitions ===')
style_shd = Counter()
for st in styles.findall('w:style', NS):
    name_el = st.find('w:name', NS)
    sname = name_el.get(w('val')) if name_el is not None else '?'
    for shd in st.findall('.//w:shd', NS):
        key = (sname, shd.get(w('val')), shd.get(w('fill')), shd.get(w('color')))
        style_shd[key] += 1
if style_shd:
    for k, v in style_shd.items():
        print(' style:', k)
else:
    print(' (none)')

# ---------- 2. document.xml: paragraph-level shading ----------
print('\n=== document.xml: paragraph-level w:pPr/w:shd ===')
p_shd_counter = Counter()
samples = []
for i, p in enumerate(paras):
    pPr = p.find('w:pPr', NS)
    if pPr is None:
        continue
    shd = pPr.find('w:shd', NS)
    if shd is None:
        continue
    fill = shd.get(w('fill'))
    val = shd.get(w('val'))
    color = shd.get(w('color'))
    txt = ''.join(t.text or '' for t in p.findall('.//w:t', NS)).strip()[:70]
    p_shd_counter[(val, fill, color)] += 1
    if len(samples) < 40:
        samples.append((i, val, fill, color, txt))

if p_shd_counter:
    for k, v in p_shd_counter.most_common():
        print(f'  val={k[0]!r} fill={k[1]!r} color={k[2]!r}  -> {v} paragraphs')
    print(f'\n  Samples (para#, val, fill, color, text):')
    for s in samples:
        print('   ', s)
else:
    print(' (none)')

# ---------- 3. run-level shading / highlight ----------
print('\n=== document.xml: run-level w:rPr/w:shd and w:highlight ===')
r_shd = Counter()
r_hl = Counter()
for p in paras:
    for r in p.findall('.//w:r', NS):
        rPr = r.find('w:rPr', NS)
        if rPr is None:
            continue
        shd = rPr.find('w:shd', NS)
        if shd is not None:
            r_shd[(shd.get(w('val')), shd.get(w('fill')))] += 1
        hl = rPr.find('w:highlight', NS)
        if hl is not None:
            r_hl[hl.get(w('val'))] += 1
print('  w:shd:', dict(r_shd) if r_shd else '(none)')
print('  w:highlight:', dict(r_hl) if r_hl else '(none)')

# ---------- 4. table cell shading ----------
print('\n=== document.xml: table cell w:tcPr/w:shd ===')
tc_shd = Counter()
for shd in body.findall('.//w:tcPr/w:shd', NS):
    tc_shd[(shd.get(w('val')), shd.get(w('fill')))] += 1
print(' ', dict(tc_shd) if tc_shd else '(none)')

# ---------- 5. themeFill (shading picked from theme colors) ----------
print('\n=== w:themeFill / w:themeFillShade usage (Paragraph > Shading > Theme colors) ===')
tf = Counter()
for shd in body.findall('.//w:pPr/w:shd', NS):
    t = shd.get(w('themeFill'))
    s = shd.get(w('themeFillShade'))
    if t or s:
        tf[(t, s)] += 1
print(' ', dict(tf) if tf else '(none)')
