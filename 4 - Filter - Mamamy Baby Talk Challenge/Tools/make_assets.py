#!/usr/bin/env python3
"""Build every image Game 3 ("Say the word") imports into Effect House.

    python3 Tools/make_assets.py   ->  Build/sprites, Build/text, Build/ui, Build/LAYOUT.json

Sources: Assets/Textures/MMM SBD Effect 3 TACH HINH N.png — full 1080x1920 frames, each holding
one layer at its mockup position (road, the near gate, the big baby). 14-19 are exact copies of
2-7, so only 2-7 are used. LAYOUT.json records each crop as a 720x1280 ScreenTransform box
(centre origin, y up) for the scene build.

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
PAD = 4

# Gate order in the round, with the TACH HINH number of the gate and of its big baby.
GATES = [
    ("eat", 12, 7),
    ("poo", 13, 6),
    ("sleep", 10, 2),
    ("cry", 11, 5),
    ("pee", 8, 4),
    ("nineteen", 9, 3),
]
SINGLES = {"road": 1, "logo_mega19": 20}

FONTS = os.path.expanduser("~/Library/Fonts")
BLACK = os.path.join(FONTS, "SVN-Gotham Black.otf")
BRAND = (207, 0, 85, 255)   # #CF0055
WHITE = (255, 255, 255, 255)

# key: (text, font, size px, fill, stroke px) — size is ~2x the on-screen height.
PHRASES = {
    "hint_intro": ("Đọc to từ trên cổng!", BLACK, 76, BRAND, 7),
    "hint_say": ("Đọc to lên nào!", BLACK, 76, BRAND, 7),
}
# Reused as-is from Game 2 (same brand kit).
FROM_GAME2 = {
    "ui": ["button_record.png", "button_play_again.png", "ui_white.png"],
    "text": ["cta_record.png", "cta_again.png"],
}


def src(n):
    return Image.open(os.path.join(SRC, f"MMM SBD Effect 3 TACH HINH {n}.png")).convert("RGBA")


def padded(box):
    l, t, r, b = box
    return (max(l - PAD, 0), max(t - PAD, 0), min(r + PAD, 1080), min(b + PAD, 1920))


def screen_rect(box):
    l, t, r, b = box
    return {"x": round(((l + r) / 2) * SCALE - 360, 1), "y": round(640 - ((t + b) / 2) * SCALE, 1),
            "w": round((r - l) * SCALE, 1), "h": round((b - t) * SCALE, 1)}


def cut(n, name, layout):
    im = src(n)
    box = padded(im.getbbox())
    im.crop(box).save(os.path.join(OUT, "sprites", name + ".png"))
    layout[name] = screen_rect(box)


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
    for word, gate, baby in GATES:
        cut(gate, "gate_" + word, layout)
        cut(baby, "baby_" + word, layout)
    for name, n in SINGLES.items():
        cut(n, name, layout)
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
