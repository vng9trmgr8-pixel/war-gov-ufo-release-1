#!/usr/bin/env python3
"""
Extract photographs from the war.gov UFO Release 01 PDFs.

Two passes:

PASS A — embedded images that are smaller than the page they live on:
  These are real embedded figures (newspaper clippings, FMV stills, sketches).
  Filter out tiny graphics + low-detail (text) images.

PASS B — full pages that contain a photograph (not text):
  Look at per-page OCR text length (from extracted-text/<stem>.txt).
  If text length < TEXT_THRESHOLD AND the rendered page has photo-like
  tonal content, crop the dark-content bounding box and save it.

Output: photos/<stem>__pNN_iMM.jpg + photos/_photos.json manifest.
"""
import io
import json
import re
import sys
from pathlib import Path

import fitz
import numpy as np
from PIL import Image

ROOT = Path(__file__).parent
PDF_DIR = Path("/Users/jaredrice/Desktop/claude/Agent/war.gov-ufo/files/medialink/ufo/release_1")
TEXT_DIR = ROOT / "extracted-text"
OUT_DIR = ROOT / "photos"
OUT_DIR.mkdir(exist_ok=True)

# Thresholds
EMBED_MIN_DIM        = 250
EMBED_MAX_PAGE_COV   = 0.85    # embedded-image area / page area
PAGE_LOW_TEXT_CHARS  = 250     # below this, page is likely a photo or blank
PAGE_RENDER_DPI      = 150
JPEG_QUALITY         = 82
JPEG_MAX_DIM         = 1600

PAGE_HDR = re.compile(r"^--- page (\d+)(?: \(OCR\))? ---\s*$", re.MULTILINE)


# ---------------------- shared helpers ----------------------

def is_photo_content(rgb_arr: np.ndarray) -> tuple[bool, str]:
    """Distinguish real photographic content from text / blank / colored paper."""
    h, w = rgb_arr.shape[:2]
    if h * w == 0:
        return (False, "empty")

    # Downsample for histogram tests
    sample = rgb_arr[::max(1, h // 100), ::max(1, w // 100)]
    sample = sample.reshape(-1, 3)
    if sample.shape[0] == 0:
        return (False, "empty")
    gray = (0.299 * sample[:, 0] + 0.587 * sample[:, 1] + 0.114 * sample[:, 2])
    std  = gray.std()
    white_ratio   = (gray > 235).mean()
    midtone_ratio = ((gray > 60) & (gray < 220)).mean()

    if white_ratio > 0.85:
        return (False, f"blank ({white_ratio:.0%} white)")
    if std < 25:
        return (False, f"flat (std={std:.0f})")
    if midtone_ratio < 0.20 and white_ratio > 0.55:
        return (False, f"text-page (mid={midtone_ratio:.0%}, white={white_ratio:.0%})")

    # Spatial uniformity: tile into 6x6 grid, compute std of block means.
    # Photos have structure → block means vary (light/dark regions).
    # Uniform colored paper has all blocks similar → low std.
    h2, w2 = rgb_arr.shape[:2]
    full_gray = (0.299 * rgb_arr[:, :, 0] + 0.587 * rgb_arr[:, :, 1]
                 + 0.114 * rgb_arr[:, :, 2])
    bh, bw = h2 // 6, w2 // 6
    block_std = 0.0
    if bh > 0 and bw > 0:
        block_means = np.array([
            full_gray[i*bh:(i+1)*bh, j*bw:(j+1)*bw].mean()
            for i in range(6) for j in range(6)
        ])
        block_std = float(block_means.std())

    # Histogram concentration as a corroborating signal
    hist, _ = np.histogram(gray, bins=32, range=(0, 256))
    top4 = np.sort(hist)[-4:].sum()
    concentration = top4 / hist.sum() if hist.sum() else 0

    # Mostly-white pages with moderate variance = paper backsides / sparse text scans.
    # Real photos with white backgrounds (e.g., evidence photo on white) usually
    # have a clearly dominant dark subject — i.e., a tightly clustered low-gray
    # mass. We approximate that with: low_gray_ratio in 5-50%.
    low_gray_ratio = (gray < 100).mean()
    is_paper_backside = white_ratio > 0.45 and low_gray_ratio < 0.05
    if is_paper_backside:
        return (False, f"paper-backside (white={white_ratio:.0%}, dark={low_gray_ratio:.0%})")

    # Strong spatial structure → photo (overrides histogram concentration test)
    if block_std >= 30:
        return (True, f"photo (block_std={block_std:.0f}, mid={midtone_ratio:.0%}, "
                      f"white={white_ratio:.0%}, dark={low_gray_ratio:.0%})")

    # Weak spatial structure → reject as uniform field
    if block_std < 18:
        return (False, f"uniform-spatial (block std={block_std:.0f})")
    if concentration > 0.78:
        return (False, f"uniform-tone (block_std={block_std:.0f}, conc={concentration:.0%})")

    # Borderline (block_std 18-30): accept only with strong photo midtone profile
    if midtone_ratio > 0.55 and white_ratio < 0.40:
        return (True, f"photo-borderline (block_std={block_std:.0f}, mid={midtone_ratio:.0%})")
    return (False, f"borderline-rejected (block_std={block_std:.0f}, mid={midtone_ratio:.0%}, "
                   f"white={white_ratio:.0%})")


def crop_dark_bbox(rgb_arr: np.ndarray) -> np.ndarray:
    """Crop to bounding box of non-white pixels (with small margin)."""
    gray = (0.299 * rgb_arr[:, :, 0] + 0.587 * rgb_arr[:, :, 1] + 0.114 * rgb_arr[:, :, 2])
    mask = gray < 230
    rows = np.any(mask, axis=1)
    cols = np.any(mask, axis=0)
    if not rows.any() or not cols.any():
        return rgb_arr
    r0, r1 = np.argmax(rows), len(rows) - 1 - np.argmax(rows[::-1])
    c0, c1 = np.argmax(cols), len(cols) - 1 - np.argmax(cols[::-1])
    pad = 12
    h, w = rgb_arr.shape[:2]
    r0 = max(0, r0 - pad); r1 = min(h - 1, r1 + pad)
    c0 = max(0, c0 - pad); c1 = min(w - 1, c1 + pad)
    return rgb_arr[r0:r1 + 1, c0:c1 + 1]


def save_jpeg(arr: np.ndarray, out_path: Path) -> tuple[int, int]:
    img = Image.fromarray(arr).convert("RGB")
    if max(img.size) > JPEG_MAX_DIM:
        scale = JPEG_MAX_DIM / max(img.size)
        img = img.resize((int(img.size[0] * scale), int(img.size[1] * scale)), Image.Resampling.LANCZOS)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    img.save(out_path, format="JPEG", quality=JPEG_QUALITY, optimize=True)
    return img.size


# ---------------------- pass A: embedded sub-page images ----------------------

def pass_a_embedded(doc: fitz.Document, stem: str) -> list[dict]:
    kept = []
    seen: set[int] = set()
    for page_num, page in enumerate(doc, 1):
        page_area = page.rect.width * page.rect.height
        for img_idx, info in enumerate(page.get_images(full=True)):
            xref = info[0]
            if xref in seen:
                continue
            seen.add(xref)
            rects = page.get_image_rects(xref)
            biggest = max((r.width * r.height for r in rects), default=0)
            page_cov = biggest / page_area if page_area else 1.0
            if page_cov > EMBED_MAX_PAGE_COV:
                continue  # full-page raster — handled by pass B
            try:
                base = doc.extract_image(xref)
            except Exception:
                continue
            w, h = base["width"], base["height"]
            if max(w, h) < EMBED_MIN_DIM:
                continue
            img = Image.open(io.BytesIO(base["image"])).convert("RGB")
            arr = np.array(img)
            ok, reason = is_photo_content(arr)
            if not ok:
                continue
            out_name = f"{stem}__p{page_num:03d}_e{img_idx:02d}.jpg"
            final_w, final_h = save_jpeg(arr, OUT_DIR / out_name)
            kept.append({
                "stem": stem, "page": page_num, "kind": "embedded",
                "filename": out_name, "w": final_w, "h": final_h,
                "page_cov": round(page_cov, 2), "reason": reason,
            })
    return kept


# ---------------------- pass B: full pages with photo content ----------------------

def parse_per_page_text(stem: str) -> dict[int, int]:
    """Return {page_num: char_count} parsed from OCR'd text file."""
    txt_path = TEXT_DIR / f"{stem}.txt"
    if not txt_path.exists():
        return {}
    raw = txt_path.read_text()
    matches = list(PAGE_HDR.finditer(raw))
    out: dict[int, int] = {}
    for i, m in enumerate(matches):
        pg = int(m.group(1))
        end = matches[i + 1].start() if i + 1 < len(matches) else len(raw)
        body = raw[m.end():end].strip()
        out[pg] = len(body)
    return out


def pass_b_pages(doc: fitz.Document, stem: str, kept_a: list[dict]) -> list[dict]:
    page_text = parse_per_page_text(stem)
    if not page_text:
        return []
    already = {k["page"] for k in kept_a}
    kept = []
    for page_num, page in enumerate(doc, 1):
        if page_num in already:
            continue
        if page_text.get(page_num, 0) >= PAGE_LOW_TEXT_CHARS:
            continue  # has substantial text → it's a text page
        # Render the page
        try:
            pix = page.get_pixmap(dpi=PAGE_RENDER_DPI)
        except Exception:
            continue
        arr = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.height, pix.width, pix.n)
        if pix.n == 4:
            arr = arr[:, :, :3]
        elif pix.n == 1:
            arr = np.repeat(arr, 3, axis=2)
        ok, reason = is_photo_content(arr)
        if not ok:
            continue
        cropped = crop_dark_bbox(arr)
        if min(cropped.shape[:2]) < 200:  # too small after cropping
            continue
        out_name = f"{stem}__p{page_num:03d}_pg.jpg"
        final_w, final_h = save_jpeg(cropped, OUT_DIR / out_name)
        kept.append({
            "stem": stem, "page": page_num, "kind": "page-render",
            "filename": out_name, "w": final_w, "h": final_h,
            "ocr_chars": page_text.get(page_num, 0), "reason": reason,
        })
    return kept


# ---------------------- driver ----------------------

def main():
    only = [a for a in sys.argv[1:] if not a.startswith("-")]
    pdfs = sorted(PDF_DIR.glob("*.pdf"))
    if only:
        pdfs = [p for p in pdfs if any(o in p.name for o in only)]

    print(f"Scanning {len(pdfs)} PDFs", flush=True)
    all_kept: list[dict] = []
    for i, p in enumerate(pdfs, 1):
        try:
            doc = fitz.open(p)
        except Exception as e:
            print(f"[{i}/{len(pdfs)}] OPEN ERR  {p.name}: {e!r}")
            continue
        a = pass_a_embedded(doc, p.stem)
        b = pass_b_pages(doc, p.stem, a)
        doc.close()
        all_kept.extend(a + b)
        print(f"[{i}/{len(pdfs)}] embedded={len(a):3d}  pages={len(b):3d}  {p.name}", flush=True)

    manifest = OUT_DIR / "_photos.json"
    manifest.write_text(json.dumps(all_kept, indent=2))
    print(f"\nWROTE {manifest} — {len(all_kept)} photos kept")


if __name__ == "__main__":
    main()
