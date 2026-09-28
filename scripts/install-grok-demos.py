#!/usr/bin/env python3
"""Install Grok-generated demo WebPs into WorkoutPlanner.Api/wwwroot/demos.

Copies {id}.webp from --src for the expected Grok batch ids, then keeps the
RDL twin byte-identical (db-romanian-deadlift.webp -> dumbbell-romanian-deadlift.webp).

Optionally refreshes demos/index.json (same shape as build-mobility-webps.refresh_index).
"""

from __future__ import annotations

import argparse
import json
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DEMOS = ROOT / "WorkoutPlanner.Api" / "wwwroot" / "demos"

# P0 24 (exercise stick replacements) + P1 5 + keepers 4 + remaining mobility 23 + RDL pair 2 = 58
P0 = [
    "ab-wheel-rollout",
    "band-row",
    "barbell-back-squat",
    "barbell-bench-press",
    "barbell-row",
    "burpees",
    "db-bent-over-row",
    "db-chest-fly",
    "db-curl",
    "db-lunge",
    "db-overhead-press",
    "db-step-up",
    "db-triceps-extension",
    "farmers-carry",
    "hammer-curl",
    "hanging-knee-raise",
    "kettlebell-goblet-squat",
    "kettlebell-swing",
    "lateral-raise",
    "pull-up",
    "push-up",
    "renegade-row",
    "side-plank",
    "suitcase-carry",
]

# P1 five that formerly pointed at FEDB stills
P1 = [
    "wu-bw-squat",
    "wu-glute-bridge",
    "wu-calf-raise",
    "wu-band-disloc",
    "cd-ham-hinge",
]

# Keepers (original stick animations that stayed as Grok WebPs)
KEEPERS = [
    "wu-march",
    "wu-jacks",
    "wu-high-knees",
    "wu-dead-bug",
]

# Remaining mobility Grok WebPs (STICK_ONLY / GROK_ONLY minus P1 + keepers)
REMAINING_MOBILITY = [
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

RDL_PAIR = [
    "db-romanian-deadlift",
    "dumbbell-romanian-deadlift",
]

EXPECTED_IDS = P0 + P1 + KEEPERS + REMAINING_MOBILITY + RDL_PAIR
assert len(EXPECTED_IDS) == 58, len(EXPECTED_IDS)
assert len(set(EXPECTED_IDS)) == 58


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
    print(f"updated index.json ({len(ids)} demos)")


def main() -> int:
    ap = argparse.ArgumentParser(description="Install Grok demo WebPs into wwwroot/demos")
    ap.add_argument("--src", required=True, type=Path, help="Directory of {id}.webp files")
    ap.add_argument(
        "--require-all",
        action="store_true",
        help="Exit non-zero if any EXPECTED_IDS file is missing from --src",
    )
    ap.add_argument(
        "--refresh-index",
        action="store_true",
        help="Rewrite demos/index.json after copies",
    )
    args = ap.parse_args()

    src: Path = args.src
    if not src.is_dir():
        print(f"error: --src is not a directory: {src}", file=sys.stderr)
        return 2

    DEMOS.mkdir(parents=True, exist_ok=True)

    copied = 0
    missing: list[str] = []
    for eid in EXPECTED_IDS:
        src_file = src / f"{eid}.webp"
        if not src_file.is_file():
            missing.append(eid)
            continue
        dst = DEMOS / f"{eid}.webp"
        shutil.copy2(src_file, dst)
        print(f"  copied {eid}.webp")
        copied += 1

    # Always keep RDL twin byte-identical: db -> dumbbell
    db_rdl = DEMOS / "db-romanian-deadlift.webp"
    twin = DEMOS / "dumbbell-romanian-deadlift.webp"
    if db_rdl.is_file():
        shutil.copy2(db_rdl, twin)
        print("  synced RDL twin: db-romanian-deadlift.webp -> dumbbell-romanian-deadlift.webp")
    else:
        print("  WARN: db-romanian-deadlift.webp missing; could not sync twin", file=sys.stderr)

    if args.refresh_index:
        refresh_index()

    print(f"Done: {copied} copied, {len(missing)} missing (of {len(EXPECTED_IDS)} expected)")
    if missing:
        print("Missing:")
        for m in missing:
            print(f"  - {m}")

    if args.require_all and missing:
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
