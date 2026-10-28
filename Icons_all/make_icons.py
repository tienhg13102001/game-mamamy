"""Build 720x720 TikTok effect icons for Mamamy Games 2-5 in the style of Game 1's icon.
Layout: game art at top corners + bottom, logo, game hint line, RECORD TO PLAY pill."""
import os, random, sys
from PIL import Image, ImageDraw, ImageFilter

ROOT = "/Users/tiennguyen/Documents/Game Mamamy"
OUT = sys.argv[1] if len(sys.argv) > 1 else None
N = 720
# old game number -> renamed project folder
FOLDERS = {2: "1 - Filter - Mamamy Tower 19 Challenge", 1: "2 - Filter - Mamamy Baby Match Challenge",
           4: "3 - Filter - Mamamy Baby Face Challenge", 3: "4 - Filter - Mamamy Baby Talk Challenge",
           5: "5 - Filter - Mamamy Pack It Right Challenge"}
PINK = (0xCF, 0x00, 0x55)


def A(game, name):
    return Image.open(f"{ROOT}/{FOLDERS[game]}/{name}").convert("RGBA")


def fit(im, w=None, h=None):
    im = im.crop(im.getbbox())
    if w and not h:
        h = round(im.height * w / im.width)
    elif h and not w:
        w = round(im.width * h / im.height)
    return im.resize((w, h), Image.LANCZOS)


def shadow(im, r=10, a=90, off=(0, 8)):
    pad = r * 3
    s = Image.new("RGBA", (im.width + pad * 2, im.height + pad * 2), (0, 0, 0, 0))
    alpha = im.split()[3].point(lambda v: v * a // 255)
    s.paste((60, 0, 25, 255), (pad, pad), alpha)
    s = s.filter(ImageFilter.GaussianBlur(r))
    return s, pad, off


def put(canvas, im, cx, cy, rot=0, sh=True):
    if rot:
        im = im.rotate(rot, resample=Image.BICUBIC, expand=True)
    x, y = round(cx - im.width / 2), round(cy - im.height / 2)
    if sh:
        s, pad, off = shadow(im)
        canvas.alpha_composite(s, (x - pad + off[0], y - pad + off[1])) if x - pad + off[0] >= 0 and y - pad + off[1] >= 0 else paste_clip(canvas, s, x - pad + off[0], y - pad + off[1])
    paste_clip(canvas, im, x, y)


def paste_clip(canvas, im, x, y):
    layer = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    layer.paste(im, (x, y), im)
    canvas.alpha_composite(layer)


def background(seed):
    # white -> brand pink tint radial, plus soft white bokeh
    bg = Image.new("RGBA", (N, N), (255, 255, 255, 255))
    g = Image.radial_gradient("L").resize((N * 2, N * 2)).crop((N // 2, N // 2 - 80, N // 2 + N, N // 2 + N - 80))
    tint = Image.new("RGBA", (N, N), PINK + (255,))
    bg = Image.composite(tint, bg, g.point(lambda v: int(v * 0.42)))
    d = Image.new("RGBA", (N, N), (0, 0, 0, 0))
    dd = ImageDraw.Draw(d)
    rnd = random.Random(seed)
    for _ in range(26):
        r = rnd.randint(8, 34)
        x, y = rnd.randint(0, N), rnd.randint(0, N)
        dd.ellipse((x - r, y - r, x + r, y + r), fill=(255, 255, 255, rnd.randint(50, 120)))
    bg.alpha_composite(d.filter(ImageFilter.GaussianBlur(3)))
    return bg


def header(c, logo, hint, logo_y=268, hint_y=372, btn_y=448):
    put(c, fit(logo, w=540), N / 2, logo_y)
    put(c, fit(hint, w=560), N / 2, hint_y, sh=False)
    btn = fit(A(1, "Assets/button_record.png"), w=372)
    cta = fit(A(1, "Assets/cta_record.png"), w=276)
    btn.alpha_composite(cta, ((btn.width - cta.width) // 2, (btn.height - cta.height) // 2 - 2))
    put(c, btn, N / 2, btn_y)


def game1():
    c = background(1)
    put(c, fit(A(1, "Assets/baby_tl_idle.png"), w=200), 105, 95, rot=6)
    put(c, fit(A(1, "Assets/baby_tr_idle.png"), w=175), 625, 95, rot=-6)
    put(c, fit(A(1, "Assets/prod_wipes.png"), w=230), N / 2, 640)
    put(c, fit(A(1, "Assets/baby_bl_idle.png"), w=250), 130, 610)
    put(c, fit(A(1, "Assets/baby_br_idle.png"), w=225), 600, 610)
    header(c, A(1, "Assets/logo_mega19.png"), A(1, "Build/text/hint.png"))
    return c


def game2():
    c = background(2)
    # top: claw grabbing a Tropical pack
    put(c, fit(A(2, "Assets/claw.png"), w=210), 600, 70, rot=-8)
    put(c, fit(A(2, "Assets/khan_uot_tropical_1.png"), w=200), 590, 175, rot=-8)
    put(c, fit(A(2, "Assets/co_rua_binh.png"), h=190), 95, 95, rot=12)
    # bottom: product tower
    put(c, fit(A(2, "Assets/khan_uot_do.png"), w=300), 360, 680)
    put(c, fit(A(2, "Assets/khan_uot_xanh.png"), w=280), 360, 610, rot=-3)
    put(c, fit(A(2, "Assets/khan_uot_tropical_2.png"), w=270), 365, 545, rot=4)
    put(c, fit(A(2, "Assets/nuoc_giat_xa.png"), h=230), 95, 615, rot=8)
    put(c, fit(A(2, "Assets/bot_tam_goi.png"), h=220), 630, 620, rot=-8)
    header(c, A(2, "Assets/logo.png"), A(2, "Prototype/text/hint.png"), logo_y=290, hint_y=388, btn_y=460)
    return c


def game3():
    c = background(3)
    put(c, fit(A(3, "Assets/gate_poo.png"), w=200), 100, 95, rot=8)
    put(c, fit(A(3, "Assets/baby_cry.png"), w=170), 630, 95, rot=-8)
    put(c, fit(A(3, "Assets/gate_eat.png"), w=300), 190, 600)
    put(c, fit(A(3, "Assets/baby_eat.png"), w=260), 590, 610)
    header(c, A(3, "Assets/logo_mega19.png"), A(3, "Build/text/hint_intro.png"))
    return c


def game4():
    c = background(4)
    put(c, fit(A(4, "Assets/face_smile.png"), w=170), 95, 95, rot=10)
    put(c, fit(A(4, "Assets/card_cry.png"), w=200), 625, 90, rot=-8)
    put(c, fit(A(4, "Assets/card_tongue.png"), w=280), 190, 615, rot=6)
    put(c, fit(A(4, "Assets/face_tongue.png"), w=260), 560, 610, rot=-4)
    header(c, A(4, "Assets/logo_mega19.png"), A(4, "Build/text/hint_intro.png"))
    return c


def game5():
    c = background(5)
    put(c, fit(A(5, "Assets/roller_white.png"), h=190), 80, 105, rot=10)
    put(c, fit(A(5, "Assets/roller_pattern.png"), w=250), 330, 60, rot=-4)
    put(c, fit(A(5, "Assets/roller_pink.png"), w=230), 600, 120, rot=-10)
    put(c, fit(A(5, "Assets/pack_green.png"), w=210), 105, 640, rot=12)
    put(c, fit(A(5, "Assets/pack_pink.png"), w=210), 615, 640, rot=-12)
    put(c, fit(A(5, "Assets/pack_full.png"), w=400), N / 2, 615)
    header(c, A(5, "Assets/logo_tower19.png"), A(5, "Build/text/hint_intro.png"))
    return c


if __name__ == "__main__":
    os.makedirs(OUT, exist_ok=True)
    for g, fn in [(1, game1), (2, game2), (3, game3), (4, game4), (5, game5)]:
        fn().convert("RGB").save(f"{OUT}/icon_game{g}.png", optimize=True)
    sheet = Image.new("RGB", (N * 5 // 2, N // 2), "white")
    tiles = [Image.open(f"{OUT}/icon_game{g}.png") for g in (1, 2, 3, 4, 5)]
    for i, t in enumerate(tiles):
        sheet.paste(t.convert("RGB").resize((N // 2, N // 2)), (i * N // 2, 0))
    sheet.save(f"{OUT}/sheet.jpg", quality=90)
