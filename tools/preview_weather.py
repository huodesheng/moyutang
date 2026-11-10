"""Approximate the weather layers (storm rain + flash, sunny glow) over a pond
scene at real panel size, so the effect can be judged without a browser."""
import math
import os

from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
POOL = os.path.join(ROOT, "assets")
OUT = os.path.join(POOL, "weather_preview.png")

scene_w, scene_h = 930, 400

with Image.open(os.path.join(POOL, "ponds", "ovechain.webp" if False else "overtime-sea.webp")) as source:
    art = source.convert("RGB")
scale = max(scene_w / art.width, scene_h / art.height)
resized = art.resize((int(art.width * scale) + 1, int(art.height * scale) + 1), Image.LANCZOS)
left = (resized.width - scene_w) // 2
top = (resized.height - scene_h) // 2
base = resized.crop((left, top, left + scene_w, top + scene_h))


def storm_frame(flash):
    tile = base.convert("RGB").copy()
    dark = Image.new("RGB", (scene_w, scene_h), (16, 24, 42))
    tile = Image.blend(tile, dark, 0.42)
    overlay = Image.new("RGBA", (scene_w, scene_h), (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    angle = math.radians(100)
    dx, dy = math.sin(angle), math.cos(angle)
    step = 6
    for offset in range(-scene_h, scene_w + scene_h, step):
        x0 = offset
        y0 = 0
        length = scene_h * 1.6
        draw.line(
            [(x0, y0), (x0 + dx * length, y0 + dy * length)],
            fill=(190, 220, 255, 90),
            width=1,
        )
    tile = Image.alpha_composite(tile.convert("RGBA"), overlay).convert("RGB")
    if flash:
        tile = Image.blend(tile, Image.new("RGB", (scene_w, scene_h), (233, 242, 255)), 0.45)
    return tile


def sunny_frame():
    tile = base.convert("RGB").copy()
    glow = Image.new("L", (scene_w, scene_h), 0)
    draw = ImageDraw.Draw(glow)
    cx, cy, r = int(scene_w * 0.76), int(scene_h * 0.06), int(scene_w * 0.5)
    for i in range(r, 0, -4):
        alpha = int(70 * (1 - i / r) ** 2)
        draw.ellipse([cx - i, cy - i, cx + i, cy + i], fill=alpha)
    warm = Image.new("RGB", (scene_w, scene_h), (255, 238, 180))
    return Image.composite(warm, tile, glow)


sheet = Image.new("RGB", (scene_w, scene_h * 3 + 24), (16, 18, 22))
sheet.paste(sunny_frame(), (0, 0))
sheet.paste(storm_frame(False), (0, scene_h + 12))
sheet.paste(storm_frame(True), (0, scene_h * 2 + 24))
sheet.save(OUT)
print(OUT, sheet.size)
