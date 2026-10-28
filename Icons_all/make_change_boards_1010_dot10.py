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


board("1 - Pack It Right (game son) - chi sp dau thu nho, mui ten ngan.png", "PACK IT RIGHT – Chỉ sản phẩm đầu thu nhỏ nhẹ, mũi tên ngắn", [
    panel("pk_before", "TRƯỚC: thu nhỏ 82%, lệch phải"),
    panel("pk_left", "SAU: SP đầu – cọ trái", ring=(0, 590, 150, 700)),
    panel("pk_top", "SAU: SP đầu – cọ trên", ring=(470, 350, 590, 490)),
    panel("pk_next", "SAU: SP 2 trở đi")],
    ["Chỉ SẢN PHẨM ĐẦU (round có hướng dẫn) thu nhỏ nhẹ còn 90% (trước 82%) và giữ ở GIỮA màn hình, không đẩy lệch sang phải nữa.",
     "Mũi tên ngắn lại (khoảng 3/4 so với trước), vẫn nằm song song cạnh cán cọ, nhấp nháy và chỉ theo chiều cọ lăn.",
     "Từ sản phẩm thứ 2 trở đi: bao và 3 cây cọ giữ NGUYÊN kích thước và vị trí như cũ, không di chuyển, không có mũi tên.",
     "Logo MEGA MAMAMY lúc thắng vẫn mọc ra đúng từ logo in trên bao cuối."])

board("2 - Baby Match (4 em be) - xoa han chu Chon em be.png", "BABY MATCH – Xoá hẳn chữ \"CHỌN EM BÉ\"", [
    panel("bm_before", "TRƯỚC: còn chữ \"Chọn em bé\""),
    panel("bm_after", "SAU: không còn chữ", ring=(200, 680, 560, 790))],
    ["Đã XOÁ HẲN lớp chữ \"Chọn em bé\" khỏi filter (không chỉ ẩn), nên không thể hiện lại ở bất kỳ màn nào.",
     "Hướng dẫn ở sản phẩm đầu vẫn giữ: em bé cần chọn rung lên, hình sản phẩm mờ bay vào chỗ em bé đó.",
     "Nếu bản test trên điện thoại vẫn thấy chữ, đó là bản cũ: cần quét lại QR / gửi lại bản mới."])
