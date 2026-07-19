#!/usr/bin/env python3
"""Build a name→ExRx URL map by scraping public ExRx exercise list pages.

We only store *links* to ExRx pages (allowed by ExRx content policy for linking).
We do NOT download or embed ExRx images/GIFs (requires a license/API).

Usage:
  python scripts/build-exrx-map.py
"""

from __future__ import annotations

import json
import re
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "WorkoutPlanner.Api" / "Data" / "exrx-map.json"
EXERCISES = ROOT / "WorkoutPlanner.Api" / "Data" / "exercises.json"

UA = {"User-Agent": "WorkOut.fit mapper (personal fitness app; link-only catalog)"}

LIST_PAGES = [
    "https://exrx.net/Lists/ExList/ArmWt",
    "https://exrx.net/Lists/ExList/ChestWt",
    "https://exrx.net/Lists/ExList/BackWt",
    "https://exrx.net/Lists/ExList/ShouldWt",
    "https://exrx.net/Lists/ExList/ForeArmWt",
    "https://exrx.net/Lists/ExList/WaistWt",
    "https://exrx.net/Lists/ExList/HipsWt",
    "https://exrx.net/Lists/ExList/ThighWt",
    "https://exrx.net/Lists/ExList/CalfWt",
    "https://exrx.net/Lists/ExList/NeckWt",
    "https://exrx.net/Lists/ExList/OlympicWeightlifting",
    "https://exrx.net/Lists/PowerExercises",
    "https://exrx.net/Lists/CardioExercises",
    "https://exrx.net/Lists/KettlebellExercises",
    "https://exrx.net/Lists/OtherExercises",
]


def fetch(url: str) -> str:
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=30) as resp:
        return resp.read().decode("utf-8", "replace")


def normalize_name(name: str) -> str:
    n = name.lower().strip()
    n = re.sub(r"[^a-z0-9]+", " ", n)
    n = re.sub(r"\s+", " ", n).strip()
    # common synonyms
    replacements = [
        (r"\bdumbbells?\b", "dumbbell"),
        (r"\bbarbells?\b", "barbell"),
        (r"\bkettlebells?\b", "kettlebell"),
        (r"\bbodyweight\b", "body weight"),
        (r"\bpush ups?\b", "push up"),
        (r"\bpull ups?\b", "pull up"),
        (r"\bchin ups?\b", "chin up"),
        (r"\bsit ups?\b", "sit up"),
        (r"\btriceps?\b", "triceps"),
        (r"\bbiceps?\b", "biceps"),
    ]
    for pat, rep in replacements:
        n = re.sub(pat, rep, n)
    return n


def scrape_list_page(url: str) -> list[tuple[str, str]]:
    """Return list of (display name, absolute url)."""
    try:
        html = fetch(url)
    except Exception as ex:
        print(f"  fail {url}: {ex}")
        return []

    found: list[tuple[str, str]] = []
    # Anchors to WeightExercises pages
    for m in re.finditer(
        r'href=["\']((?:https://exrx\.net)?/WeightExercises/[^"\'#]+)["\'][^>]*>(.*?)</a>',
        html,
        re.I | re.S,
    ):
        href = m.group(1)
        text = re.sub(r"<[^>]+>", "", m.group(2))
        text = re.sub(r"\s+", " ", text).strip()
        if not text or len(text) < 3:
            continue
        if href.startswith("/"):
            href = "https://exrx.net" + href
        # strip trailing slash
        href = href.rstrip("/")
        found.append((text, href))

    # Some lists use relative without leading WeightExercises in path differently
    for m in re.finditer(
        r'href=["\'](\.\./WeightExercises/[^"\'#]+)["\'][^>]*>(.*?)</a>',
        html,
        re.I | re.S,
    ):
        href = "https://exrx.net/WeightExercises/" + m.group(1).split("WeightExercises/")[-1]
        href = href.rstrip("/")
        text = re.sub(r"<[^>]+>", "", m.group(2))
        text = re.sub(r"\s+", " ", text).strip()
        if text:
            found.append((text, href))

    print(f"  {url}: {len(found)} links")
    return found


def score_match(our_name: str, exrx_name: str) -> float:
    a = set(normalize_name(our_name).split())
    b = set(normalize_name(exrx_name).split())
    if not a or not b:
        return 0.0
    inter = len(a & b)
    if inter == 0:
        return 0.0
    # Jaccard with slight boost for containment
    j = inter / len(a | b)
    if a <= b or b <= a:
        j = max(j, 0.55)
    # prefer similar length
    if abs(len(a) - len(b)) <= 1 and inter >= max(2, min(len(a), len(b)) - 1):
        j = max(j, 0.7)
    return j


def main():
    print("Scraping ExRx lists…")
    catalog: dict[str, str] = {}  # normalized name -> url
    display: dict[str, str] = {}  # url -> best display name

    for page in LIST_PAGES:
        for name, url in scrape_list_page(page):
            key = normalize_name(name)
            # prefer shorter paths / first seen
            if key not in catalog:
                catalog[key] = url
                display[url] = name
            # also store by last path segment loosely
        time.sleep(0.4)

    print(f"Unique ExRx names: {len(catalog)}")

    our = json.loads(EXERCISES.read_text(encoding="utf-8"))
    mapping = {}  # our exercise id -> { url, exrxName, score }

    for ex in our:
        best_url = None
        best_name = None
        best_score = 0.0
        for ename, url in catalog.items():
            # reconstruct display for scoring
            dname = display.get(url, ename)
            s = score_match(ex["name"], dname)
            if s > best_score:
                best_score = s
                best_url = url
                best_name = dname
        if best_score >= 0.55 and best_url:
            mapping[ex["id"]] = {
                "url": best_url,
                "exrxName": best_name,
                "score": round(best_score, 3),
                "name": ex["name"],
            }

    # Manual high-confidence overrides
    overrides = {
        "dumbbell-bicep-curl": "https://exrx.net/WeightExercises/Biceps/DBCurl",
        "dumbbell-curl": "https://exrx.net/WeightExercises/Biceps/DBCurl",
        "barbell-curl": "https://exrx.net/WeightExercises/Biceps/BBCurl",
        "incline-dumbbell-curl": "https://exrx.net/WeightExercises/Biceps/DBInclineCurl",
        "barbell-bench-press-medium-grip": "https://exrx.net/WeightExercises/PectoralSternal/BBBenchPress",
        "barbell-deadlift": "https://exrx.net/WeightExercises/ErectorSpinae/BBDeadlift",
        "barbell-squat": "https://exrx.net/WeightExercises/Quadriceps/BBSquat",
        "pull-up": "https://exrx.net/WeightExercises/LatissimusDorsi/BWPullup",
        "chin-up": "https://exrx.net/WeightExercises/LatissimusDorsi/BWChinup",
        "push-up": "https://exrx.net/WeightExercises/PectoralSternal/BWPushup",
    }
    for eid, url in overrides.items():
        # only if exercise exists
        if any(e["id"] == eid for e in our):
            mapping[eid] = {
                "url": url,
                "exrxName": overrides.get(eid, url.rsplit("/", 1)[-1]),
                "score": 1.0,
                "name": next(e["name"] for e in our if e["id"] == eid),
            }

    payload = {
        "source": "ExRx.net public exercise lists (link-only; images not embedded)",
        "policy": "https://exrx.net/Questions/Content — linking allowed; republishing media requires permission",
        "count": len(mapping),
        "byId": mapping,
    }
    OUT.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    print(f"Mapped {len(mapping)}/{len(our)} exercises → {OUT}")

    # show sample
    for k in list(mapping.keys())[:8]:
        print(f"  {mapping[k]['name']} → {mapping[k]['url']} ({mapping[k]['score']})")


if __name__ == "__main__":
    main()
