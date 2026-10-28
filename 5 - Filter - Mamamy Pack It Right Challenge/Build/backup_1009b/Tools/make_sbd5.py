#!/usr/bin/env python3
"""Build the seven-product images of Game 5 from the "MMM SBD Effect 5 OP 3" design.

    python3 Tools/make_sbd5.py   ->  Build/sbd5/<PRODUCT>_<layer>.png, Build/sbd5/LAYOUT.json,
                                     Build/sbd5/logo_mega.png, Icon/femaleIcon.png

Each product folder (1-KUT, 2-KK, NRB, NGX, BTG, KUC) holds TACH HINH 1-10 as full 1080x1920 frames:
1 pink roller (top), 2 pattern roller (bottom), 3 white roller (left), 4 empty outline,
5 white base, 6 printed, 7 finished, 8 flooded by the pattern roller, 9 flooded pink, 10 logo.
"3-MEGA MAMAMY 19" is the last item, the MEGA MAMAMY 19 logo, with named layers and its own print
order: purple (Cọ tím, left) → pink (Cọ hồng, top) → gold (Cọ gold, bottom). Its layers map onto
the same names (pack_white = B 1, pack_print = B 2, pack_full = B Final), plus flood_first (purple).
PRODUCTS is the game order: the first two always come first, MEGA always last, the rest shuffled.

Every layer type is cropped with ONE box shared by all six products (the union of their bounding
boxes), so the scene objects never move when the product changes: only textures swap. The roller
bodies sit at different places per product, so their centres are measured here and written to
LAYOUT.json (screen px along the roll axis, relative to the roller image centre).
Like make_assets.py, layers are shifted down by DY to line up with the mockups.
"""
import json
import os

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
GAMES = os.path.dirname(ROOT)
SRC = os.path.join(GAMES, "MMM SBD Effect 5 OP 3")
OUT = os.path.join(ROOT, "Build", "sbd5")
PRODUCTS = ["KUT", "KK", "NRB", "NGX", "BTG", "KUC", "MEGA"]
FOLDERS = {"KUT": "1-KUT", "KK": "2-KK", "MEGA": "3-MEGA MAMAMY 19"}
MEGA_FILES = {
    "roller_pink": "Cọ hồng", "roller_pattern": "Cọ gold", "roller_white": "Cọ tím", "frame": "B 0",
    "pack_white": "B 1", "pack_print": "B 2", "pack_full": "B Final",
    "flood_pattern": "B màu gold", "flood_pink": "B màu hồng", "flood_first": "B màu tím",
}
SCALE = 720 / 1080
DY = 212
PAD = 4

LAYERS = {   # name -> TACH HINH
    "roller_pink": 1, "roller_pattern": 2, "roller_white": 3, "frame": 4,
    "pack_white": 5, "pack_print": 6, "pack_full": 7, "flood_pattern": 8, "flood_pink": 9,
}
PACK_LAYERS = ["pack_white", "pack_print", "pack_full", "flood_pattern", "flood_pink", "flood_first"]
ROLLER_AXIS = {"roller_white": 0, "roller_pattern": 1, "roller_pink": 1}   # 0 rolls along x, 1 along y
THUMB_FIT = (308, 190)        # finished-pack thumbnail fits in this box (mockup px), top-left anchored
THUMB_TOPLEFT = (88, 334 - DY)
THUMB_GLOW = 14


def layer(p, n):
    return Image.open(os.path.join(SRC, FOLDERS.get(p, p), f"MMM SBD Effect 5 TACH HINH {n}.png")).convert("RGBA")


def load(p):
    if p == "MEGA":
        return {k: Image.open(os.path.join(SRC, FOLDERS[p], f + ".png")).convert("RGBA") for k, f in MEGA_FILES.items()}
    return {k: layer(p, n) for k, n in LAYERS.items()}


def filled_frame(m):
    """MEGA outline filled with white (client 2026-10-09: "fill màu trắng vào đây không để mỗi stroke"):
    the finished logo's shape (letter counters stay open) in white, the outline on top."""
    shape = m["pack_full"].getchannel("A").point(lambda v: 255 if v >= 128 else 0).filter(ImageFilter.GaussianBlur(1))
    out = Image.new("RGBA", m["frame"].size, (255, 255, 255, 0))
    out.putalpha(shape)
    out.alpha_composite(m["frame"])
    return out


def union(boxes):
    return (min(b[0] for b in boxes), min(b[1] for b in boxes), max(b[2] for b in boxes), max(b[3] for b in boxes))


def padded(b):
    return (max(b[0] - PAD, 0), max(b[1] - PAD, 0), min(b[2] + PAD, 1080), min(b[3] + PAD, 1920))


def sx(x):
    return round(x * SCALE - 360, 1)


def sy(y):
    return round(640 - (y + DY) * SCALE, 1)


def rect(b):
    return {"x": sx((b[0] + b[2]) / 2), "y": sy((b[1] + b[3]) / 2),
            "w": round((b[2] - b[0]) * SCALE, 1), "h": round((b[3] - b[1]) * SCALE, 1)}


def body_centre(im, axis):
    """Centre of the roller body (the thick part) along the roll axis, in source px."""
    a = np.array(im)[..., 3] > 40
    prof = a.sum(0) if axis == 0 else a.sum(1)
    idx = np.where(prof > 0.6 * prof.max())[0]
    return (idx.min() + idx.max() + 1) / 2


def thumbnail(full):
    pack = full.crop(full.getbbox())
    fw, fh = THUMB_FIT
    k = min(fw / pack.width, fh / pack.height)
    w, h = round(pack.width * k), round(pack.height * k)
    pack = pack.resize((w, h), Image.LANCZOS)
    g = THUMB_GLOW
    im = Image.new("RGBA", (fw + 2 * g, fh + 2 * g), (255, 255, 255, 0))
    glow = Image.new("L", im.size, 0)
    ox, oy = (fw - w) // 2, (fh - h) // 2
    ImageDraw.Draw(glow).rounded_rectangle((ox + g // 2, oy + g // 2, ox + w + g + g // 2, oy + h + g + g // 2), 12, fill=150)
    im.putalpha(glow.filter(ImageFilter.GaussianBlur(g / 2)))
    im.alpha_composite(pack, (ox + g, oy + g))
    return im


def main():
    os.makedirs(OUT, exist_ok=True)
    imgs = {p: load(p) for p in PRODUCTS}
    imgs["MEGA"]["frame"] = filled_frame(imgs["MEGA"])
    layout = {"products": PRODUCTS, "body": {}}
    boxes = {}
    for k in ["roller_pink", "roller_pattern", "roller_white", "frame"]:
        boxes[k] = padded(union([imgs[p][k].getbbox() for p in PRODUCTS]))
    boxes["pack"] = padded(union([imgs[p][k].getbbox() for p in PRODUCTS for k in PACK_LAYERS if k in imgs[p]]))
    for k, b in boxes.items():
        layout[k] = rect(b)
    for p in PRODUCTS:
        for k in imgs[p]:
            box = boxes["pack"] if k in PACK_LAYERS else boxes[k]
            imgs[p][k].crop(box).save(os.path.join(OUT, f"{p}_{k}.png"))
        thumbnail(imgs[p]["pack_full"]).save(os.path.join(OUT, f"{p}_thumb.png"))
        body = []
        for k in ["roller_white", "roller_pattern", "roller_pink"]:   # script order: print order
            axis = ROLLER_AXIS[k]
            b = boxes[k]
            c = body_centre(imgs[p][k], axis)
            centre = (b[0] + b[2]) / 2 if axis == 0 else (b[1] + b[3]) / 2
            off = (c - centre) * SCALE
            body.append(round(off if axis == 0 else -off, 1))         # screen y is up
        layout["body"][p] = body
    fw, fh = THUMB_FIT
    g = THUMB_GLOW
    tl = THUMB_TOPLEFT
    layout["thumb"] = rect((tl[0] - g, tl[1] - g, tl[0] + fw + g, tl[1] + fh + g))
    # Win screen ("Bước chúc mừng"): the MEGA MAMAMY 19 logo with its tagline, where the pack was.
    logo = Image.open(os.path.join(SRC, FOLDERS["MEGA"], "Cụm mamamy 19 năm.png")).convert("RGBA")
    logo.crop(padded(logo.getbbox())).save(os.path.join(OUT, "logo_mega.png"))
    layout["logo"] = rect(padded(logo.getbbox()))
    Image.open(os.path.join(SRC, "MMM SBD Effect 5 - THUMB.jpg")).convert("RGB").resize((720, 720), Image.LANCZOS) \
        .save(os.path.join(OUT, "icon.png"))   # copy to Icon/femaleIcon.png when switching to this design
    with open(os.path.join(OUT, "LAYOUT.json"), "w") as f:
        json.dump(layout, f, indent=1)
    print(json.dumps(layout, indent=1))


if __name__ == "__main__":
    main()
