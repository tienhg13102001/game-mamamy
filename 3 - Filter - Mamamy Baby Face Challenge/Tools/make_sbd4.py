#!/usr/bin/env python3
"""Build the assets of the Baby Face expression roulette (design folder "MMM SBD Effect 4").

    python3 Tools/make_sbd4.py   ->  Assets/roulette/*.png + Build/sbd4/EMOJI.json

Client feedback 2026-10-09: same faces as before, but neutral -> angry, cry -> pout (kiss-heart
emoji) and the last shield shows the new laugh-squint emoji. The plain laugh-squint emoji is left out
of the ring (it repeated the purple shield's face); the girl smile (TACH HINH 13) was dropped
too (client 2026-10-09). Each emoji names the expression class
the player must make:
    0 tongue / mouth open, 1 pout, 2 wink, 3 sad, 4 angry, 5 smile / grin, 6 laugh / eyes-shut smile
Also built: the polaroid frame (transparent photo window), the white badge disc behind the
roulette emoji, the hold bar and the plain 19 shield. The old version is in Build/backup_1009/.
"""
import json
import os

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DESIGNS = os.path.join(os.path.dirname(ROOT), "MMM SBD - Design 5 effect")
DESIGN = os.path.join(DESIGNS, "MMM SBD Effect 4")
OUT = os.path.join(ROOT, "Assets", "roulette")
INFO = os.path.join(ROOT, "Build", "sbd4")
T = "MMM SBD Effect 4 TACH HINH {}.png"
PINK = (0xCF, 0x00, 0x55, 255)
WHITE = (255, 255, 255, 255)
FACE = 360          # roulette emoji canvas (square)

# (key, face file, class) — the last one is the shield and always ends the round
EMOJI = [
    ("tongue", T.format(12), 0),
    ("pout", "Emoji hôn tim.png", 1),
    ("wink", T.format(16), 2),
    ("sad", T.format(15), 3),
    ("angry", "Emoji Giận dữ.png", 4),
    ("surprise", T.format(18), 0),
    ("eyes_shut_smile", T.format(20), 6),
    ("girl_grin", T.format(21), 5),
    ("teeth_grin", "Emoji cười nhe răng.png", 5),
]
SHIELD = ("shield", None, 6)


def load(path):
    return Image.open(path).convert("RGBA")


def fit_square(im, size, pad=0.04):
    im = im.crop(im.getbbox())
    k = size * (1 - 2 * pad) / max(im.size)
    im = im.resize((round(im.width * k), round(im.height * k)), Image.LANCZOS)
    out = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    out.alpha_composite(im, ((size - im.width) // 2, (size - im.height) // 2))
    return out


def laugh_shield():
    """FINAL KHIEN with the girl face painted out and the laugh-squint emoji on it."""
    a = load(os.path.join(DESIGN, T.format("FINAL KHIEN")))
    a = a.crop(a.getbbox())
    A = np.array(a).astype(float)
    r, g, b = A[..., 0], A[..., 1], A[..., 2]
    purple = (A[..., 3] > 250) & (r < 190) & (g < 140) & (b > 90) & (r > 70)
    inner = np.zeros(purple.shape, bool)
    inner[60:420, 40:420] = True
    mask = inner & ~purple & (A[..., 3] > 250)
    mask = np.array(Image.fromarray((mask * 255).astype("uint8")).filter(ImageFilter.MaxFilter(9))) > 0
    F, known = A.copy(), ~mask
    for _ in range(400):                       # fill the hole from the purple around it
        if known.all():
            break
        acc, cnt = np.zeros_like(F), np.zeros(mask.shape)
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            kn = np.roll(np.roll(known, dy, 0), dx, 1)
            acc += np.roll(np.roll(F, dy, 0), dx, 1) * kn[..., None]
            cnt += kn
        new = (~known) & (cnt > 0)
        F[new] = acc[new] / cnt[new][:, None]
        known |= new
    blank = Image.fromarray(F.clip(0, 255).astype("uint8"))
    soft = Image.fromarray((mask * 255).astype("uint8")).filter(ImageFilter.GaussianBlur(4))
    blank = Image.composite(blank.filter(ImageFilter.GaussianBlur(14)), blank, soft)
    blank.putalpha(a.getchannel("A"))
    e = load(os.path.join(DESIGN, "Emoji cuối.png"))
    e = e.crop(e.getbbox())
    w = 370
    h = round(e.height * w / e.width)
    blank.alpha_composite(e.resize((w, h), Image.LANCZOS), (229 - w // 2, 240 - h // 2))
    return blank


def polaroid():
    """1000x1332 (2x of 500x666): white frame, 60 px sides/top, 170 px bottom, transparent window.
    Taller since 2026-10-10 (photo window 440x551, was 500x600 with a 440x470 window)."""
    W, H, S = 1000, 1332, 24
    im = Image.new("RGBA", (W + 2 * S, H + 2 * S), (0, 0, 0, 0))
    sh = Image.new("L", im.size, 0)
    ImageDraw.Draw(sh).rounded_rectangle((S, S + 8, S + W, S + H + 8), 28, fill=70)
    im.putalpha(sh.filter(ImageFilter.GaussianBlur(10)))
    im = Image.merge("RGBA", (Image.new("L", im.size, 0),) * 3 + (im.getchannel("A"),))
    card = Image.new("RGBA", im.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(card)
    d.rounded_rectangle((S, S, S + W, S + H), 28, fill=WHITE)
    win = Image.new("L", im.size, 0)
    ImageDraw.Draw(win).rounded_rectangle((S + 60, S + 60, S + W - 60, S + H - 170), 12, fill=255)
    im.alpha_composite(card)
    a = np.array(im)
    a[..., 3] = np.where(np.array(win) > 0, 255 - np.array(win), a[..., 3])
    return Image.fromarray(a)


def badge():
    im = Image.new("RGBA", (400, 400), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.ellipse((4, 4, 396, 396), fill=PINK)
    d.ellipse((18, 18, 382, 382), fill=WHITE)
    return im


def bar(color, alpha):
    im = Image.new("RGBA", (380, 22), (0, 0, 0, 0))
    ImageDraw.Draw(im).rounded_rectangle((0, 0, 379, 21), 11, fill=color[:3] + (alpha,))
    return im


def main():
    os.makedirs(OUT, exist_ok=True)
    os.makedirs(INFO, exist_ok=True)
    info = {"emoji": []}
    for key, f, cls in EMOJI:
        fit_square(load(os.path.join(DESIGN, f)), FACE).save(os.path.join(OUT, f"emoji_{key}.png"))
        info["emoji"].append({"key": key, "class": cls})
    sh = laugh_shield()
    sh.save(os.path.join(OUT, "emoji_shield.png"))
    sh.save(os.path.join(INFO, "shield_laugh.png"))
    info["emoji"].append({"key": SHIELD[0], "class": SHIELD[2]})
    polaroid().save(os.path.join(OUT, "polaroid_frame.png"))
    badge().save(os.path.join(OUT, "badge_back.png"))
    bar(PINK, 70).save(os.path.join(OUT, "hold_track.png"))
    bar(PINK, 255).save(os.path.join(OUT, "hold_fill.png"))
    with open(os.path.join(INFO, "EMOJI.json"), "w") as fh:
        json.dump(info, fh, indent=1)
    print(json.dumps(info))


if __name__ == "__main__":
    main()
