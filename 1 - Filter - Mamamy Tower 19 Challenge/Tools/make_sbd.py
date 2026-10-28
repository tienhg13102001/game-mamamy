"""Build the MMM SBD Effect 2 assets (new claw, intro screen, MEGA logo, icon).

Source: ../../MMM SBD Effect 2/  ->  ../Assets/*.png and ../Icon/femaleIcon.png
Run: python3 Tools/make_sbd.py
"""
import os
from collections import deque

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
PROJ = os.path.dirname(HERE)
SRC = os.path.join(os.path.dirname(PROJ), "MMM SBD Effect 2")
ASSETS = os.path.join(PROJ, "Assets")
LAYER = os.path.join(SRC, "MMM SBD Effect 2 TACH HINH %d.png")

# Claw design: layer 1 cropped to its bbox (332x282). Stem = cols 142..188, rows 0..60.
CLAW_BOX = (373, 0, 705, 282)
CLAW_HOLD_ROW = 115   # item top sits at this claw row (shield top half peeks above the item)


def save(im, name):
    im.save(os.path.join(ASSETS, name))
    print("wrote", name, im.size)


def flood_outside(mask):
    """True for pixels reachable from the border through mask==False."""
    h, w = mask.shape
    out = np.zeros_like(mask)
    q = deque()
    for x in range(w):
        for y in (0, h - 1):
            if not mask[y, x] and not out[y, x]:
                out[y, x] = True; q.append((y, x))
    for y in range(h):
        for x in (0, w - 1):
            if not mask[y, x] and not out[y, x]:
                out[y, x] = True; q.append((y, x))
    while q:
        y, x = q.popleft()
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            ny, nx = y + dy, x + dx
            if 0 <= ny < h and 0 <= nx < w and not mask[ny, nx] and not out[ny, nx]:
                out[ny, nx] = True; q.append((ny, nx))
    return out


def split_claw():
    claw = Image.open(LAYER % 1).convert("RGBA").crop(CLAW_BOX)
    a = np.array(claw).astype(np.float32)
    rgb, alpha = a[..., :3], a[..., 3]
    sat = rgb.max(2) - rgb.min(2)
    colored = (sat > 18) & (alpha > 40)
    # Shield = coloured pixels + the cream digits inside, grown 2px to take the anti-aliased rim.
    m = Image.fromarray((colored * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(5))
    shield = np.array(m) > 0
    shield = ~flood_outside(shield)
    ys, xs = np.where(shield)
    sbox = (int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1)

    # Shield sprite: original pixels inside the mask.
    sh = a.copy()
    sh[..., 3] = np.where(shield, alpha, 0)
    shield_img = Image.fromarray(sh.astype(np.uint8)).crop(sbox)

    # Arms sprite: the white body continues under the shield. Above the arms' fork
    # (row 155) the body is solid between the outer edges, below it the fork is open.
    arms = a.copy()
    body = alpha > 128
    for y in range(sbox[1], sbox[3]):
        row_sh = shield[y]
        if not row_sh.any():
            continue
        vis = body[y] & ~row_sh
        cols = np.where(vis)[0]
        if y < 105:          # stem only
            lo_x, hi_x = 142, 188
        elif y < 155 and len(cols):
            lo_x, hi_x = cols.min(), cols.max()
        else:
            lo_x, hi_x = 1, 0
        for x in np.where(row_sh)[0]:
            if lo_x <= x <= hi_x:
                # Shade like the claw: sample the nearest visible body pixels on each side.
                L = [c for c in cols if c < x]
                R = [c for c in cols if c > x]
                if y < 105 or not L or not R:
                    src = a[40, x] if 142 <= x <= 188 else a[y, (L or R)[-1 if L else 0]]
                    arms[y, x] = src; arms[y, x, 3] = 255
                else:
                    l, r = L[-1], R[0]
                    t = (x - l) / max(1, r - l)
                    arms[y, x, :3] = rgb[y, l] * (1 - t) + rgb[y, r] * t
                    arms[y, x, 3] = 255
            else:
                arms[y, x, 3] = 0
    arms_img = Image.fromarray(arms.astype(np.uint8))
    stem = claw.crop((142, 10, 189, 50)).resize((47, 8))
    return claw, arms_img, shield_img, sbox, stem


def header_plate():
    """SUPER BRAND DAY header cut from the thumb on a soft rounded beige plate."""
    t = Image.open(os.path.join(SRC, "MMM SBD Effect 2 - THUMB.jpg")).convert("RGB")
    box = (285, 12, 815, 112)
    crop = np.array(t.crop(box)).astype(np.float32)
    bg = np.array([233, 231, 227], np.float32)
    # Paint out the claw stem that runs behind the header (neutral light pixels in its columns).
    lum = crop.mean(2)
    sat = crop.max(2) - crop.min(2)
    x0 = 525 - box[0]
    for x in range(x0 - 4, x0 + 44):
        col = (lum[:, x] > 150) & (sat[:, x] < 14)
        col[88:] = True   # below the text the stem is all that is there
        crop[col, x] = bg
    rgb = Image.fromarray(crop.clip(0, 255).astype(np.uint8))
    w, h = rgb.size
    pad = 14
    W, H = w + 2 * pad, h + 2 * pad
    plate = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    mask = Image.new("L", (W, H), 0)
    ImageDraw.Draw(mask).rounded_rectangle((pad // 2, pad // 2, W - pad // 2, H - pad // 2), radius=34, fill=235)
    mask = mask.filter(ImageFilter.GaussianBlur(4))
    plate.paste(Image.new("RGBA", (W, H), tuple(int(c) for c in bg) + (255,)), (0, 0), mask)
    inner = Image.new("L", (w, h), 255)
    plate_a = np.array(plate)
    plate_a[pad:pad + h, pad:pad + w, :3] = np.array(rgb)
    out = Image.fromarray(plate_a)
    out.putalpha(mask)
    return out


def main():
    claw, arms, shield, sbox, stem = split_claw()
    save(arms, "claw_white.png")
    save(shield, "claw_shield.png")
    save(stem, "claw_stem.png")
    print("shield box in claw", sbox)

    # Intro claw: stem up to the screen top, claw, then the detergent pouch in front.
    bag = Image.open(os.path.join(ASSETS, "nuoc_giat_xa.png")).convert("RGBA")
    rise = 420
    W = max(claw.width, bag.width)
    H = rise + CLAW_HOLD_ROW + bag.height
    g = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    cx = (W - claw.width) // 2
    g.alpha_composite(stem.resize((47, rise + 20)), (cx + 142, 0))
    g.alpha_composite(claw, (cx, rise))
    g.alpha_composite(bag, ((W - bag.width) // 2, rise + CLAW_HOLD_ROW))
    save(g, "intro_claw.png")

    # Finale piece: the standalone 19 shield (layer 14).
    shield19 = Image.open(LAYER % 14).convert("RGBA")
    save(shield19.crop(shield19.getbbox()), "shield_19.png")

    logo = Image.open(LAYER % 13).convert("RGBA")
    logo = logo.crop(logo.getbbox())
    save(logo, "logo_mega.png")

    # Product tower like the design: bottle on the dry towels on the wet wipes.
    parts = [Image.open(os.path.join(ASSETS, n)).convert("RGBA")
             for n in ("nuoc_rua_binh.png", "khan_kho_tropical.png", "khan_uot_xanh.png")]
    W = max(p.width for p in parts)
    H = sum(p.height for p in parts)
    tw = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    y = 0
    for p in parts:
        tw.alpha_composite(p, ((W - p.width) // 2, y))
        y += p.height
    save(tw, "intro_tower.png")

    save(header_plate(), "intro_header.png")

    icon = Image.open(os.path.join(SRC, "MMM SBD Effect 2 - THUMB.jpg")).convert("RGB").resize((720, 720), Image.LANCZOS)
    icon.save(os.path.join(PROJ, "Icon", "femaleIcon.png"))
    print("wrote Icon/femaleIcon.png")


if __name__ == "__main__":
    main()
