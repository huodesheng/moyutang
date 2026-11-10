"""Zoom crops around the painted float so its position can be read precisely."""
import os

from PIL import Image, ImageDraw

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ROOT = os.path.join(BASE, "assets")
OUT = os.path.join(ROOT, "zoom_floats.png")
CASES = [
    ("newbie-creek", 44, 26, 12),
    ("caffeine-lake", 53, 45, 10),
]
scale = 4
cell = 320
sheet = Image.new("RGB", (cell * len(CASES) + 10 * (len(CASES) + 1), cell + 20), (20, 22, 26))

for index, (pond, cx, cy, half) in enumerate(CASES):
    with Image.open(os.path.join(ROOT, "ponds", f"{pond}.webp")) as source:
        image = source.convert("RGB")
    width, height = image.size
    left = int((cx - half) / 100 * width)
    right = int((cx + half) / 100 * width)
    top = int((cy - half) / 100 * height)
    bottom = int((cy + half) / 100 * height)
    crop = image.crop((left, top, right, bottom)).resize((cell, cell), Image.NEAREST)
    draw = ImageDraw.Draw(crop)
    # crosshair at the intended anchor
    draw.line([(cell // 2 - 14, cell // 2), (cell // 2 + 14, cell // 2)], fill=(0, 255, 0), width=1)
    draw.line([(cell // 2, cell // 2 - 14), (cell // 2, cell // 2 + 14)], fill=(0, 255, 0), width=1)
    for step in range(1, 10):
        offset = int(cell * step / 10)
        draw.line([(offset, 0), (offset, cell)], fill=(255, 255, 255, 40), width=1)
        draw.line([(0, offset), (cell, offset)], fill=(255, 255, 255, 40), width=1)
    x = 10 + index * (cell + 10)
    sheet.paste(crop, (x, 20))
    ImageDraw.Draw(sheet).text((x + 4, 4), f"{pond}: centre = {cx}% , {cy}%  (+/-{half}%)", fill=(255, 255, 0))

sheet.save(OUT)
print(OUT, sheet.size)
