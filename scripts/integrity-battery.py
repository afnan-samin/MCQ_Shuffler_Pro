#!/usr/bin/env python3
"""
integrity-battery.py -- ZIP/XML integrity battery on 5 Chemistry color-serial .docx outputs vs original.
READ-ONLY: this script never writes or modifies any file; it only reads the .docx inputs and prints a report.

Per output file:
  a. ZIP integrity: zipfile.testzip() + full per-member read/CRC check, entry count, duplicate-name check.
  b. Entry-set diff vs original (missing / extra, files vs dir-entries separately) + uncompressed
     size + CRC-32 compare of every shared entry EXCEPT word/document.xml.
  c. Strict XML parse (lxml, recover=False) of word/document.xml -> OK/FAIL with line/col + approx byte offset.
  d. Strict parse of [Content_Types].xml and word/_rels/document.xml.rels (if present).
  e. document.xml sanity: starts with <?xml decl, ends with </w:document>, rough <w:p open/self-close/close
     tag counts + balance, top-level (direct w:body children) <w:p count.
  f. <m:oMath occurrence count vs original (must be identical).
  g. Plain text (concat of w:t) of top-level paragraphs 518, 532, 536, 932, 2120, 7787 (0-based, in the
     OUTPUT), first 80 chars, + same-index text from the original for context.
"""

import hashlib
import re
import sys
import zipfile
from io import BytesIO
from pathlib import Path

from lxml import etree

UPLOAD = Path("/home/z/my-project/upload")
ORIG_NAME = "Final Chemistry 1st paper only varsity Question (1-5).docx"
OUT_NAMES = [
    "Final Chemistry 1st paper only varsity Question (1-5) (color serial - B1).docx",
    "Final Chemistry 1st paper only varsity Question (1-5) (color serial - A4).docx",
    "Final Chemistry 1st paper only varsity Question (1-5) (color serial - A3).docx",
    "Final Chemistry 1st paper only varsity Question (1-5) (color serial - B6).docx",
    "Final Chemistry 1st paper only varsity Question (1-5) (color serial - continuous).docx",
]
DOC = "word/document.xml"
CT = "[Content_Types].xml"
RELS = "word/_rels/document.xml.rels"
SUSPECT = [518, 532, 536, 932, 2120, 7787]

W_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
M_NS = "http://schemas.openxmlformats.org/officeDocument/2006/math"
W_P, W_T, W_BODY = f"{{{W_NS}}}p", f"{{{W_NS}}}t", f"{{{W_NS}}}body"
M_T, M_OMATH = f"{{{M_NS}}}t", f"{{{M_NS}}}oMath"

TAG_RE = re.compile(rb"<(/?)([A-Za-z_][-.\w]*)((?:\"[^\"]*\"|'[^']*'|[^>\"'])*?)(/?)>")
WT_RE = re.compile(rb"<w:t(?:\s[^>]*)?>(.*?)</w:t>", re.S)
MT_RE = re.compile(rb"<m:t(?:\s[^>]*)?>(.*?)</m:t>", re.S)
OPEN_P_RE = re.compile(rb"<w:p(?:\s[^>]*)?>")     # <w:p> or <w:p attrs> (NOT <w:p/>)
SELF_P_RE = re.compile(rb"<w:p(?:\s[^>]*)?/>")    # self-closing
CLOSE_P_RE = re.compile(rb"</w:p\s*>")
OMATH_RE = re.compile(rb"<m:oMath(?=[\s/>])")     # matches <m:oMath>, <m:oMath ...> but NOT <m:oMathPara>
ENT_RE = re.compile(rb"&(?:amp|lt|gt|quot|apos|#\d+|#x[0-9A-Fa-f]+);")
FIXED = {b"&amp;": "&", b"&lt;": "<", b"&gt;": ">", b"&quot;": '"', b"&apos;": "'"}


def _unesc(m):
    e = m.group(0)
    if e in FIXED:
        return FIXED[e]
    if e[:3] in (b"&#x", b"&#X"):
        return chr(int(e[3:-1], 16))
    return chr(int(e[2:-1]))


def unescape_bytes(b):
    return ENT_RE.sub(_unesc, b).decode("utf-8", "replace")


def text_from_slice(data, start, end):
    """Fallback text extraction for a raw <w:p ...>...</w:p> byte slice (w:t concat; m:t fallback)."""
    sl = data[start:end]
    txt = "".join(unescape_bytes(t) for t in WT_RE.findall(sl))
    mtxt = ""
    if not txt.strip():
        mtxt = "".join(unescape_bytes(t) for t in MT_RE.findall(sl))
    omath = len(OMATH_RE.findall(sl))
    return txt, mtxt, omath


def strict_parse(data, label):
    """lxml strict parse. Returns (ok, err_msg, approx_byte_offset)."""
    parser = etree.XMLParser(recover=False, resolve_entities=False, huge_tree=True)
    try:
        etree.parse(BytesIO(data), parser)
        return True, None, None
    except etree.XMLSyntaxError as e:
        line = getattr(e, "lineno", None) or getattr(e, "line", None)
        col = getattr(e, "column", None)
        try:
            pos = e.position  # (line, column) tuple on lxml error log entries
            if line is None:
                line = pos[0]
            if col is None:
                col = pos[1]
        except Exception:
            pass
        msg = getattr(e, "msg", None) or str(e)
        off = None
        if line:
            try:
                lines = data.split(b"\n")
                if 1 <= line <= len(lines):
                    off = sum(len(l) + 1 for l in lines[: line - 1]) + ((col - 1) if col else 0)
            except Exception:
                off = None
        return False, f"{label}: line {line}, col {col}: {msg}", off


def parse_root(data):
    parser = etree.XMLParser(recover=False, resolve_entities=False, huge_tree=True)
    return etree.parse(BytesIO(data), parser).getroot()


def top_level_paras_lxml(root):
    """Direct <w:p> children of <w:body>, in document order."""
    body = root.find(W_BODY)
    if body is None:
        return []
    return [c for c in body if c.tag == W_P]


def para_text_lxml(p):
    wt = "".join(t.text or "" for t in p.iter(W_T))
    mt = ""
    if not wt.strip():
        mt = "".join(t.text or "" for t in p.iter(M_T))
    om = sum(1 for _ in p.iter(M_OMATH))
    return wt, mt, om


def scan_top_level_para_spans(data):
    """Byte-level fallback: spans of top-level <w:p> elements directly inside <w:body>
    (depth-aware: w:p inside w:tbl/w:txbxContent is NOT counted). Includes self-closing <w:p/>."""
    mb = re.search(rb"<w:body(?:\s[^>]*)?>", data)
    if not mb:
        return []
    spans, depth, open_start = [], 0, None
    for m in TAG_RE.finditer(data, mb.end()):
        closing = m.group(1) == b"/"
        name = m.group(2).decode("ascii", "replace")
        selfclose = m.group(4) == b"/"
        if selfclose:
            if name == "w:p" and depth == 0:
                spans.append((m.start(), m.end()))
            continue
        if closing:
            depth -= 1
            if name == "w:p" and depth == 0 and open_start is not None:
                spans.append((open_start, m.end()))
                open_start = None
            if depth < 0:
                depth = 0
        else:
            if name == "w:p" and depth == 0:
                open_start = m.start()
            depth += 1
    return spans


def read_all_members(zf):
    """Fully decompress every member; returns (bad_list, per-member note). CRC failure raises BadZipFile."""
    bad = []
    for zi in zf.infolist():
        try:
            with zf.open(zi) as fh:
                while fh.read(1 << 20):
                    pass
        except Exception as e:  # BadZipFile / zlib error / unsupported, etc.
            bad.append((zi.filename, type(e).__name__, str(e)))
    return bad


def md5(b):
    return hashlib.md5(b).hexdigest()


def hr(title):
    print("\n" + "=" * 100)
    print(title)
    print("=" * 100)


def main():
    # ---------------- original baseline ----------------
    hr(f"ORIGINAL BASELINE: {ORIG_NAME}")
    orig_path = UPLOAD / ORIG_NAME
    orig_zf = zipfile.ZipFile(orig_path)
    orig_infos = {i.filename: i for i in orig_zf.infolist()}
    orig_names = sorted(orig_infos)
    print(f"entries: {len(orig_zf.infolist())} ({sum(1 for n in orig_names if n.endswith('/'))} dir-entries)")
    orig_doc = orig_zf.read(DOC)
    print(f"word/document.xml: {len(orig_doc):,} bytes, md5={md5(orig_doc)}, "
          f"oMath={len(OMATH_RE.findall(orig_doc))}, top-level <w:p> count pending parse...")
    ok, err, off = strict_parse(orig_doc, "orig document.xml")
    if not ok:
        print(f"[FAIL] original document.xml does NOT strict-parse: {err} (approx offset {off})")
        orig_texts = []
    else:
        orig_root = parse_root(orig_doc)
        orig_paras = top_level_paras_lxml(orig_root)
        orig_texts = [para_text_lxml(p)[0] for p in orig_paras]
        print(f"[OK] original document.xml strict-parse OK; top-level <w:p> = {len(orig_paras)}")
    orig_omath = len(OMATH_RE.findall(orig_doc))

    results = []

    # ---------------- per-output battery ----------------
    for name in OUT_NAMES:
        hr(f"OUTPUT: {name}")
        path = UPLOAD / name
        res = {"name": name}
        if not path.exists():
            print("[FAIL] FILE MISSING")
            res.update(zip="MISSING")
            results.append(res)
            continue
        print(f"file size: {path.stat().st_size:,} bytes")

        # ---- a. ZIP integrity ----
        try:
            zf = zipfile.ZipFile(path)
        except Exception as e:
            print(f"[FAIL] not a readable zip: {type(e).__name__}: {e}")
            res.update(zip=f"BADZIP:{type(e).__name__}")
            results.append(res)
            continue
        infos = zf.infolist()
        names = [i.filename for i in infos]
        dupes = sorted({n for n in names if names.count(n) > 1})
        tz_bad = zf.testzip()  # returns first member with bad CRC else None
        all_bad = read_all_members(zf)
        zip_ok = tz_bad is None and not all_bad and not dupes
        res["zip"] = "OK" if zip_ok else f"FAIL({tz_bad or all_bad or dupes})"
        print(f"a. ZIP: entries={len(infos)} (dirs={sum(1 for n in names if n.endswith('/'))}) "
              f"testzip={'OK' if tz_bad is None else 'BAD:' + tz_bad} full-read="
              f"{'OK' if not all_bad else all_bad} dup-names={dupes or 'none'} -> "
              f"{'[OK]' if zip_ok else '[FAIL]'}")

        out_infos = {i.filename: i for i in infos}

        # ---- b. entry-set diff vs original + non-document byte compare ----
        on = {n for n in orig_infos if not n.endswith("/")}
        od = {n for n in orig_infos if n.endswith("/")}
        xn = {n for n in out_infos if not n.endswith("/")}
        xd = {n for n in out_infos if n.endswith("/")}
        missing_files, extra_files = sorted(on - xn), sorted(xn - on)
        missing_dirs, extra_dirs = sorted(od - xd), sorted(xd - od)
        diffs = []
        for n in sorted(set(orig_infos) & set(out_infos)):
            if n == DOC or n.endswith("/"):
                continue
            io_, ix = orig_infos[n], out_infos[n]
            if io_.file_size != ix.file_size or io_.CRC != ix.CRC:
                diffs.append((n, io_.file_size, io_.CRC, ix.file_size, ix.CRC))
        entry_ok = not missing_files and not extra_files and not diffs
        res["entries"] = "OK" if entry_ok else f"DIFF(miss={len(missing_files)}+{len(missing_dirs)}d extra={len(extra_files)}+{len(extra_dirs)}d bytediff={len(diffs)})"
        print(f"b. entry diff vs original: missing files={missing_files or 'none'} | extra files={extra_files or 'none'}")
        print(f"   missing dir-entries={missing_dirs or 'none'} | extra dir-entries={extra_dirs or 'none'}")
        if diffs:
            print("   [FAIL] non-document shared entries whose bytes differ (size/CRC-32 of uncompressed data):")
            for n, so, co, sx, cx in diffs:
                print(f"     {n}: orig size={so:,} crc={co:08x}  vs  out size={sx:,} crc={cx:08x}")
        else:
            print("   [OK] every shared non-document entry is byte-identical (uncompressed size + CRC-32 match)")

        # ---- c. strict parse document.xml ----
        try:
            doc = zf.read(DOC)
        except Exception as e:
            print(f"[FAIL] cannot read {DOC}: {type(e).__name__}: {e}")
            res.update(docxml="UNREADABLE", entries=res.get("entries", ""), zip=res.get("zip", ""))
            results.append(res)
            continue
        print(f"   word/document.xml: {len(doc):,} bytes, md5={md5(doc)}")
        ok, err, off = strict_parse(doc, "document.xml")
        res["docxml"] = "OK" if ok else f"FAIL({err} @~{off})"
        print(f"c. strict lxml parse of {DOC}: {'[OK]' if ok else '[FAIL] ' + str(err) + ' | approx byte offset ' + str(off)}")

        # ---- d. strict parse content types + rels ----
        for extra, label in ((CT, CT), (RELS, RELS)):
            if extra not in out_infos:
                print(f"d. {extra}: NOT PRESENT (skipped)")
                res[label] = "MISSING"
                continue
            okx, errx, offx = strict_parse(zf.read(extra), extra)
            res[label] = "OK" if okx else f"FAIL({errx})"
            print(f"d. strict parse {extra}: {'[OK]' if okx else '[FAIL] ' + str(errx) + ' @~' + str(offx)}")

        # ---- e. document.xml sanity ----
        starts = doc.lstrip()[:5] == b"<?xml"
        ends = doc.rstrip().endswith(b"</w:document>")
        opens = len(OPEN_P_RE.findall(doc))
        selfs = len(SELF_P_RE.findall(doc))
        closes = len(CLOSE_P_RE.findall(doc))
        bal = (opens == closes)
        # top-level paras: lxml preferred, byte-scanner fallback
        tl_count, para_texts = None, []
        if ok:
            root = parse_root(doc)
            tl = top_level_paras_lxml(root)
            tl_count = len(tl)
            para_texts = [para_text_lxml(p) for p in tl]
        else:
            spans = scan_top_level_para_spans(doc)
            tl_count = len(spans)
            para_texts = [text_from_slice(doc, s, e) for s, e in spans]
        sanity_ok = starts and ends and bal
        res["tail"] = "OK" if sanity_ok else f"FAIL(start={starts} end={ends} bal={bal})"
        print(f"e. sanity: starts-with-<?xml={starts} ends-with-</w:document>={ends} | "
              f"<w:p opens={opens} self-closing={selfs} closes={closes} balance={'OK' if bal else 'MISMATCH'}")
        print(f"   top-level <w:p> (direct w:body children): output={tl_count} vs original={len(orig_texts)} "
              f"{'[OK]' if tl_count == len(orig_texts) else '[DIFF]'}")
        res["topparas"] = tl_count

        # ---- f. oMath count ----
        om = len(OMATH_RE.findall(doc))
        om_ok = om == orig_omath
        res["omath"] = f"{om}({'OK' if om_ok else 'DIFF!'})"
        print(f"f. <m:oMath count: output={om} vs original={orig_omath} -> {'[OK] identical' if om_ok else '[FAIL] MATH LOST/CHANGED'}")

        # ---- g. suspicious paragraphs ----
        print(f"g. suspicious top-level paragraphs {SUSPECT} (0-based, OUTPUT document.xml):")
        for idx in SUSPECT:
            if idx >= len(para_texts):
                print(f"   para[{idx}]: OUT OF RANGE (output has {tl_count} top-level paras)")
                continue
            wt, mt, omc = para_texts[idx]
            shown = (wt or mt).replace("\n", "\\n")
            o_txt = orig_texts[idx].replace("\n", "\\n") if idx < len(orig_texts) else "<out of range in orig>"
            same = (orig_texts[idx] == wt) if idx < len(orig_texts) and ok else None
            print(f"   para[{idx}]: oMath={omc} text={shown[:80]!r}")
            print(f"             orig-same-idx: {o_txt[:80]!r}  ({'same text' if same else 'DIFFERS from original' if same is False else 'n/a'})")

        results.append(res)

    # ---------------- summary ----------------
    hr("SUMMARY (per output file)")
    hdr = f"{'file':<72} {'zip':<6} {'entries':<10} {'docxml':<8} {'ct/rels':<8} {'tail':<6} {'oMath':<8} topParas"
    print(hdr)
    for r in results:
        f = r["name"].replace("Final Chemistry 1st paper only varsity Question (1-5) (color serial - ", "").replace(").docx", "")
        ct = "OK" if r.get(CT) == "OK" and r.get(RELS) == "OK" else (r.get(CT, "?") + "/" + r.get(RELS, "?"))
        print(f"{f:<72} {str(r.get('zip', '?'))[:6]:<6} {str(r.get('entries', '?')):<10} "
              f"{str(r.get('docxml', '?'))[:8]:<8} {ct[:8]:<8} {str(r.get('tail', '?')):<6} "
              f"{str(r.get('omath', '?')):<8} {r.get('topparas', '?')}")

    hard = [r for r in results if str(r.get("zip", "")).startswith(("FAIL", "BADZIP"))
            or str(r.get("docxml", "")).startswith(("FAIL", "UNREADABLE", "MISSING"))]
    print(f"\nHARD FAILURES: {len(hard)} file(s)")
    return 1 if hard else 0


if __name__ == "__main__":
    sys.exit(main())
