#!/usr/bin/env python3
"""Parsea un dump de caché de Xuper y genera catalog_xuper.json (títulos + mediaCodes)."""
import os, re, sys, json, glob, sqlite3, zipfile

ROOT = sys.argv[1] if len(sys.argv) > 1 else "."
OUT = "catalog_xuper.json"
HEX32 = re.compile(r"\b([0-9A-Fa-f]{32})\b")
fields = ["mediaCode", "media_code", "contentId", "vodId", "playCode", "code"]
keys_title = ["title", "name", "vodName", "mediaName", "contentName", "resourceName"]

def scan_text(text, out):
    for m in HEX32.finditer(text):
        code = m.group(1).upper()
        out.setdefault(code, {"sources": 0})
        out[code]["sources"] += 1

def scan_json(obj, out):
    if isinstance(obj, dict):
        code = None
        title = None
        for k, v in obj.items():
            if k in fields and isinstance(v, str) and len(v) >= 20:
                code = v.upper()
            if k in keys_title and isinstance(v, str) and v and not title:
                title = v
        if code and HEX32.fullmatch(code):
            e = out.setdefault(code, {"sources": 0})
            e["sources"] += 1
            if title and "title" not in e:
                e["title"] = title
        for v in obj.values():
            scan_json(v, out)
    elif isinstance(obj, list):
        for v in obj:
            scan_json(v, out)

out = {}
for root, _, files in os.walk(ROOT):
    for fn in files:
        p = os.path.join(root, fn)
        try:
            if fn.endswith(".json") or fn.endswith(".txt"):
                with open(p, "r", errors="replace") as f:
                    scan_text(f.read(), out)
            elif fn.endswith(".xml"):
                with open(p, "r", errors="replace") as f:
                    scan_text(f.read(), out)
            elif fn.endswith((".db", ".sqlite")):
                con = sqlite3.connect(p)
                for (tname,) in con.execute(
                    "select name from sqlite_master where type='table'"):
                    try:
                        for row in con.execute(f"select * from {tname}"):
                            scan_json(list(row), out)
                    except Exception:
                        pass
                con.close()
            elif fn.endswith((".zip", ".ab")):
                pass
        except Exception as e:
            print("skip", p, e)

print(f"mediaCodes encontrados: {len(out)}")
print(json.dumps(out, indent=2, ensure_ascii=False)[:4000])
with open(OUT, "w") as f:
    json.dump(out, f, indent=2, ensure_ascii=False)
print(f"guardado en {OUT}")
