#!/usr/bin/env python3
"""Build data.json from war.gov UFO Release 01 CSV manifest."""
import csv
import json
import re
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

ROOT = Path(__file__).parent
CSV_SRC = Path("/Users/jaredrice/Desktop/claude/Olaf/war.gov-ufo/uap-csv.csv")
POSTER_RE = re.compile(r'poster="([^"]+)"')


def fetch_poster(video_id):
    if not video_id:
        return ""
    url = f"https://www.dvidshub.net/video/embed/{video_id}"
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=20) as r:
            html = r.read().decode("utf-8", errors="ignore")
        m = POSTER_RE.search(html)
        return m.group(1) if m else ""
    except Exception:
        return ""


def clean(s):
    return (s or "").replace(" ", " ").strip()


def main():
    with CSV_SRC.open(encoding="utf-8-sig") as f:
        rows = list(csv.DictReader(f))

    pdfs, images, videos = [], [], []
    for r in rows:
        t = clean(r.get("Type", "")).upper()
        record = {
            "title": clean(r.get("Title", "")),
            "agency": clean(r.get("Agency", "")),
            "incidentDate": clean(r.get("Incident Date", "")),
            "incidentLocation": clean(r.get("Incident Location", "")),
            "releaseDate": clean(r.get("Release Date", "")),
            "blurb": clean(r.get("Description Blurb", "")),
            "url": clean(r.get("PDF | Image Link", "")),
            "thumb": clean(r.get("Modal Image", "")),
            "videoId": clean(r.get("DVIDS Video ID", "")),
            "videoTitle": clean(r.get("Video Title", "")),
        }
        if t == "PDF":
            pdfs.append(record)
        elif t == "IMG":
            images.append(record)
        elif t == "VID":
            videos.append(record)

    print(f"fetching DVIDS posters for {len(videos)} videos...")
    with ThreadPoolExecutor(max_workers=8) as ex:
        posters = list(ex.map(fetch_poster, [v["videoId"] for v in videos]))
    for v, p in zip(videos, posters):
        v["thumb"] = p
        v["embed"] = f"https://www.dvidshub.net/video/embed/{v['videoId']}"
        v["dvidsPage"] = f"https://www.dvidshub.net/video/{v['videoId']}"
    print(f"  posters resolved: {sum(1 for p in posters if p)}/{len(posters)}")

    data = {
        "release": "01",
        "releaseDate": "May 8, 2026",
        "source": "U.S. Department of War — war.gov/ufo",
        "sourceUrl": "https://www.war.gov/ufo/",
        "counts": {"pdfs": len(pdfs), "images": len(images), "videos": len(videos)},
        "pdfs": pdfs,
        "images": images,
        "videos": videos,
    }
    out = ROOT / "data.json"
    out.write_text(json.dumps(data, indent=2, ensure_ascii=False))
    print(f"wrote {out} — {len(pdfs)} pdfs, {len(images)} images, {len(videos)} videos")


if __name__ == "__main__":
    main()
