#!/usr/bin/env python3
"""Replace every Vietnamese in-game text image with English (client: no Vietnamese text in any game).

    python3 Icons_all/make_english_text.py

Overwrites the text PNGs in each game's Assets/ under the SAME file names, so Effect House
re-imports them and every scene/script reference keeps working. The Vietnamese originals are
backed up once to <game>/Build/vi_text_backup/. Hints that only decorate (intro hints, rule hints)
are deleted from the scenes instead, so they are not rendered here.
Brand rules: SVN-Gotham, only #CF0055 + white.
"""
import os
import shutil

from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FONTS = os.path.expanduser("~/Library/Fonts")
BLACK = os.path.join(FONTS, "SVN-Gotham Black.otf")
BOLD = os.path.join(FONTS, "SVN-Gotham Bold.otf")
BRAND = (207, 0, 85, 255)   # #CF0055
WHITE = (255, 255, 255, 255)

TITLE = (BLACK, 120, BRAND, 10)
GAMES = {
    "1 - Filter - Mamamy Tower 19 Challenge": {
        "label_floor": ("FLOOR", BOLD, 44, BRAND, 0),
        "label_best": ("BEST", BOLD, 44, BRAND, 0),
        "title_record": ("NEW RECORD!",) + TITLE,
        "title_lose": ("OOPS!",) + TITLE,
        "title_win": ("WELL DONE!",) + TITLE,
        "reason_record": ("You stacked", BOLD, 56, BRAND, 0),
        "reason_topple": ("Too far off-centre", BOLD, 56, BRAND, 0),
        "reason_miss": ("Missed the tower", BOLD, 56, BRAND, 0),
        "reason_collapse": ("The tower lost balance", BOLD, 56, BRAND, 0),
        "reason_out": ("Fell off the tower", BOLD, 56, BRAND, 0),
        "sub_floor": ("floors", BOLD, 60, BRAND, 0),
        "popup_perfect": ("PERFECT!", BLACK, 96, BRAND, 8),
        "popup_topple": ("Too far!", BLACK, 96, BRAND, 8),
        "popup_collapse": ("Wobbly tower!", BLACK, 96, BRAND, 8),
    },
    "2 - Filter - Mamamy Baby Match Challenge": {
        "title_win": ("WELL DONE!",) + TITLE,
        "title_lose": ("OOPS!",) + TITLE,
    },
    "5 - Filter - Mamamy Pack It Right Challenge": {
        "title_lose": ("OOPS!",) + TITLE,
    },
}


def render(text, font_path, size, fill, stroke):
    font = ImageFont.truetype(font_path, size)
    l, t, r, b = font.getbbox(text, stroke_width=stroke)
    pad = 4
    im = Image.new("RGBA", (r - l + 2 * pad, b - t + 2 * pad), (0, 0, 0, 0))
    ImageDraw.Draw(im).text((pad - l, pad - t), text, font=font, fill=fill,
                            stroke_width=stroke, stroke_fill=WHITE if stroke else None)
    return im


def main():
    for game, phrases in GAMES.items():
        assets = os.path.join(ROOT, game, "Assets")
        backup = os.path.join(ROOT, game, "Build", "vi_text_backup")
        os.makedirs(backup, exist_ok=True)
        for key, spec in phrases.items():
            path = os.path.join(assets, key + ".png")
            keep = os.path.join(backup, key + ".png")
            if os.path.exists(path) and not os.path.exists(keep):
                shutil.copy(path, keep)
            im = render(*spec)
            im.save(path)
            print(game[:4], key, im.size)


if __name__ == "__main__":
    main()
