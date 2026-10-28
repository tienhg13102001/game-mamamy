#!/usr/bin/env python3
"""Build every image Game 4 ("Copy the baby face") imports into Effect House.

    python3 Tools/make_assets.py   ->  Build/sprites, Build/text, Build/ui, Build/LAYOUT.json

Sources: Assets/Textures/MMM SBD Effect 4 TACH HINH N.png — full 1080x1920 frames. The exported
layers sit DY px higher than the mockups (MMM SBD Effect 4 1-2.jpg), so every box is shifted down
by DY before it is turned into a 720x1280 ScreenTransform box (centre origin, y up).
All six cards share one crop box, and so do all six faces, so a texture swap never moves them.

Text uses the MMM brand font (SVN-Gotham) and only the Mamamy logo pink #CF0055 + white.
"""
import json
import os
import shutil

from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "Assets", "Textures")
OUT = os.path.join(ROOT, "Build")
GAMES = os.path.dirname(ROOT)
SCALE = 720 / 1080  # mockup px -> screen px
PAD = 4
DY = 220            # exported layers are this much higher than the mockup

# expression -> (card TACH HINH, big face TACH HINH)
EXPRESSIONS = {
    "tongue": (2, 8),
    "cry": (3, 13),
    "wink": (4, 12),
    "sad": (5, 11),
    "neutral": (6, 10),
    "smile": (7, 9),
}

FONTS = os.path.expanduser("~/Library/Fonts")
BLACK = os.path.join(FONTS, "SVN-Gotham Black.otf")
BRAND = (207, 0, 85, 255)   # #CF0055
WHITE = (255, 255, 255, 255)

PHRASES = {
    "hint_intro": ("Làm mặt giống em bé nhé!", BLACK, 76, BRAND, 7),
}
# Reused as-is from the other games (same brand kit).
REUSE = {
    "sprites": [("Game 1/Build/sprites/logo_mega19.png", "logo_mega19.png")],
    "ui": [("Game 2/Assets/button_record.png", "button_record.png"),
           ("Game 2/Assets/button_play_again.png", "button_play_again.png"),
           ("Game 2/Assets/ui_white.png", "ui_white.png")],
    "text": [("Game 2/Assets/cta_record.png", "cta_record.png"),
             ("Game 2/Assets/cta_again.png", "cta_again.png")],
}


def src(n):
    return Image.open(os.path.join(SRC, f"MMM SBD Effect 4 TACH HINH {n}.png")).convert("RGBA")


def union(boxes):
    return (min(b[0] for b in boxes), min(b[1] for b in boxes),
            max(b[2] for b in boxes), max(b[3] for b in boxes))


def padded(box):
    l, t, r, b = box
    return (max(l - PAD, 0), max(t - PAD, 0), min(r + PAD, 1080), min(b + PAD, 1920))


def screen_rect(box):
    l, t, r, b = box
    t, b = t + DY, b + DY
    return {"x": round(((l + r) / 2) * SCALE - 360, 1), "y": round(640 - ((t + b) / 2) * SCALE, 1),
            "w": round((r - l) * SCALE, 1), "h": round((b - t) * SCALE, 1)}


def render(text, font_path, size, fill, stroke):
    font = ImageFont.truetype(font_path, size)
    l, t, r, b = font.getbbox(text, stroke_width=stroke)
    pad = 4
    im = Image.new("RGBA", (r - l + 2 * pad, b - t + 2 * pad), (0, 0, 0, 0))
    ImageDraw.Draw(im).text((pad - l, pad - t), text, font=font, fill=fill,
                            stroke_width=stroke, stroke_fill=WHITE if stroke else None)
    return im


def main():
    for sub in ("sprites", "text", "ui"):
        os.makedirs(os.path.join(OUT, sub), exist_ok=True)
    layout = {}
    cards = {k: src(c) for k, (c, _) in EXPRESSIONS.items()}
    faces = {k: src(f) for k, (_, f) in EXPRESSIONS.items()}
    card_box = padded(union([im.getbbox() for im in cards.values()]))
    face_box = padded(union([im.getbbox() for im in faces.values()]))
    for k in EXPRESSIONS:
        cards[k].crop(card_box).save(os.path.join(OUT, "sprites", f"card_{k}.png"))
        faces[k].crop(face_box).save(os.path.join(OUT, "sprites", f"face_{k}.png"))
    layout["card"] = screen_rect(card_box)
    layout["face"] = screen_rect(face_box)
    # The road is taller than Effect House's 1024px texture limit, so it ships as two halves
    # (top/bottom) that each stay under the limit and keep their full sharpness.
    road = src(1)
    l, t, r, btm = padded(road.getbbox())
    mid = (t + btm) // 2
    lap = 6  # overlap so the seam never shows (edge texels blend when filtered)
    for name, box in (("road_top", (l, t, r, mid + lap)), ("road_bottom", (l, mid - lap, r, btm))):
        road.crop(box).save(os.path.join(OUT, "sprites", name + ".png"))
        layout[name] = screen_rect(box)
    for key, (text, font, size, fill, stroke) in PHRASES.items():
        render(text, font, size, fill, stroke).save(os.path.join(OUT, "text", key + ".png"))
    for sub, pairs in REUSE.items():
        for rel, name in pairs:
            shutil.copy(os.path.join(GAMES, rel), os.path.join(OUT, sub, name))
    with open(os.path.join(OUT, "LAYOUT.json"), "w") as f:
        json.dump(layout, f, indent=1)
    print(json.dumps(layout, indent=1))


if __name__ == "__main__":
    main()
