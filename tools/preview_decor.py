"""Composite what the pond scene looks like with decorations placed, sized like
the real panel (930x400 cover crop)."""
import os

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
POOL = os.path.join(ROOT, "assets")
OUT = os.path.join(POOL, "decor_preview.png")

SLOTS = [(4, 3), (19, 5), (63, 2), (79, 4)]
ITEMS = ["hut", "chair", "chime", "cat"]
SIZES = [72, 58]

scene_w, scene_h = 930, 400
with Image.open(os.path.join(POOL, "ponds", "newbie-creek.webp")) as source:
    art = source.convert("RGB")
scale = max(scene_w / art.width, scene_h / art.height)
resized = art.resize((int(art.width * scale) + 1, int(art.height * scale) + 1), Image.LANCZOS)
left = (resized.width - scene_w) // 2
top = (resized.height - scene_h) // 2
base = resized.crop((left, top, left + scene_w, top + scene_h))

sheet = Image.new("RGB", (scene_w, scene_h * 2 + 12), (16, 18, 22))
for index, size in enumerate(SIZES):
    tile = base.copy()
    for slot, item_id in zip(SLOTS, ITEMS):
        with Image.open(os.path.join(POOL, "items", f"{item_id}.webp")) as raw:
            icon = raw.convert("RGBA").resize((size, size), Image.LANCZOS)
        x = int(scene_w * slot[0] / 100)
        y = scene_h - int(scene_h * slot[1] / 100) - size
        tile.paste(icon, (x, y), icon)
    sheet.paste(tile, (0, index * (scene_h + 12)))
sheet.save(OUT)
print(OUT, sheet.size)
