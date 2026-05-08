# UFO — Release 01

A reorganized, browsable mirror of the U.S. Department of War's UAP/UFO archive,
**Release 01** (cleared for release May 8, 2026).

- 119 declassified PDFs (with summaries + thumbnails, links to originals)
- 14 still images (gallery + lightbox)

Source: https://www.war.gov/ufo

## How it works

- Static HTML/CSS/JS, no framework, no build step.
- All file links and thumbnails point back to **war.gov** (and **dvidshub.net**
  for video). Nothing is rehosted.
- The data driving the page lives in [`data.json`](./data.json), built from
  the war.gov CSV manifest by [`build_data.py`](./build_data.py).

## Local dev

```bash
python3 -m http.server 8765
# → http://localhost:8765
```

## Rebuild data

```bash
python3 build_data.py
```

This re-parses `war.gov-ufo/uap-csv.csv` and rewrites `data.json`.

## Deploy

Hosted on Vercel as a static site (no build command).
