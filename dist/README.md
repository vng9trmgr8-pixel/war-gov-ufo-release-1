# UFO — Release 01 — bulk download bundle

A reproducible mirror of the U.S. Department of War's UAP/UFO Release 01,
released 8 May 2026.

- 119 PDFs (≈2.3 GB)
- 14 images (≈30 MB)
- 28 video pages (DVIDS) — links only; videos play in-browser

Source: <https://www.war.gov/ufo>
Mirror: <https://war-gov-ufo-release-1.vercel.app>

## Files in this bundle

- `manifest.txt` — every asset URL, one per line.
- `download.py` — Python script that bulk-downloads everything past Akamai
  bot protection (uses `curl_cffi` to impersonate Chrome's TLS fingerprint —
  plain `wget` / `curl` get HTTP 403 from war.gov).
- `README.md` — this file.

## Quick start

```bash
unzip ufo-release-1-bundle.zip
cd ufo-release-1-bundle
pip3 install --user curl_cffi
python3 download.py
```

After it completes, all files mirror the war.gov URL paths under `./files/`.
The script is resumable — re-running skips files that already exist.

DVIDS video URLs are listed in the manifest but skipped by the script (they're
HTML pages, not direct video files). Open each in a browser to play or grab
the source video manually.

## Disk space

- About 2.3 GB once everything is fetched.

## Disclaimer

These are public-domain U.S. government records. This bundle is just a
manifest and a downloader — nothing here rehosts, modifies, or repackages
the content. All bytes come straight from war.gov / dvidshub.net.
