#!/usr/bin/env python3
"""Guide assets from the 2026-10-10 internal-player feedback.

Vietnamese hint texts (same style as Baby Talk's hint_say: SVN-Gotham Black,
#CF0055 with a white outline) and a pink arrow (points RIGHT; rotate in scene).
Writes <game>/Build/guide/*.png.
"""
import os
from PIL import Image, ImageDraw, ImageFont, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BLACK = os.path.expanduser("~/Library/Fonts/SVN-Gotham Black.otf")
BRAND = (0xCF, 0x00, 0x55, 255)
WHITE = (255, 255, 255, 255)
GAMES = {
    "2 - Filter - Mamamy Baby Match Challenge": {"hint_chon_em_be": "Chọn em bé"},
    "3 - Filter - Mamamy Baby Face Challenge": {"hint_lam_mat": "LÀM MẶT THEO BIỂU CẢM"},
    "4 - Filter - Mamamy Baby Talk Challenge": {"hint_doc_len": "HÃY ĐỌC TO"},
    "5 - Filter - Mamamy Pack It Right Challenge": {},
}


def render(text, size=76, stroke=7, fill=BRAND):
    font = ImageFont.truetype(BLACK, size)
    l, t, r, b = font.getbbox(text, stroke_width=stroke)
    pad = 6
    im = Image.new("RGBA", (r - l + 2 * pad, b - t + 2 * pad), (0, 0, 0, 0))
    ImageDraw.Draw(im).text((pad - l, pad - t), text, font=font, fill=fill,
                            stroke_width=stroke, stroke_fill=WHITE if stroke else None)
    return im


def render_shadow(text, size=76):
    """White text with a soft dark drop shadow behind it (client 2026-10-10, Baby Face)."""
    font = ImageFont.truetype(BLACK, size)
    l, t, r, b = font.getbbox(text)
    pad, dy = 22, 5
    W, H = r - l + 2 * pad, b - t + 2 * pad + dy
    sh = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(sh).text((pad - l, pad - t + dy), text, font=font, fill=(0, 0, 0, 150))
    sh = sh.filter(ImageFilter.GaussianBlur(6))
    im = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    im.alpha_composite(sh)
    ImageDraw.Draw(im).text((pad - l, pad - t), text, font=font, fill=WHITE)
    return im


def arrow(w=220, h=180, stroke=14):
    """Chunky right-pointing arrow: pink body, white outline, soft shadow."""
    s = 4
    W, H = w * s, h * s
    m = stroke * s + 8 * s
    shaft_h = H * 0.42
    head_x = W * 0.52
    pts = [(m, H / 2 - shaft_h / 2), (head_x, H / 2 - shaft_h / 2), (head_x, m),
           (W - m, H / 2), (head_x, H - m), (head_x, H / 2 + shaft_h / 2),
           (m, H / 2 + shaft_h / 2)]
    im = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    shadow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(shadow).polygon([(x, y + 5 * s) for x, y in pts], fill=(0, 0, 0, 70))
    shadow = shadow.filter(ImageFilter.GaussianBlur(5 * s))
    im.alpha_composite(shadow)
    d = ImageDraw.Draw(im)
    d.line(pts + [pts[0]], fill=WHITE, width=2 * stroke * s, joint="curve")
    for x, y in pts:
        r = stroke * s
        d.ellipse((x - r, y - r, x + r, y + r), fill=WHITE)
    d.polygon(pts, fill=WHITE)
    # inset pink body
    cx, cy = W / 2, H / 2
    d.polygon(pts, fill=BRAND)
    return im.resize((w, h), Image.LANCZOS)


def arrow_thin(w=240, h=96, shaft=12, outline=5):
    """Slim right-pointing arrow (2x): thin pink shaft + open chevron head, thin white outline."""
    s = 4
    W, H = w * s, h * s
    m = (outline + 6) * s
    tip = (W - m, H / 2)
    head = H / 2 - m          # chevron arm reach
    pts_shaft = [(m, H / 2), tip]
    arms = [(tip[0] - head, H / 2 - head), tip, (tip[0] - head, H / 2 + head)]
    im = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    for col, wd in ((WHITE, (shaft + 2 * outline) * s), (BRAND, shaft * s)):
        d.line(pts_shaft, fill=col, width=wd)
        d.line(arms, fill=col, width=wd, joint="curve")
        r = wd / 2
        for x, y in [pts_shaft[0], arms[0], arms[2], tip]:
            d.ellipse((x - r, y - r, x + r, y + r), fill=col)
    return im.resize((w, h), Image.LANCZOS)


def main():
    for game, texts in GAMES.items():
        out = os.path.join(ROOT, game, "Build", "guide")
        os.makedirs(out, exist_ok=True)
        for key, text in texts.items():
            # "Chọn em bé": plain white, no outline (client 2026-10-10)
            if key == "hint_chon_em_be": im = render(text, stroke=0, fill=WHITE)
            # "LÀM MẶT THEO BIỂU CẢM": pink + white outline like "HÃY ĐỌC TO" (client 2026-10-10 round 9; was white + shadow)
            else: im = render(text)
            im.save(os.path.join(out, key + ".png"))
        if game.startswith("5"):
            arrow().save(os.path.join(out, "arrow_guide.png"))
            # thicker strokes since the client's 2026-10-10 note ("dày nét lên chút nữa")
            # shorter shaft since the client's 2026-10-10 evening note ("mũi tên ngắn tí cũng được")
            arrow_thin(w=170, shaft=20, outline=6).save(os.path.join(out, "arrow_guide_thin.png"))
    print("ok")


if __name__ == "__main__":
    main()
