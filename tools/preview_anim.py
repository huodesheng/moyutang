"""Storyboard check: composite the cast/bite overlays onto the pond art so the
anchors (rod tip, float spot, line sag) can be eyeballed without a browser."""
import math
import os

from PIL import Image, ImageDraw

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ROOT = os.path.join(BASE, "assets")
OUT = os.path.join(ROOT, "preview_anim.png")

PONDS = {
    "newbie-creek": {"from": (48, 17), "float": (47.7, 45)},
    "caffeine-lake": {"from": (52.4, 46), "float": (52.6, 65.5)},
    "bug-swamp": {"from": (6, 104), "float": (52, 62)},
}
PHASES = ["charging", "casting", "waiting", "bite"]

cell_w, cell_h = 430, 242
pad = 10
sheet = Image.new("RGB", (cell_w * len(PHASES) + pad * (len(PHASES) + 1),
                          cell_h * len(PONDS) + pad * (len(PONDS) + 1)), (18, 20, 24))

with Image.open(os.path.join(ROOT, "items", "bobber.webp")) as raw:
    bobber = raw.convert("RGBA").resize((20, 20), Image.LANCZOS)


def px(percent, size):
    return percent / 100 * size


def draw_quad(draw, a, b, sag, colour, width):
    control = ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2 + sag)
    points = []
    for step in range(25):
        t = step / 24
        x = (1 - t) ** 2 * a[0] + 2 * (1 - t) * t * control[0] + t * t * b[0]
        y = (1 - t) ** 2 * a[1] + 2 * (1 - t) * t * control[1] + t * t * b[1]
        points.append((x, y))
    draw.line(points, fill=colour, width=width)


for row, (pond_id, anchor) in enumerate(PONDS.items()):
    with Image.open(os.path.join(ROOT, "ponds", f"{pond_id}.webp")) as source:
        base = source.convert("RGB").resize((cell_w, cell_h), Image.LANCZOS)
    start = (px(anchor["from"][0], cell_w), px(anchor["from"][1], cell_h))
    rest = (px(anchor["float"][0], cell_w), px(anchor["float"][1], cell_h))
    for column, phase in enumerate(PHASES):
        tile = base.copy()
        draw = ImageDraw.Draw(tile, "RGBA")
        if phase == "charging":
            radius = 14
            draw.ellipse([rest[0] - radius, rest[1] - radius * 0.45, rest[0] + radius, rest[1] + radius * 0.45],
                         outline=(255, 255, 255, 220), width=2)
        elif phase == "casting":
            t = 0.45
            ease = 1 - (1 - t) ** 2.2
            x = start[0] + (rest[0] - start[0]) * ease
            y = start[1] + (rest[1] - start[1]) * ease - math.sin(math.pi * t) * 15 / 100 * cell_h
            draw_quad(draw, start, (x, y), 2, (255, 255, 255, 190), 1)
            tile.paste(bobber, (int(x - 13), int(y - 13)), bobber)
        elif phase == "waiting":
            draw_quad(draw, start, rest, 8, (255, 255, 255, 170), 1)
            tile.paste(bobber, (int(rest[0] - 13), int(rest[1] - 13)), bobber)
            for scale, alpha in ((0.5, 210), (0.9, 140)):
                draw.ellipse([rest[0] - 26 * scale, rest[1] - 10 * scale,
                              rest[0] + 26 * scale, rest[1] + 10 * scale],
                             outline=(255, 255, 255, alpha), width=2)
        else:
            draw_quad(draw, start, rest, 6, (255, 255, 255, 170), 1)
            tile.paste(bobber, (int(rest[0] - 13), int(rest[1] - 13 + 7)), bobber)
            for scale in (0.4, 0.75, 1.1):
                draw.ellipse([rest[0] - 26 * scale, rest[1] - 10 * scale,
                              rest[0] + 26 * scale, rest[1] + 10 * scale],
                             outline=(255, 255, 255, 170), width=2)
            draw.rectangle([rest[0] - 18, rest[1] - 34, rest[0] + 18, rest[1] - 16], fill=(226, 86, 77, 235))
            draw.text((rest[0] - 14, rest[1] - 31), "bite!", fill=(255, 255, 255))
        x = pad + column * (cell_w + pad)
        y = pad + row * (cell_h + pad)
        sheet.paste(tile, (x, y))
        draw2 = ImageDraw.Draw(sheet)
        draw2.text((x + 4, y + 4), f"{pond_id} / {phase}", fill=(255, 255, 0))

sheet.save(OUT)
print(OUT, sheet.size)
