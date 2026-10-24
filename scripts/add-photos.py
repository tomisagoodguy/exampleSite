# /// script
# requires-python = ">=3.10"
# dependencies = ["pillow>=10", "pillow-heif>=0.16"]
# ///
"""把手機照片壓縮後放進破關地圖地點的照片資料夾。

平常用法（收件匣）：照片丟進 photos-inbox/<地點名稱>/，然後
    uv run scripts/add-photos.py
資料夾名稱用地點名稱就好（要在 .env 設 DATING_MAP_PASSPHRASE 才能查 id）；
同名地點有好幾個時改成「361 小油坑」直接指定 id。
說明寫在同資料夾的 說明.txt，每行「原檔名 說明」，例如「IMG_1234.HEIC 霧太大」。
處理完的原圖移到 photos-inbox/_done/，不會刪除，也不會進 git。

直接指定（不經收件匣）：
    uv run scripts/add-photos.py 361 a.heic b.jpg --caption "霧太大" --caption "硫磺味好重"

每張照片輸出兩個檔（EXIF 全部去掉，包含 GPS）：
    static/adventure-map/photos/<id>/NN.jpg        長邊 1600px
    static/adventure-map/photos/<id>/NN.thumb.jpg  長邊 400px，卡片縮圖用
並在同資料夾的 captions.txt 追加「NN.jpg 說明」，說明可事後直接改這個檔。
"""

from __future__ import annotations

import argparse
import glob
import json
import os
import re
import shutil
import sys
import urllib.parse
import urllib.request
from pathlib import Path

from PIL import Image, ImageOps
from pillow_heif import register_heif_opener

register_heif_opener()

ROOT = Path(__file__).resolve().parent.parent
PHOTO_ROOT = ROOT / "static" / "adventure-map" / "photos"
INBOX = ROOT / "photos-inbox"
DONE = INBOX / "_done"
INBOX_CAPTIONS = "說明.txt"
FAILURE_NOTE = "處理失敗.txt"
IMAGE_EXT = {".jpg", ".jpeg", ".png", ".heic", ".heif", ".webp"}
FULL_EDGE = 1600
THUMB_EDGE = 400

# 與 layouts/adventure-map/list.html 相同的 publishable key，設計上可公開
SUPABASE_URL = "https://zvomerdcsxvuymnpuvxk.supabase.co"
SUPABASE_KEY = "sb_publishable_xAprCS1COLD7ePcF08buGw_LHfh6d9q"


def next_number(folder: Path) -> int:
    """回傳資料夾裡下一個可用的流水號。"""
    nums = [int(p.stem) for p in folder.glob("*.jpg") if p.stem.isdigit()]
    return max(nums, default=0) + 1


def save_resized(img: Image.Image, edge: int, dest: Path, quality: int) -> None:
    """縮到長邊 edge 後存成不含 EXIF 的 JPEG。"""
    copy = img.copy()
    copy.thumbnail((edge, edge), Image.Resampling.LANCZOS)
    copy.save(dest, "JPEG", quality=quality, optimize=True, progressive=True)


def add_photos(place_id: int, sources: list[Path], captions: list[str]) -> None:
    """壓縮 sources 存進 photos/<place_id>/，captions 依序對應每張。"""
    folder = PHOTO_ROOT / str(place_id)
    folder.mkdir(parents=True, exist_ok=True)
    n = next_number(folder)
    lines: list[str] = []

    for i, src in enumerate(sources):
        with Image.open(src) as raw:
            # 先依 EXIF 方向轉正，之後存檔不帶 EXIF，方向資訊才不會遺失
            img = ImageOps.exif_transpose(raw).convert("RGB")
        name = f"{n:02d}.jpg"
        save_resized(img, FULL_EDGE, folder / name, quality=82)
        save_resized(img, THUMB_EDGE, folder / f"{n:02d}.thumb.jpg", quality=75)
        caption = captions[i] if i < len(captions) else ""
        lines.append(f"{name} {caption}".rstrip())
        size_kb = (folder / name).stat().st_size // 1024
        print(f"  ✓ {src.name} → {place_id}/{name}（{size_kb} KB）{caption}")
        n += 1

    caption_file = folder / "captions.txt"
    existing = caption_file.read_text(encoding="utf-8") if caption_file.exists() else ""
    if existing and not existing.endswith("\n"):
        existing += "\n"
    caption_file.write_text(existing + "\n".join(lines) + "\n", encoding="utf-8", newline="\n")


def load_passphrase() -> str | None:
    """環境變數優先，其次讀專案根目錄 .env 的 DATING_MAP_PASSPHRASE。"""
    if os.environ.get("DATING_MAP_PASSPHRASE"):
        return os.environ["DATING_MAP_PASSPHRASE"]
    env = ROOT / ".env"
    if env.exists():
        for line in env.read_text(encoding="utf-8").splitlines():
            key, _, value = line.partition("=")
            if key.strip() == "DATING_MAP_PASSPHRASE":
                return value.strip().strip("\"'")
    return None


def check_passphrase(passphrase: str) -> bool:
    """密碼錯時 RLS 只會回空陣列，看起來像「找不到地點」，所以先驗一次。"""
    req = urllib.request.Request(
        f"{SUPABASE_URL}/rest/v1/rpc/dating_map_check_passphrase",
        data=json.dumps({"p_passphrase": passphrase}).encode(),
        headers={"apikey": SUPABASE_KEY, "Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=15) as res:
        return json.load(res) is True


def query_places(passphrase: str, name_filter: str) -> list[dict]:
    """以 PostgREST 篩選式查地點，例如 name_filter='eq.小油坑'。"""
    qs = urllib.parse.urlencode({"select": "id,name,area,status", "name": name_filter})
    req = urllib.request.Request(
        f"{SUPABASE_URL}/rest/v1/dating_map_places?{qs}",
        headers={"apikey": SUPABASE_KEY, "x-dating-map-pass": passphrase},
    )
    with urllib.request.urlopen(req, timeout=15) as res:
        return json.load(res)


def resolve_place(folder_name: str, passphrase: str | None) -> int | str:
    """資料夾名稱 → 地點 id。開頭是數字就直接當 id；否則用名稱查資料庫。失敗時回傳原因文字。"""
    m = re.match(r"^(\d+)\b", folder_name)
    if m:
        return int(m.group(1))
    if not passphrase:
        return "要用名稱查地點，請在 .env 設 DATING_MAP_PASSPHRASE=<破關地圖密碼>，或把資料夾改成「id 名稱」"
    hits = query_places(passphrase, f"eq.{folder_name}")
    if not hits:
        hits = query_places(passphrase, f"ilike.*{folder_name}*")
    if len(hits) == 1:
        print(f"  → {hits[0]['name']}（id {hits[0]['id']}，{hits[0].get('area') or '無地區'}）")
        return int(hits[0]["id"])
    if not hits:
        return "資料庫找不到這個地點，請確認名稱，或先在破關地圖新增"
    lines = [f"  {h['id']} {h['name']}（{h.get('area') or '無地區'}）" for h in hits[:10]]
    return "符合的地點不只一個，把資料夾改名成「id 名稱」（例如「361 小油坑」）：\n" + "\n".join(lines)


def read_inbox_captions(folder: Path) -> dict[str, str]:
    """讀收件匣資料夾的 說明.txt：每行「原檔名 說明」。"""
    path = folder / INBOX_CAPTIONS
    if not path.exists():
        return {}
    result: dict[str, str] = {}
    for line in path.read_text(encoding="utf-8-sig").splitlines():
        name, _, caption = line.strip().partition(" ")
        if name and caption.strip():
            result[name.lower()] = caption.strip()
    return result


def unique_dest(path: Path) -> Path:
    """_done 裡已有同名資料夾時加上編號，避免覆蓋上次的原圖。"""
    candidate, i = path, 2
    while candidate.exists():
        candidate = path.with_name(f"{path.name} ({i})")
        i += 1
    return candidate


def run_inbox() -> int:
    """處理 photos-inbox/ 底下每個資料夾。"""
    INBOX.mkdir(exist_ok=True)
    folders = sorted(p for p in INBOX.iterdir() if p.is_dir() and p != DONE)
    if not folders:
        print(f"收件匣是空的：把照片放進 {INBOX}\\<地點名稱>\\ 再執行一次")
        return 0

    passphrase = load_passphrase()
    if passphrase and not check_passphrase(passphrase):
        print("✗ .env 的 DATING_MAP_PASSPHRASE 不對，用名稱查地點會失敗（資料夾開頭寫 id 的照常處理）")
        passphrase = None
    failed = 0
    for folder in folders:
        images = sorted(p for p in folder.iterdir() if p.suffix.lower() in IMAGE_EXT)
        print(f"📁 {folder.name}（{len(images)} 張）")
        if not images:
            continue
        place_id = resolve_place(folder.name, passphrase)
        failure = folder / FAILURE_NOTE
        if isinstance(place_id, str):
            # 寫進資料夾裡，打開收件匣就看得到為什麼沒處理
            print("  ✗ " + place_id)
            failure.write_text(place_id + "\n", encoding="utf-8")
            failed += 1
            continue
        failure.unlink(missing_ok=True)
        captions = read_inbox_captions(folder)
        add_photos(place_id, images, [captions.get(p.name.lower(), "") for p in images])
        DONE.mkdir(exist_ok=True)
        shutil.move(str(folder), str(unique_dest(DONE / folder.name)))

    if failed:
        print(f"⚠️ {failed} 個資料夾沒處理，留在收件匣裡，修正後再執行一次")
    print("完成後 commit + push 即上線；說明可再改 static/adventure-map/photos/<id>/captions.txt")
    return 1 if failed else 0


def expand(patterns: list[str]) -> list[Path]:
    """展開萬用字元（PowerShell 不會自己展開）。"""
    paths: list[Path] = []
    for pat in patterns:
        hits = sorted(glob.glob(pat)) or [pat]
        paths.extend(Path(h) for h in hits)
    return paths


def main() -> int:
    # Windows 終端預設 cp950，印 ✓ 會 UnicodeEncodeError
    sys.stdout.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser(description="壓縮照片並加到破關地圖地點；不帶參數就處理 photos-inbox/")
    parser.add_argument("place_id", type=int, nargs="?", help="dating_map_places.id")
    parser.add_argument("images", nargs="*", help="照片路徑，可用 *.jpg")
    parser.add_argument("--caption", action="append", default=[], help="依序對應每張照片的說明")
    args = parser.parse_args()

    if args.place_id is None:
        return run_inbox()
    if not args.images:
        parser.error("指定地點 id 時要給照片路徑")

    sources = expand(args.images)
    missing = [p for p in sources if not p.is_file()]
    if missing:
        print("找不到檔案：" + "、".join(map(str, missing)), file=sys.stderr)
        return 1
    add_photos(args.place_id, sources, args.caption)
    return 0


if __name__ == "__main__":
    sys.exit(main())
