#!/usr/bin/env python3
"""Generate original stick-figure exercise demos as animated WebP (public domain).

Side-view figure with human proportions:
  head, torso, upper arm + forearm + hand, thigh + shin + foot.
"""

from __future__ import annotations

import math
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "WorkoutPlanner.Api" / "wwwroot" / "demos"

W, H = 560, 560
BG = (248, 250, 252)
INK = (30, 41, 59)
ACCENT = (37, 99, 235)
MUTED = (148, 163, 184)
FLOOR_C = (203, 213, 225)
DURATION_MS = 65

# 8-head side-view proportions
HEAD = 36.0
NECK = HEAD * 0.25
TORSO = HEAD * 2.55       # hip joint → shoulder joint
UPPER_ARM = HEAD * 1.5
FOREARM = HEAD * 1.3
HAND = HEAD * 0.5
THIGH = HEAD * 2.1
SHIN = HEAD * 2.05
FOOT = HEAD * 1.0


def lerp(a, b, t):
    return a + (b - a) * t


def ease(t):
    return 0.5 - 0.5 * math.cos(math.pi * max(0.0, min(1.0, t)))


def joint(d, p, r=5, color=INK):
    d.ellipse([p[0] - r, p[1] - r, p[0] + r, p[1] + r], fill=color)


def seg(d, a, b, width=9, color=INK):
    d.line([a, b], fill=color, width=width)
    joint(d, a, r=max(4, width // 2), color=color)
    joint(d, b, r=max(4, width // 2), color=color)


def draw_head(d, c, face_left=True):
    r = HEAD * 0.47
    d.ellipse([c[0] - r, c[1] - r, c[0] + r, c[1] + r], outline=INK, width=4, fill=(255, 255, 255))
    # face direction (nose)
    dir_x = -1 if face_left else 1
    nose = (c[0] + dir_x * (r + 5), c[1] + 1)
    d.line([(c[0] + dir_x * r * 0.3, c[1]), nose], fill=INK, width=3)
    # eye
    eye = (c[0] + dir_x * r * 0.25, c[1] - r * 0.15)
    joint(d, eye, r=2, color=INK)


def draw_foot(d, ankle, face_left=True):
    dir_x = -1 if face_left else 1
    toe = (ankle[0] + dir_x * FOOT, ankle[1] + 3)
    heel = (ankle[0] - dir_x * FOOT * 0.3, ankle[1] + 3)
    seg(d, heel, toe, width=8)
    joint(d, ankle, r=5)


def draw_db(d, hand):
    """Side-view dumbbell at hand."""
    a = (hand[0] - 14, hand[1])
    b = (hand[0] + 14, hand[1])
    d.line([a, b], fill=ACCENT, width=5)
    for end in (a, b):
        d.ellipse([end[0] - 5, end[1] - 13, end[0] + 5, end[1] + 13], fill=ACCENT)
    joint(d, hand, r=6)


def two_bone_ik(shoulder, hand, len1, len2, bend_sign=1.0):
    """Place elbow for arm with fixed lengths. bend_sign: +1 or -1 for side of bend."""
    dx = hand[0] - shoulder[0]
    dy = hand[1] - shoulder[1]
    dist = math.hypot(dx, dy)
    max_reach = (len1 + len2) * 0.995
    if dist < 1e-3:
        return ((shoulder[0] + len1, shoulder[1]), hand)
    if dist > max_reach:
        # stretch hand toward shoulder
        s = max_reach / dist
        hand = (shoulder[0] + dx * s, shoulder[1] + dy * s)
        dx, dy = hand[0] - shoulder[0], hand[1] - shoulder[1]
        dist = max_reach

    # distance from shoulder to elbow projection on shoulder-hand axis
    # cos law
    cos_a = (len1 * len1 + dist * dist - len2 * len2) / (2 * len1 * dist)
    cos_a = max(-1.0, min(1.0, cos_a))
    a = math.acos(cos_a)
    base = math.atan2(dy, dx)
    # bend posterior (behind the body) for side-view hanging arm
    ang = base + bend_sign * a
    elbow = (
        shoulder[0] + math.cos(ang) * len1,
        shoulder[1] + math.sin(ang) * len1,
    )
    return elbow, hand


def stick_rdl_side(t: float) -> Image.Image:
    """
    t=0 stand, t=1 bottom of RDL.
    Side view facing left. Hips go back (+x). Hands drop straight down
    from upper thigh to mid-shin.
    """
    im = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(im)
    floor_y = H - 72
    d.line([(40, floor_y), (W - 40, floor_y)], fill=FLOOR_C, width=4)

    t = max(0.0, min(1.0, t))

    # --- Fixed foot ---
    ankle = (W * 0.42, floor_y - 3)

    # Standing hip (above ankle with soft knee so thigh and shin read as two parts)
    hip0_x = ankle[0] + 2
    hip0_y = floor_y - SHIN - THIGH + 20

    # Hips travel BACK (to the right, +x) as we hinge
    hip_back = HEAD * 2.4 * t
    hip_drop = HEAD * 0.35 * t
    hip = (hip0_x + hip_back, hip0_y + hip_drop)

    # Knee clearly forward of the hip–ankle line (soft knees, not locked)
    knee0 = (ankle[0] + 28, floor_y - SHIN + 12)
    knee1 = (ankle[0] + 34 + hip_back * 0.12, floor_y - SHIN * 0.9)
    knee = (lerp(knee0[0], knee1[0], t), lerp(knee0[1], knee1[1], t))

    # Torso lean: 0 upright → ~80° from vertical (forward = left)
    lean = math.radians(lerp(0, 80, t))
    shoulder = (
        hip[0] - math.sin(lean) * TORSO,
        hip[1] - math.cos(lean) * TORSO,
    )
    head = (
        shoulder[0] - math.sin(lean) * (NECK + HEAD * 0.48),
        shoulder[1] - math.cos(lean) * (NECK + HEAD * 0.48),
    )

    # --- Hand path: straight vertical ---
    # Upper thigh at stand (just below hip crease)
    hand_y_top = hip0_y + THIGH * 0.12
    # Mid-shin
    hand_y_bot = floor_y - SHIN * 0.42
    hand_y = lerp(hand_y_top, hand_y_bot, t)
    # In front of the leg (left of shin)
    hand_x = ankle[0] - 22
    hand = (hand_x, hand_y)

    # Arm IK — bend elbow "back" (toward +x / posterior)
    elbow, hand = two_bone_ik(shoulder, hand, UPPER_ARM, FOREARM, bend_sign=1.0)

    # --- Draw (back-to-front) ---
    # Leg
    seg(d, hip, knee, width=11)
    seg(d, knee, ankle, width=11)
    draw_foot(d, ankle, face_left=True)

    # Torso + neck + head
    seg(d, hip, shoulder, width=13)
    neck_end = (
        shoulder[0] - math.sin(lean) * NECK,
        shoulder[1] - math.cos(lean) * NECK,
    )
    seg(d, shoulder, neck_end, width=6)
    draw_head(d, head, face_left=True)

    # Arm: upper arm, forearm, hand
    seg(d, shoulder, elbow, width=9)
    seg(d, elbow, hand, width=9)
    # hand block
    palm = (hand[0] - HAND * 0.6, hand[1] + 3)
    seg(d, hand, palm, width=6)
    draw_db(d, hand)

    # Labels
    d.text((18, 14), "Dumbbell Romanian Deadlift", fill=(71, 85, 105))
    d.text((18, 36), "Side view · hip hinge back · bar path straight down", fill=MUTED)
    if t <= 0.05:
        phase = "1  Stand — DBs at upper thighs"
    elif t >= 0.95:
        phase = "2  Bottom — hips back, DBs at mid-shin"
    else:
        phase = "2  Hinge — hips back, bar path straight down"
    d.text((18, 58), phase, fill=ACCENT)
    d.text((18, H - 38), "Original stick demo — not a photo", fill=MUTED)

    return im


def frames_rdl(n_half: int = 18) -> list[Image.Image]:
    frames = []
    for i in range(n_half + 1):
        frames.append(stick_rdl_side(ease(i / n_half)))
    # pause at bottom
    frames.append(stick_rdl_side(1.0))
    frames.append(stick_rdl_side(1.0))
    frames.append(stick_rdl_side(1.0))
    for i in range(1, n_half + 1):
        frames.append(stick_rdl_side(ease(1.0 - i / n_half)))
    return frames


def save_webp(frames, path: Path, duration=DURATION_MS):
    path.parent.mkdir(parents=True, exist_ok=True)
    frames[0].save(
        path,
        format="WEBP",
        save_all=True,
        append_images=frames[1:],
        duration=duration,
        loop=0,
        quality=84,
        method=4,
    )
    print(f"wrote {path} ({path.stat().st_size // 1024} KB, {len(frames)} frames)")


def main():
    frames = frames_rdl(18)
    save_webp(frames, OUT / "db-romanian-deadlift.webp")
    save_webp(frames, OUT / "dumbbell-romanian-deadlift.webp")
    frames[0].save(OUT / "_rdl_qa_stand.png")
    # bottom ≈ after down phase
    bottom_i = 18
    frames[bottom_i].save(OUT / "_rdl_qa_bottom.png")
    mid_i = 9
    frames[mid_i].save(OUT / "_rdl_qa_mid.png")
    print("QA:", "_rdl_qa_stand.png", "_rdl_qa_mid.png", "_rdl_qa_bottom.png")


if __name__ == "__main__":
    main()
