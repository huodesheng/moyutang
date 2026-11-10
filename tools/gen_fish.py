"""Generate the missing fish sprites through the async image API, 3 at a time.

Reads assets/prompts/fish.json, skips ids that already have a generated PNG in
assets/gen/, and writes a progress log to assets/gen.log.
"""
import concurrent.futures
import json
import os
import sys
import time
import urllib.request

BASE = "https://api.goeasyapi.xyz"
BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ROOT = os.path.join(BASE, "assets")
GEN = os.path.join(ROOT, "gen")
LOG = os.path.join(ROOT, "gen.log")
MODEL = "gpt-image-2-async"
SIZE = "1024x1024"
WORKERS = 3
TIMEOUT = 420


def read_key():
    path = os.path.join(os.environ.get("TEMP", "."), "moyutang-goeasy-key.txt")
    with open(path, "r", encoding="utf-8") as fh:
        return fh.read().strip()


KEY = read_key()


def api(method, url, payload=None):
    data = None
    headers = {"Authorization": f"Bearer {KEY}"}
    if payload is not None:
        data = json.dumps(payload).encode("utf-8")
        headers["Content-Type"] = "application/json"
    request = urllib.request.Request(url, data=data, headers=headers, method=method)
    with urllib.request.urlopen(request, timeout=120) as response:
        return json.loads(response.read().decode("utf-8"))


def log(line):
    stamp = time.strftime("%H:%M:%S")
    text = f"[{stamp}] {line}"
    print(text, flush=True)
    with open(LOG, "a", encoding="utf-8") as fh:
        fh.write(text + "\n")


def build_prompt(manifest, entry):
    palette = manifest["palettes"][entry["pond"]]
    return (
        f'Pixel art game sprite, cozy fishing-game collectible: {entry["visual"]}. '
        f'Style: {manifest["style"]}. '
        f"Palette: {palette}."
    )


def download(url, path):
    request = urllib.request.Request(
        url,
        headers={
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
            "Referer": "https://api.goeasyapi.xyz/",
            "Accept": "image/*,*/*;q=0.8",
        },
    )
    with urllib.request.urlopen(request, timeout=180) as response:
        blob = response.read()
    with open(path, "wb") as fh:
        fh.write(blob)
    return len(blob)


def generate(manifest, entry):
    fish_id = entry["id"]
    out = os.path.join(GEN, f"{fish_id}.png")
    if os.path.exists(out) and os.path.getsize(out) > 10000:
        return (fish_id, "cached")
    prompt = build_prompt(manifest, entry)
    for attempt in (1, 2):
        try:
            created = api("POST", f"{BASE}/api/image-tasks/generations",
                          {"model": MODEL, "prompt": prompt, "size": SIZE, "quality": "auto"})
            task_id = created.get("id")
            if not task_id:
                return (fish_id, f"no-task {json.dumps(created, ensure_ascii=False)[:120]}")
            started = time.time()
            while time.time() - started < TIMEOUT:
                time.sleep(5)
                result = api("GET", f"{BASE}/api/image-tasks?ids={task_id}")
                items = result.get("items") or []
                if not items:
                    continue
                item = items[0]
                status = item.get("status")
                if status == "success":
                    data = item.get("data") or []
                    if data and data[0].get("url"):
                        size = download(data[0]["url"], out)
                        return (fish_id, f"ok {size} bytes {int(time.time() - started)}s")
                    return (fish_id, "success without url")
                if status in ("failure", "failed", "error", "cancelled"):
                    if attempt == 2:
                        return (fish_id, "failed")
                    break
            else:
                if attempt == 2:
                    return (fish_id, "timeout")
            time.sleep(3)
        except Exception as error:  # noqa: BLE001 - report and continue with the batch
            if attempt == 2:
                return (fish_id, f"error {error}")
            time.sleep(5)
    return (fish_id, "unknown")


def main():
    os.makedirs(GEN, exist_ok=True)
    with open(os.path.join(ROOT, "prompts", "fish.json"), "r", encoding="utf-8") as fh:
        manifest = json.load(fh)
    pending = [entry for entry in manifest["fish"]]
    log(f"start: {len(pending)} fish, model={MODEL}, workers={WORKERS}")
    done = 0
    with concurrent.futures.ThreadPoolExecutor(max_workers=WORKERS) as pool:
        futures = {pool.submit(generate, manifest, entry): entry["id"] for entry in pending}
        for future in concurrent.futures.as_completed(futures):
            fish_id, status = future.result()
            done += 1
            log(f"{done}/{len(pending)} {fish_id}: {status}")
    ok = len([f for f in os.listdir(GEN) if f.endswith(".png")])
    log(f"finished: {ok} files in assets/gen")
    return 0 if ok >= len(pending) else 1


if __name__ == "__main__":
    sys.exit(main())
