#!/usr/bin/env python3
"""Copy free-exercise-db WebP demos onto warm-up / cool-down mobility ids.

Maps each wu-*/cd-* move to a closest visual source exercise, then
copies wwwroot/demos/{source}.webp → wwwroot/demos/{mobility-id}.webp

Keep SOURCE_MAP in sync with MobilityCatalog.cs SourceDemoId values.
"""

from __future__ import annotations

import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DEMOS = ROOT / "WorkoutPlanner.Api" / "wwwroot" / "demos"

# mobility id → source exercise id (must already have a .webp from build-exercise-webps.py)
SOURCE_MAP = {
    "wu-march": "step-up-with-knee-raise",
    "wu-jacks": "star-jump",
    "wu-high-knees": "knee-tuck-jump",
    "wu-arm-circles": "around-the-worlds",
    "wu-scap-pushup": "incline-push-up",
    "wu-band-disloc": "band-pull-apart",
    "wu-cat-cow": "hyperextensions-with-no-hyperextension-bench",
    "wu-bird-dog": "plank",
    "wu-dead-bug": "dead-bug",
    "wu-hip-circles": "bodyweight-squat",
    "wu-leg-swings": "scissors-jump",
    "wu-bw-squat": "bodyweight-squat",
    "wu-glute-bridge": "butt-lift-bridge",
    "wu-calf-raise": "standing-calf-raises",
    "wu-wrist-circles": "palms-up-barbell-wrist-curl-over-a-bench",
    "wu-shoulder-rolls": "front-dumbbell-raise",
    "wu-torso-twist": "medicine-ball-full-twist",
    "cd-chest-door": "bodyweight-flyes",
    "cd-tricep-oh": "standing-dumbbell-triceps-extension",
    "cd-cross-body": "around-the-worlds",
    "cd-child-pose": "plank",
    "cd-thread-needle": "hyperextensions-with-no-hyperextension-bench",
    "cd-quad-stand": "bodyweight-squat",
    "cd-ham-hinge": "stiff-leg-barbell-good-morning",
    "cd-fig4": "single-leg-glute-bridge",
    "cd-calf-wall": "standing-calf-raises",
    "cd-hip-flexor": "kneeling-squat",
    "cd-cobra": "reverse-hyperextension",
    "cd-knees-chest": "bent-knee-hip-raise",
    "cd-forearm-stretch": "palms-up-barbell-wrist-curl-over-a-bench",
    "cd-neck-side": "isometric-neck-exercise-sides",
    "cd-breathe": "plank",
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
    ok = miss = 0
    for mob_id, src_id in SOURCE_MAP.items():
        src = DEMOS / f"{src_id}.webp"
        dst = DEMOS / f"{mob_id}.webp"
        if not src.exists():
            print(f"  MISS source {src_id} for {mob_id}")
            miss += 1
            continue
        shutil.copy2(src, dst)
        print(f"  {mob_id} ← {src_id} ({dst.stat().st_size // 1024} KB)")
        ok += 1
    print(f"Done: {ok} copied, {miss} missing sources")
    refresh_index()


if __name__ == "__main__":
    main()
