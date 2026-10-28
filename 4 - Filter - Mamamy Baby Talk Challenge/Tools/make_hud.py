#!/usr/bin/env python3
"""Build the in-play HUD for Baby Talk (client 2026-10-09): a mic button at the top left that
reacts to the voice, and an elapsed-time counter (mm:ss) at the top right.

    python3 Tools/make_hud.py   ->  Build/hud/*.png

Colours: only Mamamy pink #CF0055 and white; digits in SVN-Gotham Black (brand rules).
Every timer digit shares one canvas size so the counter never shifts as the digits change.
"""
import os

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "Build", "hud")
BLACK = os.path.expanduser("~/Library/Fonts/SVN-Gotham Black.otf")
PINK = (207, 0, 85, 255)
WHITE = (255, 255, 255, 255)
SS = 4   # supersampling for smooth edges


def mic_button(size=256):
    # Flat pink disc with an outlined white mic, like the client's reference (2026-10-09).
    s = size * SS
    im = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    m = 4 * SS
    d.ellipse((m, m, s - m, s - m), fill=PINK)
    c = s / 2
    lw = int(0.045 * s)
    w = 0.19 * s                                                   # capsule outline
    d.rounded_rectangle((c - w / 2, 0.19 * s, c + w / 2, 0.54 * s), radius=w / 2, outline=WHITE, width=lw)
    r = 0.21 * s                                                   # holder arc
    d.arc((c - r, 0.42 * s - r, c + r, 0.42 * s + r), 0, 180, fill=WHITE, width=lw)
    for x, y in ((c - r + lw / 2, 0.42 * s), (c + r - lw / 2, 0.42 * s)):   # round arc ends
        d.ellipse((x - lw / 2, y - lw / 2, x + lw / 2, y + lw / 2), fill=WHITE)
    d.line((c, 0.42 * s + r, c, 0.77 * s), fill=WHITE, width=lw)   # stem
    d.ellipse((c - lw / 2, 0.77 * s - lw / 2, c + lw / 2, 0.77 * s + lw / 2), fill=WHITE)
    return im.resize((size, size), Image.LANCZOS)


def wave_ring(size=256):
    s = size * SS
    im = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    m = 6 * SS
    d.ellipse((m, m, s - m, s - m), outline=WHITE, width=7 * SS)
    im = im.resize((size, size), Image.LANCZOS)
    glow = im.filter(ImageFilter.GaussianBlur(4))
    return Image.alpha_composite(glow, im)


def timer_pill(w=300, h=104):
    im = Image.new("RGBA", (w * SS, h * SS), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rounded_rectangle((0, 0, w * SS - 1, h * SS - 1), radius=h * SS / 2, fill=WHITE)
    # plain white pill, no pink outline (client 2026-10-10); the pink digits sit on it
    return im.resize((w, h), Image.LANCZOS)


def digits(size=120):
    font = ImageFont.truetype(BLACK, size)
    _, t, _, b = font.getbbox("0123456789:")
    cw = max(font.getbbox(ch)[2] - font.getbbox(ch)[0] for ch in "0123456789") + 8
    ch_h = b - t + 8
    for ch, name in [(c, c) for c in "0123456789"] + [(":", "colon")]:
        l, _, r, _ = font.getbbox(ch)
        wid = cw if ch != ":" else r - l + 8
        im = Image.new("RGBA", (wid, ch_h), (0, 0, 0, 0))
        ImageDraw.Draw(im).text(((wid - (r - l)) / 2 - l, 4 - t), ch, font=font, fill=PINK)
        im.save(os.path.join(OUT, f"tdigit_{name}.png"))
    return cw, ch_h


def main():
    os.makedirs(OUT, exist_ok=True)
    mic_button().save(os.path.join(OUT, "mic_button.png"))
    wave_ring().save(os.path.join(OUT, "mic_wave.png"))
    timer_pill().save(os.path.join(OUT, "timer_pill.png"))
    print("digit canvas", digits())
    print("ok ->", OUT, sorted(os.listdir(OUT)))


if __name__ == "__main__":
    main()
