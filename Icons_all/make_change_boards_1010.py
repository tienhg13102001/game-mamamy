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

board("1 - Pack It Right (game son) - mui ten huong dan.png", "PACK IT RIGHT – Mũi tên hướng dẫn cọ lăn", [
    panel("pk_old", "TRƯỚC: chỉ có cọ rung"),
    panel("pk_new1", "SAU: mũi tên ở cọ trái", ring=(100, 640, 290, 800)),
    panel("pk_new2", "SAU: mũi tên ở cọ dưới", ring=(310, 770, 480, 920)),
    panel("pk_new3", "SAU: mũi tên ở cọ trên", ring=(310, 470, 480, 630))],
    ["Round 1: cạnh cây cọ cần lăn có MŨI TÊN hồng NHẤP NHÁY, chỉ đúng chiều cọ sẽ lăn (cọ trái: mũi tên chỉ sang phải, cọ dưới: chỉ lên, cọ trên: chỉ xuống). Cọ vẫn rung như cũ.",
     "Lăn xong cọ nào thì mũi tên chuyển sang cọ tiếp theo, hướng dẫn lần lượt cả 3 cọ.",
     "Round 2-5 giữ như cũ: không hình mẫu, không cọ rung, không mũi tên."])

board("2 - Baby Match (4 em be) - huong dan chon em be.png", "BABY MATCH – Hướng dẫn chọn em bé", [
    panel("bm_new1", "SAU: sản phẩm mờ bay vào bé", ring=(0, 650, 400, 1060)),
    panel("bm_new2", "SAU: em bé rung + chữ", ring=(120, 650, 600, 740))],
    ["Chỉ ở SẢN PHẨM ĐẦU TIÊN của ván: hiện chữ \"Chọn em bé\" dưới sản phẩm.",
     "Em bé cần sản phẩm đó RUNG RUNG để người chơi hiểu là chạm vào em bé.",
     "Một bản MỜ của sản phẩm liên tục bay vào đúng em bé đó để minh hoạ cách chơi.",
     "Chọn xong món đầu tiên thì toàn bộ hướng dẫn tắt; các món sau chơi như cũ."])

board("3 - Baby Face (bieu cam) - khung to va chu.png", "BABY FACE – Khung to + cao hơn, chữ hướng dẫn", [
    panel("bf_old", "TRƯỚC: khung nhỏ, chụp sau 1s"),
    panel("bf_new", "SAU: khung to + cao, chụp sau 3s")],
    ["Khung polaroid to hơn ~1,2 lần và CAO hơn (khung ảnh 528x661, trước 440x470): gần full chiều ngang, cao gần hết màn hình, người cầm máy gần vẫn lọt cả mặt.",
     "Emoji trên mép khung to hơn (khoảng 1,3 lần).",
     "Thời gian chụp kéo dài: thanh hồng chạy 3 giây rồi mới chụp (trước 1 giây). Đã thử 6 giây như góp ý nhưng cả ván ~86 giây, vượt 60 giây quay TikTok, nên chốt 3 giây + vòng emoji quay nhanh hơn (2 giây) để cả ván ~56 giây.",
     "Ảnh đầu tiên của ván: dải trắng dưới khung hiện chữ \"Làm mặt biểu cảm\"; từ ảnh thứ 2 không hiện."])

TOP = (0, 0, 720, 300)
board("4 - Baby Talk (doc tieng Anh) - mic rung va chu.png", "BABY TALK – Mic rung theo giọng + chữ hướng dẫn", [
    panel("bt_old", "TRƯỚC: mic phồng nhẹ", crop=TOP),
    panel("bt_new1", "SAU: chữ \"Đọc lên nhé\"", crop=TOP, ring=(170, 115, 470, 205)),
    panel("bt_new2", "SAU: đọc to, mic rung mạnh", crop=TOP, ring=(10, 60, 210, 260))],
    ["Cạnh nút mic hiện chữ \"Đọc lên nhé\" ở cổng đầu tiên; qua cổng đầu tiên thì chữ tắt.",
     "Mic chuyển động rõ hơn theo giọng đọc: đọc càng to thì mic càng phồng to (tới ~1,5 lần), lắc rung mạnh hơn và vòng sóng toả ra rộng, nhanh hơn; im lặng thì mic đứng yên.",
     "Lưu ý: video demo quay trong Effect House không có micro thật nên giọng đọc là giả lập; cần test trên điện thoại để chỉnh độ nhạy nếu cần."])
