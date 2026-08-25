#!/usr/bin/env python3
"""Demo QA audit: one line per exercise, pass/fail for the file the runner uses.

Checks (in priority order):
  missing      - demos/{id}.webp does not exist (runner will fall back to still/placeholder)
  tiny         - file < 15 KB (likely unreadable at arm's length, e.g. pallof-press)
  snap         - animated WebP has <= 2 frames (hard two-pose snap, not motion)
  reused-slug  - known wrong mapping: mobility id points at unrelated FEDB art
                 (march->step-up, jacks->star-jump, high-knees->knee-tuck-jump)

Writes demos/qa.json + prints a summary. The report is rendered by /demo-qa.html.

Usage:
  python scripts/demo-qa.py            # audit everything
  python scripts/demo-qa.py --fails    # print only failures/warnings
"""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
DEMOS = ROOT / "WorkoutPlanner.Api" / "wwwroot" / "demos"
EXERCISES = ROOT / "WorkoutPlanner.Api" / "Data" / "exercises.json"

TINY_BYTES = 15 * 1024

# Mobility ids that reuse unrelated FEDB art (wrong movement).
# Empty since march/jacks/high-knees/dead-bug got original stick demos —
# add ids here if a wrong FEDB mapping ever sneaks back in.
REUSED_SLUGS: dict[str, str] = {}


def load_ids() -> list[dict]:
    """All ids the runner can request a demo for."""
    items = []
    data = json.loads(EXERCISES.read_text(encoding="utf-8"))
    for ex in data:
        items.append({"id": ex["id"], "name": ex["name"], "kind": "exercise"})
    # mobility ids: every wu-/cd- prefixed demo (source dirs + sticks + FEDB matches)
    mob = sorted({
        p.name for p in DEMOS.glob("mobility-source/*") if p.is_dir()
    } | {p.stem for p in DEMOS.glob("wu-*.webp")} | {p.stem for p in DEMOS.glob("cd-*.webp")})
    labels = {
        "wu-march": "March in place", "wu-jacks": "Jumping jacks",
        "wu-high-knees": "High knees (easy)", "wu-arm-circles": "Arm circles",
        "wu-scap-pushup": "Scapular push-ups", "wu-band-disloc": "Open-chest arm swings",
        "wu-cat-cow": "Cat-cow", "wu-bird-dog": "Bird dog", "wu-dead-bug": "Dead bug",
        "wu-hip-circles": "Standing hip circles", "wu-leg-swings": "Leg swings",
        "wu-bw-squat": "Bodyweight squat (easy)", "wu-glute-bridge": "Glute bridge",
        "wu-calf-raise": "Calf raises", "wu-wrist-circles": "Wrist circles",
        "wu-shoulder-rolls": "Shoulder rolls", "wu-torso-twist": "Standing torso twists",
        "cd-chest-door": "Chest doorway stretch", "cd-tricep-oh": "Overhead triceps stretch",
        "cd-cross-body": "Cross-body shoulder stretch", "cd-child-pose": "Child's pose",
        "cd-thread-needle": "Thread the needle", "cd-quad-stand": "Standing quad stretch",
        "cd-ham-hinge": "Standing hamstring hinge", "cd-fig4": "Figure-4 glute stretch",
        "cd-calf-wall": "Calf wall stretch", "cd-hip-flexor": "Half-kneeling hip flexor stretch",
        "cd-cobra": "Prone press-up / cobra", "cd-knees-chest": "Knees to chest",
        "cd-forearm-stretch": "Forearm stretch", "cd-neck-side": "Neck side stretch",
        "cd-breathe": "Box breathing (easy)",
    }
    for mid in mob:
        items.append({"id": mid, "name": labels.get(mid, mid), "kind": "mobility"})
    return items


def frame_count(path: Path) -> int:
    try:
        with Image.open(path) as im:
            return getattr(im, "n_frames", 1)
    except Exception:
        return -1


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--fails", action="store_true")
    args = ap.parse_args()

    items = load_ids()
    hashes: dict[str, list[str]] = {}
    report = []

    for item in items:
        eid = item["id"]
        path = DEMOS / f"{eid}.webp"
        flags: list[str] = []
        kb = frames = None
        if path.exists():
            kb = round(path.stat().st_size / 1024, 1)
            frames = frame_count(path)
            digest = hashlib.md5(path.read_bytes()).hexdigest()
            hashes.setdefault(digest, []).append(eid)
            if path.stat().st_size < TINY_BYTES:
                flags.append("tiny")
            if 0 < frames <= 2 and eid not in REUSED_SLUGS:
                flags.append("snap")
        else:
            flags.append("missing")
        if eid in REUSED_SLUGS:
            flags.append("reused-slug")

        status = "fail" if ("missing" in flags or "reused-slug" in flags) else (
            "warn" if flags else "pass"
        )
        report.append({
            **item,
            "file": path.name,
            "kb": kb,
            "frames": frames,
            "flags": flags,
            "status": status,
        })

    dupes = {h: ids for h, ids in hashes.items() if len(ids) > 1}

    (DEMOS / "qa.json").write_text(
        json.dumps({"items": report, "aliases": sorted(dupes.values())}, indent=1),
        encoding="utf-8",
    )

    fails = [r for r in report if r["status"] == "fail"]
    warns = [r for r in report if r["status"] == "warn"]
    passes = len(report) - len(fails) - len(warns)
    print(f"total {len(report)} | pass {passes} | warn {len(warns)} | fail {len(fails)}")
    print(f"byte-identical alias groups: {len(dupes)}")

    if args.fails:
        for r in fails + warns:
            detail = ", ".join(f"{f} ({r['frames']}fr/{r['kb']}kb)" if r['kb'] is not None else f for f in r["flags"])
            print(f"  [{r['status']}] {r['id']}: {detail}")


if __name__ == "__main__":
    main()
