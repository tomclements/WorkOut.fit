#!/usr/bin/env python3
"""Apply curated ExRx page links as demoUrl on matching exercises.

Keeps free-exercise-db imageUrl for in-app photo flip.
Only stores outbound links (ExRx policy allows linking; not embedding media).
"""

from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
EX_PATH = ROOT / "WorkoutPlanner.Api" / "Data" / "exercises.json"
MAP_PATH = ROOT / "WorkoutPlanner.Api" / "Data" / "exrx-map.json"


def norm_id(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")


def main():
    exercises = json.loads(EX_PATH.read_text(encoding="utf-8"))
    mapping = json.loads(MAP_PATH.read_text(encoding="utf-8"))
    by_id = mapping.get("byId") or {}

    # Index by id, exrx display name, and tokens for loose contains match
    by_key: dict[str, dict] = dict(by_id)
    for eid, meta in by_id.items():
        if meta.get("exrxName"):
            by_key[norm_id(meta["exrxName"])] = meta
        if meta.get("name"):
            by_key[norm_id(meta["name"])] = meta

    # Common aliases not stored as separate catalog ids
    aliases = {
        "db-curl": "dumbbell-bicep-curl",
        "dumbbell-alternate-bicep-curl": "dumbbell-bicep-curl",
        "seated-dumbbell-curl": "dumbbell-bicep-curl",
        "seated-dumbbell-inner-biceps-curl": "dumbbell-bicep-curl",
        "standing-dumbbell-reverse-curl": "barbell-curl",
    }
    for a, target in aliases.items():
        if target in by_id:
            by_key[a] = by_id[target]

    def resolve(ex: dict) -> dict | None:
        if ex["id"] in by_id:
            return by_id[ex["id"]]
        nid = norm_id(ex["name"])
        if nid in by_key:
            return by_key[nid]
        # token overlap against curated keys (strict-ish)
        tokens = set(nid.split("-"))
        best = None
        best_score = 0
        for k, meta in by_id.items():
            kt = set(k.split("-"))
            inter = len(tokens & kt)
            if inter < 2:
                continue
            score = inter / max(len(tokens | kt), 1)
            if score > best_score:
                best_score = score
                best = meta
        if best_score >= 0.6:
            return best
        return None

    updated = 0
    for ex in exercises:
        meta = resolve(ex)
        if not meta or not meta.get("url"):
            continue
        url = meta["url"]
        if ex.get("demoUrl") == url:
            continue
        ex["demoUrl"] = url
        updated += 1

    EX_PATH.write_text(json.dumps(exercises, indent=2), encoding="utf-8")
    print(f"Updated demoUrl on {updated}/{len(exercises)} exercises")
    print(f"Map size: {len(by_id)}")


if __name__ == "__main__":
    main()
