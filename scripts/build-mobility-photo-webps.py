#!/usr/bin/env python3
"""Build animated WebP demos for mobility moves from two still frames.

Sources (in order):
  1. demos/mobility-source/{id}/0.jpg + 1.jpg  (AI or photo pairs)
  2. free-exercise-db stills when SOURCE_MAP has a true match

Does NOT overwrite with wrong FEDB copies. Stick demos are replaced when
photo pairs exist.

Usage:
  python scripts/build-mobility-photo-webps.py
  python scripts/build-mobility-photo-webps.py --force
  python scripts/build-mobility-photo-webps.py --only wu-cat-cow,cd-cobra
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
DEMOS = ROOT / "WorkoutPlanner.Api" / "wwwroot" / "demos"
SOURCE = DEMOS / "mobility-source"

MAX_EDGE = 480
DURATION_MS = 750
QUALITY = 78

# True visual matches only (same as MobilityCatalog SourceDemoId)
FEDB_MATCHES = {
    "wu-march": "step-up-with-knee-raise",
    "wu-jacks": "star-jump",
    "wu-high-knees": "knee-tuck-jump",
    "wu-band-disloc": "band-pull-apart",
    "wu-dead-bug": "dead-bug",
    "wu-bw-squat": "bodyweight-squat",
    "wu-glute-bridge": "butt-lift-bridge",
    "wu-calf-raise": "standing-calf-raises",
    "cd-ham-hinge": "stiff-leg-barbell-good-morning",
}

# Need 2-frame photo/AI pairs in mobility-source/
PHOTO_PAIR_IDS = [
    "wu-arm-circles",
    "wu-scap-pushup",
    "wu-cat-cow",
    "wu-bird-dog",
    "wu-hip-circles",
    "wu-leg-swings",
    "wu-wrist-circles",
    "wu-shoulder-rolls",
    "wu-torso-twist",
    "cd-chest-door",
    "cd-tricep-oh",
    "cd-cross-body",
    "cd-child-pose",
    "cd-thread-needle",
    "cd-quad-stand",
    "cd-fig4",
    "cd-calf-wall",
    "cd-hip-flexor",
    "cd-cobra",
    "cd-knees-chest",
    "cd-forearm-stretch",
    "cd-neck-side",
    "cd-breathe",
]


def fit_pad(im: Image.Image, w: int, h: int) -> Image.Image:
    im = im.convert("RGB")
    im = im.copy()
    im.thumbnail((MAX_EDGE, MAX_EDGE), Image.Resampling.LANCZOS)
    canvas = Image.new("RGB", (w, h), (245, 246, 248))
    canvas.paste(im, ((w - im.width) // 2, (h - im.height) // 2))
    return canvas


def load_pair(folder: Path) -> tuple[Image.Image, Image.Image] | None:
    a = b = None
    for name0, name1 in (
        ("0.jpg", "1.jpg"),
        ("0.jpeg", "1.jpeg"),
        ("0.png", "1.png"),
        ("0.webp", "1.webp"),
    ):
        p0, p1 = folder / name0, folder / name1
        if p0.exists() and p1.exists():
            a, b = Image.open(p0), Image.open(p1)
            break
    if a is None or b is None:
        return None
    a, b = a.convert("RGB"), b.convert("RGB")
    w = max(min(a.width, MAX_EDGE), min(b.width, MAX_EDGE))
    h = max(min(a.height, MAX_EDGE), min(b.height, MAX_EDGE))
    # Use max of thumbnail sizes
    a.thumbnail((MAX_EDGE, MAX_EDGE), Image.Resampling.LANCZOS)
    b.thumbnail((MAX_EDGE, MAX_EDGE), Image.Resampling.LANCZOS)
    w, h = max(a.width, b.width), max(a.height, b.height)
    return fit_pad(a, w, h), fit_pad(b, w, h)


def save_webp(a: Image.Image, b: Image.Image, out: Path) -> None:
    out.parent.mkdir(parents=True, exist_ok=True)
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


def refresh_index() -> None:
    ids = sorted(p.stem for p in DEMOS.glob("*.webp") if not p.name.startswith("_"))
    (DEMOS / "index.json").write_text(
        json.dumps(
            {
                "format": "webp",
                "pathPattern": "/demos/{id}.webp",
                "count": len(ids),
                "ids": ids,
            },
            indent=2,
        ),
        encoding="utf-8",
    )
    print(f"index.json: {len(ids)} demos")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--only", type=str, default="", help="Comma-separated mobility ids")
    args = ap.parse_args()
    only = {x.strip() for x in args.only.split(",") if x.strip()}

    DEMOS.mkdir(parents=True, exist_ok=True)
    ok = miss = skip = 0

    targets = PHOTO_PAIR_IDS if not only else [i for i in PHOTO_PAIR_IDS if i in only]
    # Also allow building only FEDB matches if requested
    if only:
        for i in only:
            if i in FEDB_MATCHES and i not in targets:
                targets.append(i)

    print("Building photo-pair mobility WebPs…")
    for mid in targets:
        out = DEMOS / f"{mid}.webp"
        if out.exists() and not args.force and out.stat().st_size > 2000:
            # Still rebuild if source is newer
            src_dir = SOURCE / mid
            if src_dir.exists():
                src_mtime = max((p.stat().st_mtime for p in src_dir.glob("*") if p.is_file()), default=0)
                if src_mtime <= out.stat().st_mtime:
                    print(f"  skip {mid} (up to date)")
                    skip += 1
                    continue
            else:
                print(f"  skip {mid} (exists, no source dir)")
                skip += 1
                continue

        pair = load_pair(SOURCE / mid)
        if not pair:
            print(f"  MISS pair for {mid} — expected {SOURCE / mid}/0.jpg and 1.jpg")
            miss += 1
            continue
        a, b = pair
        save_webp(a, b, out)
        print(f"  ok {mid} ({out.stat().st_size // 1024} KB)")
        ok += 1

    # FEDB true matches: copy existing exercise webp if present
    print("Copying true FEDB mobility matches…")
    for mid, src_id in FEDB_MATCHES.items():
        if only and mid not in only:
            continue
        src = DEMOS / f"{src_id}.webp"
        dst = DEMOS / f"{mid}.webp"
        if not src.exists():
            print(f"  MISS FEDB webp {src_id} for {mid}")
            miss += 1
            continue
        if dst.exists() and not args.force and dst.stat().st_mtime >= src.stat().st_mtime:
            skip += 1
            continue
        import shutil

        shutil.copy2(src, dst)
        print(f"  {mid} ← {src_id}")
        ok += 1

    refresh_index()
    print(f"Done: {ok} built/copied, {miss} missing, {skip} skipped")


if __name__ == "__main__":
    main()
