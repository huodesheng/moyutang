"""Locate the painted float in each pond scene by looking for the bright red bulb."""
import os

from PIL import Image

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ROOT = os.path.join(BASE, "assets", "ponds")
PONDS = ["newbie-creek", "caffeine-lake", "bug-swamp", "overtime-sea", "context-abyss", "whale-fall"]

for pond in PONDS:
    path = os.path.join(ROOT, f"{pond}.webp")
    with Image.open(path) as image:
        rgb = image.convert("RGB")
    width, height = rgb.size
    pixels = rgb.load()
    hits = []
    for y in range(0, height, 2):
        for x in range(0, width, 2):
            r, g, b = pixels[x, y]
            if r > 175 and g < 95 and b < 95 and r - g > 90:
                hits.append((x, y))
    if not hits:
        print(f"{pond:14s} no red float found")
        continue
    # keep the densest cluster (the float bulb is the largest red blob)
    hits.sort()
    clusters = []
    for x, y in hits:
        placed = False
        for cluster in clusters:
            cx, cy, n = cluster
            if abs(cx / n - x) < width * 0.05 and abs(cy / n - y) < height * 0.05:
                cluster[0] += x
                cluster[1] += y
                cluster[2] += 1
                placed = True
                break
        if not placed:
            clusters.append([x, y, 1])
    clusters.sort(key=lambda c: c[2], reverse=True)
    print(f"{pond:14s} red pixels={len(hits)}")
    for cx, cy, n in clusters[:3]:
        print(f"    cluster n={n:4d} at {cx / n / width * 100:5.1f}% , {cy / n / height * 100:5.1f}%")
