#!/usr/bin/env python3
"""Build every image Game 1 ("Bé cần gì?") imports into Effect House.

    python3 Tools/make_assets.py   ->  Build/sprites, Build/text, Build/ui

Sources: Assets/Textures/MMM SBD Effect 1 N.png — full 1080x1920 frames that each hold one
sprite at its final on-screen spot. The three states of a baby are cropped with one shared
box, so swapping the texture at runtime never shifts the baby. LAYOUT.json records every
box as a 720x1280 ScreenTransform (centre origin, y up) for the scene build.

Text uses the MMM brand font (SVN-Gotham) and only the Mamamy logo pink #CF0055 + white.
"""
import json
import os
import shutil

from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "Assets", "Textures")
OUT = os.path.join(ROOT, "Build")
GAME2 = os.path.join(os.path.dirname(ROOT), "Game 2", "Assets")
SCALE = 720 / 1080  # mockup px -> screen px
PAD = 6

# baby key -> (idle, wrong, correct) source numbers
BABIES = {
    "baby_tl": (11, 8, 3),    # girl with bottle -> bottle washing liquid
    "baby_tr": (10, 6, 2),    # muddy boy        -> bath foam
    "baby_bl": (9, 5, 1),     # dirty diaper     -> wet wipes
    "baby_br": (12, 7, 4),    # paint-stained    -> laundry liquid
}
SINGLES = {
    "prod_wipes": 13,
    "prod_bath": 14,
    "prod_bottle": 15,
    "prod_laundry": 16,
    "logo_mega19": 17,
}

FONTS = os.path.expanduser("~/Library/Fonts")
BLACK = os.path.join(FONTS, "SVN-Gotham Black.otf")
BRAND = (207, 0, 85, 255)   # #CF0055
WHITE = (255, 255, 255, 255)

# key: (text, font, size px, fill, stroke px) — size is ~2x the on-screen height.
PHRASES = {
    "hint": ("Món này dành cho bé nào?", BLACK, 76, BRAND, 7),
    "title_win": ("BÉ NÀO CŨNG VUI!", BLACK, 120, BRAND, 10),
    "title_lose": ("TIẾC QUÁ!", BLACK, 120, BRAND, 10),
}
# Reused as-is from Game 2 (same brand kit).
FROM_GAME2 = {
    "ui": ["button_record.png", "button_play_again.png", "ui_white.png"],
    "text": ["cta_record.png", "cta_again.png"],
}


def src(n):
    return Image.open(os.path.join(SRC, f"MMM SBD Effect 1 {n}.png")).convert("RGBA")


def union(boxes):
    return (min(b[0] for b in boxes), min(b[1] for b in boxes),
            max(b[2] for b in boxes), max(b[3] for b in boxes))


def screen_rect(box):
    l, t, r, b = box
    return {"x": round(((l + r) / 2) * SCALE - 360, 1), "y": round(640 - ((t + b) / 2) * SCALE, 1),
            "w": round((r - l) * SCALE, 1), "h": round((b - t) * SCALE, 1)}


def crop(im, box):
    l, t, r, b = box
    return im.crop((max(l - PAD, 0), max(t - PAD, 0), min(r + PAD, 1080), min(b + PAD, 1920)))


def padded(box):
    l, t, r, b = box
    return (max(l - PAD, 0), max(t - PAD, 0), min(r + PAD, 1080), min(b + PAD, 1920))


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
    for key, nums in BABIES.items():
        ims = [src(n) for n in nums]
        box = union([im.getbbox() for im in ims])
        for state, im in zip(("idle", "wrong", "correct"), ims):
            crop(im, box).save(os.path.join(OUT, "sprites", f"{key}_{state}.png"))
        layout[key] = screen_rect(padded(box))
    for key, n in SINGLES.items():
        im = src(n)
        box = im.getbbox()
        crop(im, box).save(os.path.join(OUT, "sprites", f"{key}.png"))
        layout[key] = screen_rect(padded(box))
    for key, (text, font, size, fill, stroke) in PHRASES.items():
        render(text, font, size, fill, stroke).save(os.path.join(OUT, "text", key + ".png"))
    for sub, names in FROM_GAME2.items():
        for name in names:
            shutil.copy(os.path.join(GAME2, name), os.path.join(OUT, sub, name))
    with open(os.path.join(OUT, "LAYOUT.json"), "w") as f:
        json.dump(layout, f, indent=1)
    print(json.dumps(layout, indent=1))


if __name__ == "__main__":
    main()
