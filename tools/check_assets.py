"""Compose verification sheets: each sprite scaled into a fixed cell over a
checkerboard, so leftover backdrop, halos and clipping are obvious."""
import os
from PIL import Image, ImageDraw

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(BASE, "assets")


def grid_background(width, height, cell=16):
    image = Image.new("RGB", (width, height), (60, 64, 72))
    draw = ImageDraw.Draw(image)
    for y in range(0, height, cell):
        for x in range(0, width, cell):
            if (x // cell + y // cell) % 2 == 0:
                draw.rectangle([x, y, x + cell - 1, y + cell - 1], fill=(96, 100, 110))
    return image


def sheet(directory, cell, pad, per_row, name):
    files = sorted(f for f in os.listdir(os.path.join(OUT, directory)) if f.endswith(".webp"))
    rows = (len(files) + per_row - 1) // per_row
    unit = cell + pad * 2 + 14
    canvas = grid_background(per_row * unit, rows * unit)
    draw = ImageDraw.Draw(canvas)
    for index, filename in enumerate(files):
        with Image.open(os.path.join(OUT, directory, filename)) as sprite:
            sprite = sprite.convert("RGBA")
        sprite.thumbnail((cell, cell), Image.LANCZOS)
        x = (index % per_row) * unit + pad
        y = (index // per_row) * unit + pad
        canvas.paste(sprite, (x + (cell - sprite.width) // 2, y + (cell - sprite.height) // 2), sprite)
        draw.text((x + 2, y + cell + 2), filename.replace(".webp", ""), fill=(255, 255, 255))
    path = os.path.join(OUT, name)
    canvas.save(path)
    print(path, canvas.size, len(files))


sheet("fish", 110, 6, 6, "check_fish.png")
sheet("items", 84, 6, 6, "check_items.png")
