import os, sys
from PIL import Image, ImageDraw, ImageFont
FR, OUT = sys.argv[1], sys.argv[2]
F = os.path.expanduser("~/Library/Fonts/")
BLACK = ImageFont.truetype(F + "SVN-Gotham Black.otf", 44)
BOLD = ImageFont.truetype(F + "SVN-Gotham Bold.otf", 26)
BOOK = ImageFont.truetype(F + "SVN-Gotham Book.otf", 27)
PINK = (0xCF, 0x00, 0x55); WHITE = (255, 255, 255); GREY = (120, 120, 120); BG = (246, 241, 243)
PW = 420  # panel width

def panel(name, label, crop=None, ring=None):
    im = Image.open(os.path.join(FR, name + ".png")).convert("RGB")
    if crop: im = im.crop(crop)
    im = im.resize((PW, round(im.height * PW / im.width)), Image.LANCZOS)
    d = ImageDraw.Draw(im)
    if ring:  # highlight box in panel coords (scaled from 720 space)
        k = PW / 720 if not crop else PW / (crop[2] - crop[0])
        ox, oy = (crop[0], crop[1]) if crop else (0, 0)
        x0, y0, x1, y1 = [(v - o) * k for v, o in zip(ring, (ox, oy, ox, oy))]
        d.rounded_rectangle((x0, y0, x1, y1), 14, outline=PINK, width=6)
    return im, label

def wrap(text, font, w, d):
    out, line = [], ""
    for word in text.split():
        t = (line + " " + word).strip()
        if d.textlength(t, font=font) > w and line: out.append(line); line = word
        else: line = t
    out.append(line); return out

def board(fname, title, panels, notes):
    gap = 30
    W = max(len(panels) * PW + (len(panels) + 1) * gap, 1000)
    ph = max(p[0].height for p in panels)
    tmp = ImageDraw.Draw(Image.new("RGB", (10, 10)))
    lines = []
    for n in notes: lines.append(wrap("• " + n, BOOK, W - 2 * gap, tmp))
    nh = sum(len(l) for l in lines) * 38 + len(lines) * 10
    H = 110 + 50 + ph + 40 + nh + 40
    im = Image.new("RGB", (W, H), BG); d = ImageDraw.Draw(im)
    d.rectangle((0, 0, W, 100), fill=PINK)
    tf, sz = BLACK, 44
    while d.textlength(title, font=tf) > W - 2 * gap and sz > 20:
        sz -= 2; tf = ImageFont.truetype(F + "SVN-Gotham Black.otf", sz)
    d.text((gap, 50), title, font=tf, fill=WHITE, anchor="lm")
    x0 = (W - (len(panels) * PW + (len(panels) - 1) * gap)) // 2
    for i, (p, label) in enumerate(panels):
        x = x0 + i * (PW + gap)
        old = label.startswith("TRƯỚC")
        d.text((x + PW // 2, 135), label, font=BOLD, fill=GREY if old else PINK, anchor="mm")
        im.paste(p, (x, 160))
        d.rounded_rectangle((x - 3, 157, x + PW + 3, 163 + p.height), 10, outline=GREY if old else PINK, width=4)
    y = 160 + ph + 40
    for l in lines:
        for s in l:
            d.text((gap, y), s, font=BOOK, fill=(40, 40, 40)); y += 38
        y += 10
    im.save(os.path.join(OUT, fname)); print(fname, im.size)

board("1 - Pack It Right (game son) - mui ten manh dung vi tri.png", "PACK IT RIGHT – Mũi tên mảnh, đặt đúng vị trí khách khoanh", [
    panel("pk_new1", "TRƯỚC: mũi tên dày, sát bao"),
    panel("pk2_left", "SAU: cọ trái", ring=(5, 585, 155, 685)),
    panel("pk2_top", "SAU: cọ trên", ring=(495, 255, 605, 435)),
    panel("pk2_bottom", "SAU: cọ dưới", ring=(165, 1005, 285, 1155))],
    ["Mũi tên đổi sang loại MẢNH (thân và đầu nét mảnh, viền trắng mỏng), vẫn nhấp nháy và nhích nhẹ theo chiều cọ lăn.",
     "Đặt đúng 3 vị trí khách khoanh: cọ trái: mũi tên ngang ở mép trái, chỉ sang phải; cọ trên: mũi tên dọc phía trên bên phải, chỉ xuống; cọ dưới: mũi tên dọc phía dưới bên trái, chỉ lên.",
     "Vẫn chỉ ở round 1, lần lượt theo cây cọ cần lăn."])

board("2 - Baby Match (4 em be) - chu trang khong vien.png", "BABY MATCH – Chữ \"Chọn em bé\" màu trắng, bỏ viền", [
    panel("bm_new2", "TRƯỚC: chữ hồng viền trắng", ring=(120, 650, 600, 740)),
    panel("bm2", "SAU: chữ trắng, không viền", ring=(120, 650, 600, 740))],
    ["Giữ nguyên vị trí chữ, đổi sang chữ TRẮNG không viền.",
     "Hướng dẫn vẫn chỉ xuất hiện 1 lần ở sản phẩm / em bé đầu tiên của ván (em bé rung + sản phẩm mờ bay vào bé); chọn xong món đầu là tắt."])

board("3 - Baby Face (bieu cam) - chu len tren emoji to hon.png", "BABY FACE – Chữ lên trên khung, emoji to hơn", [
    panel("bf_new", "TRƯỚC: chữ ở dải dưới khung"),
    panel("bf_new2", "SAU: chữ trên cùng, emoji to hơn", ring=(140, 40, 580, 110))],
    ["Chữ \"Làm mặt biểu cảm\" chuyển lên trên cùng, đúng chỗ khách khoanh (chỉ hiện ở ảnh đầu tiên của ván).",
     "Emoji trên mép khung to thêm (cao 250 px, trước 210 px; khiên 19 cũng to theo).",
     "Thời gian chụp giữ 3 giây."])

board("4 - Baby Talk (doc tieng Anh) - chu cong sau dong ho.png", "BABY TALK – Đồng hồ không viền, chữ nhấp nhô, cổng sau nhỏ hơn", [
    panel("bt_new1", "TRƯỚC"),
    panel("bt_new3", "SAU", ring=(100, 615, 450, 715))],
    ["Ô thời gian: bỏ viền hồng, chỉ còn ô trắng với số đếm màu hồng.",
     "Chữ \"Đọc lên nhé\" chuyển xuống giữa mặt và cổng (đúng chỗ khách khoanh), nhấp nhô lên xuống; chỉ hiện ở cổng đầu tiên.",
     "Cổng phía sau (cổng kế tiếp) thu nhỏ lại (khoảng 0,8 lần so với trước) để chữ trên 2 cổng và câu hướng dẫn không bị rối."])
