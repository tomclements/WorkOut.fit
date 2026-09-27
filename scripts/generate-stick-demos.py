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
TORSO = HEAD * 2.55       # hip joint -> shoulder joint
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
    dir_x = -1 if face_left else 1
    nose = (c[0] + dir_x * (r + 5), c[1] + 1)
    d.line([(c[0] + dir_x * r * 0.3, c[1]), nose], fill=INK, width=3)
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


def draw_barbell(d, hand_l, hand_r, face_left=True):
    """Bar line with small plates at ends. hand_l/hand_r are outside edges."""
    mid = ((hand_l[0] + hand_r[0]) / 2, (hand_l[1] + hand_r[1]) / 2)
    dir_x = -1 if face_left else 1
    bar_a = (mid[0] - 48, mid[1])
    bar_b = (mid[0] + 48, mid[1])
    d.line([bar_a, bar_b], fill=INK, width=7)
    for x in (bar_a[0], bar_b[0]):
        plate_x = x - dir_x * 8 if x == bar_a[0] else x + dir_x * 8
        d.rectangle([plate_x - 6, mid[1] - 26, plate_x + 6, mid[1] + 26], fill=INK)
    joint(d, mid, r=5)


def draw_kb(d, hand):
    """Kettlebell shape held at hand."""
    cx, cy = hand[0] + 10, hand[1] + 20
    d.arc([cx - 18, cy - 42, cx + 18, cy + 2], start=0, end=180, fill=INK, width=5)
    d.ellipse([cx - 22, cy - 8, cx + 22, cy + 36], outline=INK, width=4, fill=(255, 255, 255))
    joint(d, hand, r=5)


def draw_band(d, hand1, hand2):
    """Resistance band curve between hands."""
    mid = ((hand1[0] + hand2[0]) / 2, (hand1[1] + hand2[1]) / 2 - 40)
    d.line([hand1, mid, hand2], fill=ACCENT, width=6)
    joint(d, hand1, r=5)
    joint(d, hand2, r=5)


def draw_ab_wheel(d, hand):
    """Ab wheel with handles."""
    cx, cy = hand[0], hand[1] + 12
    d.ellipse([cx - 22, cy - 22, cx + 22, cy + 22], outline=INK, width=5, fill=(255, 255, 255))
    d.line([(cx - 14, cy), (cx + 14, cy)], fill=INK, width=5)
    joint(d, hand, r=5)


def draw_pullup_bar(d, y):
    """Horizontal pull-up bar mounted at top."""
    d.line([(W * 0.22, y), (W * 0.78, y)], fill=INK, width=8)
    d.line([(W * 0.22, y), (W * 0.22, y - 35)], fill=INK, width=6)
    d.line([(W * 0.78, y), (W * 0.78, y - 35)], fill=INK, width=6)


def draw_bench(d, top_y, left, right):
    """Simple bench top and legs."""
    d.line([(left, top_y), (right, top_y)], fill=INK, width=7)
    for x in (left + 10, right - 10):
        d.line([(x, top_y), (x, top_y + 50)], fill=INK, width=8)


def label(d, title, subtitle="", phase=""):
    d.text((18, 14), title, fill=(71, 85, 105))
    if subtitle:
        d.text((18, 36), subtitle, fill=MUTED)
    if phase:
        d.text((18, 58), phase, fill=ACCENT)
    d.text((18, H - 38), "Original stick demo — not a photo", fill=MUTED)


def two_bone_ik(shoulder, hand, len1, len2, bend_sign=1.0):
    """Place elbow for arm with fixed lengths. bend_sign: +1 or -1 for side of bend."""
    dx = hand[0] - shoulder[0]
    dy = hand[1] - shoulder[1]
    dist = math.hypot(dx, dy)
    max_reach = (len1 + len2) * 0.995
    if dist < 1e-3:
        return ((shoulder[0] + len1, shoulder[1]), hand)
    if dist > max_reach:
        s = max_reach / dist
        hand = (shoulder[0] + dx * s, shoulder[1] + dy * s)
        dx, dy = hand[0] - shoulder[0], hand[1] - shoulder[1]
        dist = max_reach

    cos_a = (len1 * len1 + dist * dist - len2 * len2) / (2 * len1 * dist)
    cos_a = max(-1.0, min(1.0, cos_a))
    a = math.acos(cos_a)
    base = math.atan2(dy, dx)
    ang = base + bend_sign * a
    elbow = (
        shoulder[0] + math.cos(ang) * len1,
        shoulder[1] + math.sin(ang) * len1,
    )
    return elbow, hand


def stick_rdl_side(t: float) -> Image.Image:
    """t=0 stand, t=1 bottom of RDL. Side view facing left."""
    im = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(im)
    floor_y = H - 72
    d.line([(40, floor_y), (W - 40, floor_y)], fill=FLOOR_C, width=4)
    t = max(0.0, min(1.0, t))

    ankle = (W * 0.48, floor_y - 3)
    knee_fwd0 = 10
    knee_fwd1 = 18
    knee_fwd = lerp(knee_fwd0, knee_fwd1, t)
    knee = (ankle[0] - knee_fwd, floor_y - SHIN + lerp(2, 8, t))
    hip0_x = knee[0] + 4
    hip0_y = knee[1] - THIGH + 6
    hip_back = HEAD * 2.35 * t
    hip_drop = HEAD * 0.32 * t
    hip = (hip0_x + hip_back, hip0_y + hip_drop)
    knee = (ankle[0] - knee_fwd, knee[1])

    lean = math.radians(lerp(0, 80, t))
    shoulder = (
        hip[0] - math.sin(lean) * TORSO,
        hip[1] - math.cos(lean) * TORSO,
    )
    head = (
        shoulder[0] - math.sin(lean) * (NECK + HEAD * 0.48),
        shoulder[1] - math.cos(lean) * (NECK + HEAD * 0.48),
    )

    hand_y_top = hip0_y + THIGH * 0.12
    hand_y_bot = floor_y - SHIN * 0.42
    hand_y = lerp(hand_y_top, hand_y_bot, t)
    hand_x = ankle[0] - 24
    hand = (hand_x, hand_y)
    elbow, hand = two_bone_ik(shoulder, hand, UPPER_ARM, FOREARM, bend_sign=1.0)

    seg(d, hip, knee, width=11)
    seg(d, knee, ankle, width=11)
    draw_foot(d, ankle, face_left=True)
    seg(d, hip, shoulder, width=13)
    neck_end = (
        shoulder[0] - math.sin(lean) * NECK,
        shoulder[1] - math.cos(lean) * NECK,
    )
    seg(d, shoulder, neck_end, width=6)
    draw_head(d, head, face_left=True)
    seg(d, shoulder, elbow, width=9)
    seg(d, elbow, hand, width=9)
    palm = (hand[0] - HAND * 0.6, hand[1] + 3)
    seg(d, hand, palm, width=6)
    draw_db(d, hand)

    label(
        d,
        "Dumbbell Romanian Deadlift",
        "Side view · hip hinge back · bar path straight down",
        "Stand" if t <= 0.05 else "Bottom" if t >= 0.95 else "Hinge — hips back",
    )
    return im


def frames_rdl(n_half: int = 18) -> list[Image.Image]:
    frames = []
    for i in range(n_half + 1):
        frames.append(stick_rdl_side(ease(i / n_half)))
    frames.append(stick_rdl_side(1.0))
    frames.append(stick_rdl_side(1.0))
    frames.append(stick_rdl_side(1.0))
    for i in range(1, n_half + 1):
        frames.append(stick_rdl_side(ease(1.0 - i / n_half)))
    return frames


def bounce_frames(fn, n=14, pause=2):
    frames = []
    for i in range(n + 1):
        frames.append(fn(ease(i / n)))
    for _ in range(pause):
        frames.append(fn(1.0))
    for i in range(1, n + 1):
        frames.append(fn(ease(1.0 - i / n)))
    return frames


def cyclic_frames(fn, n=24):
    frames = []
    for i in range(n):
        frames.append(fn(i / n))
    return frames


# ---------------------------------------------------------------------------
# 24 P0 exercise demos
# ---------------------------------------------------------------------------


def ab_wheel_rollout_stick(t: float) -> Image.Image:
    """Kneeling, roll wheel forward until body near floor, roll back."""
    im = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(im)
    floor_y = H - 72
    d.line([(40, floor_y), (W - 40, floor_y)], fill=FLOOR_C, width=4)
    t = max(0.0, min(1.0, t))

    knee = (W * 0.55, floor_y - 5)
    hip0 = (knee[0] - 10, knee[1] - THIGH * 0.6)
    hip_forward = HEAD * 4.2 * t
    hip_drop = HEAD * 1.1 * t
    hip = (hip0[0] - hip_forward, hip0[1] + hip_drop)

    torso_ang = math.radians(lerp(60, 6, t))
    shoulder = (
        hip[0] - math.sin(torso_ang) * TORSO,
        hip[1] - math.cos(torso_ang) * TORSO,
    )
    head = (
        shoulder[0] - math.sin(torso_ang) * (NECK + HEAD * 0.48),
        shoulder[1] - math.cos(torso_ang) * (NECK + HEAD * 0.48),
    )

    wheel_x = knee[0] - HEAD * 0.2 - HEAD * 3.8 * t
    hand = (wheel_x, floor_y - 8)
    elbow, hand = two_bone_ik(shoulder, hand, UPPER_ARM, FOREARM, bend_sign=1.0)

    ankle = (knee[0] + FOOT * 0.9, floor_y - 3)
    seg(d, hip, knee, width=12)
    seg(d, knee, ankle, width=10)
    draw_foot(d, ankle, face_left=True)

    seg(d, hip, shoulder, width=13)
    neck_end = (
        shoulder[0] - math.sin(torso_ang) * NECK,
        shoulder[1] - math.cos(torso_ang) * NECK,
    )
    seg(d, shoulder, neck_end, width=6)
    draw_head(d, head, face_left=True)
    seg(d, shoulder, elbow, width=9)
    seg(d, elbow, hand, width=9)
    draw_ab_wheel(d, hand)

    label(d, "Ab Wheel Rollout", "Kneeling · roll forward and back", "Roll out" if t > 0.5 else "Roll back")
    return im


def frames_ab_wheel_rollout(n=16):
    return bounce_frames(ab_wheel_rollout_stick, n=n, pause=2)


def band_row_stick(t: float) -> Image.Image:
    """Standing facing left, pull band handles to lower chest."""
    im = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(im)
    floor_y = H - 72
    d.line([(40, floor_y), (W - 40, floor_y)], fill=FLOOR_C, width=4)
    t = ease(max(0.0, min(1.0, t)))

    anchor = (W * 0.18, floor_y - HEAD * 3.0)
    ankle_r = (W * 0.52, floor_y - 3)
    ankle_l = (ankle_r[0] + 28, floor_y - 3)
    knee_r = (ankle_r[0] - 4, ankle_r[1] - SHIN + 5)
    knee_l = (ankle_l[0] - 4, ankle_l[1] - SHIN + 5)
    hip = ((ankle_r[0] + ankle_l[0]) / 2 + 6, knee_r[1] - THIGH + 8)
    shoulder = (hip[0] - 8, hip[1] - TORSO)
    head = (shoulder[0] - 8, shoulder[1] - NECK - HEAD * 0.5)

    start_hand = (anchor[0] + 110, shoulder[1] + 24)
    end_hand = (shoulder[0] - 18, shoulder[1] + 26)
    hand = (lerp(start_hand[0], end_hand[0], t), lerp(start_hand[1], end_hand[1], t))
    hand2 = (hand[0] + 16, hand[1] + 6)

    elbow, hand = two_bone_ik(shoulder, hand, UPPER_ARM, FOREARM, bend_sign=-1.0)
    elbow2, hand2 = two_bone_ik(shoulder, hand2, UPPER_ARM, FOREARM, bend_sign=-1.0)

    seg(d, hip, knee_r, width=11)
    seg(d, knee_r, ankle_r, width=11)
    draw_foot(d, ankle_r, face_left=True)
    seg(d, hip, knee_l, width=11)
    seg(d, knee_l, ankle_l, width=11)
    draw_foot(d, ankle_l, face_left=True)

    seg(d, hip, shoulder, width=13)
    draw_head(d, head, face_left=True)

    seg(d, shoulder, elbow2, width=9)
    seg(d, elbow2, hand2, width=9)
    draw_band(d, anchor, hand2)
    seg(d, shoulder, elbow, width=9)
    seg(d, elbow, hand, width=9)

    label(d, "Band Row", "Standing facing left · squeeze shoulder blades", "Pull" if t > 0.5 else "Extend")
    return im


def frames_band_row(n=16):
    return bounce_frames(band_row_stick, n=n, pause=2)


def barbell_back_squat_stick(t: float) -> Image.Image:
    """Bar on upper back, squat down/up."""
    im = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(im)
    floor_y = H - 72
    d.line([(40, floor_y), (W - 40, floor_y)], fill=FLOOR_C, width=4)
    t = ease(max(0.0, min(1.0, t)))

    ankle_r = (W * 0.52, floor_y - 3)
    ankle_l = (ankle_r[0] + 30, floor_y - 3)
    hip0 = (ankle_r[0] + 6, ankle_r[1] - SHIN - THIGH + 12)
    hip_drop = HEAD * 2.0 * t
    hip_back = HEAD * 1.0 * t
    hip = (hip0[0] + hip_back, hip0[1] + hip_drop)
    knee_r = (ankle_r[0] - 22 * t, ankle_r[1] - SHIN + 20 * t)
    knee_l = (ankle_l[0] - 22 * t, ankle_l[1] - SHIN + 20 * t)

    torso_lean = math.radians(lerp(8, 38, t))
    shoulder = (
        hip[0] - math.sin(torso_lean) * TORSO,
        hip[1] - math.cos(torso_lean) * TORSO,
    )
    head = (shoulder[0] - 6, shoulder[1] - NECK - HEAD * 0.5)

    bar_l = (shoulder[0] - 50, shoulder[1] - 10)
    bar_r = (shoulder[0] + 50, shoulder[1] - 10)
    hand_l = (bar_l[0] + 10, shoulder[1] + 10)
    hand_r = (bar_r[0] - 10, shoulder[1] + 10)
    elbow_l, _ = two_bone_ik(shoulder, hand_l, UPPER_ARM, FOREARM, bend_sign=1.0)
    elbow_r, _ = two_bone_ik(shoulder, hand_r, UPPER_ARM, FOREARM, bend_sign=-1.0)

    seg(d, hip, knee_r, width=12)
    seg(d, knee_r, ankle_r, width=12)
    draw_foot(d, ankle_r, face_left=True)
    seg(d, hip, knee_l, width=12)
    seg(d, knee_l, ankle_l, width=12)
    draw_foot(d, ankle_l, face_left=True)

    seg(d, hip, shoulder, width=13)
    draw_head(d, head, face_left=True)
    seg(d, shoulder, elbow_l, width=9)
    seg(d, elbow_l, hand_l, width=9)
    seg(d, shoulder, elbow_r, width=9)
    seg(d, elbow_r, hand_r, width=9)
    draw_barbell(d, bar_l, bar_r, face_left=True)

    label(d, "Barbell Back Squat", "Bar on upper back · squat down and up", "Down" if t > 0.5 else "Up")
    return im


def frames_barbell_back_squat(n=16):
    return bounce_frames(barbell_back_squat_stick, n=n, pause=2)


def barbell_bench_press_stick(t: float) -> Image.Image:
    """Lying on bench, press bar from chest to full extension."""
    im = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(im)
    floor_y = H - 72
    d.line([(40, floor_y), (W - 40, floor_y)], fill=FLOOR_C, width=4)
    bench_y = floor_y - 95
    draw_bench(d, bench_y, W * 0.18, W * 0.72)
    t = ease(max(0.0, min(1.0, t)))

    hip = (W * 0.55, bench_y - 6)
    shoulder = (hip[0] - TORSO * 0.85, bench_y - 8)
    head = (shoulder[0] - NECK - HEAD * 0.45, bench_y - 28)

    chest = (shoulder[0] - 18, bench_y - 30)
    ext = (shoulder[0] - 10, bench_y - TORSO * 0.8)
    bar_mid = (lerp(chest[0], ext[0], t), lerp(chest[1], ext[1], t))
    bar_l = (bar_mid[0] - 55, bar_mid[1])
    bar_r = (bar_mid[0] + 55, bar_mid[1])

    hand_l = (bar_l[0] + 12, bar_mid[1])
    hand_r = (bar_r[0] - 12, bar_mid[1])
    elbow_l, _ = two_bone_ik(shoulder, hand_l, UPPER_ARM, FOREARM, bend_sign=-1.0)
    elbow_r, _ = two_bone_ik(shoulder, hand_r, UPPER_ARM, FOREARM, bend_sign=-1.0)

    knee = (hip[0] + 26, bench_y + 28)
    ankle = (knee[0] + 8, bench_y + 48)
    seg(d, hip, knee, width=11)
    seg(d, knee, ankle, width=10)

    seg(d, hip, shoulder, width=13)
    neck = (shoulder[0] - NECK, bench_y - 22)
    seg(d, shoulder, neck, width=6)
    draw_head(d, head, face_left=True)

    seg(d, shoulder, elbow_l, width=9)
    seg(d, elbow_l, hand_l, width=9)
    seg(d, shoulder, elbow_r, width=9)
    seg(d, elbow_r, hand_r, width=9)
    draw_barbell(d, bar_l, bar_r, face_left=True)

    label(d, "Barbell Bench Press", "Lying on bench · press from chest to extension", "Press" if t > 0.5 else "Lower")
    return im


def frames_barbell_bench_press(n=16):
    return bounce_frames(barbell_bench_press_stick, n=n, pause=2)


def barbell_row_stick(t: float) -> Image.Image:
    """Bent-over barbell row, bar from hang to lower chest."""
    im = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(im)
    floor_y = H - 72
    d.line([(40, floor_y), (W - 40, floor_y)], fill=FLOOR_C, width=4)
    t = ease(max(0.0, min(1.0, t)))

    ankle_r = (W * 0.54, floor_y - 3)
    ankle_l = (ankle_r[0] + 28, floor_y - 3)
    hip = (ankle_r[0] + HEAD * 1.4, ankle_r[1] - SHIN - THIGH * 0.75)
    knee_r = (ankle_r[0] - 8, ankle_r[1] - SHIN + 10)
    knee_l = (ankle_l[0] - 8, ankle_l[1] - SHIN + 10)

    torso_lean = math.radians(50)
    shoulder = (
        hip[0] - math.sin(torso_lean) * TORSO,
        hip[1] - math.cos(torso_lean) * TORSO,
    )
    head = (shoulder[0] - math.sin(torso_lean) * (NECK + HEAD * 0.48),
            shoulder[1] - math.cos(torso_lean) * (NECK + HEAD * 0.48))

    hang = (shoulder[0] - 20, hip[1] + 18)
    top = (shoulder[0] - 22, shoulder[1] + 28)
    bar_mid = (lerp(hang[0], top[0], t), lerp(hang[1], top[1], t))
    bar_l = (bar_mid[0] - 58, bar_mid[1])
    bar_r = (bar_mid[0] + 58, bar_mid[1])

    hand_l = (bar_l[0] + 14, bar_mid[1])
    hand_r = (bar_r[0] - 14, bar_mid[1])
    elbow_l, _ = two_bone_ik(shoulder, hand_l, UPPER_ARM, FOREARM, bend_sign=-1.0)
    elbow_r, _ = two_bone_ik(shoulder, hand_r, UPPER_ARM, FOREARM, bend_sign=-1.0)

    seg(d, hip, knee_r, width=12)
    seg(d, knee_r, ankle_r, width=12)
    draw_foot(d, ankle_r, face_left=True)
    seg(d, hip, knee_l, width=12)
    seg(d, knee_l, ankle_l, width=12)
    draw_foot(d, ankle_l, face_left=True)

    seg(d, hip, shoulder, width=13)
    draw_head(d, head, face_left=True)
    seg(d, shoulder, elbow_l, width=9)
    seg(d, elbow_l, hand_l, width=9)
    seg(d, shoulder, elbow_r, width=9)
    seg(d, elbow_r, hand_r, width=9)
    draw_barbell(d, bar_l, bar_r, face_left=True)

    label(d, "Barbell Row", "Bent-over · row bar to lower chest", "Row up" if t > 0.5 else "Lower")
    return im


def frames_barbell_row(n=16):
    return bounce_frames(barbell_row_stick, n=n, pause=2)


def burpees_stick(t: float) -> Image.Image:
    """Stand -> hands down -> jump back to plank -> push-up -> jump in -> jump up."""
    im = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(im)
    floor_y = H - 72
    d.line([(40, floor_y), (W - 40, floor_y)], fill=FLOOR_C, width=4)
    t = max(0.0, min(1.0, t))

    if t < 0.15:
        phase_t = t / 0.15
        hip = (W * 0.5, floor_y - SHIN - THIGH + 20)
        shoulder = (hip[0] - 8, hip[1] - TORSO)
        head = (shoulder[0] - 8, shoulder[1] - NECK - HEAD * 0.5)
        ankle = (hip[0] + 4, floor_y - 3)
        knee = (hip[0] - 2, hip[1] + THIGH - 10)
        hand = (hip[0] - 18, hip[1] + 20)
        elbow, hand = two_bone_ik(shoulder, hand, UPPER_ARM, FOREARM, bend_sign=-1.0)
    elif t < 0.35:
        phase_t = (t - 0.15) / 0.20
        hip = (W * 0.5 + phase_t * 20, floor_y - SHIN * 0.5 - 30)
        shoulder = (hip[0] - 10, hip[1] - TORSO * 0.7)
        head = (shoulder[0] - 8, shoulder[1] - NECK - HEAD * 0.5)
        ankle = (hip[0] + 6, floor_y - 3)
        knee = (hip[0] - 6, floor_y - SHIN * 0.4)
        hand = (hip[0] - 60 - phase_t * 30, floor_y - 8)
        elbow, hand = two_bone_ik(shoulder, hand, UPPER_ARM, FOREARM, bend_sign=1.0)
    elif t < 0.55:
        phase_t = (t - 0.35) / 0.20
        shoulder_y = floor_y - 30 - 8 * phase_t
        shoulder = (W * 0.55, shoulder_y)
        hip = (shoulder[0] + TORSO * 0.8, shoulder_y + 8)
        ankle = (hip[0] + THIGH * 0.8 + SHIN * 0.8, floor_y - 3)
        knee = (hip[0] + THIGH * 0.8, floor_y - 3)
        head = (shoulder[0] - NECK - HEAD * 0.5, shoulder_y - 6)
        hand = (shoulder[0] - 30, floor_y - 5)
        elbow = (shoulder[0] - 16, shoulder_y + 4)
    elif t < 0.75:
        phase_t = (t - 0.55) / 0.20
        shoulder_y = floor_y - 38 + 18 * math.sin(phase_t * math.pi)
        shoulder = (W * 0.55, shoulder_y)
        hip = (shoulder[0] + TORSO * 0.8, shoulder_y + 8)
        ankle = (hip[0] + THIGH * 0.8 + SHIN * 0.8, floor_y - 3)
        knee = (hip[0] + THIGH * 0.8, floor_y - 3)
        head = (shoulder[0] - NECK - HEAD * 0.5, shoulder_y - 6)
        hand = (shoulder[0] - 30, floor_y - 5)
        elbow = (shoulder[0] - 16, shoulder_y + 4)
    elif t < 0.85:
        phase_t = (t - 0.75) / 0.10
        shoulder = (W * 0.55 - phase_t * 30, floor_y - 60)
        hip = (shoulder[0] + TORSO * 0.8, shoulder[1] + 8)
        ankle = (hip[0] + THIGH * 0.6 + SHIN * 0.6, floor_y - 3)
        knee = (hip[0] + THIGH * 0.6, floor_y - 3)
        head = (shoulder[0] - NECK - HEAD * 0.5, shoulder[1] - 6)
        hand = (shoulder[0] - 30, floor_y - 5)
        elbow = (shoulder[0] - 16, shoulder[1] + 4)
    else:
        phase_t = (t - 0.85) / 0.15
        hip = (W * 0.5, floor_y - SHIN - THIGH + 20 - phase_t * 90)
        shoulder = (hip[0] - 8, hip[1] - TORSO)
        head = (shoulder[0] - 8, shoulder[1] - NECK - HEAD * 0.5)
        ankle = (hip[0] + 4, floor_y - 3 - phase_t * 60)
        knee = (hip[0] - 2, hip[1] + THIGH - 10)
        hand = (hip[0] - 18, hip[1] - TORSO - 10)
        elbow, hand = two_bone_ik(shoulder, hand, UPPER_ARM, FOREARM, bend_sign=-1.0)

    if t >= 0.35 and t < 0.85:
        seg(d, shoulder, hip, width=13)
        seg(d, hip, knee, width=12)
        seg(d, knee, ankle, width=12)
        draw_foot(d, ankle, face_left=False)
        seg(d, shoulder, elbow, width=9)
        seg(d, elbow, hand, width=9)
    else:
        seg(d, hip, knee, width=12)
        seg(d, knee, ankle, width=12)
        draw_foot(d, ankle, face_left=True)
        seg(d, hip, shoulder, width=13)
        seg(d, shoulder, elbow, width=9)
        seg(d, elbow, hand, width=9)

    draw_head(d, head, face_left=True)
    label(d, "Burpees", "Stand · hands down · plank · push-up · jump up", "")
    return im


def frames_burpees(n=20):
    frames = []
    for i in range(n):
        frames.append(burpees_stick(i / (n - 1)))
    return frames


def db_bent_over_row_stick(t: float) -> Image.Image:
    """One DB, hinged torso, row DB to hip."""
    im = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(im)
    floor_y = H - 72
    d.line([(40, floor_y), (W - 40, floor_y)], fill=FLOOR_C, width=4)
    t = ease(max(0.0, min(1.0, t)))

    ankle_r = (W * 0.52, floor_y - 3)
    ankle_l = (ankle_r[0] + 28, floor_y - 3)
    hip = (ankle_r[0] + HEAD * 1.2, ankle_r[1] - SHIN - THIGH * 0.78)
    knee_r = (ankle_r[0] - 6, ankle_r[1] - SHIN + 8)
    knee_l = (ankle_l[0] - 6, ankle_l[1] - SHIN + 8)

    torso_lean = math.radians(55)
    shoulder = (hip[0] - math.sin(torso_lean) * TORSO, hip[1] - math.cos(torso_lean) * TORSO)
    head = (shoulder[0] - math.sin(torso_lean) * (NECK + HEAD * 0.48),
            shoulder[1] - math.cos(torso_lean) * (NECK + HEAD * 0.48))

    hang = (shoulder[0] - 16, hip[1] + 28)
    top = (hip[0] - 18, hip[1] - 8)
    hand = (lerp(hang[0], top[0], t), lerp(hang[1], top[1], t))
    elbow, hand = two_bone_ik(shoulder, hand, UPPER_ARM, FOREARM, bend_sign=-1.0)

    support_hand = (shoulder[0] - 14, hip[1] + 30)
    elbow2, _ = two_bone_ik(shoulder, support_hand, UPPER_ARM, FOREARM, bend_sign=1.0)

    seg(d, hip, knee_r, width=12)
    seg(d, knee_r, ankle_r, width=12)
    draw_foot(d, ankle_r, face_left=True)
    seg(d, hip, knee_l, width=12)
    seg(d, knee_l, ankle_l, width=12)
    draw_foot(d, ankle_l, face_left=True)

    seg(d, hip, shoulder, width=13)
    draw_head(d, head, face_left=True)
    seg(d, shoulder, elbow2, width=9)
    seg(d, elbow2, support_hand, width=9)
    draw_db(d, support_hand)
    seg(d, shoulder, elbow, width=9)
    seg(d, elbow, hand, width=9)
    draw_db(d, hand)

    label(d, "Dumbbell Bent-Over Row", "Hinged torso · row DB to hip", "Row" if t > 0.5 else "Lower")
    return im


def frames_db_bent_over_row(n=16):
    return bounce_frames(db_bent_over_row_stick, n=n, pause=2)


def db_chest_fly_stick(t: float) -> Image.Image:
    """Lying on bench, DBs arc from wide to together over chest."""
    im = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(im)
    floor_y = H - 72
    d.line([(40, floor_y), (W - 40, floor_y)], fill=FLOOR_C, width=4)
    bench_y = floor_y - 95
    draw_bench(d, bench_y, W * 0.18, W * 0.72)
    t = ease(max(0.0, min(1.0, t)))

    hip = (W * 0.55, bench_y - 6)
    shoulder = (hip[0] - TORSO * 0.85, bench_y - 8)
    head = (shoulder[0] - NECK - HEAD * 0.45, bench_y - 28)

    wide_l = (shoulder[0] - 90, bench_y - 20)
    wide_r = (shoulder[0] + 90, bench_y - 20)
    top_l = (shoulder[0] - 20, bench_y - 55)
    top_r = (shoulder[0] + 20, bench_y - 55)

    hand_l = (lerp(wide_l[0], top_l[0], t), lerp(wide_l[1], top_l[1], t))
    hand_r = (lerp(wide_r[0], top_r[0], t), lerp(wide_r[1], top_r[1], t))
    elbow_l, _ = two_bone_ik(shoulder, hand_l, UPPER_ARM, FOREARM, bend_sign=-1.0)
    elbow_r, _ = two_bone_ik(shoulder, hand_r, UPPER_ARM, FOREARM, bend_sign=-1.0)

    knee = (hip[0] + 26, bench_y + 28)
    ankle = (knee[0] + 8, bench_y + 48)
    seg(d, hip, knee, width=11)
    seg(d, knee, ankle, width=10)

    seg(d, hip, shoulder, width=13)
    draw_head(d, head, face_left=True)
    seg(d, shoulder, elbow_l, width=9)
    seg(d, elbow_l, hand_l, width=9)
    draw_db(d, hand_l)
    seg(d, shoulder, elbow_r, width=9)
    seg(d, elbow_r, hand_r, width=9)
    draw_db(d, hand_r)

    label(d, "Dumbbell Chest Fly", "Lying on bench · arc DBs together", "Fly up" if t > 0.5 else "Open wide")
    return im


def frames_db_chest_fly(n=16):
    return bounce_frames(db_chest_fly_stick, n=n, pause=2)


def db_curl_stick(t: float) -> Image.Image:
    """Standing, curl DBs from thighs to shoulders."""
    im = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(im)
    floor_y = H - 72
    d.line([(40, floor_y), (W - 40, floor_y)], fill=FLOOR_C, width=4)
    t = ease(max(0.0, min(1.0, t)))

    ankle_r = (W * 0.5, floor_y - 3)
    ankle_l = (ankle_r[0] + 26, floor_y - 3)
    hip = (ankle_r[0] + 8, ankle_r[1] - SHIN - THIGH + 12)
    knee_r = (ankle_r[0] - 4, ankle_r[1] - SHIN + 6)
    knee_l = (ankle_l[0] - 4, ankle_l[1] - SHIN + 6)
    shoulder = (hip[0] - 6, hip[1] - TORSO)
    head = (shoulder[0] - 6, shoulder[1] - NECK - HEAD * 0.5)

    low_l = (shoulder[0] - 20, hip[1] + 18)
    low_r = (low_l[0] + 18, low_l[1] + 4)
    high_l = (shoulder[0] - 22, shoulder[1] + 18)
    high_r = (high_l[0] + 18, high_l[1] + 4)
    hand_l = (lerp(low_l[0], high_l[0], t), lerp(low_l[1], high_l[1], t))
    hand_r = (lerp(low_r[0], high_r[0], t), lerp(low_r[1], high_r[1], t))
    elbow_l, _ = two_bone_ik(shoulder, hand_l, UPPER_ARM, FOREARM, bend_sign=-1.0)
    elbow_r, _ = two_bone_ik(shoulder, hand_r, UPPER_ARM, FOREARM, bend_sign=-1.0)

    seg(d, hip, knee_r, width=12)
    seg(d, knee_r, ankle_r, width=12)
    draw_foot(d, ankle_r, face_left=True)
    seg(d, hip, knee_l, width=12)
    seg(d, knee_l, ankle_l, width=12)
    draw_foot(d, ankle_l, face_left=True)
    seg(d, hip, shoulder, width=13)
    draw_head(d, head, face_left=True)
    seg(d, shoulder, elbow_l, width=9)
    seg(d, elbow_l, hand_l, width=9)
    draw_db(d, hand_l)
    seg(d, shoulder, elbow_r, width=9)
    seg(d, elbow_r, hand_r, width=9)
    draw_db(d, hand_r)

    label(d, "Dumbbell Curl", "Standing · curl DBs to shoulders", "Curl" if t > 0.5 else "Lower")
    return im


def frames_db_curl(n=16):
    return bounce_frames(db_curl_stick, n=n, pause=2)


def db_lunge_stick(t: float) -> Image.Image:
    """Standing with DBs at sides, step forward into lunge and back."""
    im = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(im)
    floor_y = H - 72
    d.line([(40, floor_y), (W - 40, floor_y)], fill=FLOOR_C, width=4)
    t = ease(max(0.0, min(1.0, t)))

    back_ankle = (W * 0.58, floor_y - 3)
    front_ankle_x = lerp(back_ankle[0] - 30, back_ankle[0] - 110, t)
    front_ankle = (front_ankle_x, floor_y - 3)

    hip_drop = HEAD * 1.3 * math.sin(t * math.pi)
    hip_y = back_ankle[1] - SHIN - THIGH + 18 + hip_drop
    hip_x = lerp(back_ankle[0] - 10, (front_ankle[0] + back_ankle[0]) / 2 + 10, t)
    hip = (hip_x, hip_y)

    back_knee = (back_ankle[0] - 4, hip_y + THIGH * 0.7)
    front_knee = (front_ankle[0] + 16 * t, hip_y + THIGH * 0.65)

    shoulder = (hip[0] - 6, hip[1] - TORSO)
    head = (shoulder[0] - 6, shoulder[1] - NECK - HEAD * 0.5)

    hand_l = (shoulder[0] - 24, hip[1] + 16)
    hand_r = (hand_l[0] + 20, hand_l[1] + 4)
    elbow_l, _ = two_bone_ik(shoulder, hand_l, UPPER_ARM, FOREARM, bend_sign=-1.0)
    elbow_r, _ = two_bone_ik(shoulder, hand_r, UPPER_ARM, FOREARM, bend_sign=-1.0)

    seg(d, hip, back_knee, width=12)
    seg(d, back_knee, back_ankle, width=12)
    draw_foot(d, back_ankle, face_left=True)
    seg(d, hip, front_knee, width=12)
    seg(d, front_knee, front_ankle, width=12)
    draw_foot(d, front_ankle, face_left=True)

    seg(d, hip, shoulder, width=13)
    draw_head(d, head, face_left=True)
    seg(d, shoulder, elbow_l, width=9)
    seg(d, elbow_l, hand_l, width=9)
    draw_db(d, hand_l)
    seg(d, shoulder, elbow_r, width=9)
    seg(d, elbow_r, hand_r, width=9)
    draw_db(d, hand_r)

    label(d, "Dumbbell Lunge", "Step forward into lunge · DBs at sides", "Lunge down" if t > 0.5 else "Stand")
    return im


def frames_db_lunge(n=16):
    return bounce_frames(db_lunge_stick, n=n, pause=2)


def db_overhead_press_stick(t: float) -> Image.Image:
    """Standing, press DBs from shoulders to overhead."""
    im = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(im)
    floor_y = H - 72
    d.line([(40, floor_y), (W - 40, floor_y)], fill=FLOOR_C, width=4)
    t = ease(max(0.0, min(1.0, t)))

    ankle_r = (W * 0.5, floor_y - 3)
    ankle_l = (ankle_r[0] + 26, floor_y - 3)
    hip = (ankle_r[0] + 8, ankle_r[1] - SHIN - THIGH + 12)
    knee_r = (ankle_r[0] - 4, ankle_r[1] - SHIN + 6)
    knee_l = (ankle_l[0] - 4, ankle_l[1] - SHIN + 6)
    shoulder = (hip[0] - 6, hip[1] - TORSO)
    head = (shoulder[0] - 6, shoulder[1] - NECK - HEAD * 0.5)

    low_l = (shoulder[0] - 18, shoulder[1] + 22)
    low_r = (low_l[0] + 18, low_l[1] + 4)
    high_l = (shoulder[0] - 20, shoulder[1] - HEAD * 1.8)
    high_r = (high_l[0] + 18, high_l[1] + 4)
    hand_l = (lerp(low_l[0], high_l[0], t), lerp(low_l[1], high_l[1], t))
    hand_r = (lerp(low_r[0], high_r[0], t), lerp(low_r[1], high_r[1], t))
    elbow_l, _ = two_bone_ik(shoulder, hand_l, UPPER_ARM, FOREARM, bend_sign=-1.0)
    elbow_r, _ = two_bone_ik(shoulder, hand_r, UPPER_ARM, FOREARM, bend_sign=-1.0)

    seg(d, hip, knee_r, width=12)
    seg(d, knee_r, ankle_r, width=12)
    draw_foot(d, ankle_r, face_left=True)
    seg(d, hip, knee_l, width=12)
    seg(d, knee_l, ankle_l, width=12)
    draw_foot(d, ankle_l, face_left=True)
    seg(d, hip, shoulder, width=13)
    draw_head(d, head, face_left=True)
    seg(d, shoulder, elbow_l, width=9)
    seg(d, elbow_l, hand_l, width=9)
    draw_db(d, hand_l)
    seg(d, shoulder, elbow_r, width=9)
    seg(d, elbow_r, hand_r, width=9)
    draw_db(d, hand_r)

    label(d, "Dumbbell Overhead Press", "Standing · press DBs overhead", "Press" if t > 0.5 else "Lower")
    return im


def frames_db_overhead_press(n=16):
    return bounce_frames(db_overhead_press_stick, n=n, pause=2)


def db_step_up_stick(t: float) -> Image.Image:
    """Step onto bench with DBs, alternating."""
    im = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(im)
    floor_y = H - 72
    d.line([(40, floor_y), (W - 40, floor_y)], fill=FLOOR_C, width=4)
    bench_y = floor_y - 65
    draw_bench(d, bench_y, W * 0.18, W * 0.58)
    t = max(0.0, min(1.0, t))
    cycle = ease(math.sin(t * math.pi * 2) * 0.5 + 0.5)

    back_ankle = (W * 0.52, floor_y - 3)
    front_ankle_x = lerp(back_ankle[0] - 25, W * 0.36, cycle)
    front_ankle_y = lerp(floor_y - 3, bench_y - 3, cycle)
    front_ankle = (front_ankle_x, front_ankle_y)

    hip_y = lerp(floor_y - SHIN - THIGH + 12, bench_y - SHIN - THIGH * 0.5, cycle)
    hip = (lerp(back_ankle[0] - 5, W * 0.42, cycle), hip_y)

    back_knee = (back_ankle[0] - 4, hip_y + THIGH * 0.7)
    front_knee = (front_ankle[0] + 10, hip_y + THIGH * 0.6)

    shoulder = (hip[0] - 6, hip[1] - TORSO)
    head = (shoulder[0] - 6, shoulder[1] - NECK - HEAD * 0.5)

    hand_l = (shoulder[0] - 24, hip[1] + 16)
    hand_r = (hand_l[0] + 20, hand_l[1] + 4)

    seg(d, hip, back_knee, width=12)
    seg(d, back_knee, back_ankle, width=12)
    draw_foot(d, back_ankle, face_left=True)
    seg(d, hip, front_knee, width=12)
    seg(d, front_knee, front_ankle, width=12)
    draw_foot(d, front_ankle, face_left=True)

    seg(d, hip, shoulder, width=13)
    draw_head(d, head, face_left=True)
    elbow_l, _ = two_bone_ik(shoulder, hand_l, UPPER_ARM, FOREARM, bend_sign=-1.0)
    elbow_r, _ = two_bone_ik(shoulder, hand_r, UPPER_ARM, FOREARM, bend_sign=-1.0)
    seg(d, shoulder, elbow_l, width=9)
    seg(d, elbow_l, hand_l, width=9)
    draw_db(d, hand_l)
    seg(d, shoulder, elbow_r, width=9)
    seg(d, elbow_r, hand_r, width=9)
    draw_db(d, hand_r)

    label(d, "Dumbbell Step-Up", "Step onto bench · DBs at sides", "Step up" if cycle > 0.5 else "Step down")
    return im


def frames_db_step_up(n=24):
    return cyclic_frames(db_step_up_stick, n=n)


def db_triceps_extension_stick(t: float) -> Image.Image:
    """Standing/slight lean, DB overhead lowered behind head and extended."""
    im = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(im)
    floor_y = H - 72
    d.line([(40, floor_y), (W - 40, floor_y)], fill=FLOOR_C, width=4)
    t = ease(max(0.0, min(1.0, t)))

    ankle_r = (W * 0.5, floor_y - 3)
    ankle_l = (ankle_r[0] + 24, floor_y - 3)
    hip = (ankle_r[0] + 8, ankle_r[1] - SHIN - THIGH + 12)
    knee_r = (ankle_r[0] - 4, ankle_r[1] - SHIN + 6)
    knee_l = (ankle_l[0] - 4, ankle_l[1] - SHIN + 6)
    shoulder = (hip[0] - 6, hip[1] - TORSO)
    head = (shoulder[0] - 6, shoulder[1] - NECK - HEAD * 0.5)

    top = (shoulder[0] - 10, shoulder[1] - HEAD * 2.2)
    back = (shoulder[0] - 18, shoulder[1] - HEAD * 0.6)
    hand = (lerp(top[0], back[0], t), lerp(top[1], back[1], t))
    elbow, hand = two_bone_ik(shoulder, hand, UPPER_ARM, FOREARM, bend_sign=1.0)

    seg(d, hip, knee_r, width=12)
    seg(d, knee_r, ankle_r, width=12)
    draw_foot(d, ankle_r, face_left=True)
    seg(d, hip, knee_l, width=12)
    seg(d, knee_l, ankle_l, width=12)
    draw_foot(d, ankle_l, face_left=True)
    seg(d, hip, shoulder, width=13)
    draw_head(d, head, face_left=True)
    seg(d, shoulder, elbow, width=9)
    seg(d, elbow, hand, width=9)
    draw_db(d, hand)

    label(d, "Dumbbell Triceps Extension", "Overhead · lower behind head · extend", "Extend" if t < 0.5 else "Lower")
    return im


def frames_db_triceps_extension(n=16):
    return bounce_frames(db_triceps_extension_stick, n=n, pause=2)


def farmers_carry_stick(t: float) -> Image.Image:
    """Walk with heavy DBs in each hand."""
    im = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(im)
    floor_y = H - 72
    d.line([(40, floor_y), (W - 40, floor_y)], fill=FLOOR_C, width=4)
    t = max(0.0, min(1.0, t))

    walk_offset = math.sin(t * math.pi * 2) * 18
    ankle_r = (W * 0.52 + walk_offset, floor_y - 3)
    ankle_l = (ankle_r[0] + 28, floor_y - 3)
    hip = (ankle_r[0] + 10, ankle_r[1] - SHIN - THIGH + 12)
    knee_r = (ankle_r[0] - 4, ankle_r[1] - SHIN + 6)
    knee_l = (ankle_l[0] - 4, ankle_l[1] - SHIN + 6)
    shoulder = (hip[0] - 6, hip[1] - TORSO)
    head = (shoulder[0] - 6, shoulder[1] - NECK - HEAD * 0.5)

    hand_l = (shoulder[0] - 22, hip[1] + 18 + math.sin(t * math.pi * 2) * 4)
    hand_r = (hand_l[0] + 20, hand_l[1] + 4 - math.sin(t * math.pi * 2) * 4)
    elbow_l, _ = two_bone_ik(shoulder, hand_l, UPPER_ARM, FOREARM, bend_sign=-1.0)
    elbow_r, _ = two_bone_ik(shoulder, hand_r, UPPER_ARM, FOREARM, bend_sign=-1.0)

    seg(d, hip, knee_r, width=12)
    seg(d, knee_r, ankle_r, width=12)
    draw_foot(d, ankle_r, face_left=True)
    seg(d, hip, knee_l, width=12)
    seg(d, knee_l, ankle_l, width=12)
    draw_foot(d, ankle_l, face_left=True)
    seg(d, hip, shoulder, width=13)
    draw_head(d, head, face_left=True)
    seg(d, shoulder, elbow_l, width=9)
    seg(d, elbow_l, hand_l, width=9)
    draw_db(d, hand_l)
    seg(d, shoulder, elbow_r, width=9)
    seg(d, elbow_r, hand_r, width=9)
    draw_db(d, hand_r)

    label(d, "Farmer's Carry", "Walk with heavy DBs in each hand", "Walk")
    return im


def frames_farmers_carry(n=24):
    return cyclic_frames(farmers_carry_stick, n=n)


def hammer_curl_stick(t: float) -> Image.Image:
    """Neutral-grip curl."""
    im = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(im)
    floor_y = H - 72
    d.line([(40, floor_y), (W - 40, floor_y)], fill=FLOOR_C, width=4)
    t = ease(max(0.0, min(1.0, t)))

    ankle_r = (W * 0.5, floor_y - 3)
    ankle_l = (ankle_r[0] + 26, floor_y - 3)
    hip = (ankle_r[0] + 8, ankle_r[1] - SHIN - THIGH + 12)
    knee_r = (ankle_r[0] - 4, ankle_r[1] - SHIN + 6)
    knee_l = (ankle_l[0] - 4, ankle_l[1] - SHIN + 6)
    shoulder = (hip[0] - 6, hip[1] - TORSO)
    head = (shoulder[0] - 6, shoulder[1] - NECK - HEAD * 0.5)

    low_l = (shoulder[0] - 16, hip[1] + 18)
    low_r = (low_l[0] + 18, low_l[1] + 4)
    high_l = (shoulder[0] - 18, shoulder[1] + 18)
    high_r = (high_l[0] + 18, high_l[1] + 4)
    hand_l = (lerp(low_l[0], high_l[0], t), lerp(low_l[1], high_l[1], t))
    hand_r = (lerp(low_r[0], high_r[0], t), lerp(low_r[1], high_r[1], t))
    elbow_l, _ = two_bone_ik(shoulder, hand_l, UPPER_ARM, FOREARM, bend_sign=-1.0)
    elbow_r, _ = two_bone_ik(shoulder, hand_r, UPPER_ARM, FOREARM, bend_sign=-1.0)

    seg(d, hip, knee_r, width=12)
    seg(d, knee_r, ankle_r, width=12)
    draw_foot(d, ankle_r, face_left=True)
    seg(d, hip, knee_l, width=12)
    seg(d, knee_l, ankle_l, width=12)
    draw_foot(d, ankle_l, face_left=True)
    seg(d, hip, shoulder, width=13)
    draw_head(d, head, face_left=True)
    seg(d, shoulder, elbow_l, width=9)
    seg(d, elbow_l, hand_l, width=9)
    draw_db(d, hand_l)
    seg(d, shoulder, elbow_r, width=9)
    seg(d, elbow_r, hand_r, width=9)
    draw_db(d, hand_r)

    label(d, "Hammer Curl", "Neutral-grip curl", "Curl" if t > 0.5 else "Lower")
    return im


def frames_hammer_curl(n=16):
    return bounce_frames(hammer_curl_stick, n=n, pause=2)


def hanging_knee_raise_stick(t: float) -> Image.Image:
    """Hang from bar, knees lift to chest and lower."""
    im = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(im)
    floor_y = H - 72
    d.line([(40, floor_y), (W - 40, floor_y)], fill=FLOOR_C, width=4)
    bar_y = H * 0.18
    draw_pullup_bar(d, bar_y)
    t = ease(max(0.0, min(1.0, t)))

    shoulder = (W * 0.5, bar_y + 26)
    hand_l = (shoulder[0] - 24, bar_y + 4)
    hand_r = (shoulder[0] + 24, bar_y + 4)
    elbow_l = (shoulder[0] - 16, shoulder[1] + 10)
    elbow_r = (shoulder[0] + 16, shoulder[1] + 10)
    head = (shoulder[0] - 6, shoulder[1] + NECK + HEAD * 0.5)

    hip_y = shoulder[1] + TORSO * 0.9 - math.sin(t * math.pi) * HEAD * 1.8
    hip = (shoulder[0] + 8, hip_y)
    knee_angle = math.radians(lerp(15, 95, t))
    knee = (hip[0] + math.sin(knee_angle) * THIGH * 0.8, hip[1] + math.cos(knee_angle) * THIGH * 0.8)
    ankle = (knee[0] + 10, knee[1] + SHIN * 0.7)

    seg(d, shoulder, elbow_l, width=9)
    seg(d, elbow_l, hand_l, width=9)
    seg(d, shoulder, elbow_r, width=9)
    seg(d, elbow_r, hand_r, width=9)
    seg(d, shoulder, hip, width=13)
    draw_head(d, head, face_left=False)
    seg(d, hip, knee, width=12)
    seg(d, knee, ankle, width=12)
    draw_foot(d, ankle, face_left=False)

    label(d, "Hanging Knee Raise", "Hang from bar · raise knees to chest", "Raise" if t > 0.5 else "Lower")
    return im


def frames_hanging_knee_raise(n=16):
    return bounce_frames(hanging_knee_raise_stick, n=n, pause=2)


def kettlebell_goblet_squat_stick(t: float) -> Image.Image:
    """KB held at chest, squat."""
    im = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(im)
    floor_y = H - 72
    d.line([(40, floor_y), (W - 40, floor_y)], fill=FLOOR_C, width=4)
    t = ease(max(0.0, min(1.0, t)))

    ankle_r = (W * 0.5, floor_y - 3)
    ankle_l = (ankle_r[0] + 26, floor_y - 3)
    hip_drop = HEAD * 1.9 * t
    hip = (ankle_r[0] + 10 + 12 * t, ankle_r[1] - SHIN - THIGH + 14 + hip_drop)
    knee_r = (ankle_r[0] - 18 * t, ankle_r[1] - SHIN + 18 * t)
    knee_l = (ankle_l[0] - 18 * t, ankle_l[1] - SHIN + 18 * t)
    shoulder = (hip[0] - 6, hip[1] - TORSO)
    head = (shoulder[0] - 6, shoulder[1] - NECK - HEAD * 0.5)

    hand = (shoulder[0] - 8, shoulder[1] + 26)
    elbow, hand = two_bone_ik(shoulder, hand, UPPER_ARM, FOREARM, bend_sign=-1.0)

    seg(d, hip, knee_r, width=12)
    seg(d, knee_r, ankle_r, width=12)
    draw_foot(d, ankle_r, face_left=True)
    seg(d, hip, knee_l, width=12)
    seg(d, knee_l, ankle_l, width=12)
    draw_foot(d, ankle_l, face_left=True)
    seg(d, hip, shoulder, width=13)
    draw_head(d, head, face_left=True)
    seg(d, shoulder, elbow, width=9)
    seg(d, elbow, hand, width=9)
    draw_kb(d, hand)

    label(d, "Kettlebell Goblet Squat", "KB at chest · squat down and up", "Squat" if t > 0.5 else "Stand")
    return im


def frames_kettlebell_goblet_squat(n=16):
    return bounce_frames(kettlebell_goblet_squat_stick, n=n, pause=2)


def kettlebell_swing_stick(t: float) -> Image.Image:
    """Hip hinge swing from between legs to chest height."""
    im = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(im)
    floor_y = H - 72
    d.line([(40, floor_y), (W - 40, floor_y)], fill=FLOOR_C, width=4)
    t = ease(max(0.0, min(1.0, t)))

    ankle_r = (W * 0.5, floor_y - 3)
    ankle_l = (ankle_r[0] + 26, floor_y - 3)
    hip0 = (ankle_r[0] + 8, ankle_r[1] - SHIN - THIGH + 14)
    hip_back = HEAD * 1.6 * math.sin(t * math.pi)
    hip_drop = HEAD * 0.6 * math.sin(t * math.pi)
    hip = (hip0[0] + hip_back, hip0[1] + hip_drop)
    knee_r = (ankle_r[0] - 4 - 10 * math.sin(t * math.pi), ankle_r[1] - SHIN + 6 + 12 * math.sin(t * math.pi))
    knee_l = (ankle_l[0] - 4 - 10 * math.sin(t * math.pi), ankle_l[1] - SHIN + 6 + 12 * math.sin(t * math.pi))

    torso_lean = math.radians(lerp(45, 10, math.sin(t * math.pi)))
    shoulder = (hip[0] - math.sin(torso_lean) * TORSO, hip[1] - math.cos(torso_lean) * TORSO)
    head = (shoulder[0] - math.sin(torso_lean) * (NECK + HEAD * 0.48),
            shoulder[1] - math.cos(torso_lean) * (NECK + HEAD * 0.48))

    low = (hip[0] - 10, hip[1] + 55)
    high = (hip[0] - 30, shoulder[1] + 20)
    s = math.sin(t * math.pi)
    hand = (lerp(low[0], high[0], s), lerp(low[1], high[1], s))
    elbow, hand = two_bone_ik(shoulder, hand, UPPER_ARM, FOREARM, bend_sign=-1.0)

    seg(d, hip, knee_r, width=12)
    seg(d, knee_r, ankle_r, width=12)
    draw_foot(d, ankle_r, face_left=True)
    seg(d, hip, knee_l, width=12)
    seg(d, knee_l, ankle_l, width=12)
    draw_foot(d, ankle_l, face_left=True)
    seg(d, hip, shoulder, width=13)
    draw_head(d, head, face_left=True)
    seg(d, shoulder, elbow, width=9)
    seg(d, elbow, hand, width=9)
    draw_kb(d, hand)

    label(d, "Kettlebell Swing", "Hip hinge swing · between legs to chest", "Swing up" if s > 0.5 else "Hinge back")
    return im


def frames_kettlebell_swing(n=24):
    return cyclic_frames(kettlebell_swing_stick, n=n)


def lateral_raise_stick(t: float) -> Image.Image:
    """Raise DBs out to sides to shoulder height."""
    im = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(im)
    floor_y = H - 72
    d.line([(40, floor_y), (W - 40, floor_y)], fill=FLOOR_C, width=4)
    t = ease(max(0.0, min(1.0, t)))

    ankle_r = (W * 0.5, floor_y - 3)
    ankle_l = (ankle_r[0] + 26, floor_y - 3)
    hip = (ankle_r[0] + 8, ankle_r[1] - SHIN - THIGH + 12)
    knee_r = (ankle_r[0] - 4, ankle_r[1] - SHIN + 6)
    knee_l = (ankle_l[0] - 4, ankle_l[1] - SHIN + 6)
    shoulder = (hip[0] - 6, hip[1] - TORSO)
    head = (shoulder[0] - 6, shoulder[1] - NECK - HEAD * 0.5)

    low_l = (shoulder[0] - 20, hip[1] + 16)
    low_r = (low_l[0] + 20, low_l[1] + 4)
    high_l = (shoulder[0] - 70, shoulder[1] + 4)
    high_r = (high_l[0] + 20, high_l[1] + 4)
    hand_l = (lerp(low_l[0], high_l[0], t), lerp(low_l[1], high_l[1], t))
    hand_r = (lerp(low_r[0], high_r[0], t), lerp(low_r[1], high_r[1], t))
    elbow_l, _ = two_bone_ik(shoulder, hand_l, UPPER_ARM, FOREARM, bend_sign=-1.0)
    elbow_r, _ = two_bone_ik(shoulder, hand_r, UPPER_ARM, FOREARM, bend_sign=-1.0)

    seg(d, hip, knee_r, width=12)
    seg(d, knee_r, ankle_r, width=12)
    draw_foot(d, ankle_r, face_left=True)
    seg(d, hip, knee_l, width=12)
    seg(d, knee_l, ankle_l, width=12)
    draw_foot(d, ankle_l, face_left=True)
    seg(d, hip, shoulder, width=13)
    draw_head(d, head, face_left=True)
    seg(d, shoulder, elbow_l, width=9)
    seg(d, elbow_l, hand_l, width=9)
    draw_db(d, hand_l)
    seg(d, shoulder, elbow_r, width=9)
    seg(d, elbow_r, hand_r, width=9)
    draw_db(d, hand_r)

    label(d, "Lateral Raise", "Raise DBs out to shoulder height", "Raise" if t > 0.5 else "Lower")
    return im


def frames_lateral_raise(n=16):
    return bounce_frames(lateral_raise_stick, n=n, pause=2)


def pull_up_stick(t: float) -> Image.Image:
    """Pull body up to bar and lower."""
    im = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(im)
    floor_y = H - 72
    d.line([(40, floor_y), (W - 40, floor_y)], fill=FLOOR_C, width=4)
    bar_y = H * 0.18
    draw_pullup_bar(d, bar_y)
    t = ease(max(0.0, min(1.0, t)))

    lift = HEAD * 1.8 * math.sin(t * math.pi)
    shoulder = (W * 0.5, bar_y + 60 - lift)
    hand_l = (shoulder[0] - 26, bar_y + 4)
    hand_r = (shoulder[0] + 26, bar_y + 4)
    head = (shoulder[0] - 6, shoulder[1] + NECK + HEAD * 0.5)

    elbow_y_offset = lerp(UPPER_ARM * 0.6, UPPER_ARM * 0.1, math.sin(t * math.pi))
    elbow_l = (shoulder[0] - 18, shoulder[1] + elbow_y_offset)
    elbow_r = (shoulder[0] + 18, shoulder[1] + elbow_y_offset)

    hip = (shoulder[0] + 6, shoulder[1] + TORSO * 0.9)
    knee = (hip[0] + 10, hip[1] + THIGH * 0.75)
    ankle = (knee[0] + 6, knee[1] + SHIN * 0.75)

    seg(d, shoulder, elbow_l, width=9)
    seg(d, elbow_l, hand_l, width=9)
    seg(d, shoulder, elbow_r, width=9)
    seg(d, elbow_r, hand_r, width=9)
    seg(d, shoulder, hip, width=13)
    draw_head(d, head, face_left=False)
    seg(d, hip, knee, width=12)
    seg(d, knee, ankle, width=12)
    draw_foot(d, ankle, face_left=False)

    label(d, "Pull-Up", "Pull body up to bar · lower with control", "Pull up" if t > 0.5 else "Lower")
    return im


def frames_pull_up(n=16):
    return bounce_frames(pull_up_stick, n=n, pause=2)


def push_up_stick(t: float) -> Image.Image:
    """Plank, lower chest to floor, press up."""
    im = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(im)
    floor_y = H - 72
    d.line([(40, floor_y), (W - 40, floor_y)], fill=FLOOR_C, width=4)
    t = ease(max(0.0, min(1.0, t)))

    shoulder_y = floor_y - 42 + 22 * math.sin(t * math.pi)
    shoulder = (W * 0.52, shoulder_y)
    hip = (shoulder[0] + TORSO * 0.8, shoulder_y + 8)
    ankle = (hip[0] + THIGH * 0.8 + SHIN * 0.8, floor_y - 3)
    knee = (hip[0] + THIGH * 0.8, floor_y - 3)
    head = (shoulder[0] - NECK - HEAD * 0.45, shoulder_y - 8)
    hand = (shoulder[0] - 34, floor_y - 5)
    elbow = (shoulder[0] - 20, shoulder_y + 4 + 18 * math.sin(t * math.pi))

    seg(d, shoulder, hip, width=13)
    seg(d, hip, knee, width=12)
    seg(d, knee, ankle, width=12)
    draw_foot(d, ankle, face_left=False)
    draw_head(d, head, face_left=True)
    seg(d, shoulder, elbow, width=9)
    seg(d, elbow, hand, width=9)

    label(d, "Push-Up", "Plank · lower chest · press up", "Press up" if t < 0.5 else "Lower")
    return im


def frames_push_up(n=16):
    return bounce_frames(push_up_stick, n=n, pause=2)


def renegade_row_stick(t: float) -> Image.Image:
    """Plank on DBs, alternate row."""
    im = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(im)
    floor_y = H - 72
    d.line([(40, floor_y), (W - 40, floor_y)], fill=FLOOR_C, width=4)
    t = max(0.0, min(1.0, t))
    side = 1 if (t % 1.0) < 0.5 else -1
    phase_t = ease(abs(math.sin(t * math.pi * 2)))

    shoulder_y = floor_y - 45
    shoulder = (W * 0.52, shoulder_y)
    hip = (shoulder[0] + TORSO * 0.8, shoulder_y + 8)
    ankle = (hip[0] + THIGH * 0.8 + SHIN * 0.8, floor_y - 3)
    knee = (hip[0] + THIGH * 0.8, floor_y - 3)
    head = (shoulder[0] - NECK - HEAD * 0.45, shoulder_y - 8)

    hand_l = (shoulder[0] - 34, floor_y - 5)
    hand_r = (shoulder[0] + 10, floor_y - 5)
    if side == 1:
        row_hand = (lerp(hand_l[0], shoulder[0] - 22, phase_t), lerp(hand_l[1], hip[1] - 10, phase_t))
        other_hand = hand_r
        elbow, _ = two_bone_ik(shoulder, row_hand, UPPER_ARM, FOREARM, bend_sign=1.0)
    else:
        row_hand = (lerp(hand_r[0], shoulder[0] + 22, phase_t), lerp(hand_r[1], hip[1] - 10, phase_t))
        other_hand = hand_l
        elbow, _ = two_bone_ik(shoulder, row_hand, UPPER_ARM, FOREARM, bend_sign=-1.0)

    seg(d, shoulder, hip, width=13)
    seg(d, hip, knee, width=12)
    seg(d, knee, ankle, width=12)
    draw_foot(d, ankle, face_left=False)
    draw_head(d, head, face_left=True)

    if side == 1:
        seg(d, shoulder, elbow, width=9)
        seg(d, elbow, row_hand, width=9)
        draw_db(d, row_hand)
        seg(d, shoulder, (shoulder[0] + 16, shoulder_y + 4), width=9)
        seg(d, (shoulder[0] + 16, shoulder_y + 4), other_hand, width=9)
        draw_db(d, other_hand)
    else:
        seg(d, shoulder, (shoulder[0] - 16, shoulder_y + 4), width=9)
        seg(d, (shoulder[0] - 16, shoulder_y + 4), other_hand, width=9)
        draw_db(d, other_hand)
        seg(d, shoulder, elbow, width=9)
        seg(d, elbow, row_hand, width=9)
        draw_db(d, row_hand)

    label(d, "Renegade Row", "Plank on DBs · alternate row", "Row left" if side == 1 else "Row right")
    return im


def frames_renegade_row(n=24):
    return cyclic_frames(renegade_row_stick, n=n)


def side_plank_stick(t: float) -> Image.Image:
    """Side plank with small hip dip/raise."""
    im = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(im)
    floor_y = H - 72
    d.line([(40, floor_y), (W - 40, floor_y)], fill=FLOOR_C, width=4)
    t = max(0.0, min(1.0, t))

    elbow = (W * 0.42, floor_y - 8)
    dip = math.sin(t * math.pi * 2) * 10
    shoulder = (elbow[0] + TORSO * 0.85, elbow[1] - 90 + dip)
    head = (shoulder[0] + HEAD * 0.4, shoulder[1] - NECK - HEAD * 0.45)
    hip = (shoulder[0] - 10, shoulder[1] + TORSO * 0.5)
    ankle = (hip[0] - 20, floor_y - 3)
    knee = (hip[0] - 10, floor_y - 3)
    top_hand = (shoulder[0] + 40, shoulder[1] - 10)

    seg(d, elbow, shoulder, width=13)
    draw_head(d, head, face_left=False)
    seg(d, shoulder, hip, width=13)
    seg(d, hip, knee, width=12)
    seg(d, knee, ankle, width=12)
    draw_foot(d, ankle, face_left=False)
    seg(d, shoulder, (shoulder[0] + 22, shoulder[1] - 4), width=9)
    seg(d, (shoulder[0] + 22, shoulder[1] - 4), top_hand, width=9)

    label(d, "Side Plank", "Hold · small hip dip and raise", "Hold")
    return im


def frames_side_plank(n=24):
    return cyclic_frames(side_plank_stick, n=n)


def suitcase_carry_stick(t: float) -> Image.Image:
    """Walk with single DB in one hand."""
    im = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(im)
    floor_y = H - 72
    d.line([(40, floor_y), (W - 40, floor_y)], fill=FLOOR_C, width=4)
    t = max(0.0, min(1.0, t))

    walk_offset = math.sin(t * math.pi * 2) * 18
    ankle_r = (W * 0.52 + walk_offset, floor_y - 3)
    ankle_l = (ankle_r[0] + 28, floor_y - 3)
    hip = (ankle_r[0] + 10, ankle_r[1] - SHIN - THIGH + 12)
    knee_r = (ankle_r[0] - 4, ankle_r[1] - SHIN + 6)
    knee_l = (ankle_l[0] - 4, ankle_l[1] - SHIN + 6)
    shoulder = (hip[0] - 6, hip[1] - TORSO)
    head = (shoulder[0] - 6, shoulder[1] - NECK - HEAD * 0.5)

    hand_db = (shoulder[0] - 22, hip[1] + 18 + math.sin(t * math.pi * 2) * 4)
    hand_free = (shoulder[0] + 10, hip[1] + 16 - math.sin(t * math.pi * 2) * 4)
    elbow_db, _ = two_bone_ik(shoulder, hand_db, UPPER_ARM, FOREARM, bend_sign=-1.0)
    elbow_free, _ = two_bone_ik(shoulder, hand_free, UPPER_ARM, FOREARM, bend_sign=-1.0)

    seg(d, hip, knee_r, width=12)
    seg(d, knee_r, ankle_r, width=12)
    draw_foot(d, ankle_r, face_left=True)
    seg(d, hip, knee_l, width=12)
    seg(d, knee_l, ankle_l, width=12)
    draw_foot(d, ankle_l, face_left=True)
    seg(d, hip, shoulder, width=13)
    draw_head(d, head, face_left=True)
    seg(d, shoulder, elbow_db, width=9)
    seg(d, elbow_db, hand_db, width=9)
    draw_db(d, hand_db)
    seg(d, shoulder, elbow_free, width=9)
    seg(d, elbow_free, hand_free, width=9)

    label(d, "Suitcase Carry", "Walk with single DB at side", "Walk")
    return im


def frames_suitcase_carry(n=24):
    return cyclic_frames(suitcase_carry_stick, n=n)


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


def refresh_index():
    import json

    ids = sorted(p.stem for p in OUT.glob("*.webp") if not p.name.startswith("_"))
    (OUT / "index.json").write_text(
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
    # existing demo
    frames = frames_rdl(18)
    save_webp(frames, OUT / "db-romanian-deadlift.webp")
    save_webp(frames, OUT / "dumbbell-romanian-deadlift.webp")

    # 24 P0 demos
    save_webp(frames_ab_wheel_rollout(), OUT / "ab-wheel-rollout.webp")
    save_webp(frames_band_row(), OUT / "band-row.webp")
    save_webp(frames_barbell_back_squat(), OUT / "barbell-back-squat.webp")
    save_webp(frames_barbell_bench_press(), OUT / "barbell-bench-press.webp")
    save_webp(frames_barbell_row(), OUT / "barbell-row.webp")
    save_webp(frames_burpees(), OUT / "burpees.webp")
    save_webp(frames_db_bent_over_row(), OUT / "db-bent-over-row.webp")
    save_webp(frames_db_chest_fly(), OUT / "db-chest-fly.webp")
    save_webp(frames_db_curl(), OUT / "db-curl.webp")
    save_webp(frames_db_lunge(), OUT / "db-lunge.webp")
    save_webp(frames_db_overhead_press(), OUT / "db-overhead-press.webp")
    save_webp(frames_db_step_up(), OUT / "db-step-up.webp")
    save_webp(frames_db_triceps_extension(), OUT / "db-triceps-extension.webp")
    save_webp(frames_farmers_carry(), OUT / "farmers-carry.webp")
    save_webp(frames_hammer_curl(), OUT / "hammer-curl.webp")
    save_webp(frames_hanging_knee_raise(), OUT / "hanging-knee-raise.webp")
    save_webp(frames_kettlebell_goblet_squat(), OUT / "kettlebell-goblet-squat.webp")
    save_webp(frames_kettlebell_swing(), OUT / "kettlebell-swing.webp")
    save_webp(frames_lateral_raise(), OUT / "lateral-raise.webp")
    save_webp(frames_pull_up(), OUT / "pull-up.webp")
    save_webp(frames_push_up(), OUT / "push-up.webp")
    save_webp(frames_renegade_row(), OUT / "renegade-row.webp")
    save_webp(frames_side_plank(), OUT / "side-plank.webp")
    save_webp(frames_suitcase_carry(), OUT / "suitcase-carry.webp")

    refresh_index()


if __name__ == "__main__":
    main()
