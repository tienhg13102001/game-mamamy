import os, sys
from PIL import Image, ImageDraw, ImageFont
FR, OUT, DV = sys.argv[1], sys.argv[2], sys.argv[3]
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


def cut(board_rel, n, i):
    """Cut panel i (of n) out of an earlier change board in DEMO ver 2."""
    b = Image.open(os.path.join(DV, board_rel)).convert("RGB")
    W = b.width; gap = 30
    x0 = (W - (n * PW + (n - 1) * gap)) // 2 + i * (PW + gap)
    y = 200
    while y < b.height - 6 and not all(b.getpixel((x0 + PW // 2, y + k)) == BG for k in range(6)): y += 1
    return b.crop((x0, 160, x0 + PW, y - 4))

def bpanel(board_rel, n, i, label):
    return cut(board_rel, n, i), label

HD = "Thay doi 10-10 (huong dan)/"
D2 = "Thay doi 10-10 dot 2 (theo gop y khach)/"
D9 = "Thay doi 10-10 dot 9 (chu hong vien trang, bo chu, mui ten)/"
D10 = "Thay doi 10-10 dot 10 (chi sp dau thu nho, mui ten ngan, xoa chu)/"

board("1 - Tower 19 (xep do) - khong doi.png", "TOWER 19 – Không thay đổi trong các đợt 10-10", [
    panel("tw_intro", "Mở đầu: RECORD TO PLAY"),
    panel("tw_play", "Đang chơi: FLOOR / BEST"),
    panel("tw_end", "Kết thúc: logo MEGA MAMAMY")],
    ["Các đợt chỉnh 10-10 (đợt 1 đến đợt 10) không có thay đổi nào cho Tower 19; game giữ nguyên như bản đã gửi.",
     "Chơi vô tận, xếp sản phẩm lên tháp; HUD FLOOR / BEST; khiên 19 xuất hiện mỗi 12 tầng và ở tầng vượt BEST.",
     "Rơi đồ thì hiện logo MEGA MAMAMY kèm FLOOR / BEST rồi tự chơi lại."])

board("2 - Baby Match (4 em be) - huong dan chon em be.png", "BABY MATCH – Hướng dẫn chọn em bé ở sản phẩm đầu", [
    panel("bm_4.5", "SAU: SP đầu – SP mờ bay vào bé", ring=(30, 760, 380, 1060)),
    bpanel(D10 + "2 - Baby Match (4 em be) - xoa han chu Chon em be.png", 2, 1, "SAU: không còn chữ"),
    panel("bm_9.0", "SAU: SP 2 trở đi – như cũ")],
    ["TRƯỚC: không có hướng dẫn, người chơi không biết phải chạm vào em bé.",
     "Chỉ ở SẢN PHẨM ĐẦU TIÊN: em bé cần sản phẩm đó RUNG RUNG, một bản MỜ của sản phẩm liên tục bay vào đúng em bé đó.",
     "Chữ \"Chọn em bé\" đã thử thêm rồi XOÁ HẲN theo góp ý khách (không còn hiện ở bất kỳ màn nào).",
     "Chọn xong món đầu tiên thì toàn bộ hướng dẫn tắt; từ món thứ 2 chơi như cũ."])

board("3 - Baby Face (bieu cam) - khung to, chu huong dan, chup 3s.png", "BABY FACE – Khung to hơn, chữ hướng dẫn, chụp đúng 3 giây", [
    bpanel(HD + "3 - Baby Face (bieu cam) - khung to va chu.png", 2, 0, "TRƯỚC: khung nhỏ, chụp sau 1s"),
    panel("bf_frame", "SAU: khung to + cao, đếm 3s"),
    bpanel(D9 + "3 - Baby Face (bieu cam) - chu hong vien trang.png", 2, 1, "SAU: chữ hướng dẫn ảnh đầu")],
    ["Khung polaroid to hơn ~1,2 lần và CAO hơn (gần full chiều ngang); emoji trên mép khung to hơn ~1,3 lần.",
     "Chụp ĐÚNG 3 giây tính từ lúc vòng emoji dừng (trước 1 giây); thanh hồng đếm ngược theo mốc này. Vòng emoji quay 2 giây, cả ván ~56 giây, vừa video 60 giây.",
     "Ảnh đầu tiên của ván có chữ \"LÀM MẶT THEO BIỂU CẢM\": in hoa, hồng viền trắng (cùng kiểu \"HÃY ĐỌC TO\"), nằm sát ngay trên emoji, nhấp nhô nhẹ; từ ảnh thứ 2 không hiện."])

board("4 - Baby Talk (doc tieng Anh) - HAY DOC TO, mic rung.png", "BABY TALK – Chữ \"HÃY ĐỌC TO\", mic rung theo giọng", [
    bpanel(D2 + "4 - Baby Talk (doc tieng Anh) - chu cong sau dong ho.png", 2, 0, "TRƯỚC: chữ cũ, ô giờ viền hồng"),
    panel("bt_mic", "SAU: \"HÃY ĐỌC TO\" + mic rung", ring=(30, 600, 460, 700))],
    ["Bản đầu ngày 10-10 chưa có chữ hướng dẫn, mic chỉ phồng nhẹ; sau đó thử chữ \"Đọc lên nhé\" cạnh mic rồi chốt như bên dưới.",
     "Cổng đầu tiên có chữ \"HÃY ĐỌC TO\" (in hoa, hồng viền trắng), nằm giữa mặt và cổng, nhấp nhô lên xuống; qua cổng đầu thì tắt.",
     "Mic chuyển động theo giọng: đọc càng to mic càng phồng (tới ~1,5 lần), rung mạnh và vòng sóng toả rộng; im lặng thì mic đứng yên.",
     "Ô thời gian bỏ viền hồng, chỉ còn ô trắng số hồng.",
     "Cổng phía sau thu nhỏ lại (~0,8 lần) để chữ trên 2 cổng và câu hướng dẫn không bị rối."])

board("5 - Pack It Right (game son) - mui ten huong dan co lan.png", "PACK IT RIGHT – Mũi tên hướng dẫn cọ lăn ở sản phẩm đầu", [
    bpanel(HD + "1 - Pack It Right (game son) - mui ten huong dan.png", 4, 0, "TRƯỚC: chỉ có cọ rung"),
    bpanel(D10 + "1 - Pack It Right (game son) - chi sp dau thu nho, mui ten ngan.png", 4, 1, "SAU: SP đầu – cọ trái"),
    bpanel(D10 + "1 - Pack It Right (game son) - chi sp dau thu nho, mui ten ngan.png", 4, 2, "SAU: SP đầu – cọ trên"),
    bpanel(D10 + "1 - Pack It Right (game son) - chi sp dau thu nho, mui ten ngan.png", 4, 3, "SAU: SP 2 trở đi")],
    ["Sản phẩm đầu: cạnh cây cọ cần lăn có MŨI TÊN hồng NHẤP NHÁY, ngắn, nằm SONG SONG cạnh cán cọ (không đè lên cọ), chỉ đúng chiều cọ lăn: cọ trái sang phải, cọ trên xuống, cọ dưới lên.",
     "Lăn xong cọ nào thì mũi tên chuyển sang cọ tiếp theo, hướng dẫn lần lượt cả 3 cọ.",
     "Chỉ sản phẩm đầu thu nhỏ nhẹ còn 90% và giữ ở GIỮA màn hình để có chỗ cho mũi tên.",
     "Từ sản phẩm thứ 2: bao và 3 cọ giữ nguyên kích thước, vị trí như cũ, không mũi tên. Logo MEGA MAMAMY lúc thắng vẫn mọc ra từ logo trên bao cuối."])
