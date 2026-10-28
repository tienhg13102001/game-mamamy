#!/usr/bin/env python3
"""Build the SBD final assets (design folder "MMM SBD Effect 1", ROUND 1 + ROUND 2).

    python3 Tools/make_sbd1.py   ->  Build/sbd1/*.png + Build/sbd1/LAYOUT.json + Build/sbd1/icon.png

Round 1: four babies (TL, TR, BL, BR), each idle / wrong / correct, cropped with one shared box.
Round 2: three babies (TL, BL, BR) plus the 19 shield in the TR slot (idle = shield,
wrong = cracked shield, correct = "19 năm kiên định chuẩn an toàn").
LAYOUT.json holds every box as a 720x1280 ScreenTransform (centre origin, y up) and the spot of
the shield inside the MEGA MAMAMY 19 logo (for the shield -> logo finale).
"""
import json
import os

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DESIGN = os.path.join(os.path.dirname(ROOT), "MMM SBD - Design 5 effect", "MMM SBD Effect 1")
OUT = os.path.join(ROOT, "Build", "sbd1")
SCALE = 720 / 1080
PAD = 6

# slot key -> (idle, wrong, correct) layer numbers; slot order TL, TR, BL, BR
BABIES = {
    "ROUND 1": {"r1_tl": (11, 8, 3), "r1_tr": (10, 6, 2), "r1_bl": (9, 5, 1), "r1_br": (12, 7, 4)},
    "ROUND 2": {"r2_tl": (10, 7, 2), "r2_tr": (12, 8, 4), "r2_bl": (11, 5, 3), "r2_br": (9, 6, 1)},
}
# product each slot needs, in slot order TL, TR, BL, BR
PRODUCTS = {
    "ROUND 1": {"r1_prod_tl": 15, "r1_prod_tr": 16, "r1_prod_bl": 13, "r1_prod_br": 14},  # client 10-08: laundry -> dirty clothes, bath foam -> pouting girl
    "ROUND 2": {"r2_prod_tl": 14, "r2_prod_tr": 16, "r2_prod_bl": 15, "r2_prod_br": 13},
}


def layer(rnd, n):
    return Image.open(os.path.join(DESIGN, rnd, f"MMM SBD Effect 1 {n}.png")).convert("RGBA")


def union(boxes):
    return (min(b[0] for b in boxes), min(b[1] for b in boxes),
            max(b[2] for b in boxes), max(b[3] for b in boxes))


def padded(box):
    l, t, r, b = box
    return (max(l - PAD, 0), max(t - PAD, 0), min(r + PAD, 1080), min(b + PAD, 1920))


def screen_rect(box):
    l, t, r, b = box
    return {"x": round(((l + r) / 2) * SCALE - 360, 1), "y": round(640 - ((t + b) / 2) * SCALE, 1),
            "w": round((r - l) * SCALE, 1), "h": round((b - t) * SCALE, 1)}


# Shield box inside the cropped logo (807x343), measured by eye on the logo layer.
LOGO_SHIELD = (595, 5, 805, 240)


def main():
    os.makedirs(OUT, exist_ok=True)
    layout = {}
    for rnd, babies in BABIES.items():
        for key, nums in babies.items():
            ims = [layer(rnd, n) for n in nums]
            box = padded(union([im.getbbox() for im in ims]))
            for state, im in zip(("idle", "wrong", "correct"), ims):
                im.crop(box).save(os.path.join(OUT, f"{key}_{state}.png"))
            layout[key] = screen_rect(box)
    for rnd, prods in PRODUCTS.items():
        for key, n in prods.items():
            im = layer(rnd, n)
            im.crop(padded(im.getbbox())).save(os.path.join(OUT, key + ".png"))
    # plain shield (finale) and the logo
    sh = layer("ROUND 2", 12)
    sbox = padded(sh.getbbox())
    sh.crop(sbox).save(os.path.join(OUT, "shield_plain.png"))
    layout["shield_plain"] = screen_rect(sbox)
    logo = layer("ROUND 2", 17)
    lbox = padded(logo.getbbox())
    logo = logo.crop(lbox)
    logo.save(os.path.join(OUT, "logo_mega19.png"))
    l, t, r, b = LOGO_SHIELD
    lw, lh = logo.size
    # shield centre relative to the logo centre and its height, as fractions of the logo size
    layout["logo_shield"] = {"cx": round(((l + r) / 2 - lw / 2) / lw, 4), "cy": round((lh / 2 - (t + b) / 2) / lh, 4),
                             "h": round((b - t) / lh, 4), "w": round((r - l) / lw, 4)}
    thumb = Image.open(os.path.join(DESIGN, "ROUND 1", "MMM SBD Effect 1 - THUMB.jpg")).convert("RGB")
    side = min(thumb.size)
    thumb.crop(((thumb.width - side) // 2, (thumb.height - side) // 2,
                (thumb.width + side) // 2, (thumb.height + side) // 2)).resize((720, 720), Image.LANCZOS).save(
        os.path.join(OUT, "icon.png"))
    with open(os.path.join(OUT, "LAYOUT.json"), "w") as f:
        json.dump(layout, f, indent=1)
    print(json.dumps(layout, indent=1))


if __name__ == "__main__":
    main()
