#!/usr/bin/env python3
"""Cat sat cac anh TACH HINH (1080x1920 trong suot) thanh sprite + sinh du lieu collider.

Chay lai moi khi designer gui anh moi:
    python3 Tools/crop_sprites.py

Dau ra:
    Prototype/sprites/<ten>.png   sprite da cat sat vien
    Prototype/items.js            window.SPRITES = {...}  (bbox goc, kich thuoc, hull collider)
    Prototype/items.json          cung du lieu, dung khi dung game trong Effect House
"""
import json
import os

import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "Assets", "Textures")
OUT = os.path.join(ROOT, "Prototype")
SPRITE_DIR = os.path.join(OUT, "sprites")

# so anh -> (ten, loai). Anh 4 trung y het anh 3 nen bo qua.
MAPPING = {
    1: ("claw", "ui"),
    2: ("next_panel", "ui"),
    3: ("bot_tam_goi", "item"),
    5: ("co_rua_binh", "item"),
    6: ("nuoc_giat_xa", "item"),
    7: ("nuoc_rua_binh", "item"),
    8: ("khan_kho_tropical", "item"),
    9: ("khan_uot_xanh", "item"),
    10: ("khan_uot_do", "item"),
    11: ("khan_uot_tropical_1", "item"),
    12: ("khan_uot_tropical_2", "item"),
    13: ("logo", "ui"),
}

ALPHA_SOLID = 110  # pixel co alpha >= nguong nay moi tinh la "vat the" khi tinh collider


def convex_hull(points):
    pts = sorted(set(points))
    if len(pts) <= 2:
        return pts

    def cross(o, a, b):
        return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])

    lower, upper = [], []
    for p in pts:
        while len(lower) >= 2 and cross(lower[-2], lower[-1], p) <= 0:
            lower.pop()
        lower.append(p)
    for p in reversed(pts):
        while len(upper) >= 2 and cross(upper[-2], upper[-1], p) <= 0:
            upper.pop()
        upper.append(p)
    return lower[:-1] + upper[:-1]


def simplify_closed(poly, max_vertices=14, min_area_ratio=0.004):
    """Bo dan dinh dong gop dien tich nho nhat (giu tinh loi vi chi xoa dinh)."""
    poly = list(poly)

    def tri_area(a, b, c):
        return abs((b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1])) / 2

    def poly_area(p):
        return abs(sum(p[i][0] * p[(i + 1) % len(p)][1] - p[(i + 1) % len(p)][0] * p[i][1] for i in range(len(p)))) / 2

    total = poly_area(poly)
    while len(poly) > 4:
        n = len(poly)
        areas = [tri_area(poly[i - 1], poly[i], poly[(i + 1) % n]) for i in range(n)]
        i = int(np.argmin(areas))
        if len(poly) <= max_vertices and areas[i] > total * min_area_ratio:
            break
        poly.pop(i)
    return poly


def main():
    os.makedirs(SPRITE_DIR, exist_ok=True)
    data = {}
    for idx, (name, kind) in MAPPING.items():
        path = os.path.join(SRC, f"MMM SBD Effect 2 TACH HINH {idx}.png")
        im = Image.open(path).convert("RGBA")
        bbox = im.getbbox()
        crop = im.crop(bbox)
        crop.save(os.path.join(SPRITE_DIR, f"{name}.png"), optimize=True)

        entry = {
            "file": f"sprites/{name}.png",
            "kind": kind,
            "source": os.path.basename(path),
            "sourceBBox": list(bbox),  # vi tri trong khung 1080x1920 goc
            "w": crop.width,
            "h": crop.height,
        }

        if kind == "item":
            alpha = np.array(crop)[:, :, 3]
            pts = []
            for y in range(alpha.shape[0]):
                xs = np.nonzero(alpha[y] >= ALPHA_SOLID)[0]
                if len(xs):
                    pts.append((int(xs[0]), y))
                    pts.append((int(xs[-1]) + 1, y))
            # them day/dinh day du de hull kin
            hull = convex_hull(pts)
            hull = simplify_closed(hull)
            entry["hull"] = [[int(x), int(y)] for x, y in hull]

        if name == "logo":
            # So "19" dinh lien vao khien -> tach rieng phan chu (truoc khoang trong suot giua chu va khien)
            cols = (np.array(crop)[:, :, 3] > 20).sum(0)
            empty = [x for x in range(crop.width // 2, crop.width) if cols[x] == 0]
            text = crop.crop((0, 0, empty[0], crop.height))
            text = text.crop(text.getbbox())
            text.save(os.path.join(SPRITE_DIR, "logo_text.png"), optimize=True)
            data["logo_text"] = {"file": "sprites/logo_text.png", "kind": "ui", "source": entry["source"],
                                 "w": text.width, "h": text.height}

        data[name] = entry
        print(f"{idx:>2} {name:<22} {crop.width}x{crop.height}  hull={len(entry.get('hull', []))}")

    with open(os.path.join(OUT, "items.json"), "w") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    with open(os.path.join(OUT, "items.js"), "w") as f:
        f.write("// Tu sinh boi Tools/crop_sprites.py - khong sua tay\n")
        f.write("window.SPRITES = " + json.dumps(data, ensure_ascii=False) + ";\n")


if __name__ == "__main__":
    main()
