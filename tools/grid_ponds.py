"""Contact sheet of the six pond scenes with a 10% grid, to read anchors."""
import os
from PIL import Image, ImageDraw

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ROOT = os.path.join(BASE, "assets", "ponds")
OUT = os.path.join(BASE, "assets", "grid_ponds.png")
PONDS = ["newbie-creek", "caffeine-lake", "bug-swamp", "overtime-sea", "context-abyss", "whale-fall"]

thumb_w, thumb_h = 430, 242
padding = 26
sheet = Image.new("RGB", (thumb_w * 2 + padding * 3, (thumb_h + padding) * 3 + padding), (24, 26, 30))
draw = ImageDraw.Draw(sheet)

for index, name in enumerate(PONDS):
    path = os.path.join(ROOT, f"{name}.webp")
    with Image.open(path) as image:
        thumb = image.convert("RGB").resize((thumb_w, thumb_h), Image.LANCZOS)
    x = padding + (index % 2) * (thumb_w + padding)
    y = padding + (index // 2) * (thumb_h + padding)
    sheet.paste(thumb, (x, y))
    for percent in range(10, 100, 10):
        gx = x + int(thumb_w * percent / 100)
        gy = y + int(thumb_h * percent / 100)
        colour = (255, 80, 80) if percent % 50 == 0 else (255, 255, 255)
        draw.line([(gx, y), (gx, y + thumb_h)], fill=colour, width=1)
        draw.line([(x, gy), (x + thumb_w, gy)], fill=colour, width=1)
    draw.text((x + 4, y + 4), name, fill=(255, 255, 0))
    for percent in (10, 30, 50, 70, 90):
        draw.text((x + int(thumb_w * percent / 100) + 2, y + 6), str(percent), fill=(255, 255, 0))

sheet.save(OUT)
print(OUT, sheet.size)
