#!/usr/bin/env python3
"""Build every image Game 5 ("Print the Mamamy Tropical pack") imports into Effect House.

    python3 Tools/make_assets.py   ->  Build/sprites, Build/text, Build/ui, Build/LAYOUT.json

Sources: Assets/Textures/MMM SBD Effect 5 TACH HINH N.png — full 1080x1920 frames. The exported
layers sit DY px higher than the mockups (MMM SBD Effect 5 1-5.jpg, SAI MAU 1-2.jpg), so every box
is shifted down by DY before it is turned into a 720x1280 ScreenTransform box (centre origin, y up).
All pack states share one crop box, so swapping textures never moves the pack.

Text uses the MMM brand font (SVN-Gotham) and only the Mamamy logo pink #CF0055 + white.
"""
import json
import os
import shutil

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "Assets", "Textures")
OUT = os.path.join(ROOT, "Build")
GAMES = os.path.dirname(ROOT)
SCALE = 720 / 1080  # mockup px -> screen px
PAD = 4
DY = 212            # exported layers are this much higher than the mockup (template-matched)

PACKS = {           # pack state -> TACH HINH
    "pack_white": 5,
    "pack_print": 6,
    "pack_full": 7,
    "pack_green": 8,
    "pack_pink": 9,
}
SINGLES = {         # sprite -> TACH HINH
    "roller_pink": 1,     # top: prints the logo
    "roller_pattern": 2,  # bottom: prints the tropical pattern
    "roller_white": 3,    # left: prints the white base
    "pack_frame": 4,      # empty pack outline
    "logo_tower19": 10,
}
# Roller bodies (the part that touches the pack), measured on the alpha profile of TACH HINH 1-3.
ROLLER_BODY = {
    "roller_white": ("x", 111, 201),
    "roller_pink": ("y", 469, 559),
    "roller_pattern": ("y", 1171, 1261),
}
# Reference thumbnail in the top-left (the finished pack), template-matched on mockup 1.
THUMB_BOX = (88, 334 - DY, 88 + 308, 334 - DY + 155)
THUMB_GLOW = 14

FONTS = os.path.expanduser("~/Library/Fonts")
BLACK = os.path.join(FONTS, "SVN-Gotham Black.otf")
BOLD = os.path.join(FONTS, "SVN-Gotham Bold.otf")
BRAND = (207, 0, 85, 255)   # #CF0055
WHITE = (255, 255, 255, 255)

PHRASES = {
    "hint_intro": ("In bao bì giống mẫu nhé!", BLACK, 72, BRAND, 7),
    "hint_rule": ("Chạm trục lăn theo đúng thứ tự", BOLD, 46, BRAND, 6),
}
# Reused as-is from the other games (same brand kit).
REUSE = {
    "ui": [("Game 2/Assets/button_record.png", "button_record.png"),
           ("Game 2/Assets/button_play_again.png", "button_play_again.png"),
           ("Game 2/Assets/ui_white.png", "ui_white.png")],
    "text": [("Game 2/Assets/cta_record.png", "cta_record.png"),
             ("Game 2/Assets/cta_again.png", "cta_again.png"),
             ("Game 1/Build/text/title_lose.png", "title_lose.png")],
}


def src(n):
    return Image.open(os.path.join(SRC, f"MMM SBD Effect 5 TACH HINH {n}.png")).convert("RGBA")


def union(boxes):
    return (min(b[0] for b in boxes), min(b[1] for b in boxes),
            max(b[2] for b in boxes), max(b[3] for b in boxes))


def padded(box):
    l, t, r, b = box
    return (max(l - PAD, 0), max(t - PAD, 0), min(r + PAD, 1080), min(b + PAD, 1920))


def sx(x):
    return round(x * SCALE - 360, 1)


def sy(y):
    return round(640 - (y + DY) * SCALE, 1)


def screen_rect(box):
    l, t, r, b = box
    return {"x": sx((l + r) / 2), "y": sy((t + b) / 2),
            "w": round((r - l) * SCALE, 1), "h": round((b - t) * SCALE, 1)}


def render(text, font_path, size, fill, stroke):
    font = ImageFont.truetype(font_path, size)
    l, t, r, b = font.getbbox(text, stroke_width=stroke)
    pad = 4
    im = Image.new("RGBA", (r - l + 2 * pad, b - t + 2 * pad), (0, 0, 0, 0))
    ImageDraw.Draw(im).text((pad - l, pad - t), text, font=font, fill=fill,
                            stroke_width=stroke, stroke_fill=WHITE if stroke else None)
    return im


def thumbnail(full):
    """Finished pack scaled to the mockup thumbnail, on a soft white glow like the mockup."""
    l, t, r, b = THUMB_BOX
    w, h = r - l, b - t
    g = THUMB_GLOW
    pack = full.crop(full.getbbox()).resize((w, h), Image.LANCZOS)
    im = Image.new("RGBA", (w + 2 * g, h + 2 * g), (255, 255, 255, 0))
    glow = Image.new("L", im.size, 0)
    ImageDraw.Draw(glow).rounded_rectangle((g // 2, g // 2, w + g + g // 2, h + g + g // 2), 12, fill=150)
    glow = glow.filter(ImageFilter.GaussianBlur(g / 2))
    im.putalpha(glow)
    im.alpha_composite(pack, (g, g))
    return im, (l - g, t - g, r + g, b + g)


def main():
    for sub in ("sprites", "text", "ui"):
        os.makedirs(os.path.join(OUT, sub), exist_ok=True)
    layout = {}
    packs = {k: src(n) for k, n in PACKS.items()}
    pack_box = padded(union([im.getbbox() for im in packs.values()]))
    for k, im in packs.items():
        im.crop(pack_box).save(os.path.join(OUT, "sprites", k + ".png"))
    layout["pack"] = screen_rect(pack_box)
    for k, n in SINGLES.items():
        im = src(n)
        box = padded(im.getbbox())
        im.crop(box).save(os.path.join(OUT, "sprites", k + ".png"))
        layout[k] = screen_rect(box)
    for k, (axis, a, b) in ROLLER_BODY.items():
        layout[k]["body"] = sx((a + b) / 2) if axis == "x" else sy((a + b) / 2)
        layout[k]["axis"] = axis
    thumb, box = thumbnail(packs["pack_full"])
    thumb.save(os.path.join(OUT, "sprites", "thumb_pack.png"))
    layout["thumb_pack"] = screen_rect(box)
    for key, (text, font, size, fill, stroke) in PHRASES.items():
        im = render(text, font, size, fill, stroke)
        im.save(os.path.join(OUT, "text", key + ".png"))
        layout[key] = {"w": round(im.width * SCALE, 1), "h": round(im.height * SCALE, 1)}
    for sub, pairs in REUSE.items():
        for rel, name in pairs:
            shutil.copy(os.path.join(GAMES, rel), os.path.join(OUT, sub, name))
    with open(os.path.join(OUT, "LAYOUT.json"), "w") as f:
        json.dump(layout, f, indent=1)
    print(json.dumps(layout, indent=1))


if __name__ == "__main__":
    main()
