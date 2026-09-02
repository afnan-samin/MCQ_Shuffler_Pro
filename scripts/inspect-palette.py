#!/usr/bin/env python3
"""Inspect color shading palette docx: find all shaded paragraphs/cells and their labels."""
import zipfile
from collections import Counter
from lxml import etree

DOCX = '/home/z/my-project/upload/color shading palatte.docx'
W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
NS = {'w': W}

def w(tag):
    return f'{{{W}}}{tag}'

with zipfile.ZipFile(DOCX) as z:
    print('=== files in docx ===')
    for n in z.namelist():
        print(' ', n)
    doc = etree.fromstring(z.read('word/document.xml'))

body = doc.find('w:body', NS)

print('\n=== PARAGRAPHS: text + paragraph shading + first-run shading ===')
for i, p in enumerate(body.findall('.//w:p', NS)):
    txt = ''.join(t.text or '' for t in p.findall('.//w:t', NS)).strip()
    p_shd = None
    pPr = p.find('w:pPr', NS)
    if pPr is not None:
        s = pPr.find('w:shd', NS)
        if s is not None:
            p_shd = (s.get(w('val')), s.get(w('fill')), s.get(w('color')))
    # run-level shadings within this paragraph
    r_shds = []
    for r in p.findall('.//w:r', NS):
        rPr = r.find('w:rPr', NS)
        if rPr is None:
            continue
        s = rPr.find('w:shd', NS)
        if s is not None:
            r_txt = ''.join(t.text or '' for t in r.findall('.//w:t', NS))
            r_shds.append((r_txt, s.get(w('val')), s.get(w('fill'))))
    if txt or p_shd or r_shds:
        print(f'  p#{i}: text={txt!r}')
        if p_shd:
            print(f'        pShd: val={p_shd[0]} fill={p_shd[1]} color={p_shd[2]}')
        for rs in r_shds:
            print(f'        rShd: text={rs[0]!r} val={rs[1]} fill={rs[2]}')

print('\n=== TABLES: cell-level shading + cell text ===')
for ti, tbl in enumerate(body.findall('.//w:tbl', NS)):
    print(f'--- table {ti} ---')
    for ri, tr in enumerate(tbl.findall('w:tr', NS)):
        row = []
        for tc in tr.findall('w:tc', NS):
            shd = tc.find('w:tcPr/w:shd', NS)
            fill = shd.get(w('fill')) if shd is not None else None
            txt = ''.join(t.text or '' for t in tc.findall('.//w:t', NS)).strip()
            row.append(f'{txt!r}[fill={fill}]')
        print(f'  row{ri}: ' + ' | '.join(row))
