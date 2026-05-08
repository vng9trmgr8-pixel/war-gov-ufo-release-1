#!/usr/bin/env python3
"""
UFO — Release 01 bulk downloader.

Reads manifest.txt and pulls every URL using curl_cffi (impersonates Chrome's
TLS fingerprint to bypass war.gov's Akamai bot wall). Files mirror the URL path
into ./files/. Resumable: skips already-downloaded files.

Usage:
    pip3 install --user curl_cffi
    python3 download.py
"""
import os, sys, time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from urllib.parse import urlparse, unquote

try:
    from curl_cffi import requests
except ImportError:
    print("Installing curl_cffi...")
    os.system(f"{sys.executable} -m pip install --user curl_cffi")
    from curl_cffi import requests

ROOT      = Path(__file__).parent
MANIFEST  = ROOT / "manifest.txt"
OUT_DIR   = ROOT / "files"
WORKERS   = 6
HEADERS   = {"Referer": "https://www.war.gov/ufo/"}


def url_to_local_path(url: str) -> Path:
    path = unquote(urlparse(url).path)
    if not path or path.endswith("/"):
        path = path + "index.html"
    return OUT_DIR / path.lstrip("/")


def download(url: str):
    if "dvidshub.net" in url:
        return ("skip-vid", url, "video page — open in browser to view/download")
    dest = url_to_local_path(url)
    if dest.exists() and dest.stat().st_size > 0:
        return ("skip", url, dest.stat().st_size)
    dest.parent.mkdir(parents=True, exist_ok=True)
    try:
        r = requests.get(url, impersonate="chrome", headers=HEADERS, timeout=60)
        if r.status_code != 200:
            return ("fail", url, f"HTTP {r.status_code}")
        dest.write_bytes(r.content)
        return ("ok", url, len(r.content))
    except Exception as e:
        return ("err", url, repr(e)[:120])


def main():
    urls = [
        line.strip() for line in MANIFEST.read_text().splitlines()
        if line.strip() and not line.startswith("#")
    ]
    print(f"manifest: {len(urls)} URLs | {WORKERS} workers")
    counts = {"ok": 0, "skip": 0, "skip-vid": 0, "fail": 0, "err": 0}
    with ThreadPoolExecutor(max_workers=WORKERS) as ex:
        futs = {ex.submit(download, u): u for u in urls}
        for i, fut in enumerate(as_completed(futs), 1):
            status, url, info = fut.result()
            counts[status] += 1
            mark = {"ok": "OK", "skip": "--", "skip-vid": "VID",
                    "fail": "FAIL", "err": "ERR"}[status]
            print(f"[{i:3d}/{len(urls)}] {mark:4s}  {url}  ({info})")
    print(f"\nSummary: {counts}")
    print(f"Files saved under: {OUT_DIR.resolve()}")


if __name__ == "__main__":
    main()
