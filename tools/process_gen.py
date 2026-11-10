"""Key the white backdrop out of freshly generated fish sprites and write the
final transparent WebP into assets/fish/.

Reuses the keying/cropping helpers from build_assets.py.
"""
import os
import sys

from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from build_assets import key_out, save_webp, to_sprite  # noqa: E402

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ROOT = os.path.join(BASE, "assets")
GEN = os.path.join(ROOT, "gen")
FISH = os.path.join(ROOT, "fish")


def main():
    os.makedirs(FISH, exist_ok=True)
    files = sorted(f for f in os.listdir(GEN) if f.endswith(".png"))
    if not files:
        print("nothing to process")
        return 0
    processed = 0
    for filename in files:
        fish_id = filename[:-4]
        out = os.path.join(FISH, f"{fish_id}.webp")
        if os.path.exists(out) and os.path.getmtime(out) >= os.path.getmtime(os.path.join(GEN, filename)):
            continue
        with Image.open(os.path.join(GEN, filename)) as source:
            sprite = to_sprite(key_out(source.convert("RGB")), 256)
        if sprite is None:
            print(f"{fish_id}: empty after keying")
            continue
        save_webp(sprite, out, quality=90)
        processed += 1
        print(f"{fish_id}: {os.path.getsize(out)} bytes")
    print(f"processed {processed} of {len(files)} generated images")
    return 0


if __name__ == "__main__":
    sys.exit(main())
