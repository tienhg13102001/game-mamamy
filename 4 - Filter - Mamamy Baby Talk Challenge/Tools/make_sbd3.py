#!/usr/bin/env python3
"""Build the SBD final assets for Baby Talk (design folder "MMM SBD Effect 3").

    python3 Tools/make_sbd3.py   ->  Build/sbd3/*.png + Build/sbd3/LAYOUT.json + Build/sbd3/icon.png

Ten gates in play order (nine words, then the NINETEEN shield gate). For each gate: the gate
image (the "khung" arch), its big baby, the baby's screen centre, the transparent strip under
the gate's legs (feet band, share of the image height) and the words the detector accepts.
"""
import json
import os

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DESIGN = os.path.join(os.path.dirname(ROOT), "MMM SBD - Design 5 effect", "MMM SBD Effect 3")
OUT = os.path.join(ROOT, "Build", "sbd3")
SCALE = 720 / 1080
PAD = 4
T = "MMM SBD Effect 3 TACH HINH {}.png"

# (key, gate file, big baby file, accepted words) in play order; NINETEEN (the shield) is last.
GATES = [
    ("eat", T.format(12), T.format(6), "eat"),
    ("chew", "Chew khung.png", "Chew (em bé ăn, có đồ ăn dặm bên cạnh).png", "chew"),
    ("poo", T.format(13), T.format(7), "poo"),
    ("clap", "Clap khung.png", "Clap (em bé vỗ tay).png", "clap"),
    ("sleep", T.format(10), T.format(4), "sleep,pee"),
    # client 10-08: WAKE UP -> LAUGH (one syllable); same laughing baby, new arch
    ("laugh", "Laugh khung.png", "Wake up (em bé vươn vai năm trên gối).png", "laugh,laughing"),
    ("cry", T.format(11), T.format(5), "cry"),
    ("hug", "Hug khung.png", "Hug (em bé ôm gấu).png", "hug"),
    ("pee", T.format(8), T.format(2), "pee"),
    ("nineteen", T.format(9), T.format(3), "nineteen"),
]
SINGLES = {"road": T.format(1), "logo_mega19": T.format(20), "baby_first": "1. em be dau tien.png"}


def load(name):
    return Image.open(os.path.join(DESIGN, name)).convert("RGBA")


def padded(box):
    l, t, r, b = box
    return (max(l - PAD, 0), max(t - PAD, 0), min(r + PAD, 1080), min(b + PAD, 1920))


def screen_rect(box):
    l, t, r, b = box
    return {"x": round(((l + r) / 2) * SCALE - 360, 1), "y": round(640 - ((t + b) / 2) * SCALE, 1),
            "w": round((r - l) * SCALE, 1), "h": round((b - t) * SCALE, 1)}


def cut(name, key):
    im = load(name)
    box = padded(im.getbbox())
    crop = im.crop(box)
    crop.save(os.path.join(OUT, key + ".png"))
    return crop, screen_rect(box)


def feet_band(gate):
    """Transparent strip under the arch legs: lowest opaque row in the outer 12% columns."""
    a = gate.getchannel("A").point(lambda v: 255 if v > 128 else 0)
    w, h = gate.size
    edge = max(4, int(w * 0.12))
    low = 0
    for box in ((0, 0, edge, h), (w - edge, 0, w, h)):
        bb = a.crop(box).getbbox()
        if bb:
            low = max(low, bb[3])
    return round((h - low) / h, 4)


def main():
    os.makedirs(OUT, exist_ok=True)
    layout = {"gates": []}
    for key, gate_file, baby_file, words in GATES:
        gate, _ = cut(gate_file, "gate_" + key)
        _, brect = cut(baby_file, "baby_" + key)
        layout["gates"].append({"key": key, "babyX": brect["x"], "babyY": brect["y"],
                                "band": feet_band(gate), "accepted": words})
    for key, name in SINGLES.items():
        _, rect = cut(name, key)
        layout[key] = rect
    thumb = Image.open(os.path.join(DESIGN, "MMM SBD Effect 3 - THUMB.jpg")).convert("RGB")
    side = min(thumb.size)
    thumb.crop(((thumb.width - side) // 2, (thumb.height - side) // 2,
                (thumb.width + side) // 2, (thumb.height + side) // 2)).resize((720, 720), Image.LANCZOS).save(
        os.path.join(OUT, "icon.png"))
    with open(os.path.join(OUT, "LAYOUT.json"), "w") as f:
        json.dump(layout, f, indent=1)
    print(json.dumps(layout, indent=1))


if __name__ == "__main__":
    main()
