#!/usr/bin/env python3
"""Merge extracted photos into data.json under the images[] array."""
import json
from pathlib import Path

ROOT = Path(__file__).parent
data = json.load(open(ROOT / "data.json"))
manifest = json.load(open(ROOT / "photos" / "_photos.json"))

# Index PDFs by stem so we can copy parent metadata onto each photo
pdf_by_stem = {}
for r in data["pdfs"]:
    stem = r["url"].rsplit("/", 1)[-1].lower().rsplit(".pdf", 1)[0]
    pdf_by_stem.setdefault(stem, r)


def pretty_pdf_name(stem: str) -> str:
    s = stem.replace("_", " ").replace("-", " ")
    s = " ".join(w if w.isupper() else w.title() for w in s.split())
    return s


def build_blurb(parent: dict, page: int, kind: str) -> str:
    parent_title = parent.get("title", "").strip() or "(untitled document)"
    src_label = "embedded image" if kind == "embedded" else "page render"
    base = (f"Photograph {src_label} extracted from page {page} of "
            f"{parent_title} ({parent.get('agency', 'unknown agency')}).")
    if parent.get("blurb"):
        base += f"\n\nFROM PARENT DOC: {parent['blurb']}"
    return base


# Strip any previously-injected extracted photos so this script is rerunnable
data["images"] = [r for r in data["images"] if not r.get("extracted")]
existing_count = len(data["images"])

added = 0
for m in manifest:
    parent = pdf_by_stem.get(m["stem"])
    if parent is None:
        continue
    title = (f"Page {m['page']:03d} — {pretty_pdf_name(m['stem'])[:80]}")
    record = {
        "title": title,
        "agency": parent.get("agency", ""),
        "incidentDate": parent.get("incidentDate", ""),
        "incidentLocation": parent.get("incidentLocation", ""),
        "releaseDate": parent.get("releaseDate", ""),
        "blurb": build_blurb(parent, m["page"], m["kind"]),
        "url": f"/photos/{m['filename']}",
        "thumb": f"/photos/{m['filename']}",
        "extracted": True,
        "extractedFrom": {
            "pdfStem": m["stem"],
            "pdfUrl": parent.get("url", ""),
            "page": m["page"],
            "pdfTitle": parent.get("title", ""),
            "kind": m["kind"],
        },
    }
    data["images"].append(record)
    added += 1

data["counts"]["images"] = len(data["images"])

with open(ROOT / "data.json", "w") as f:
    json.dump(data, f, indent=2, ensure_ascii=False)

print(f"existing curated images: {existing_count}")
print(f"extracted photos added:  {added}")
print(f"total images now:        {len(data['images'])}")
