"""MEGA round: the empty frame is a plain white sheet (client 2026-10-09) and every MEGA layer is
printed on that sheet. Originals (logo-shaped) are in Build/backup_1009b/mega_logo_shape/.
Frame textures are 716x586, layer textures 708x578, sharing one centre (layer px = frame px - 4)."""
import os
from PIL import Image, ImageDraw
SRC = "Build/backup_1009b/mega_logo_shape"
BOX = (6, 181, 702, 419)      # layer px: logo bbox (24,199)-(692,401) + 18 px margin
RADIUS = 28
def sheet(size, off):
    ss = 4
    big = Image.new("L", (size[0] * ss, size[1] * ss), 0)
    x0, y0, x1, y1 = [(v + off) * ss for v in BOX]
    ImageDraw.Draw(big).rounded_rectangle((x0, y0, x1, y1), RADIUS * ss, fill=255)
    a = big.resize(size, Image.LANCZOS)
    im = Image.new("RGBA", size, (255, 255, 255, 0)); im.putalpha(a)
    return im
for name in os.listdir(SRC):
    if not name.endswith(".png") or "roller" in name or "thumb" in name: continue
    src = Image.open(os.path.join(SRC, name)).convert("RGBA")
    off = 4 if src.size == (716, 586) else 0
    out = sheet(src.size, off)
    if name != "MEGA_frame.png": out.alpha_composite(src)
    out.save(os.path.join("Assets", name)); print(name, src.size)
