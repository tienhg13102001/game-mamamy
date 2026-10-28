#!/usr/bin/env python3
"""Sinh cac hinh UI don gian (mau thuong hieu Mamamy) cho ban Effect House.

    python3 Tools/make_ui.py   ->  Prototype/ui/*.png
"""
import os

from PIL import Image, ImageDraw, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "Prototype", "ui")
PINK = (232, 51, 109, 255)
PLUM = (122, 84, 112, 255)
S = 4  # ve o do phan giai x4 roi thu nho de vien min
BRAND = (207, 0, 85, 255)  # #CF0055 — mau hong logo Mamamy tren bao bi (khan uot)


def fit_pill(btn, aspect):
    """Re-length a pill button to width/height = aspect: keep both round caps, stretch or
    shrink only the flat middle (sampled from the centre column), at 240px height."""
    h = 240
    src = btn.resize((round(btn.width * h / btn.height), h), Image.LANCZOS)
    cap = h // 2 + 10
    w = max(int(h * aspect), 2 * cap + 2)
    out = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    out.paste(src.crop((0, 0, cap, h)), (0, 0))
    mid = src.crop((src.width // 2, 0, src.width // 2 + 1, h))
    for x in range(cap, w - cap):
        out.paste(mid, (x, 0))
    out.paste(src.crop((src.width - cap, 0, src.width, h)), (w - cap, 0))
    return out


def to_brand(im):
    """To lai phan hong cua hinh sang mau brand, giu sang/toi (bong, vien, dai sang).

    Mau than chinh (do sang pho bien nhat cua cac diem hong) duoc dat dung #CF0055;
    diem toi hon -> dam dan tu mau brand, diem sang hon -> nhat dan ve trang. Cac diem
    khong hong (trang, trong suot) giu nguyen.
    """
    import numpy as np
    a = np.asarray(im).astype(np.float32)
    rgb, alpha = a[..., :3], a[..., 3]
    lum = rgb @ np.array([0.299, 0.587, 0.114], dtype=np.float32)
    sat = rgb.max(-1) - rgb.min(-1)
    pink = (alpha > 10) & (sat > 60) & (rgb[..., 0] > rgb[..., 1] + 40)
    body = float(np.bincount(np.round(lum[pink]).astype(np.int64)).argmax())
    lum = np.where(pink & (np.abs(lum - body) <= 3), body, lum)  # flat body -> exactly #CF0055
    brand = np.array(BRAND[:3], dtype=np.float32)
    k = (lum / max(body, 1))[..., None]
    darker = brand * np.clip(k, 0, 1)
    t = np.clip((lum - body) / max(255 - body, 1), 0, 1)[..., None]
    lighter = brand + (255 - brand) * t
    new = np.where((lum <= body)[..., None], darker, lighter)
    # Keep near-white highlights / icons exactly as they were.
    out = np.where(pink[..., None], new, rgb)
    return Image.fromarray(np.dstack([out, alpha]).clip(0, 255).astype(np.uint8), "RGBA")


def rounded(w, h, r, fill, shadow=None, shadow_dy=0):
    im = Image.new("RGBA", (w * S, (h + shadow_dy) * S), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    if shadow:
        d.rounded_rectangle((0, shadow_dy * S, w * S - 1, (h + shadow_dy) * S - 1), r * S, fill=shadow)
    d.rounded_rectangle((0, 0, w * S - 1, h * S - 1), r * S, fill=fill)
    return im.resize((w, h + shadow_dy), Image.LANCZOS)


def main():
    os.makedirs(OUT, exist_ok=True)
    rounded(280, 200, 64, PINK, shadow=PLUM, shadow_dy=14).save(os.path.join(OUT, "ui_badge.png"))
    rounded(600, 140, 70, PINK).save(os.path.join(OUT, "ui_button.png"))
    rounded(840, 760, 90, (255, 255, 255, 255)).save(os.path.join(OUT, "ui_card.png"))
    Image.new("RGBA", (16, 16), (255, 255, 255, 255)).save(os.path.join(OUT, "ui_white.png"))

    sh = Image.new("RGBA", (900, 120), (0, 0, 0, 0))
    ImageDraw.Draw(sh).ellipse((40, 30, 860, 90), fill=(122, 84, 112, 90))
    sh.filter(ImageFilter.GaussianBlur(10)).save(os.path.join(OUT, "ui_shadow.png"))
    # O "mon tiep theo" dai hon: giu nguyen dau bo tron + mui ten (x < 150),
    # nhan ban cot than hong phang de co cho dat hinh san pham ben phai mui ten.
    panel = Image.open(os.path.join(ROOT, "Prototype", "sprites", "next_panel.png")).convert("RGBA")
    cut, extra = 150, 192
    wide = Image.new("RGBA", (panel.width + extra, panel.height), (0, 0, 0, 0))
    wide.paste(panel.crop((0, 0, cut, panel.height)), (0, 0))
    col = panel.crop((cut, 0, cut + 1, panel.height))
    for x in range(extra):
        wide.paste(col, (cut + x, 0))
    wide.paste(panel.crop((cut, 0, panel.width, panel.height)), (cut + extra, 0))
    wide.save(os.path.join(OUT, "next_panel_wide.png"))

    # Ban dai cua nut hong bong (PlayAgainButton do AI tao): giu nguyen 2 dau tron,
    # nhan ban cot giua de khong meo khi dung cho dai chu huong dan o man mo dau.
    btn_path = os.path.join(ROOT, "Assets", "Textures", "PlayAgainButton.png")
    if os.path.exists(btn_path):
        btn = Image.open(btn_path).convert("RGBA")
        btn = btn.crop(btn.getbbox())
        cap = btn.height // 2 + 20                     # rong cua moi dau tron
        target_w = int(btn.height * 6.6)               # ti le ~ 600x90
        mid = btn.crop((btn.width // 2, 0, btn.width // 2 + 1, btn.height))
        wide_btn = Image.new("RGBA", (target_w, btn.height), (0, 0, 0, 0))
        wide_btn.paste(btn.crop((0, 0, cap, btn.height)), (0, 0))
        for x in range(cap, target_w - cap):
            wide_btn.paste(mid, (x, 0))
        wide_btn.paste(btn.crop((btn.width - cap, 0, btn.width, btn.height)), (target_w - cap, 0))
        wide_btn.resize((target_w // 2, btn.height // 2), Image.LANCZOS).save(os.path.join(OUT, "glossy_pill_wide.png"))

        # Nut vien mong: cat bo vanh tim sam day ben ngoai, giu than hong bong ben trong
        # (dai sang phia tren + mep duoi dam), bo tron lai va ve mot vien hong dam mong.
        inner = btn.crop((34, 29, btn.width - 34, 357))
        iw, ih = inner.size
        k = 4
        mask = Image.new("L", (iw * k, ih * k), 0)
        ImageDraw.Draw(mask).rounded_rectangle((0, 0, iw * k - 1, ih * k - 1), ih * k // 2, fill=255)
        mask = mask.resize((iw, ih), Image.LANCZOS)
        thin = Image.new("RGBA", (iw, ih), (0, 0, 0, 0))
        thin.paste(inner, (0, 0), mask)
        ring = Image.new("RGBA", (iw * k, ih * k), (0, 0, 0, 0))
        bw = 7 * k
        ImageDraw.Draw(ring).rounded_rectangle((bw // 2, bw // 2, iw * k - bw // 2 - 1, ih * k - bw // 2 - 1),
                                               (ih * k - bw) // 2, outline=(142, 21, 83, 255), width=bw)
        thin.alpha_composite(ring.resize((iw, ih), Image.LANCZOS))
        thin.save(os.path.join(OUT, "glossy_button_thin.png"))

    # --- Mau brand: chi dung dung mau hong cua logo Mamamy (#CF0055, do tu logo tren bao bi) ---
    # CTA buttons hugging their label: same round caps, body length fitted to the text.
    # Display target: 60px tall, label 24px tall + ~40px side padding (see Tools/make_text.py sizes).
    brand_btn = os.path.join(OUT, "button_brand.png")
    if os.path.exists(brand_btn):
        src = Image.open(brand_btn).convert("RGBA")
        for name, text_w in (("button_play_again.png", 186), ("button_record.png", 263)):
            aspect = (text_w + 2 * 40) / 60
            fit_pill(src, aspect).save(os.path.join(OUT, name))
    rounded(280, 200, 64, BRAND).save(os.path.join(OUT, "ui_badge_brand.png"))
    rounded(280, 200, 64, (255, 255, 255, 255)).save(os.path.join(OUT, "ui_badge_white.png"))  # HUD boxes: white box, pink text
    for src, dst in (("glossy_button_thin.png", "button_brand.png"), ("next_panel_wide.png", "next_panel_brand.png")):
        p = os.path.join(OUT, src)
        if os.path.exists(p):
            to_brand(Image.open(p).convert("RGBA")).save(os.path.join(OUT, dst))

    # Icon mat buon cho man thua: mat hong nhat, vien + mat + mieng mau tim, giot nuoc mat.
    n = 256 * S
    face = Image.new("RGBA", (n, n), (0, 0, 0, 0))
    d = ImageDraw.Draw(face)
    lw = 14 * S
    d.ellipse((lw, lw, n - lw, n - lw), fill=(255, 211, 226, 255), outline=PLUM, width=lw)
    for cx in (0.36, 0.64):  # mat
        d.ellipse((cx * n - 16 * S, 0.40 * n - 20 * S, cx * n + 16 * S, 0.40 * n + 20 * S), fill=PLUM)
    for cx, sgn in ((0.36, 1), (0.64, -1)):  # long may cup xuong
        d.line((cx * n - 26 * S * sgn, 0.29 * n, cx * n + 18 * S * sgn, 0.25 * n), fill=PLUM, width=8 * S)
    d.arc((0.32 * n, 0.62 * n, 0.68 * n, 0.90 * n), 200, 340, fill=PLUM, width=12 * S)  # mieng meu
    tx, ty = 0.72 * n, 0.52 * n  # giot nuoc mat
    d.polygon([(tx, ty - 22 * S), (tx - 14 * S, ty + 6 * S), (tx + 14 * S, ty + 6 * S)], fill=(90, 170, 255, 255))
    d.ellipse((tx - 14 * S, ty - 8 * S, tx + 14 * S, ty + 20 * S), fill=(90, 170, 255, 255))
    face.resize((256, 256), Image.LANCZOS).save(os.path.join(OUT, "sad_face.png"))

    print("ok ->", OUT, sorted(os.listdir(OUT)))


if __name__ == "__main__":
    main()
