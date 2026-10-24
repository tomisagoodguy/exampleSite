# /// script
# requires-python = ">=3.10"
# dependencies = ["pillow>=10", "pillow-heif>=0.16"]
# ///
"""把手機照片壓縮後放進破關地圖某個地點的照片資料夾。

用法：
    uv run scripts/add-photos.py 361 D:/匯出/小油坑/*.jpg
    uv run scripts/add-photos.py 361 a.heic b.jpg --caption "霧太大" --caption "硫磺味好重"

每張照片輸出兩個檔（EXIF 全部去掉，包含 GPS）：
    static/adventure-map/photos/<id>/NN.jpg        長邊 1600px
    static/adventure-map/photos/<id>/NN.thumb.jpg  長邊 400px，卡片縮圖用
並在同資料夾的 captions.txt 追加「NN.jpg 說明」，說明可事後直接改這個檔。
"""

from __future__ import annotations

import argparse
import glob
import sys
from pathlib import Path

from PIL import Image, ImageOps
from pillow_heif import register_heif_opener

register_heif_opener()

PHOTO_ROOT = Path(__file__).resolve().parent.parent / "static" / "adventure-map" / "photos"
FULL_EDGE = 1600
THUMB_EDGE = 400


def next_number(folder: Path) -> int:
    """回傳資料夾裡下一個可用的流水號。"""
    nums = [int(p.stem) for p in folder.glob("*.jpg") if p.stem.isdigit()]
    return max(nums, default=0) + 1


def save_resized(img: Image.Image, edge: int, dest: Path, quality: int) -> None:
    """縮到長邊 edge 後存成不含 EXIF 的 JPEG。"""
    copy = img.copy()
    copy.thumbnail((edge, edge), Image.Resampling.LANCZOS)
    copy.save(dest, "JPEG", quality=quality, optimize=True, progressive=True)


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
    parser = argparse.ArgumentParser(description="壓縮照片並加到破關地圖地點")
    parser.add_argument("place_id", type=int, help="dating_map_places.id")
    parser.add_argument("images", nargs="+", help="照片路徑，可用 *.jpg")
    parser.add_argument("--caption", action="append", default=[], help="依序對應每張照片的說明")
    args = parser.parse_args()

    sources = expand(args.images)
    missing = [p for p in sources if not p.is_file()]
    if missing:
        print("找不到檔案：" + "、".join(map(str, missing)), file=sys.stderr)
        return 1

    folder = PHOTO_ROOT / str(args.place_id)
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
        caption = args.caption[i] if i < len(args.caption) else ""
        lines.append(f"{name} {caption}".rstrip())
        size_kb = (folder / name).stat().st_size // 1024
        print(f"✓ {src.name} → {name}（{size_kb} KB）")
        n += 1

    captions = folder / "captions.txt"
    existing = captions.read_text(encoding="utf-8") if captions.exists() else ""
    if existing and not existing.endswith("\n"):
        existing += "\n"
    captions.write_text(existing + "\n".join(lines) + "\n", encoding="utf-8", newline="\n")
    print(f"說明檔：{captions}（每行「檔名 說明」，可直接編輯）")
    return 0


if __name__ == "__main__":
    sys.exit(main())
