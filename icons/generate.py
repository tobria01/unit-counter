#!/usr/bin/env python3
"""Generate the app icons (PNG) for Unit Counter.

Run from the repo root:  python3 icons/generate.py
Requires Pillow:          pip install pillow
"""
from PIL import Image, ImageDraw

BG = (16, 20, 28)       # dark background
TRACK = (44, 52, 70)    # remaining track of the donut
GREEN = (52, 199, 89)   # consumed portion of the donut

SS = 4  # supersampling factor for smooth edges


def draw_donut(size: int, scale: float = 1.0) -> Image.Image:
    big = size * SS
    img = Image.new("RGB", (big, big), BG)
    d = ImageDraw.Draw(img)
    cx = cy = big / 2
    outer = big * 0.30 * scale
    inner = big * 0.225 * scale
    width = max(2, int(outer - inner))
    box = [cx - outer, cy - outer, cx + outer, cy + outer]
    d.arc(box, 0, 360, fill=TRACK, width=width)
    d.arc(box, -90, -90 + 270, fill=GREEN, width=width)  # 75% from the top
    return img.resize((size, size), Image.LANCZOS)


def main() -> None:
    draw_donut(180).save("icons/apple-touch-icon.png")
    draw_donut(192).save("icons/icon-192.png")
    draw_donut(512).save("icons/icon-512.png")
    draw_donut(512, scale=0.8).save("icons/icon-maskable-512.png")
    draw_donut(32).save("icons/favicon-32.png")
    print("icons written")


if __name__ == "__main__":
    main()
