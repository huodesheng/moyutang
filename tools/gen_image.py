"""Generate one image through the GoEasyAPI async image endpoint and save it.

Usage:
  python gen_image.py --prompt-file prompt.txt --out assets/gen/x.png [--size 1024x1024] [--model image2-pro-async]

The key is read from %TEMP%\\moyutang-goeasy-key.txt so it never lives in the repo.
"""
import argparse
import json
import os
import sys
import time
import urllib.request
import urllib.error

BASE = "https://api.goeasyapi.xyz"


def read_key():
    path = os.path.join(os.environ.get("TEMP", "."), "moyutang-goeasy-key.txt")
    with open(path, "r", encoding="utf-8") as fh:
        return fh.read().strip()


def request(method, url, key, payload=None):
    data = None
    headers = {"Authorization": f"Bearer {key}"}
    if payload is not None:
        data = json.dumps(payload).encode("utf-8")
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    with urllib.request.urlopen(req, timeout=120) as response:
        return json.loads(response.read().decode("utf-8"))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--prompt-file", required=True)
    parser.add_argument("--out", required=True)
    parser.add_argument("--size", default="1024x1024")
    parser.add_argument("--quality", default="auto")
    parser.add_argument("--model", default="image2-pro-async")
    parser.add_argument("--timeout", type=int, default=300)
    args = parser.parse_args()

    with open(args.prompt_file, "r", encoding="utf-8") as fh:
        prompt = fh.read().strip()

    key = read_key()
    created = request(
        "POST",
        f"{BASE}/api/image-tasks/generations",
        key,
        {"model": args.model, "prompt": prompt, "size": args.size, "quality": args.quality},
    )
    task_id = created.get("id")
    if not task_id:
        print(json.dumps(created, ensure_ascii=False))
        return 2
    print(f"task={task_id}", flush=True)

    started = time.time()
    url = None
    last_status = None
    while time.time() - started < args.timeout:
        time.sleep(4)
        result = request("GET", f"{BASE}/api/image-tasks?ids={task_id}", key)
        items = result.get("items") or []
        if not items:
            continue
        item = items[0]
        status = item.get("status")
        if status != last_status:
            last_status = status
            print(f"status={status} progress={item.get('progress')}", flush=True)
        if status == "success":
            data = item.get("data") or []
            if data and data[0].get("url"):
                url = data[0]["url"]
            break
        if status in ("failure", "failed", "error", "cancelled"):
            print(json.dumps(item, ensure_ascii=False)[:600])
            return 3

    if not url:
        print("timeout, no image")
        return 4

    os.makedirs(os.path.dirname(os.path.abspath(args.out)), exist_ok=True)
    blob = None
    if data and data[0].get("b64_json"):
        import base64

        blob = base64.b64decode(data[0]["b64_json"])
    if blob is None:
        download = urllib.request.Request(
            url,
            headers={
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
                "Referer": "https://api.goeasyapi.xyz/",
                "Accept": "image/avif,image/webp,image/png,image/*,*/*;q=0.8",
            },
        )
        with urllib.request.urlopen(download, timeout=180) as response:
            blob = response.read()
    with open(args.out, "wb") as fh:
        fh.write(blob)
    print(f"saved {args.out} ({len(blob)} bytes) in {int(time.time() - started)}s url={url}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
