# ============================================================
# OOXML (docx) Word-লেভেল স্যানিটি-চেকার — test-merger-repro.ts-এর ভ্যালিডেটর
# ============================================================
# Word "unreadable content"-এর প্রধান ট্রিগারগুলো স্ট্রিক্টলি ধরে:
#   ১) যেকোনো XML পার্ট (xml/rels) well-formed না হলে — namespace-aware
#      পার্সারে (ElementTree) আনডিক্লেয়ার্ড প্রিফিক্স/ডুপ্লিকেট অ্যাট্রিবিউট ফেটাল
#   ২) document.xml-এর r:embed / r:id / r:link রেফারেন্স word/_rels/document.xml.rels-এ
#      না থাকলে (মার্জে extra-র ইমেজ-রিল হারালে ঠিক এটাই হয়)
#   ৩) রিলেশনশিপের টার্গেট ফাইল zip-এ না থাকলে
#   ৪) [Content_Types].xml-এ প্রতিটা পার্টের Default/Override না থাকলে
#   ৫) mc:Ignorable-এর প্রিফিক্স root-এ ডিক্লেয়ার্ড না থাকলে
#   ৬) w:sectPr w:body-র শেষ চাইল্ড না হলে (schema-order)
# এরর stderr-এ, exit 1 হলে ব্যর্থ। ব্যবহার: python3 ooxml_check.py <file.docx>
# ============================================================
import sys
import re
import zipfile
import posixpath
import xml.etree.ElementTree as ET

errors = []


def err(msg):
    errors.append(msg)


def parse_strict(path_zip, name, data):
    try:
        return ET.fromstring(data)
    except ET.ParseError as e:
        err(f"{name}: XML পার্স-ব্যর্থ (Word 'unreadable content'): {e}")
        return None


def main(path):
    try:
        z = zipfile.ZipFile(path)
    except Exception as e:
        print(f"{path}: zip খোলা যায়নি: {e}", file=sys.stderr)
        return 1

    bad = z.testzip()
    if bad is not None:
        err(f"zip-এন্ট্রি CRC ব্যর্থ: {bad}")

    names = z.namelist()
    parts = [n for n in names if not n.endswith("/")]

    doc_xml = None
    doc_tree = None
    for n in parts:
        data = z.read(n)
        if n.endswith((".xml", ".rels")):
            t = parse_strict(path, n, data)
            if n == "word/document.xml":
                doc_tree = t
        if n == "word/document.xml":
            doc_xml = data.decode("utf-8", "replace")

    if doc_xml is None:
        err("word/document.xml নেই")
    else:
        # ---- রিল-রেফারেন্স ইন্টিগ্রিটি ----
        rels_name = "word/_rels/document.xml.rels"
        rel_ids, rel_targets = set(), []
        if rels_name in parts:
            rels = z.read(rels_name).decode("utf-8", "replace")
            for m in re.finditer(r'<Relationship\b[^>]*>', rels):
                tag = m.group(0)
                rid = re.search(r'Id="([^"]+)"', tag)
                tgt = re.search(r'Target="([^"]+)"', tag)
                ext = re.search(r'TargetMode="External"', tag)
                if rid:
                    rel_ids.add(rid.group(1))
                if tgt and not ext:
                    t = tgt.group(1)
                    base = posixpath.dirname("word/document.xml")
                    resolved = posixpath.normpath(posixpath.join(base, t)) if not t.startswith("/") else t.lstrip("/")
                    rel_targets.append((rid.group(1) if rid else "?", resolved))
        else:
            err(f"{rels_name} নেই")

        for rid in re.findall(r'\br:(?:embed|id|link|pict)="([^"]+)"', doc_xml):
            if rid not in rel_ids:
                err(f"document.xml: r:{rid} রেফারেন্স word/_rels/document.xml.rels-এ নেই (মার্জে extra-এর রিল হারালে এমন হয়)")

        for rid, target in rel_targets:
            if target not in parts:
                err(f"রিলেশনশিপ {rid}: টার্গেট zip-এ নেই — {target}")

        # ---- mc:Ignorable প্রিফিক্স ----
        root_m = re.match(r'.*?<w:document\b([^>]*)>', doc_xml, re.S)
        if root_m:
            root_attrs = root_m.group(1)
            declared = set(re.findall(r'xmlns:([\w.-]+)="', root_attrs))
            ign = re.search(r'mc:Ignorable="([^"]*)"', root_attrs)
            if ign:
                for p in ign.group(1).split():
                    if p not in declared:
                        err(f"mc:Ignorable প্রিফিক্স '{p}' root-এ ডিক্লেয়ার্ড নয়")
            req = re.search(r'mc:AllowXPath\w*|mc:ProcessContent="([^"]*)"', root_attrs)
            if req and req.group(1):
                for p in req.group(1).split():
                    if p not in declared:
                        err(f"mc:ProcessContent প্রিফিক্স '{p}' root-এ ডিক্লেয়ার্ড নয়")

            # ---- w:sectPr শেষ চাইল্ড (schema-order; pPr-লেভেল মিড-ডক sectPr এ নিয়মের বাইরে নয়) ----
            if doc_tree is not None:
                W = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"
                body_el = doc_tree.find(f"{W}body")
                if body_el is not None:
                    kids = list(body_el)
                    if kids and kids[-1].tag != f"{W}sectPr":
                        err("w:sectPr w:body-র শেষ চাইল্ড নয় (Word schema-order)")

    # ---- [Content_Types].xml কভারেজ ----
    ct_name = "[Content_Types].xml"
    if ct_name not in parts:
        err("[Content_Types].xml নেই")
    else:
        ct = z.read(ct_name).decode("utf-8", "replace")
        defaults = set(re.findall(r'<Default\b[^>]*Extension="([^"]+)"', ct))
        overrides = set(re.findall(r'<Override\b[^>]*PartName="([^"]+)"', ct))
        for n in parts:
            ext = n.rsplit(".", 1)[-1].lower()
            if ext in defaults or n in overrides:
                continue
            err(f"[Content_Types]-এ {n} কভার নেই (Default/Override নেই)")

    if errors:
        for e in errors:
            print(f"{path}: {e}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1]))
