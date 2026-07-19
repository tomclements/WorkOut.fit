#!/usr/bin/env python3
"""Generate original stick-figure exercise demos as animated WebP (public domain).

These are original drawings — not derived from third-party photos/video.
"""

from __future__ import annotations

import math
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "WorkoutPlanner.Api" / "wwwroot" / "demos"

# Canvas
W, H = 480, 480
BG = (248, 250, 252)
INK = (30, 41, 59)
ACCENT = (37, 99, 235)
FLOOR = (203, 213, 225)
DURATION_MS = 90  # per frame


def new_canvas():
    im = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(im)
    # floor line
    d.line([(40, H - 70), (W - 40, H - 70)], fill=FLOOR, width=4)
    return im, d


def limb(d: ImageDraw.ImageDraw, a, b, width=8, color=INK):
    d.line([a, b], fill=color, width=width)
    # rounded joints
    r = max(3, width // 2 + 1)
    for p in (a, b):
        d.ellipse([p[0] - r, p[1] - r, p[0] + r, p[1] + r], fill=color)


def circle(d, c, r, color=INK, fill=None):
    x, y = c
    d.ellipse([x - r, y - r, x + r, y + r], outline=color, width=4, fill=fill)


def draw_dumbbell(d, center, angle_deg, scale=1.0):
    """Small dumbbell at center, bar along angle."""
    ang = math.radians(angle_deg)
    ux, uy = math.cos(ang), math.sin(ang)
    # perpendicular
    px, py = -uy, ux
    half = 22 * scale
    head = 10 * scale
    # bar
    a = (center[0] - ux * half, center[1] - uy * half)
    b = (center[0] + ux * half, center[1] + uy * half)
    limb(d, a, b, width=5, color=ACCENT)
    for end in (a, b):
        # plate
        d.ellipse(
            [end[0] - head * 0.55, end[1] - head,
             end[0] + head * 0.55, end[1] + head],
            fill=ACCENT,
        )


def stick_rdl(hinge_deg: float) -> Image.Image:
    """
    Stick figure Dumbbell Romanian Deadlift (original drawing).
    hinge_deg: 0 = upright, ~60 = bottom of hinge (torso toward horizontal).
    Side-ish 3/4 view: left leg slightly back for depth, DBs track along thighs.
    """
    im, d = new_canvas()
    hinge = math.radians(hinge_deg)

    # Stance
    ankle_l = (W // 2 - 32, H - 78)
    ankle_r = (W // 2 + 32, H - 78)
    knee_l = (ankle_l[0] + 4, ankle_l[1] - 72)
    knee_r = (ankle_r[0] - 4, ankle_r[1] - 72)

    # Hip drifts back as hinge increases (RDL pattern)
    hip = (
        W // 2 - math.sin(hinge) * 48,
        H - 198 + math.sin(hinge) * 12,
    )

    # Soft knees track slightly forward relative to hip
    knee_l = (hip[0] - 26 + math.sin(hinge) * 10, hip[1] + 78)
    knee_r = (hip[0] + 26 + math.sin(hinge) * 10, hip[1] + 78)
    ankle_l = (knee_l[0] - 4, H - 78)
    ankle_r = (knee_r[0] + 4, H - 78)

    torso_len = 100
    # Flat back: shoulder is hip + length at angle from vertical
    shoulder = (
        hip[0] + math.sin(hinge) * torso_len,
        hip[1] - math.cos(hinge) * torso_len,
    )
    head_r = 22
    head = (
        shoulder[0] + math.sin(hinge) * (head_r + 10),
        shoulder[1] - math.cos(hinge) * (head_r + 10),
    )
    circle(d, head, head_r, fill=(255, 255, 255))

    limb(d, hip, shoulder, width=11)
    limb(d, hip, knee_l, width=9)
    limb(d, hip, knee_r, width=9)
    limb(d, knee_l, ankle_l, width=9)
    limb(d, knee_r, ankle_r, width=9)
    limb(d, ankle_l, (ankle_l[0] - 20, ankle_l[1] + 3), width=7)
    limb(d, ankle_r, (ankle_r[0] + 20, ankle_r[1] + 3), width=7)

    # Arms long, DBs near thighs (classic RDL path)
    # Hand offset down the thigh from hip
    hand_dist = 95 + hinge_deg * 0.35
    # Direction roughly along legs (down + slight forward with hinge)
    hand_dir_x = math.sin(hinge) * 0.25
    hand_dir_y = 1.0
    # normalize-ish
    mag = math.hypot(hand_dir_x, hand_dir_y) or 1
    hand_dir_x /= mag
    hand_dir_y /= mag

    hand_l = (
        hip[0] - 18 + hand_dir_x * hand_dist * 0.15 + math.sin(hinge) * 40,
        hip[1] + hand_dir_y * (55 + hinge_deg * 0.85),
    )
    hand_r = (
        hip[0] + 18 + hand_dir_x * hand_dist * 0.15 + math.sin(hinge) * 40,
        hip[1] + hand_dir_y * (55 + hinge_deg * 0.85),
    )
    elbow_l = ((shoulder[0] * 0.35 + hand_l[0] * 0.65), (shoulder[1] * 0.35 + hand_l[1] * 0.65))
    elbow_r = ((shoulder[0] * 0.35 + hand_r[0] * 0.65), (shoulder[1] * 0.35 + hand_r[1] * 0.65))
    limb(d, shoulder, elbow_l, width=7)
    limb(d, shoulder, elbow_r, width=7)
    limb(d, elbow_l, hand_l, width=7)
    limb(d, elbow_r, hand_r, width=7)

    # Dumbbells follow hand path, bar ~horizontal
    draw_dumbbell(d, hand_l, 5 + hinge_deg * 0.2, scale=1.05)
    draw_dumbbell(d, hand_r, 5 + hinge_deg * 0.2, scale=1.05)

    d.text((16, 16), "Dumbbell RDL (stick demo)", fill=(100, 116, 139))
    d.text((16, 36), "hip hinge · soft knees · flat back", fill=(148, 163, 184))
    d.text((16, H - 36), "Original diagram — not a photo", fill=(148, 163, 184))

    return im


def frames_rdl(n_half: int = 10) -> list[Image.Image]:
    """Up and down through the hinge."""
    frames = []
    # 0 → max → 0
    max_h = 62
    for i in range(n_half + 1):
        t = i / n_half
        # ease in-out
        t = 0.5 - 0.5 * math.cos(math.pi * t)
        frames.append(stick_rdl(max_h * t))
    for i in range(1, n_half + 1):
        t = i / n_half
        t = 0.5 - 0.5 * math.cos(math.pi * t)
        frames.append(stick_rdl(max_h * (1 - t)))
    return frames


def save_webp(frames: list[Image.Image], path: Path, duration: int = DURATION_MS):
    path.parent.mkdir(parents=True, exist_ok=True)
    frames[0].save(
        path,
        format="WEBP",
        save_all=True,
        append_images=frames[1:],
        duration=duration,
        loop=0,
        quality=80,
        method=4,
    )
    print(f"wrote {path} ({path.stat().st_size // 1024} KB, {len(frames)} frames)")


def main():
    # Dumbbell Romanian Deadlift (seed id)
    frames = frames_rdl(12)
    save_webp(frames, OUT / "db-romanian-deadlift.webp")
    # Alias if catalog uses longer name
    save_webp(frames, OUT / "dumbbell-romanian-deadlift.webp")


if __name__ == "__main__":
    main()
