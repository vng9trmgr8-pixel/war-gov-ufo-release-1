#!/usr/bin/env python3
"""
Build the full-content bundle: every war.gov asset we mirror + a README.

Produces ~2.3 GB zip suitable for hosting on Cloudflare R2 so users can
"DOWNLOAD ALL" with one click.
"""
import json
import zipfile
from pathlib import Path

ROOT       = Path(__file__).parent
SOURCE_DIR = Path("/Users/jaredrice/Desktop/claude/Agent/war.gov-ufo/files")
OUT_PATH   = ROOT / "dist" / "ufo-release-1-full.zip"
OUT_PATH.parent.mkdir(parents=True, exist_ok=True)

DATA = json.load(open(ROOT / "data.json"))


README = """# UFO — Release 01 — full archive

Every asset from the U.S. Department of War's UAP/UFO Release 01,
released 8 May 2026, mirrored once and bundled here.

Source: https://www.war.gov/ufo
Mirror UI: https://war-gov-ufo-release-1.vercel.app

Contents:
  pdfs/    — 119 declassified PDFs (≈2.3 GB)
  images/  — 14 still photographs
  README.txt — this file
  manifest.txt — asset catalog (titles, agencies, dates)
  videos.txt — list of DVIDS video page URLs (videos themselves are not
               in the bundle; visit each URL to view)

These are public-domain U.S. government records.
"""


def build_manifest() -> str:
    out = []
    out.append("UFO — Release 01 — manifest")
    out.append("=" * 60)
    out.append(f"PDFs: {len(DATA['pdfs'])}")
    out.append(f"Images: {len(DATA['images'])}")
    out.append(f"Videos (links only): {len(DATA['videos'])}")
    out.append("")
    out.append("=" * 60)
    out.append("PDFs")
    out.append("=" * 60)
    for r in DATA["pdfs"]:
        fname = r["url"].rsplit("/", 1)[-1]
        out.append(f"\n[{r.get('agency','—')}]  {r.get('title','')}")
        out.append(f"  file: pdfs/{fname.lower()}")
        if r.get("incidentDate") and r["incidentDate"] != "N/A":
            out.append(f"  date: {r['incidentDate']}")
        if r.get("incidentLocation") and r["incidentLocation"] != "N/A":
            out.append(f"  loc:  {r['incidentLocation']}")
    out.append("")
    out.append("=" * 60)
    out.append("Images (curated)")
    out.append("=" * 60)
    for r in DATA["images"]:
        if r.get("extracted"):
            continue
        fname = r["url"].rsplit("/", 1)[-1]
        out.append(f"\n[{r.get('agency','—')}]  {r.get('title','')}")
        out.append(f"  file: images/{fname.lower()}")
    return "\n".join(out) + "\n"


def build_videos_txt() -> str:
    lines = ["UFO — Release 01 — DVIDS video pages", "=" * 60, ""]
    for r in DATA["videos"]:
        lines.append(f"[{r.get('agency','—')}]  {r.get('title','')}")
        lines.append(f"  page:  {r.get('dvidsPage','')}")
        lines.append(f"  embed: {r.get('embed','')}")
        lines.append("")
    return "\n".join(lines)


def main():
    pdf_dir = SOURCE_DIR / "medialink/ufo/release_1"
    img_paths = []
    # Pull image filenames from data.json so we get the curated set + match names
    for r in DATA["images"]:
        if r.get("extracted"):
            continue
        fname = r["url"].rsplit("/", 1)[-1].lower()
        candidate = pdf_dir / fname
        if candidate.exists():
            img_paths.append(candidate)

    pdf_paths = sorted([p for p in pdf_dir.glob("*.pdf") if p.is_file()])
    print(f"PDFs:   {len(pdf_paths)}")
    print(f"Images: {len(img_paths)}")
    print(f"Building {OUT_PATH} ...")

    total_in = sum(p.stat().st_size for p in pdf_paths) + sum(p.stat().st_size for p in img_paths)
    print(f"Total source: {total_in/1024/1024/1024:.2f} GB")

    # ZIP_STORED — PDFs and JPEGs are already compressed; deflate adds CPU + barely shrinks.
    with zipfile.ZipFile(OUT_PATH, "w", compression=zipfile.ZIP_STORED, allowZip64=True) as zf:
        zf.writestr("ufo-release-1/README.txt", README)
        zf.writestr("ufo-release-1/manifest.txt", build_manifest())
        zf.writestr("ufo-release-1/videos.txt", build_videos_txt())
        for p in pdf_paths:
            arc = f"ufo-release-1/pdfs/{p.name}"
            zf.write(p, arc)
        for p in img_paths:
            arc = f"ufo-release-1/images/{p.name}"
            zf.write(p, arc)

    sz = OUT_PATH.stat().st_size
    print(f"DONE: {OUT_PATH} ({sz/1024/1024/1024:.2f} GB)")


if __name__ == "__main__":
    main()
