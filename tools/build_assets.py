"""Turn the docx artwork into web assets.

- assets/raw/*.jpeg  : the six pond scenes (16:9, 02-07)
- assets/raw/09..20  : single fish sprites, checkerboard baked into the pixels
- assets/raw/08      : 4x3 fish contact sheet on cream
- assets/raw/21      : 4x4 shop-item contact sheet on cream
- assets/raw/22..27  : extra item sprites, checkerboard baked in

Output:
- assets/ponds/<pondId>.webp   1280x720
- assets/fish/<fishId>.webp    256x256, transparent
- assets/items/<itemId>.webp   128x128, transparent
"""
import os
import sys
from collections import deque

from PIL import Image, ImageFilter

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(BASE, "assets", "raw")
OUT = os.path.join(BASE, "assets")

PONDS = [
    ("02_image2.jpeg", "newbie-creek"),
    ("03_image3.jpeg", "caffeine-lake"),
    ("04_image4.jpeg", "bug-swamp"),
    ("05_image5.jpeg", "overtime-sea"),
    ("06_image6.jpeg", "context-abyss"),
    ("07_image7.jpeg", "whale-fall"),
]

# single sprites: file -> fish id
FISH_SINGLE = {
    "09_image9.png": "moyu",
    "10_image10.png": "xintiao",
    "11_image11.png": "natie",
    "12_image12.png": "buglu",
    "13_image13.png": "youling",
    "14_image14.png": "zhengze",
    "15_image15.png": "digui",
    "16_image16.png": "neicun",
    "17_image17.png": "zhouwu2",
    "18_image18.png": "huigui",
    "19_image19.png": "denglong",
    "20_image20.png": "jing",
}

# contact sheets: (file, columns, rows, ids in reading order)
SHEETS = [
    (
        "08_image8.png",
        4,
        3,
        [
            # row 1 (duplicates of the single sprites, redrawn) -> keep as alternates
            "moyu_b", "huashui", "natie_b", "buglu_b",
            # row 2
            "youling_b", "zhengze_b", "digui_b", "neicun_b",
            # row 3
            "zhouwu2_b", "yasuo", "denglong_b", "jing_b",
        ],
    ),
]

ITEM_SHEET = ("21_image21.png", 4, 4, [
    "bamboo", "carbon", "keyboard", "whalebone",
    "bread", "coffee", "bug", "chain",
    "glow", "steel", "charm", "weather",
    "hut", "chair", "chime", "cat",
])

# The whale wind chime hangs across two grid rows (the wooden tag above the
# whale), so it is cut by hand instead of by the uniform grid.
ITEM_MANUAL = {
    "chime": (752, 486, 1168, 1024),
}
ITEM_SKIP = {"charm"}

ITEM_SINGLE = {
    "22_image22.png": "rod",
    "23_image23.png": "baitbag",
    "24_image24.png": "bobber",
    "25_image25.png": "spool",
    "26_image26.png": "bottle",
    "27_image27.png": "sign",
}


def border_references(image):
    width, height = image.size
    pixels = image.load()
    points = [(1, 1), (width - 2, 1), (1, height - 2), (width - 2, height - 2),
              (width // 2, 1), (width // 2, height - 2), (1, height // 2), (width - 2, height // 2),
              (width // 4, 1), (3 * width // 4, height - 2)]
    return [pixels[x, y][:3] for x, y in points]


def key_out(image, tolerance=26):
    """Flood-fill the flat backdrop from the borders; keep enclosed pixels."""
    image = image.convert("RGBA")
    width, height = image.size
    pixels = image.load()
    refs = border_references(image)

    def is_background(color):
        r, g, b = color[0], color[1], color[2]
        for ref in refs:
            if abs(r - ref[0]) + abs(g - ref[1]) + abs(b - ref[2]) <= tolerance * 3:
                return True
        return False

    seen = bytearray(width * height)
    queue = deque()
    for x in range(width):
        for y in (0, height - 1):
            if not seen[y * width + x] and is_background(pixels[x, y]):
                seen[y * width + x] = 1
                queue.append((x, y))
    for y in range(height):
        for x in (0, width - 1):
            if not seen[y * width + x] and is_background(pixels[x, y]):
                seen[y * width + x] = 1
                queue.append((x, y))

    while queue:
        x, y = queue.popleft()
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nx, ny = x + dx, y + dy
            if nx < 0 or ny < 0 or nx >= width or ny >= height:
                continue
            index = ny * width + nx
            if seen[index]:
                continue
            pixel = pixels[nx, ny]
            if pixel[3] == 0 or not is_background(pixel):
                continue
            seen[index] = 1
            queue.append((nx, ny))

    for y in range(height):
        row = y * width
        for x in range(width):
            if seen[row + x]:
                pixels[x, y] = (0, 0, 0, 0)
    return image


def to_sprite(image, size, padding=0.08):
    bbox = image.getbbox()
    if not bbox:
        return None
    cut = image.crop(bbox)
    inner = int(size * (1 - padding * 2))
    scale = min(inner / cut.width, inner / cut.height)
    target = (max(1, int(cut.width * scale)), max(1, int(cut.height * scale)))
    resized = cut.resize(target, Image.LANCZOS)
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    canvas.paste(resized, ((size - target[0]) // 2, (size - target[1]) // 2), resized)
    return canvas


def save_webp(image, path, quality=88):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    image.save(path, "WEBP", quality=quality, method=6)


def crop_cells(path, columns, rows):
    sheet = Image.open(path).convert("RGBA")
    width, height = sheet.size
    cell_w = width / columns
    cell_h = height / rows
    for row in range(rows):
        for column in range(columns):
            box = (int(column * cell_w), int(row * cell_h), int((column + 1) * cell_w), int((row + 1) * cell_h))
            yield row * columns + column, sheet.crop(box)


def main():
    report = []

    for filename, pond_id in PONDS:
        source = Image.open(os.path.join(RAW, filename)).convert("RGB")
        # crop to 16:9 then resize
        width, height = source.size
        target_ratio = 16 / 9
        if width / height > target_ratio:
            new_width = int(height * target_ratio)
            left = (width - new_width) // 2
            source = source.crop((left, 0, left + new_width, height))
        else:
            new_height = int(width / target_ratio)
            top = (height - new_height) // 2
            source = source.crop((0, top, width, top + new_height))
        source = source.resize((1280, 720), Image.LANCZOS)
        out = os.path.join(OUT, "ponds", f"{pond_id}.webp")
        save_webp(source, out, quality=82)
        report.append(("pond", pond_id, os.path.getsize(out)))

    for filename, fish_id in FISH_SINGLE.items():
        image = Image.open(os.path.join(RAW, filename))
        keyed = key_out(image)
        sprite = to_sprite(keyed, 256)
        if sprite is None:
            report.append(("fish", fish_id, "empty"))
            continue
        out = os.path.join(OUT, "fish", f"{fish_id}.webp")
        save_webp(sprite, out, quality=90)
        report.append(("fish", fish_id, os.path.getsize(out)))

    for filename, columns, rows, ids in SHEETS:
        for index, cell in crop_cells(os.path.join(RAW, filename), columns, rows):
            if index >= len(ids):
                break
            sprite = to_sprite(key_out(cell), 256)
            if sprite is None:
                report.append(("fish", ids[index], "empty"))
                continue
            out = os.path.join(OUT, "fish", f"{ids[index]}.webp")
            save_webp(sprite, out, quality=90)
            report.append(("fish", ids[index], os.path.getsize(out)))

    filename, columns, rows, ids = ITEM_SHEET
    for index, cell in crop_cells(os.path.join(RAW, filename), columns, rows):
        if index >= len(ids):
            break
        item_id = ids[index]
        if item_id in ITEM_SKIP:
            continue
        if item_id in ITEM_MANUAL:
            box = ITEM_MANUAL[item_id]
            cell = Image.open(os.path.join(RAW, filename)).convert("RGBA").crop(box)
        sprite = to_sprite(key_out(cell), 128, padding=0.06)
        if sprite is None:
            report.append(("item", item_id, "empty"))
            continue
        out = os.path.join(OUT, "items", f"{item_id}.webp")
        save_webp(sprite, out, quality=90)
        report.append(("item", item_id, os.path.getsize(out)))

    for filename, item_id in ITEM_SINGLE.items():
        sprite = to_sprite(key_out(Image.open(os.path.join(RAW, filename))), 128, padding=0.06)
        out = os.path.join(OUT, "items", f"{item_id}.webp")
        save_webp(sprite, out, quality=90)
        report.append(("item", item_id, os.path.getsize(out)))

    for kind, name, size in report:
        print(f"{kind:5s} {name:14s} {size}")
    print("total bytes:", sum(s for _, _, s in report if isinstance(s, int)))


if __name__ == "__main__":
    sys.exit(main())
