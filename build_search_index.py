#!/usr/bin/env python3
"""
Build search-index.json for in-browser full-text search across all extracted
PDF text. Cleans OCR junk, strips boilerplate page headers, and produces a
compact JSON with one entry per PDF: {stem, text}.

Loaded asynchronously by app.js — search bar matches against this once it lands.
"""
import json
import re
from pathlib import Path

ROOT     = Path(__file__).parent
TEXT_DIR = ROOT / "extracted-text"
DATA     = json.load(open(ROOT / "data.json"))

# Per-PDF text cap. Keeps total payload sane while covering the meat of each doc.
MAX_CHARS_PER_DOC = 40_000

PAGE_HDR = re.compile(r"=== .*? \(\d+ pages\) ===|--- page \d+(?: \(OCR\))? ---", re.DOTALL)
WHITESPACE = re.compile(r"\s+")
# OCR garbage: lines that are mostly punctuation/digits with no real words
JUNK_LINE = re.compile(r"^[\W\d_]{3,}$", re.MULTILINE)


def clean(raw: str, cap: int) -> str:
    txt = PAGE_HDR.sub(" ", raw)
    txt = JUNK_LINE.sub(" ", txt)
    txt = WHITESPACE.sub(" ", txt).strip()
    return txt[:cap]


def main():
    # Map url-derived stem -> pdf record idx (for IDs the front-end can join on)
    stem_to_idx = {}
    for i, r in enumerate(DATA["pdfs"]):
        stem = r["url"].rsplit("/", 1)[-1].lower().rsplit(".pdf", 1)[0]
        stem_to_idx.setdefault(stem, i)

    docs = []
    total_chars = 0
    for txt_path in sorted(TEXT_DIR.glob("*.txt")):
        if txt_path.name == "_progress.log":
            continue
        stem = txt_path.stem
        if stem not in stem_to_idx:
            continue
        raw = txt_path.read_text(encoding="utf-8", errors="ignore")
        text = clean(raw, MAX_CHARS_PER_DOC)
        if not text:
            continue
        docs.append({"i": stem_to_idx[stem], "stem": stem, "t": text})
        total_chars += len(text)

    out = ROOT / "search-index.json"
    out.write_text(json.dumps({
        "version": 1,
        "kind": "full-text-per-pdf",
        "maxChars": MAX_CHARS_PER_DOC,
        "docs": docs,
    }, ensure_ascii=False))

    sz = out.stat().st_size
    print(f"wrote {out} — {len(docs)} docs, {total_chars:,} chars total, "
          f"{sz:,} bytes ({sz/1024/1024:.2f} MB)")


if __name__ == "__main__":
    main()
