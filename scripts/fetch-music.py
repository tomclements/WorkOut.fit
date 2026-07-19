#!/usr/bin/env python3
"""Download public-domain / CC0 music for the workout runner."""

from __future__ import annotations

import re
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "WorkoutPlanner.Api" / "wwwroot" / "music"
OUT.mkdir(parents=True, exist_ok=True)

UA = {"User-Agent": "WorkOut.fit music fetcher (personal fitness app)"}

# FreePD (public domain) – try known slug patterns and page scrape
FREEPAGE_PAGES = [
    "https://freepd.com/upbeat.php",
    "https://freepd.com/electronic.php",
    "https://freepd.com/epic.php",
    "https://freepd.com/",
]

# Internet Archive items that are free to use (verify collection licenses)
# Using well-known free sample / PD sources with direct mp3 links.
CANDIDATES = [
    # FreePD-style direct (will 404 if wrong – scraper fills real ones)
]

# SoundHelix demo tracks are free to use for testing/demo (composer: Thomas Weber)
# Prefer FreePD PD tracks when available.
SOUNDHELIX = [
    ("drive-1.mp3", "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3"),
    ("drive-2.mp3", "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3"),
    ("focus-1.mp3", "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-8.mp3"),
    ("focus-2.mp3", "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-9.mp3"),
    ("power-1.mp3", "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3"),
    ("power-2.mp3", "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-10.mp3"),
    ("calm-1.mp3", "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-13.mp3"),
    ("calm-2.mp3", "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-15.mp3"),
]


def fetch(url: str) -> bytes:
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=60) as resp:
        return resp.read()


def scrape_freepd() -> list[tuple[str, str]]:
    found: list[tuple[str, str]] = []
    for page in FREEPAGE_PAGES:
        try:
            html = fetch(page).decode("utf-8", "replace")
        except Exception as ex:
            print(f"  scrape fail {page}: {ex}")
            continue
        # href="music/Something.mp3" or full URL
        for m in re.finditer(r'href=["\']([^"\']+\.mp3)["\']', html, re.I):
            href = m.group(1)
            if href.startswith("http"):
                url = href
            elif href.startswith("/"):
                url = "https://freepd.com" + href
            else:
                url = "https://freepd.com/" + href.lstrip("./")
            name = Path(href).name
            found.append((name, url))
        print(f"  {page}: {len(found)} cumulative mp3 links")
    # de-dupe by name
    by_name = {}
    for name, url in found:
        by_name[name] = url
    return list(by_name.items())


def download(name: str, url: str) -> bool:
    dest = OUT / name
    if dest.exists() and dest.stat().st_size > 50_000:
        print(f"  skip existing {name} ({dest.stat().st_size} bytes)")
        return True
    try:
        data = fetch(url)
        if len(data) < 10_000:
            print(f"  too small {name}: {len(data)}")
            return False
        dest.write_bytes(data)
        print(f"  wrote {name} ({len(data)} bytes) from {url}")
        return True
    except Exception as ex:
        print(f"  fail {name}: {ex}")
        return False


def main():
    print("Scraping FreePD…")
    freepd = scrape_freepd()
    print(f"Found {len(freepd)} FreePD tracks")

    # Prefer FreePD if we got enough; map into style slots
    used = []
    if len(freepd) >= 4:
        # Take a spread of tracks
        picks = freepd[:16]
        style_names = [
            ("drive-1", 0),
            ("drive-2", 1),
            ("focus-1", 2),
            ("focus-2", 3),
            ("power-1", 4),
            ("power-2", 5),
            ("calm-1", 6),
            ("calm-2", 7),
        ]
        for out_stem, idx in style_names:
            if idx >= len(picks):
                break
            orig_name, url = picks[idx]
            ok = download(f"{out_stem}.mp3", url)
            if ok:
                used.append((out_stem, orig_name, url))
    else:
        print("FreePD sparse — falling back to SoundHelix demos")
        for name, url in SOUNDHELIX:
            if download(name, url):
                used.append((name, name, url))

    # Always ensure we have 8 files; fill gaps with SoundHelix
    for name, url in SOUNDHELIX:
        dest = OUT / name
        if not dest.exists():
            download(name, url)

    print("Done. Files in", OUT)
    for p in sorted(OUT.glob("*.mp3")):
        print(f"  {p.name}: {p.stat().st_size // 1024} KB")


if __name__ == "__main__":
    main()
