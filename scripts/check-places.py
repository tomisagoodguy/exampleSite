# /// script
# requires-python = ">=3.10"
# ///
"""大批匯入破關地圖地點前的檢查：擋掉推測出來的資料與錯位座標，本身不寫入資料庫。

用法：
    uv run scripts/check-places.py places.json            # 只做離線檢查
    uv run scripts/check-places.py places.json --reverse  # 加上 ArcGIS 反查座標所在縣市
    uv run scripts/check-places.py places.json --db       # 加上比對資料庫既有地點（要 .env 的 DATING_MAP_PASSPHRASE）
    uv run scripts/check-places.py places.json --reverse --db --out ok.json

places.json 是陣列，每筆：
    {
      "name": "店名",                       必填
      "source": "IG @xxx 2026-10 貼文",       必填：店名與位置從哪來；說不出來源＝推測，不匯入
      "category": "food",                   必填，合法值讀自 data.ts 的 CATEGORY_CONFIG
      "address": "台北市大安區永康街6巷5號",   選填
      "lat": 25.03, "lng": 121.53,          選填，要嘛都給、要嘛都不給
      "area": "台北市大安區",                 有座標時應填
      "region": "north",                    選填，合法值讀自 data.ts 的 REGION_LABEL
      "is_indoor": true,                    選填
      "geocode": {"by": "arcgis", "type": "PointAddress", "score": 100}   座標怎麼來的，選填
    }

結果分兩級：BLOCK（不該匯入，結束碼 1）、WARN（可以匯入但要人看一眼）。
--out 只輸出沒有 BLOCK 的那幾筆，寫入仍照 CLAUDE.md 用 SQL（不要指定 id）。
"""

from __future__ import annotations

import argparse
import json
import math
import os
import re
import sys
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA_TS = ROOT / "src" / "apps" / "adventure-map" / "data.ts"

# 與 layouts/adventure-map/list.html 相同的 publishable key，設計上可公開
SUPABASE_URL = "https://zvomerdcsxvuymnpuvxk.supabase.co"
SUPABASE_KEY = "sb_publishable_xAprCS1COLD7ePcF08buGw_LHfh6d9q"
REVERSE_URL = (
    "https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/reverseGeocode"
)

# 台灣本島＋澎金馬、綠島蘭嶼的外框
TW_LAT = (21.8, 26.5)
TW_LNG = (118.0, 122.1)
AREA_RE = re.compile(r"^(.{2}[市縣])(.{1,3}?[區鄉鎮市])$")
LEGACY_CATEGORIES = {
    "outdoor",
    "indoor",
    "night_market",
    "park",
    "temple",
    "oldshop",
    "shopping",
    "hiking",
    "daytrip",
    "indoor_sport",
}
# 縣市 → region；離島另以鄉鎮判斷
COUNTY_REGION = {
    **dict.fromkeys(["台北市", "新北市", "基隆市"], "north"),
    **dict.fromkeys(["桃園市", "新竹市", "新竹縣", "苗栗縣"], "tzm"),
    "台中市": "taichung",
    **dict.fromkeys(["宜蘭縣", "花蓮縣", "台東縣"], "east"),
    **dict.fromkeys(["澎湖縣", "金門縣", "連江縣"], "islands"),
}
ISLAND_TOWNS = {"屏東縣琉球鄉", "台東縣綠島鄉", "台東縣蘭嶼鄉"}
DUP_METERS = 100


def object_keys(ts: str, const: str) -> list[str]:
    """從 data.ts 取出 `export const NAME ... = { key: ... }` 的頂層 key。"""
    m = re.search(rf"export const {const}\b[^=]*=\s*\{{(.*?)\n\}};", ts, re.DOTALL)
    if not m:
        sys.exit(f"data.ts 找不到 {const}，請確認宣告格式沒變")
    return re.findall(r"^\s*(\w+)\s*:", m.group(1), re.MULTILINE)


def expected_region(area: str) -> str | None:
    """依 area（縣市＋鄉鎮區）推出應有的 region。"""
    county = area[:3]
    if county not in COUNTY_REGION and not re.match(r"^.{2}[市縣]$", county):
        return None
    if area in ISLAND_TOWNS or any(area.startswith(t) for t in ISLAND_TOWNS):
        return "islands"
    return COUNTY_REGION.get(county, "central_south")


def distance_m(a: tuple[float, float], b: tuple[float, float]) -> float:
    """兩點經緯度的大圓距離（公尺）。"""
    lat1, lng1, lat2, lng2 = map(math.radians, (*a, *b))
    h = (
        math.sin((lat2 - lat1) / 2) ** 2
        + math.cos(lat1) * math.cos(lat2) * math.sin((lng2 - lng1) / 2) ** 2
    )
    return 2 * 6371000 * math.asin(math.sqrt(h))


def reverse_county(lat: float, lng: float) -> str:
    """ArcGIS 反查座標所在縣市（與 geocode.ts 的 reverseArea 同一套參數），查不到回空字串。"""
    qs = urllib.parse.urlencode(
        {
            "f": "json",
            "location": f"{lng},{lat}",
            "langCode": "zht",
            "featureTypes": "Postal",
        }
    )
    with urllib.request.urlopen(f"{REVERSE_URL}?{qs}", timeout=15) as res:
        data = json.load(res)
    return (data.get("address", {}).get("Region") or "").replace("臺", "台")


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


def fetch_existing(passphrase: str) -> list[dict]:
    """讀出資料庫所有地點的 id、名稱、座標。沒帶對密碼時 RLS 會回空陣列，所以空的也當錯誤。"""
    qs = urllib.parse.urlencode({"select": "id,name,lat,lng,area"})
    req = urllib.request.Request(
        f"{SUPABASE_URL}/rest/v1/dating_map_places?{qs}",
        headers={
            "apikey": SUPABASE_KEY,
            "x-dating-map-pass": passphrase,
            "Range": "0-9999",
        },
    )
    with urllib.request.urlopen(req, timeout=30) as res:
        rows = json.load(res)
    if not rows:
        sys.exit("資料庫回傳 0 筆地點：密碼可能不對（沒帶對 header 時 RLS 回空陣列）")
    return rows


def check_row(
    row: dict, categories: set[str], regions: set[str]
) -> tuple[list[str], list[str]]:
    """離線檢查單筆，回傳 (BLOCK 原因, WARN 原因)。"""
    block: list[str] = []
    warn: list[str] = []

    if "id" in row:
        block.append("不要指定 id（GENERATED ALWAYS，手動給會讓序列落後）")
    if not str(row.get("name") or "").strip():
        block.append("沒有 name")
    if not str(row.get("source") or "").strip():
        block.append("沒有 source：說不出店名／位置從哪來就是推測，不匯入")

    cat = row.get("category")
    if cat in LEGACY_CATEGORIES:
        block.append(f"category「{cat}」是已廢除的舊分類")
    elif cat not in categories:
        block.append(f"category「{cat}」不合法，應為 {'、'.join(sorted(categories))}")

    lat, lng = row.get("lat"), row.get("lng")
    has_coord = lat is not None and lng is not None
    if (lat is None) != (lng is None):
        block.append("lat／lng 只給了一個")
    elif has_coord:
        if not (TW_LAT[0] <= lat <= TW_LAT[1] and TW_LNG[0] <= lng <= TW_LNG[1]):
            block.append(f"座標 {lat},{lng} 不在台灣範圍內（是不是經緯度顛倒？）")
        geo = row.get("geocode") or {}
        if geo.get("type") == "Locality":
            block.append(
                "座標是 Addr_type=Locality（只命中鄉鎮），改用 Google Places 重查"
            )

    area = row.get("area")
    if area:
        if "臺" in area:
            block.append(f"area「{area}」要寫「台」不寫「臺」")
        elif not AREA_RE.match(area):
            block.append(f"area「{area}」不是「縣市＋鄉鎮區」格式（例：新北市瑞芳區）")
        if not has_coord:
            warn.append("沒有座標卻有 area；無座標的地點 area 應為 null")
    elif has_coord:
        warn.append("有座標但沒填 area，寫入後要再補（dating_map_set_area）")

    region = row.get("region")
    norm = (area or "").replace("臺", "台")  # 臺字已另外擋下，這裡別重複報錯
    if region is not None and region not in regions:
        block.append(f"region「{region}」不合法，應為 {'、'.join(regions)}")
    elif AREA_RE.match(norm):
        want = expected_region(norm)
        if region and want and region != want:
            block.append(f"region「{region}」與 area「{area}」不符，應為 {want}")
        elif not region and want:
            warn.append(f"沒填 region，trigger 會依座標框猜；依 area 應為 {want}")

    return block, warn


def main() -> int:
    parser = argparse.ArgumentParser(description="匯入地點前的檢查（不寫入資料庫）")
    parser.add_argument("file", type=Path, help="待匯入地點的 JSON 陣列")
    parser.add_argument(
        "--reverse",
        action="store_true",
        help="用 ArcGIS 反查座標所在縣市，與 area 比對",
    )
    parser.add_argument("--db", action="store_true", help="與資料庫既有地點比對重複")
    parser.add_argument("--out", type=Path, help="把沒有 BLOCK 的地點寫到這個檔")
    args = parser.parse_args()
    # Windows 主控台預設 cp950，印不出 ✗ 等符號
    sys.stdout.reconfigure(encoding="utf-8")

    ts = DATA_TS.read_text(encoding="utf-8")
    categories = set(object_keys(ts, "CATEGORY_CONFIG"))
    regions = object_keys(ts, "REGION_LABEL")
    rows = json.loads(args.file.read_text(encoding="utf-8"))
    if not isinstance(rows, list):
        sys.exit("輸入檔必須是 JSON 陣列")

    existing: list[dict] = []
    if args.db:
        passphrase = load_passphrase()
        if not passphrase:
            sys.exit("--db 需要 .env 的 DATING_MAP_PASSPHRASE")
        existing = fetch_existing(passphrase)

    results = []
    for i, row in enumerate(rows):
        block, warn = check_row(row, categories, set(regions))
        name = str(row.get("name") or "").strip()
        lat, lng = row.get("lat"), row.get("lng")
        has_coord = isinstance(lat, (int, float)) and isinstance(lng, (int, float))

        if args.reverse and has_coord and row.get("area"):
            try:
                county = reverse_county(lat, lng)
            except OSError as err:
                warn.append(f"反查失敗：{err}")
            else:
                if not county:
                    warn.append("ArcGIS 反查不到縣市")
                elif county != row["area"].replace("臺", "台")[:3]:
                    block.append(
                        f"座標落在 {county}，但 area 寫 {row['area']}（同名景點？）"
                    )

        for j, other in enumerate(rows[:i]):
            if name and name == str(other.get("name") or "").strip():
                warn.append(f"與輸入檔第 {j + 1} 筆同名")
        for place in existing:
            if name and place["name"] == name:
                warn.append(
                    f"資料庫已有同名地點 id {place['id']}（{place.get('area') or '無地區'}）"
                )
            elif (
                has_coord
                and place.get("lat") is not None
                and place.get("lng") is not None
            ):
                d = distance_m((lat, lng), (place["lat"], place["lng"]))
                if d <= DUP_METERS and (name in place["name"] or place["name"] in name):
                    warn.append(
                        f"{d:.0f} 公尺內有相似地點 id {place['id']}「{place['name']}」"
                    )

        results.append((row, block, warn))

    n_block = 0
    for i, (row, block, warn) in enumerate(results, start=1):
        label = row.get("name") or "（無名稱）"
        if block:
            n_block += 1
            print(f"✗ {i}. {label}")
        elif warn:
            print(f"! {i}. {label}")
        else:
            print(f"✓ {i}. {label}")
        for msg in block:
            print(f"    BLOCK {msg}")
        for msg in warn:
            print(f"    WARN  {msg}")

    ok = [row for row, block, _ in results if not block]
    print(f"\n共 {len(rows)} 筆：可匯入 {len(ok)}、擋下 {n_block}")
    if args.out:
        args.out.write_text(
            json.dumps(ok, ensure_ascii=False, indent=2), encoding="utf-8"
        )
        print(f"已寫出 {args.out}")
    return 1 if n_block else 0


if __name__ == "__main__":
    sys.exit(main())
