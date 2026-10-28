#!/usr/bin/env python3
"""'CHỌN VIDEO 60S' intro text (user 2026-10-11): shown above RECORD TO PLAY before a round,
replacing the Publish-form 60 s hint. Same style as the guide hints (make_guide_assets.render).
Writes <game>/Build/guide/hint_60s.png for all 5 games."""
import os
from make_guide_assets import ROOT, render

GAMES = [d for d in sorted(os.listdir(ROOT)) if d[:1] in "12345" and "Filter" in d]

if __name__ == "__main__":
    im = render("CHỌN VIDEO 60S", size=60, stroke=6)
    for g in GAMES:
        out = os.path.join(ROOT, g, "Build", "guide")
        os.makedirs(out, exist_ok=True)
        im.save(os.path.join(out, "hint_60s.png"))
    print(im.size, GAMES)
