#!/usr/bin/env python3
"""
Extract text from every PDF in war.gov-ufo/files/medialink/ufo/release_1.

For each PDF:
  - First try PyMuPDF text extraction (fast, accurate when text is embedded).
  - If a page yields <30 chars, render at 200 DPI and OCR with RapidOCR.

Writes one .txt per PDF to extracted-text/. Resumable — skips files that
already exist with non-empty contents.
"""
import io
import os
import sys
import time
import multiprocessing as mp
from pathlib import Path

import fitz  # PyMuPDF
import numpy as np
from PIL import Image

PDF_DIR = Path("/Users/jaredrice/Desktop/claude/Agent/war.gov-ufo/files/medialink/ufo/release_1")
OUT_DIR = Path(__file__).parent / "extracted-text"
OUT_DIR.mkdir(exist_ok=True)

PROGRESS_PATH = OUT_DIR / "_progress.log"
WORKERS = 8
DPI = 200
MIN_TEXT_PER_PAGE = 30


_worker_ocr = None
def _init_worker():
    """Load OCR model once per worker process."""
    global _worker_ocr
    from rapidocr_onnxruntime import RapidOCR
    _worker_ocr = RapidOCR()


def ocr_page(page: "fitz.Page") -> str:
    pix = page.get_pixmap(dpi=DPI)
    img = Image.open(io.BytesIO(pix.tobytes("png")))
    arr = np.array(img)
    result, _ = _worker_ocr(arr)
    if not result:
        return ""
    return "\n".join(line[1] for line in result)


def extract_one(pdf_path: Path) -> tuple[str, int, float, str]:
    """Process one PDF, write its .txt, return (status, n_pages, secs, msg)."""
    out = OUT_DIR / (pdf_path.stem + ".txt")
    if out.exists() and out.stat().st_size > 50:
        return ("skip", 0, 0.0, str(out))

    t0 = time.time()
    try:
        doc = fitz.open(pdf_path)
    except Exception as e:
        return ("err", 0, 0.0, repr(e)[:160])

    n = len(doc)
    parts: list[str] = [f"=== {pdf_path.name} ({n} pages) ==="]
    ocr_pages = 0

    for i, page in enumerate(doc):
        embedded = page.get_text().strip()
        if len(embedded) >= MIN_TEXT_PER_PAGE:
            parts.append(f"\n--- page {i+1} ---\n{embedded}")
        else:
            try:
                ocr_text = ocr_page(page)
            except Exception as e:
                ocr_text = f"[ocr error: {e!r}]"
            ocr_pages += 1
            parts.append(f"\n--- page {i+1} (OCR) ---\n{ocr_text}")

    doc.close()
    out.write_text("\n".join(parts), encoding="utf-8")
    elapsed = time.time() - t0
    return ("ok", n, elapsed, f"ocr_pages={ocr_pages}")


def main():
    pdfs = sorted(PDF_DIR.glob("*.pdf"))
    print(f"PDFs to process: {len(pdfs)} | workers: {WORKERS}", flush=True)

    # Order largest-first so the long tail starts early and short ones fill in.
    pdfs.sort(key=lambda p: -p.stat().st_size)

    started = time.time()
    total_pages = 0
    total_ocr = 0
    done = 0

    with mp.Pool(processes=WORKERS, initializer=_init_worker) as pool, \
         PROGRESS_PATH.open("w") as plog:
        for pdf, (status, n, elapsed, msg) in zip(
            pdfs, pool.imap_unordered(extract_one, pdfs)
        ):
            done += 1
            total_pages += n
            if "ocr_pages=" in msg:
                total_ocr += int(msg.split("=")[1])
            line = (f"[{done}/{len(pdfs)}] {status:4s} {pdf.name}  "
                    f"pp={n} t={elapsed:.1f}s ({msg})")
            print(line, flush=True)
            plog.write(line + "\n")
            plog.flush()

    print(f"\nDone in {time.time()-started:.0f}s | "
          f"{done} pdfs | {total_pages} pages total | {total_ocr} OCR'd")


if __name__ == "__main__":
    main()
