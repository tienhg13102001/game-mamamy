#!/usr/bin/env python3
"""Render every in-game text as PNG in the MMM brand font (SVN-Gotham) and brand colours.

Effect House's 2D Text only offers its built-in fonts (custom .ttf/.otf cannot be imported),
so brand text is baked into images: fixed phrases are one image each, and numbers are
composed at runtime from the digit set digit_brand_0..9.

    python3 Tools/make_text.py   ->  Prototype/text/*.png

Colours: only Mamamy logo pink #CF0055 and white (client brand rule).
"""
import os

from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "Prototype", "text")
FONTS = os.path.expanduser("~/Library/Fonts")
BLACK = os.path.join(FONTS, "SVN-Gotham Black.otf")
BOLD = os.path.join(FONTS, "SVN-Gotham Bold.otf")
BRAND = (207, 0, 85, 255)   # #CF0055
WHITE = (255, 255, 255, 255)

# key: (text, font file, size px, fill, stroke px) — size is ~2x the on-screen height.
PHRASES = {
    "label_floor": ("TẦNG", BOLD, 44, BRAND, 0),
    "label_best": ("KỶ LỤC", BOLD, 44, BRAND, 0),
    "cta_record": ("RECORD TO PLAY", BLACK, 64, WHITE, 0),
    "cta_again": ("PLAY AGAIN", BLACK, 64, WHITE, 0),
    "hint": ("Xếp càng cao càng tốt!", BLACK, 76, BRAND, 7),
    "title_record": ("KỶ LỤC MỚI!", BLACK, 120, BRAND, 10),
    "title_lose": ("THÁP ĐỔ RỒI!", BLACK, 120, BRAND, 10),
    "title_win": ("HOÀN THÀNH!", BLACK, 120, BRAND, 10),
    "reason_record": ("Bạn xếp được", BOLD, 56, BRAND, 0),
    "reason_topple": ("Món hàng bị lệch quá", BOLD, 56, BRAND, 0),
    "reason_miss": ("Trượt khỏi tháp rồi", BOLD, 56, BRAND, 0),
    "reason_collapse": ("Tháp mất cân bằng", BOLD, 56, BRAND, 0),
    "reason_out": ("Rơi ra ngoài rồi", BOLD, 56, BRAND, 0),
    "sub_floor": ("tầng", BOLD, 60, BRAND, 0),
    "popup_plus": ("+1", BLACK, 96, BRAND, 8),
    "popup_perfect": ("HOÀN HẢO!", BLACK, 96, BRAND, 8),
    "popup_topple": ("Lệch rồi!", BLACK, 96, BRAND, 8),
    "popup_collapse": ("Tháp nghiêng quá!", BLACK, 96, BRAND, 8),
}

# Digit sets: all digits of a set share one canvas height so they line up when composed.
DIGITS = {
    "digit_brand": (BLACK, 200, BRAND, 0),
}


def render(text, font_path, size, fill, stroke):
    font = ImageFont.truetype(font_path, size)
    l, t, r, b = font.getbbox(text, stroke_width=stroke)
    pad = 4
    im = Image.new("RGBA", (r - l + 2 * pad, b - t + 2 * pad), (0, 0, 0, 0))
    ImageDraw.Draw(im).text((pad - l, pad - t), text, font=font, fill=fill,
                            stroke_width=stroke, stroke_fill=WHITE if stroke else None)
    return im


def render_digits(prefix, font_path, size, fill, stroke):
    font = ImageFont.truetype(font_path, size)
    _, t, _, b = font.getbbox("0123456789", stroke_width=stroke)
    pad = 4
    for d in "0123456789":
        l, _, r, _ = font.getbbox(d, stroke_width=stroke)
        im = Image.new("RGBA", (r - l + 2 * pad, b - t + 2 * pad), (0, 0, 0, 0))
        ImageDraw.Draw(im).text((pad - l, pad - t), d, font=font, fill=fill,
                                stroke_width=stroke, stroke_fill=WHITE if stroke else None)
        im.save(os.path.join(OUT, f"{prefix}_{d}.png"))


def main():
    os.makedirs(OUT, exist_ok=True)
    for key, (text, font, size, fill, stroke) in PHRASES.items():
        render(text, font, size, fill, stroke).save(os.path.join(OUT, key + ".png"))
    for prefix, (font, size, fill, stroke) in DIGITS.items():
        render_digits(prefix, font, size, fill, stroke)
    print("ok ->", OUT, len(os.listdir(OUT)), "files")


if __name__ == "__main__":
    main()
