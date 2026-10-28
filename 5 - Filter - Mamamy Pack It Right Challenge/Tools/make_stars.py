#!/usr/bin/env python3
"""Round stars for Pack It Right (client 2026-10-09: 5 rounds, a star lights up per round won).

    python3 Tools/make_stars.py  ->  Assets/star_off.png, Assets/star_on.png (256x256)

Brand colours only: off = translucent white star with a white outline, on = #CF0055 star with a
white outline. Softly rounded tips and inner corners (client 2026-10-09: "không nhọn quá,
mềm mại hơn"; the sharp version is in Build/backup_1009/). Drawn 4x and scaled down for smooth edges.
"""
import math
import os

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PINK = (0xCF, 0x00, 0x55)
S = 256
K = 4


def star_points(cx, cy, r_out, r_in, n=5):
    pts = []
    for i in range(2 * n):
        r = r_out if i % 2 == 0 else r_in
        a = -math.pi / 2 + i * math.pi / n
        pts.append((cx + r * math.cos(a), cy + r * math.sin(a)))
    return pts


def soft_star(W, cx, cy, r_out, r_in, blur):
    """Mask of a chubby star with rounded tips and inner corners (blur + threshold)."""
    m = Image.new("L", (W, W), 0)
    ImageDraw.Draw(m).polygon(star_points(cx, cy, r_out, r_in), fill=255)
    return m.filter(ImageFilter.GaussianBlur(blur)).point(lambda v: 255 if v >= 128 else 0)


def grow(mask, px):
    """Dilate a mask by about px pixels, keeping round edges."""
    return mask.filter(ImageFilter.GaussianBlur(px / 2)).point(lambda v: 255 if v >= 20 else 0)


def smooth(mask):
    return mask.filter(ImageFilter.GaussianBlur(K))


def star(fill, alpha):
    W = S * K
    c = W / 2
    inner = soft_star(W, c, c + 4 * K, 114 * K, 50 * K, 9 * K)        # inner radius ~44%, softly rounded
    outer = grow(inner, 18 * K)                                        # white outline
    # soft shadow so the star reads on any camera background
    sh = Image.new("L", (W, W), 0)
    sh.paste(outer, (0, 10 * K))
    sh = sh.filter(ImageFilter.GaussianBlur(9 * K)).point(lambda v: v * 90 // 255)
    im = Image.merge("RGBA", (Image.new("L", (W, W), 0),) * 3 + (sh,))
    im = Image.composite(Image.new("RGBA", (W, W), (255, 255, 255, 255)), im, smooth(outer))
    body = smooth(inner)
    im = Image.composite(Image.new("RGBA", (W, W), fill + (255,)), im, body)
    if alpha < 255:   # translucent inside
        a = np.array(im.getchannel("A")).astype(int)
        b = np.array(body).astype(int)
        a = a - b * (255 - alpha) // 255
        im.putalpha(Image.fromarray(a.clip(0, 255).astype("uint8")))
    return im.resize((S, S), Image.LANCZOS)


def main():
    star((255, 255, 255), 90).save(os.path.join(ROOT, "Assets", "star_off.png"))
    star(PINK, 255).save(os.path.join(ROOT, "Assets", "star_on.png"))


if __name__ == "__main__":
    main()
