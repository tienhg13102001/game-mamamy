#!/usr/bin/env python3
"""Build the SBD final assets for Baby Face (design folder "MMM SBD Effect 4").

    python3 Tools/make_sbd4.py   ->  Build/sbd4/*.png + Build/sbd4/CARDS.json + Build/sbd4/icon.png

Cards: eleven expression cards (all share one crop box, as before) plus the shield card that always
comes last. Each card names the expression class the player must make:
    0 tongue / mouth open, 1 cry, 2 wink, 3 sad, 4 neutral, 5 smile / grin, 6 laugh / eyes-shut smile
Mirror faces: one per class (same order). The angry and kiss-heart emoji are not used (hard to read
from a face), nor is anything in "Khong su dung emoji/".
"""
import json
import os

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DESIGNS = os.path.join(os.path.dirname(ROOT), "MMM SBD - Design 5 effect")
DESIGN = os.path.join(DESIGNS, "MMM SBD Effect 4")
OUT = os.path.join(ROOT, "Build", "sbd4")
PAD = 4
T = "MMM SBD Effect 4 TACH HINH {}.png"

# (key, card file, class, the card's own big face — shown by the mirror when the player matches it)
CARDS = [
    ("tongue", T.format(2), 0, T.format(12)),
    ("cry", T.format(3), 1, T.format(17)),
    ("wink", T.format(4), 2, T.format(16)),
    ("sad", T.format(5), 3, T.format(15)),
    ("neutral", T.format(6), 4, T.format(14)),
    ("smile", T.format(7), 5, T.format(13)),
    ("surprise", T.format(8), 0, T.format(18)),
    ("eyes_shut_smile", T.format(10), 6, T.format(20)),
    ("girl_grin", T.format(11), 5, T.format(21)),
    ("laugh", "Emoji cuối khung.png", 6, "Emoji cuối.png"),
    ("teeth_grin", "Emoji cười nhe răng khung.png", 5, "Emoji cười nhe răng.png"),
]
SHIELD_CARD = ("shield", T.format("FINAL KHIEN"), 6, T.format("FINAL"))
# mirror face per class
FACES = [T.format(12), T.format(17), T.format(16), T.format(15), T.format(14), T.format(13), "Emoji cuối.png"]
FINAL_FACE = T.format("FINAL")


def load(path):
    return Image.open(path).convert("RGBA")


def padded(box):
    l, t, r, b = box
    return (max(l - PAD, 0), max(t - PAD, 0), min(r + PAD, 1080), min(b + PAD, 1920))


def union(boxes):
    return (min(b[0] for b in boxes), min(b[1] for b in boxes),
            max(b[2] for b in boxes), max(b[3] for b in boxes))


def main():
    os.makedirs(OUT, exist_ok=True)
    cards = [(k, load(os.path.join(DESIGN, f)), c) for k, f, c, _ in CARDS]
    box = padded(union([im.getbbox() for _, im, _ in cards]))
    info = {"cards": [], "faces": []}
    for key, im, cls in cards:
        im.crop(box).save(os.path.join(OUT, f"card_{key}.png"))
        info["cards"].append({"key": key, "class": cls})
    key, f, cls, _ = SHIELD_CARD
    sh = load(os.path.join(DESIGN, f))
    sh.crop(padded(sh.getbbox())).save(os.path.join(OUT, "card_shield.png"))
    info["cards"].append({"key": key, "class": cls})
    faces = [load(os.path.join(DESIGN, f)) for f in FACES + [FINAL_FACE]]
    card_faces = [(k, load(os.path.join(DESIGN, f))) for k, _, _, f in CARDS + [SHIELD_CARD]]
    fbox = padded(union([im.getbbox() for im in faces] + [im.getbbox() for _, im in card_faces]))
    for i, im in enumerate(faces):
        name = "face_final" if i == len(FACES) else f"face_{i}"
        im.crop(fbox).save(os.path.join(OUT, name + ".png"))
    for k, im in card_faces:
        im.crop(fbox).save(os.path.join(OUT, f"cardface_{k}.png"))
    # the plain 19 shield (same art as the Baby Talk NINETEEN shield) and the logo
    plain = load(os.path.join(DESIGNS, "MMM SBD Effect 3", "MMM SBD Effect 3 TACH HINH 3.png"))
    plain.crop(padded(plain.getbbox())).save(os.path.join(OUT, "shield_plain.png"))
    logo = load(os.path.join(DESIGN, T.format(25)))
    logo.crop(padded(logo.getbbox())).save(os.path.join(OUT, "logo_mega19.png"))
    thumb = Image.open(os.path.join(DESIGN, "MMM SBD Effect 4 - THUMB.jpg")).convert("RGB")
    side = min(thumb.size)
    thumb.crop(((thumb.width - side) // 2, (thumb.height - side) // 2,
                (thumb.width + side) // 2, (thumb.height + side) // 2)).resize((720, 720), Image.LANCZOS).save(
        os.path.join(OUT, "icon.png"))
    info["card_box"] = box
    info["face_box"] = fbox
    with open(os.path.join(OUT, "CARDS.json"), "w") as f:
        json.dump(info, f, indent=1)
    print(json.dumps(info))


if __name__ == "__main__":
    main()
