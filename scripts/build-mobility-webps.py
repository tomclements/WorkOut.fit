#!/usr/bin/env python3
"""Copy free-exercise-db WebP demos onto warm-up / cool-down mobility ids
ONLY when the source is a true visual match.

Grok WebP demos (cat-cow, cobra, bird-dog, etc.) live under GROK_ONLY —
never overwrite those with FEDB copies. Stick generators are dead (see
generate-mobility-stick-demos.py DEAD header); art is Grok batch 2026-09-27.

Keep SOURCE_MAP in sync with MobilityCatalog.cs SourceDemoId (non-null values only).
"""

from __future__ import annotations

import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DEMOS = ROOT / "WorkoutPlanner.Api" / "wwwroot" / "demos"

# mobility id -> source exercise id (must already have a .webp from build-exercise-webps.py)
# Only include true visual matches - GROK_ONLY ids stay empty here (Grok WebPs, never FEDB-overwrite).
SOURCE_MAP = {
    # Grok originals (install-grok-demos.py / Grok batch 2026-09-27) - do NOT copy FEDB snaps over these:
    # wu-march, wu-jacks, wu-high-knees, wu-dead-bug, wu-bw-squat, wu-glute-bridge,
    # wu-calf-raise, wu-band-disloc, cd-ham-hinge (+ all GROK_ONLY ids below).
    # Only true visual-match FEDB copies remain (also used as still fallback via MobilityCatalog SourceDemoId).
}

# Grok WebPs — never overwrite with FEDB copies
GROK_ONLY = {
    "wu-march",
    "wu-jacks",
    "wu-high-knees",
    "wu-dead-bug",
    "wu-arm-circles",
    "wu-scap-pushup",
    "wu-cat-cow",
    "wu-bird-dog",
    "wu-hip-circles",
    "wu-leg-swings",
    "wu-wrist-circles",
    "wu-shoulder-rolls",
    "wu-torso-twist",
    "wu-bw-squat",
    "wu-glute-bridge",
    "wu-calf-raise",
    "wu-band-disloc",
    "cd-ham-hinge",
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
}


def refresh_index():
    import json

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


def main():
    DEMOS.mkdir(parents=True, exist_ok=True)
    ok = miss = skip = 0
    for mob_id, src_id in SOURCE_MAP.items():
        if mob_id in GROK_ONLY:
            print(f"  SKIP grok-only {mob_id}")
            skip += 1
            continue
        src = DEMOS / f"{src_id}.webp"
        dst = DEMOS / f"{mob_id}.webp"
        if not src.exists():
            print(f"  MISS source {src_id} for {mob_id}")
            miss += 1
            continue
        shutil.copy2(src, dst)
        print(f"  {mob_id} <- {src_id} ({dst.stat().st_size // 1024} KB)")
        ok += 1
    print(f"Done: {ok} copied, {miss} missing, {skip} grok-only left alone")
    refresh_index()


if __name__ == "__main__":
    main()
