#!/usr/bin/env python3
"""Audit exercises that likely need equipment they don't list."""

from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
EXERCISES_PATH = ROOT / "WorkoutPlanner.Api" / "Data" / "exercises.json"

d = json.loads(EXERCISES_PATH.read_text(encoding="utf-8"))

FREE = {"dumbbells", "barbell", "kettlebell", "ez-bar", "bands", "medicine-ball"}
HAS_SEAT = {"bench", "machines", "cable"}  # cable stacks / machines usually have seats


def has(eq, item):
    return item in (eq or [])


print("=== Name has 'bench' but eq missing bench ===")
for e in d:
    n = e["name"].lower()
    eq = e.get("equipment") or []
    if "bench" in n and "bench" not in eq:
        print(f"  {e['name']!r} | {eq}")

print("\n=== Seated free-weight, no bench/machine/cable ===")
for e in d:
    n = e["name"].lower()
    eq = set(e.get("equipment") or [])
    if not re.search(r"\bseated\b", n):
        continue
    if eq & HAS_SEAT:
        continue
    print(f"  {e['name']!r} | {sorted(eq)}")

print("\n=== Lying/prone free-weight, no surface ===")
for e in d:
    n = e["name"].lower()
    eq = set(e.get("equipment") or [])
    if not re.search(r"\b(lying|prone|supine)\b", n):
        continue
    if eq & {"bench", "machines", "stability-ball", "foam-roller"}:
        continue
    # floor-specific?
    if "floor" in n:
        print(f"  FLOOR {e['name']!r} | {sorted(eq)}")
        continue
    print(f"  {e['name']!r} | {sorted(eq)}")

print("\n=== Hip thrust / step-up / box squat / squat-to ===")
for e in d:
    n = e["name"].lower()
    eq = set(e.get("equipment") or [])
    if re.search(
        r"hip thrust|step[ -]?up|bulgarian|box squat|squat to|to a bench|from bench|onto bench",
        n,
    ):
        mark = "OK" if "bench" in eq else "MISS"
        print(f"  [{mark}] {e['name']!r} | {sorted(eq)}")

print("\n=== Pullover / skull / french / JM ===")
for e in d:
    n = e["name"].lower()
    eq = set(e.get("equipment") or [])
    if re.search(r"pullover|skull|french press|\bjm press\b", n):
        mark = "OK" if "bench" in eq else "MISS"
        print(f"  [{mark}] {e['name']!r} | {sorted(eq)}")

print("\n=== Concentration / spider / preacher ===")
for e in d:
    n = e["name"].lower()
    eq = set(e.get("equipment") or [])
    if re.search(r"concentration|spider|preacher", n):
        mark = "OK" if "bench" in eq else "MISS"
        print(f"  [{mark}] {e['name']!r} | {sorted(eq)}")

print("\n=== Dips without dip-related gear ===")
for e in d:
    n = e["name"].lower()
    eq = set(e.get("equipment") or [])
    if re.search(r"\bdip\b|dips\b", n) and "bench" not in n:
        print(f"  {e['name']!r} | {sorted(eq)}")

print("\n=== Pull-up / chin-up missing bar ===")
for e in d:
    n = e["name"].lower()
    eq = set(e.get("equipment") or [])
    if re.search(r"pull[ -]?up|chin[ -]?up|pullup|chinup", n):
        mark = "OK" if "pullup-bar" in eq or "machines" in eq or "cable" in eq else "MISS"
        print(f"  [{mark}] {e['name']!r} | {sorted(eq)}")

print("\n=== Rack / smith / machine name vs eq ===")
for e in d:
    n = e["name"].lower()
    eq = set(e.get("equipment") or [])
    if "smith" in n and "machines" not in eq:
        print(f"  SMITH MISS {e['name']!r} | {sorted(eq)}")
    if re.search(r"leg press|hack squat|pec deck|lat pulldown", n) and "machines" not in eq:
        print(f"  MACH MISS {e['name']!r} | {sorted(eq)}")

print("\n=== Name has 'dumbbell' but missing dumbbells ===")
for e in d:
    n = e["name"].lower()
    eq = set(e.get("equipment") or [])
    if "dumbbell" in n and "dumbbells" not in eq:
        print(f"  {e['name']!r} | {sorted(eq)}")

print("\n=== Name has 'barbell' but missing barbell ===")
for e in d:
    n = e["name"].lower()
    eq = set(e.get("equipment") or [])
    if "barbell" in n and "barbell" not in eq:
        print(f"  {e['name']!r} | {sorted(eq)}")

print("\n=== Name has 'kettlebell' missing ===")
for e in d:
    n = e["name"].lower()
    eq = set(e.get("equipment") or [])
    if "kettlebell" in n and "kettlebell" not in eq:
        print(f"  {e['name']!r} | {sorted(eq)}")

print("\n=== Name has cable missing ===")
for e in d:
    n = e["name"].lower()
    eq = set(e.get("equipment") or [])
    if "cable" in n and "cable" not in eq and "machines" not in eq:
        print(f"  {e['name']!r} | {sorted(eq)}")

print("\n=== Total count with bench ===", sum(1 for e in d if "bench" in (e.get("equipment") or [])))
