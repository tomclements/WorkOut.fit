#!/usr/bin/env python3
"""Build animated WebP demos by flipping free-exercise-db stills (0.jpg / 1.jpg).

Output: WorkoutPlanner.Api/wwwroot/demos/{exercise-id}.webp

Legal: free-exercise-db images are public domain (Unlicense).

Usage:
  python scripts/build-exercise-webps.py
  python scripts/build-exercise-webps.py --limit 20
  python scripts/build-exercise-webps.py --force
"""

from __future__ import annotations

import argparse
import io
import json
import re
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
EX_PATH = ROOT / "WorkoutPlanner.Api" / "Data" / "exercises.json"
OUT_DIR = ROOT / "WorkoutPlanner.Api" / "wwwroot" / "demos"
UA = {"User-Agent": "WorkOut.fit demo builder (public-domain free-exercise-db stills)"}

MAX_EDGE = 480
DURATION_MS = 700
QUALITY = 72
WORKERS = 8


def fetch_image(url: str) -> Image.Image:
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=45) as resp:
        data = resp.read()
    im = Image.open(io.BytesIO(data))
    return im.convert("RGB")


def fit(im: Image.Image, max_edge: int = MAX_EDGE) -> Image.Image:
    out = im.copy()
    out.thumbnail((max_edge, max_edge), Image.Resampling.LANCZOS)
    return out


def pair_urls(image_url: str) -> tuple[str, str] | None:
    """From .../0.jpg produce (0, 1) urls."""
    if not image_url:
        return None
    m = re.search(r"^(.*)/0\.(jpe?g|png|webp)(\?.*)?$", image_url, re.I)
    if not m:
        return None
    base, ext, q = m.group(1), m.group(2), m.group(3) or ""
    return f"{base}/0.{ext}{q}", f"{base}/1.{ext}{q}"


def build_one(ex: dict, force: bool) -> tuple[str, str]:
    eid = ex["id"]
    out = OUT_DIR / f"{eid}.webp"
    if out.exists() and not force and out.stat().st_size > 1000:
        return eid, "skip"

    pair = pair_urls(ex.get("imageUrl") or "")
    if not pair:
        return eid, "no-pair"

    u0, u1 = pair
    try:
        a = fit(fetch_image(u0))
        b = fit(fetch_image(u1))
        # Match sizes (thumbnail keeps aspect; pad to same canvas if needed)
        w = max(a.width, b.width)
        h = max(a.height, b.height)

        def pad(im: Image.Image) -> Image.Image:
            if im.width == w and im.height == h:
                return im
            canvas = Image.new("RGB", (w, h), (245, 245, 245))
            canvas.paste(im, ((w - im.width) // 2, (h - im.height) // 2))
            return canvas

        a, b = pad(a), pad(b)
        a.save(
            out,
            format="WEBP",
            save_all=True,
            append_images=[b],
            duration=DURATION_MS,
            loop=0,
            quality=QUALITY,
            method=4,
        )
        return eid, f"ok:{out.stat().st_size}"
    except urllib.error.HTTPError as e:
        return eid, f"http:{e.code}"
    except Exception as e:
        return eid, f"err:{type(e).__name__}:{e}"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=0, help="Only first N with images")
    ap.add_argument("--force", action="store_true", help="Rebuild existing")
    ap.add_argument("--workers", type=int, default=WORKERS)
    args = ap.parse_args()

    exercises = json.loads(EX_PATH.read_text(encoding="utf-8"))
    candidates = [e for e in exercises if pair_urls(e.get("imageUrl") or "")]
    if args.limit:
        candidates = candidates[: args.limit]

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    # clean test file if present
    test = OUT_DIR / "_test.webp"
    if test.exists():
        test.unlink()

    print(f"Building WebP demos for {len(candidates)} exercises → {OUT_DIR}")
    stats = {"ok": 0, "skip": 0, "fail": 0}
    fails: list[str] = []

    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        futs = {pool.submit(build_one, ex, args.force): ex["id"] for ex in candidates}
        done = 0
        for fut in as_completed(futs):
            eid, status = fut.result()
            done += 1
            if status == "skip":
                stats["skip"] += 1
            elif status.startswith("ok:"):
                stats["ok"] += 1
            else:
                stats["fail"] += 1
                fails.append(f"{eid}: {status}")
            if done % 25 == 0 or done == len(candidates):
                print(f"  {done}/{len(candidates)}  ok={stats['ok']} skip={stats['skip']} fail={stats['fail']}")

    # index for runtime
    index = {
        "format": "webp",
        "durationMs": DURATION_MS,
        "pathPattern": "/demos/{id}.webp",
        "count": len(list(OUT_DIR.glob("*.webp"))),
        "ids": sorted(p.stem for p in OUT_DIR.glob("*.webp") if not p.name.startswith("_")),
    }
    (OUT_DIR / "index.json").write_text(json.dumps(index, indent=2), encoding="utf-8")
    print("Done:", stats)
    if fails[:15]:
        print("Sample failures:")
        for f in fails[:15]:
            print(" ", f)


if __name__ == "__main__":
    main()
