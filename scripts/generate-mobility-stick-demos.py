#!/usr/bin/env python3
"""Original stick-figure demos for warm-up / cool-down mobility moves.

These replace wrong free-exercise-db copies (e.g. cat-cow was hyperextension).
Public-domain stick art — not photos of other exercises.
"""

from __future__ import annotations

import math
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "WorkoutPlanner.Api" / "wwwroot" / "demos"

W, H = 520, 520
BG = (248, 250, 252)
INK = (30, 41, 59)
ACCENT = (37, 99, 235)
MUTED = (148, 163, 184)
FLOOR_C = (203, 213, 225)
MS = 70


def lerp(a, b, t):
    return a + (b - a) * t


def ease(t):
    return 0.5 - 0.5 * math.cos(math.pi * max(0.0, min(1.0, t)))


def joint(d, p, r=5, color=INK):
    d.ellipse([p[0] - r, p[1] - r, p[0] + r, p[1] + r], fill=color)


def seg(d, a, b, width=8, color=INK):
    d.line([a, b], fill=color, width=width)
    joint(d, a, r=max(3, width // 2), color=color)
    joint(d, b, r=max(3, width // 2), color=color)


def head(d, c, r=16):
    d.ellipse([c[0] - r, c[1] - r, c[0] + r, c[1] + r], outline=INK, width=3, fill=(255, 255, 255))


def floor(d, y=None):
    y = y if y is not None else H - 56
    d.line([(28, y), (W - 28, y)], fill=FLOOR_C, width=3)
    return y


def label(d, title, subtitle=""):
    d.text((14, 12), title, fill=(71, 85, 105))
    if subtitle:
        d.text((14, 32), subtitle, fill=MUTED)
    d.text((14, H - 32), "Stick demo — mobility", fill=MUTED)


def bounce_frames(fn, n=14, pause=2):
    frames = []
    for i in range(n + 1):
        frames.append(fn(ease(i / n)))
    for _ in range(pause):
        frames.append(fn(1.0))
    for i in range(1, n + 1):
        frames.append(fn(ease(1.0 - i / n)))
    return frames


def save_webp(frames, path: Path, duration=MS):
    path.parent.mkdir(parents=True, exist_ok=True)
    frames[0].save(
        path,
        format="WEBP",
        save_all=True,
        append_images=frames[1:],
        duration=duration,
        loop=0,
        quality=82,
        method=4,
    )
    print(f"  wrote {path.name} ({path.stat().st_size // 1024} KB, {len(frames)} frames)")


# ---------------------------------------------------------------------------
# Demos
# ---------------------------------------------------------------------------

def cat_cow(t: float) -> Image.Image:
    """t=0 cow (belly down), t=1 cat (round back). Side view, all fours."""
    im = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(im)
    fy = floor(d)
    # Hands and knees fixed
    hand = (W * 0.32, fy - 120)
    knee = (W * 0.58, fy - 8)
    ankle = (knee[0] + 48, fy - 6)
    # Spine mid moves with t
    mid_y = lerp(hand[1] + 28, hand[1] - 22, t)  # cow low → cat high (rounded)
    # Actually cow: lumbar extended (belly toward floor = mid lower)
    # cat: flexed (mid higher)
    hip = (knee[0] - 8, fy - 95)
    shoulder = (hand[0] + 8, hand[1] + 8)
    mid = ((shoulder[0] + hip[0]) / 2, mid_y)
    head_c = (shoulder[0] - 28, lerp(shoulder[1] - 8, shoulder[1] + 22, t))

    # Legs
    seg(d, hip, knee, 9)
    seg(d, knee, ankle, 8)
    # Spine as two segments through mid
    seg(d, hip, mid, 11)
    seg(d, mid, shoulder, 11)
    # Arms
    seg(d, shoulder, hand, 8)
    # Head
    neck = (shoulder[0] - 12, shoulder[1] - 4)
    seg(d, shoulder, neck, 5)
    head(d, head_c, 15)
    label(d, "Cat–cow", "All fours · flex / extend spine")
    phase = "Cow — soft belly" if t < 0.45 else ("Cat — round back" if t > 0.55 else "Moving…")
    d.text((14, 52), phase, fill=ACCENT)
    return im


def cobra(t: float) -> Image.Image:
    """t=0 prone flat, t=1 gentle press-up / cobra. Side view."""
    im = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(im)
    fy = floor(d)
    # Hips stay near floor
    hip = (W * 0.52, fy - 18)
    knee = (hip[0] + 55, fy - 10)
    ankle = (knee[0] + 50, fy - 6)
    # Chest lifts
    lift = lerp(0, 72, t)
    shoulder = (hip[0] - 95, fy - 22 - lift)
    # Arms: elbows under shoulders when pressing
    elbow = (shoulder[0] + 8, fy - 8 - lift * 0.15)
    hand = (shoulder[0] + 12, fy - 4)
    if t < 0.2:
        elbow = (shoulder[0] + 25, fy - 14)
        hand = (shoulder[0] + 40, fy - 6)

    mid = ((hip[0] + shoulder[0]) / 2, (hip[1] + shoulder[1]) / 2 - 4)
    head_c = (shoulder[0] - 22, shoulder[1] - 14)

    # Legs on floor
    seg(d, hip, knee, 9)
    seg(d, knee, ankle, 8)
    # Torso
    seg(d, hip, mid, 11)
    seg(d, mid, shoulder, 11)
    # Arms
    seg(d, shoulder, elbow, 8)
    seg(d, elbow, hand, 7)
    head(d, head_c, 15)
    label(d, "Prone press-up / cobra", "Hips down · gentle chest lift")
    d.text((14, 52), "Press up" if t > 0.5 else "Start prone", fill=ACCENT)
    return im


def bird_dog(t: float) -> Image.Image:
    """t=0 all fours, t=1 opposite arm/leg extended."""
    im = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(im)
    fy = floor(d)
    hip = (W * 0.52, fy - 100)
    shoulder = (W * 0.36, fy - 108)
    # Support knee + hand
    knee_r = (hip[0] + 10, fy - 8)
    hand_l = (shoulder[0] - 8, fy - 8)
    # Extended limbs
    e = ease(t)
    leg_ext = (hip[0] + 90 * e, hip[1] - 8 * e)
    arm_ext = (shoulder[0] - 90 * e, shoulder[1] - 6 * e)
    head_c = (shoulder[0] - 20, shoulder[1] - 18)

    seg(d, hip, knee_r, 9)
    seg(d, hip, leg_ext, 9)
    seg(d, hip, shoulder, 11)
    seg(d, shoulder, hand_l, 8)
    seg(d, shoulder, arm_ext, 8)
    head(d, head_c, 15)
    label(d, "Bird dog", "Opposite arm and leg · brace core")
    return im


def child_pose(t: float) -> Image.Image:
    """t=0 tall kneel, t=1 child's pose (hips to heels, arms forward)."""
    im = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(im)
    fy = floor(d)
    e = ease(t)
    # Knees fixed
    knee = (W * 0.48, fy - 10)
    ankle = (knee[0] + 45, fy - 8)
    # Hip drops toward heels
    hip = (knee[0] - 10 + 20 * e, lerp(fy - 140, fy - 45, e))
    shoulder = (hip[0] - 55 - 50 * e, hip[1] - 20 - 10 * e)
    hand = (shoulder[0] - 70 * e - 20, fy - 12 - 5 * (1 - e))
    if e < 0.3:
        hand = (shoulder[0] - 15, shoulder[1] + 40)
    head_c = (shoulder[0] - 15, shoulder[1] - 12)

    seg(d, ankle, knee, 8)
    seg(d, knee, hip, 9)
    seg(d, hip, shoulder, 11)
    seg(d, shoulder, hand, 8)
    head(d, head_c, 15)
    label(d, "Child's pose", "Hips to heels · arms reach forward")
    return im


def thread_needle(t: float) -> Image.Image:
    """t=0 all fours, t=1 arm threaded under."""
    im = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(im)
    fy = floor(d)
    hip = (W * 0.55, fy - 100)
    shoulder = (W * 0.38, fy - 105)
    knee = (hip[0] + 8, fy - 8)
    hand_support = (shoulder[0] - 5, fy - 8)
    e = ease(t)
    # Threading arm goes under torso toward opposite side
    thread_hand = (
        lerp(shoulder[0] + 40, hip[0] + 30, e),
        lerp(shoulder[1] - 20, fy - 25, e),
    )
    head_c = (lerp(shoulder[0] - 18, shoulder[0] + 25, e), lerp(shoulder[1] - 20, shoulder[1] + 25, e))

    seg(d, hip, knee, 9)
    seg(d, hip, shoulder, 11)
    seg(d, shoulder, hand_support, 8)
    seg(d, shoulder, thread_hand, 8)
    head(d, head_c, 14)
    label(d, "Thread the needle", "On all fours · reach arm under")
    return im


def quad_stand(t: float) -> Image.Image:
    """Standing quad stretch: t animates pull of foot toward glute."""
    im = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(im)
    fy = floor(d)
    # Standing leg
    ankle_l = (W * 0.46, fy - 4)
    knee_l = (ankle_l[0] - 4, fy - 95)
    hip = (knee_l[0] + 4, fy - 190)
    shoulder = (hip[0] - 6, fy - 310)
    head_c = (shoulder[0] - 4, fy - 350)
    # Stretched leg: knee down, ankle pulled up
    e = ease(t)
    knee_r = (hip[0] + 35, fy - 100)
    ankle_r = (knee_r[0] + 8, lerp(fy - 20, hip[1] + 25, e))
    hand = (ankle_r[0] + 5, ankle_r[1] - 5)

    seg(d, hip, knee_l, 10)
    seg(d, knee_l, ankle_l, 10)
    seg(d, hip, knee_r, 9)
    seg(d, knee_r, ankle_r, 9)
    seg(d, hip, shoulder, 12)
    seg(d, shoulder, hand, 8)
    head(d, head_c, 16)
    label(d, "Standing quad stretch", "Hold ankle · knees together · tall")
    return im


def shoulder_rolls(t: float) -> Image.Image:
    """Shoulder rolls — shoulders circle."""
    im = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(im)
    fy = floor(d)
    hip = (W * 0.5, fy - 175)
    base_sh = (hip[0] - 4, fy - 295)
    ang = t * 2 * math.pi
    ox, oy = math.cos(ang) * 14, math.sin(ang) * 12
    shoulder = (base_sh[0] + ox, base_sh[1] + oy)
    head_c = (base_sh[0] - 2, base_sh[1] - 42)
    elbow = (shoulder[0] + 8, shoulder[1] + 55)
    hand = (elbow[0] + 4, elbow[1] + 50)
    knee = (hip[0] - 6, fy - 90)
    ankle = (knee[0] - 2, fy - 4)

    seg(d, hip, knee, 10)
    seg(d, knee, ankle, 10)
    seg(d, hip, shoulder, 12)
    seg(d, shoulder, elbow, 8)
    seg(d, elbow, hand, 7)
    head(d, head_c, 16)
    # motion arc
    d.arc([base_sh[0] - 22, base_sh[1] - 20, base_sh[0] + 22, base_sh[1] + 20], 0, 360, fill=MUTED, width=1)
    label(d, "Shoulder rolls", "Slow circles · relax neck")
    return im


def chest_door(t: float) -> Image.Image:
    """Doorway chest stretch — arm on wall, lean."""
    im = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(im)
    fy = floor(d)
    # Wall
    d.line([(W * 0.22, 80), (W * 0.22, fy)], fill=MUTED, width=6)
    e = ease(t)
    hip = (W * 0.48 + 18 * e, fy - 170)
    shoulder = (hip[0] - 10, fy - 295)
    elbow = (W * 0.24, fy - 295)
    hand = (W * 0.22, fy - 295)
    knee = (hip[0] - 8, fy - 88)
    ankle = (knee[0] - 4, fy - 4)
    head_c = (shoulder[0] + 8, shoulder[1] - 40)

    seg(d, hip, knee, 10)
    seg(d, knee, ankle, 10)
    seg(d, hip, shoulder, 12)
    seg(d, shoulder, elbow, 8)
    seg(d, elbow, hand, 7)
    head(d, head_c, 16)
    label(d, "Chest doorway stretch", "Elbow ~90° · gentle lean")
    return im


def cross_body(t: float) -> Image.Image:
    """Cross-body shoulder stretch."""
    im = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(im)
    fy = floor(d)
    hip = (W * 0.5, fy - 175)
    shoulder = (hip[0] - 4, fy - 300)
    head_c = (shoulder[0], shoulder[1] - 40)
    e = ease(t)
    # Right arm across body
    hand = (shoulder[0] - 70 - 20 * e, shoulder[1] + 25)
    elbow = ((shoulder[0] + hand[0]) / 2, shoulder[1] + 10)
    # Other hand pulls
    pull = (hand[0] + 15, hand[1] - 8)
    knee = (hip[0] - 6, fy - 90)
    ankle = (knee[0], fy - 4)

    seg(d, hip, knee, 10)
    seg(d, knee, ankle, 10)
    seg(d, hip, shoulder, 12)
    seg(d, shoulder, elbow, 8)
    seg(d, elbow, hand, 7)
    seg(d, shoulder, pull, 7)
    head(d, head_c, 16)
    label(d, "Cross-body shoulder stretch", "Arm across chest · soft shoulders")
    return im


def fig4(t: float) -> Image.Image:
    """Figure-4 glute stretch — seated/supine-ish side view."""
    im = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(im)
    fy = floor(d)
    # Lying on back, head left
    head_c = (W * 0.28, fy - 40)
    shoulder = (W * 0.38, fy - 35)
    hip = (W * 0.58, fy - 32)
    # Base leg bent
    knee_base = (hip[0] - 10, fy - 95)
    ankle_base = (knee_base[0] + 40, fy - 40)
    # Figure-4: ankle on opposite thigh
    e = ease(t)
    knee_f = (hip[0] + 30, fy - 110)
    ankle_f = (lerp(hip[0] + 50, knee_base[0] - 5, e), lerp(fy - 50, knee_base[1] + 5, e))

    seg(d, shoulder, hip, 11)
    seg(d, hip, knee_base, 9)
    seg(d, knee_base, ankle_base, 8)
    seg(d, hip, knee_f, 9)
    seg(d, knee_f, ankle_f, 8)
    head(d, head_c, 15)
    label(d, "Figure-4 glute stretch", "Ankle on opposite knee · gentle pull")
    return im


def hip_flexor(t: float) -> Image.Image:
    """Half-kneeling hip flexor stretch."""
    im = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(im)
    fy = floor(d)
    e = ease(t)
    # Back knee on floor
    knee_back = (W * 0.42, fy - 8)
    ankle_back = (knee_back[0] - 50, fy - 6)
    hip = (knee_back[0] + 15 + 25 * e, fy - 145)
    # Front foot
    ankle_front = (hip[0] + 70, fy - 4)
    knee_front = (ankle_front[0] - 15, fy - 95)
    shoulder = (hip[0] - 5, fy - 270)
    head_c = (shoulder[0] - 2, shoulder[1] - 40)

    seg(d, ankle_back, knee_back, 8)
    seg(d, knee_back, hip, 10)
    seg(d, hip, knee_front, 10)
    seg(d, knee_front, ankle_front, 9)
    seg(d, hip, shoulder, 12)
    head(d, head_c, 16)
    label(d, "Hip flexor stretch", "Half-kneeling · tuck pelvis · shift forward")
    return im


def knees_chest(t: float) -> Image.Image:
    """Supine knees to chest."""
    im = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(im)
    fy = floor(d)
    head_c = (W * 0.28, fy - 38)
    shoulder = (W * 0.38, fy - 32)
    hip = (W * 0.58, fy - 28)
    e = ease(t)
    knee = (hip[0] - 20, lerp(fy - 30, fy - 100, e))
    ankle = (knee[0] + 15, lerp(fy - 10, fy - 55, e))
    hand = (knee[0] - 5, knee[1] - 5)

    seg(d, shoulder, hip, 11)
    seg(d, hip, knee, 9)
    seg(d, knee, ankle, 8)
    seg(d, shoulder, hand, 7)
    head(d, head_c, 15)
    label(d, "Knees to chest", "Supine · hug knees · gentle rock")
    return im


def hip_circles(t: float) -> Image.Image:
    """Standing hip circles."""
    im = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(im)
    fy = floor(d)
    ankle = (W * 0.5, fy - 4)
    knee = (ankle[0] - 4, fy - 95)
    base_hip = (knee[0] + 4, fy - 185)
    ang = t * 2 * math.pi
    hip = (base_hip[0] + math.cos(ang) * 22, base_hip[1] + math.sin(ang) * 10)
    shoulder = (hip[0] - 4, hip[1] - 115)
    head_c = (shoulder[0], shoulder[1] - 40)
    hand_l = (shoulder[0] - 35, hip[1] + 5)
    hand_r = (shoulder[0] + 35, hip[1] + 5)

    seg(d, hip, knee, 10)
    seg(d, knee, ankle, 10)
    seg(d, hip, shoulder, 12)
    seg(d, shoulder, hand_l, 7)
    seg(d, shoulder, hand_r, 7)
    head(d, head_c, 16)
    label(d, "Standing hip circles", "Hands on hips · slow circles")
    return im


def leg_swings(t: float) -> Image.Image:
    """Standing leg swings front-back."""
    im = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(im)
    fy = floor(d)
    # Support leg
    ankle_s = (W * 0.48, fy - 4)
    knee_s = (ankle_s[0], fy - 95)
    hip = (knee_s[0] + 2, fy - 185)
    shoulder = (hip[0] - 4, fy - 300)
    head_c = (shoulder[0], shoulder[1] - 40)
    # Swing leg: -1 back to +1 front
    phase = math.sin(t * math.pi * 2)  # -1..1
    ang = math.radians(phase * 45)
    leg_len = 175
    knee_sw = (hip[0] - math.sin(ang) * 90, hip[1] + math.cos(ang) * 90)
    ankle_sw = (hip[0] - math.sin(ang) * leg_len, hip[1] + math.cos(ang) * leg_len)
    # Hand on wall
    d.line([(W * 0.18, 100), (W * 0.18, fy)], fill=MUTED, width=5)
    hand = (W * 0.2, shoulder[1] + 20)

    seg(d, hip, knee_s, 10)
    seg(d, knee_s, ankle_s, 10)
    seg(d, hip, knee_sw, 9)
    seg(d, knee_sw, ankle_sw, 8)
    seg(d, hip, shoulder, 12)
    seg(d, shoulder, hand, 7)
    head(d, head_c, 16)
    label(d, "Leg swings", "Hold support · controlled front/back")
    return im


def scap_pushup(t: float) -> Image.Image:
    """Scapular push-up: plank with protraction/retraction only."""
    im = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(im)
    fy = floor(d)
    hand = (W * 0.32, fy - 8)
    foot = (W * 0.72, fy - 8)
    # Body almost straight; shoulder height changes slightly
    e = ease(t)
    # t=0 protract (shoulders round, higher mid), t=1 retract (chest down a touch)
    sh_y = lerp(fy - 118, fy - 105, e)
    shoulder = (hand[0] + 12, sh_y)
    hip = (foot[0] - 50, sh_y + 8)
    head_c = (shoulder[0] - 28, shoulder[1] - 8)

    seg(d, hip, foot, 9)
    seg(d, hip, shoulder, 11)
    seg(d, shoulder, hand, 8)
    head(d, head_c, 14)
    label(d, "Scapular push-ups", "Plank · spread then squeeze blades")
    return im


def arm_circles(t: float) -> Image.Image:
    im = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(im)
    fy = floor(d)
    hip = (W * 0.5, fy - 175)
    shoulder = (hip[0] - 4, fy - 300)
    head_c = (shoulder[0], shoulder[1] - 40)
    ang = t * 2 * math.pi
    r = 70
    hand = (shoulder[0] + math.cos(ang) * r, shoulder[1] + math.sin(ang) * r)
    elbow = ((shoulder[0] + hand[0]) / 2, (shoulder[1] + hand[1]) / 2)
    knee = (hip[0] - 4, fy - 90)
    ankle = (knee[0], fy - 4)

    seg(d, hip, knee, 10)
    seg(d, knee, ankle, 10)
    seg(d, hip, shoulder, 12)
    seg(d, shoulder, elbow, 8)
    seg(d, elbow, hand, 7)
    head(d, head_c, 16)
    label(d, "Arm circles", "Small to large · both directions")
    return im


def tricep_oh(t: float) -> Image.Image:
    im = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(im)
    fy = floor(d)
    hip = (W * 0.48, fy - 165)
    shoulder = (hip[0] - 2, fy - 285)
    head_c = (shoulder[0] + 2, shoulder[1] - 42)
    # Stretch arm: elbow overhead, hand behind head (animates slight deepen)
    e = ease(t)
    elbow = (shoulder[0] + 6, shoulder[1] - 55 - 8 * e)
    hand = (shoulder[0] - 8 - 10 * e, shoulder[1] + 10)
    # Opposite hand on elbow
    press = (elbow[0] - 18, elbow[1] + 4)
    knee = (hip[0] - 2, fy - 88)
    ankle = (knee[0] - 2, fy - 4)

    seg(d, hip, knee, 10)
    seg(d, knee, ankle, 10)
    seg(d, hip, shoulder, 12)
    seg(d, shoulder, elbow, 9)
    seg(d, elbow, hand, 8)
    seg(d, shoulder, press, 8)
    head(d, head_c, 16)
    label(d, "Overhead triceps stretch", "Elbow high · gentle pressure")
    return im


def breathe(t: float) -> Image.Image:
    """Box breathing — seated figure, expanding chest ring."""
    im = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(im)
    fy = floor(d)
    hip = (W * 0.5, fy - 100)
    knee = (hip[0] + 55, fy - 50)
    ankle = (knee[0] + 30, fy - 8)
    shoulder = (hip[0] - 4, fy - 220)
    head_c = (shoulder[0], shoulder[1] - 40)
    # Expanding circle for breath
    r = 20 + 25 * (0.5 - 0.5 * math.cos(t * 2 * math.pi))
    d.ellipse(
        [shoulder[0] - r, shoulder[1] - r * 0.6, shoulder[0] + r, shoulder[1] + r * 0.6],
        outline=ACCENT,
        width=2,
    )

    seg(d, hip, knee, 9)
    seg(d, knee, ankle, 8)
    seg(d, hip, shoulder, 11)
    head(d, head_c, 16)
    label(d, "Box breathing", "In 4 · hold 4 · out 4 · hold 4")
    return im


def neck_side(t: float) -> Image.Image:
    im = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(im)
    fy = floor(d)
    hip = (W * 0.5, fy - 175)
    shoulder = (hip[0], fy - 300)
    e = ease(t)
    head_c = (shoulder[0] + 28 * e, shoulder[1] - 38 + 8 * e)
    knee = (hip[0], fy - 90)
    ankle = (knee[0], fy - 4)
    hand = (shoulder[0] + 40 * e, shoulder[1] + 10)

    seg(d, hip, knee, 10)
    seg(d, knee, ankle, 10)
    seg(d, hip, shoulder, 12)
    seg(d, shoulder, hand, 7)
    head(d, head_c, 16)
    label(d, "Neck side stretch", "Ear toward shoulder · no force")
    return im


def forearm_stretch(t: float) -> Image.Image:
    im = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(im)
    fy = floor(d)
    hip = (W * 0.5, fy - 175)
    shoulder = (hip[0] - 4, fy - 300)
    head_c = (shoulder[0], shoulder[1] - 40)
    e = ease(t)
    # Arm straight out, palm orientation flips via hand offset
    elbow = (shoulder[0] + 70, shoulder[1] + 10)
    hand = (elbow[0] + 55, elbow[1] + lerp(-8, 12, e))
    other = (hand[0] - 5, hand[1] + 15)
    knee = (hip[0], fy - 90)
    ankle = (knee[0], fy - 4)

    seg(d, hip, knee, 10)
    seg(d, knee, ankle, 10)
    seg(d, hip, shoulder, 12)
    seg(d, shoulder, elbow, 8)
    seg(d, elbow, hand, 7)
    seg(d, shoulder, other, 6)
    head(d, head_c, 16)
    label(d, "Forearm stretch", "Arm straight · palm up then down")
    return im


def calf_wall(t: float) -> Image.Image:
    im = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(im)
    fy = floor(d)
    d.line([(W * 0.2, 90), (W * 0.2, fy)], fill=MUTED, width=6)
    e = ease(t)
    # Front foot near wall, back leg stretched
    ankle_f = (W * 0.32, fy - 4)
    knee_f = (ankle_f[0] + 5, fy - 90)
    hip = (W * 0.48 + 15 * e, fy - 175)
    ankle_b = (W * 0.62, fy - 4)
    knee_b = (ankle_b[0] - 8, fy - 95)
    shoulder = (hip[0] - 20, fy - 290)
    hand = (W * 0.22, fy - 250)
    head_c = (shoulder[0] - 5, shoulder[1] - 38)

    seg(d, hip, knee_f, 9)
    seg(d, knee_f, ankle_f, 9)
    seg(d, hip, knee_b, 10)
    seg(d, knee_b, ankle_b, 10)
    seg(d, hip, shoulder, 12)
    seg(d, shoulder, hand, 8)
    head(d, head_c, 16)
    label(d, "Calf wall stretch", "Back heel down · lean to wall")
    return im


def torso_twist(t: float) -> Image.Image:
    im = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(im)
    fy = floor(d)
    hip = (W * 0.5, fy - 175)
    # Twist shoulders
    e = math.sin(t * 2 * math.pi)
    shoulder = (hip[0] + e * 25, fy - 300)
    head_c = (shoulder[0], shoulder[1] - 40)
    hand_l = (shoulder[0] - 50, shoulder[1] + 30)
    hand_r = (shoulder[0] + 50, shoulder[1] + 30)
    knee = (hip[0], fy - 90)
    ankle = (knee[0], fy - 4)

    seg(d, hip, knee, 10)
    seg(d, knee, ankle, 10)
    seg(d, hip, shoulder, 12)
    seg(d, shoulder, hand_l, 7)
    seg(d, shoulder, hand_r, 7)
    head(d, head_c, 16)
    label(d, "Standing torso twists", "Feet planted · gentle rotation")
    return im


def wrist_circles(t: float) -> Image.Image:
    im = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(im)
    fy = floor(d)
    hip = (W * 0.5, fy - 175)
    shoulder = (hip[0] - 4, fy - 300)
    head_c = (shoulder[0], shoulder[1] - 40)
    elbow = (shoulder[0] + 55, shoulder[1] + 40)
    ang = t * 2 * math.pi
    hand = (elbow[0] + math.cos(ang) * 28, elbow[1] + math.sin(ang) * 28)
    knee = (hip[0], fy - 90)
    ankle = (knee[0], fy - 4)

    seg(d, hip, knee, 10)
    seg(d, knee, ankle, 10)
    seg(d, hip, shoulder, 12)
    seg(d, shoulder, elbow, 8)
    seg(d, elbow, hand, 7)
    head(d, head_c, 16)
    label(d, "Wrist circles", "Open/close hands · both directions")
    return im


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


DEMOS = [
    ("wu-cat-cow", lambda: bounce_frames(cat_cow, 12, 2)),
    ("cd-cobra", lambda: bounce_frames(cobra, 12, 3)),
    ("wu-bird-dog", lambda: bounce_frames(bird_dog, 12, 3)),
    ("cd-child-pose", lambda: bounce_frames(child_pose, 12, 3)),
    ("cd-thread-needle", lambda: bounce_frames(thread_needle, 12, 2)),
    ("cd-quad-stand", lambda: bounce_frames(quad_stand, 10, 3)),
    ("wu-shoulder-rolls", lambda: [shoulder_rolls(i / 24) for i in range(25)]),
    ("cd-chest-door", lambda: bounce_frames(chest_door, 10, 3)),
    ("cd-cross-body", lambda: bounce_frames(cross_body, 10, 3)),
    ("cd-fig4", lambda: bounce_frames(fig4, 10, 3)),
    ("cd-hip-flexor", lambda: bounce_frames(hip_flexor, 10, 3)),
    ("cd-knees-chest", lambda: bounce_frames(knees_chest, 10, 3)),
    ("wu-hip-circles", lambda: [hip_circles(i / 24) for i in range(25)]),
    ("wu-leg-swings", lambda: [leg_swings(i / 28) for i in range(29)]),
    ("wu-scap-pushup", lambda: bounce_frames(scap_pushup, 10, 2)),
    ("wu-arm-circles", lambda: [arm_circles(i / 24) for i in range(25)]),
    ("cd-tricep-oh", lambda: bounce_frames(tricep_oh, 8, 3)),
    ("cd-breathe", lambda: [breathe(i / 32) for i in range(33)]),
    ("cd-neck-side", lambda: bounce_frames(neck_side, 8, 3)),
    ("cd-forearm-stretch", lambda: bounce_frames(forearm_stretch, 10, 2)),
    ("cd-calf-wall", lambda: bounce_frames(calf_wall, 10, 3)),
    ("wu-torso-twist", lambda: [torso_twist(i / 24) for i in range(25)]),
    ("wu-wrist-circles", lambda: [wrist_circles(i / 20) for i in range(21)]),
]


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    print("Generating mobility stick demos…")
    for mid, factory in DEMOS:
        frames = factory()
        save_webp(frames, OUT / f"{mid}.webp")
    refresh_index()
    print("Done.")


if __name__ == "__main__":
    main()
