# /// script
# requires-python = ">=3.10"
# ///
"""把破關地圖的公帳整份備份到本機（repo 是公開的，備份檔不能 commit）。

    uv run scripts/backup-ledger.py                 # 存到 ledger-backups/（已 gitignore）
    uv run scripts/backup-ledger.py --out D:/OneDrive/公帳備份

輸出兩個檔，檔名帶日期，同一天重跑會覆蓋：
    公帳-YYYYMMDD.json  流水、分類、餘額核對點、改帳紀錄四張表的原始資料（要還原時用）
    公帳-YYYYMMDD.csv   流水，Excel 直接開

要在 .env 設 DATING_MAP_PASSPHRASE。想每月自動跑，用 Windows「工作排程器」排
`uv run scripts/backup-ledger.py --out <雲端硬碟資料夾>`，起始位置設成 repo 根目錄。
"""

from __future__ import annotations

import argparse
import csv
import json
import os
import sys
import urllib.parse
import urllib.request
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_OUT = ROOT / "ledger-backups"

# 與 layouts/adventure-map/list.html 相同的 publishable key，設計上可公開
SUPABASE_URL = "https://zvomerdcsxvuymnpuvxk.supabase.co"
SUPABASE_KEY = "sb_publishable_xAprCS1COLD7ePcF08buGw_LHfh6d9q"
PAGE = 1000

# 表名 → 排序欄位
TABLES = {
    "dating_map_ledger": "id",
    "dating_map_ledger_categories": "sort_order",
    "dating_map_ledger_balances": "id",
    "dating_map_ledger_history": "id",
}

CSV_FIELDS = [
    "id", "spent_on", "kind", "category", "amount", "orig_currency", "orig_amount",
    "method", "paid_by", "note", "place_id", "trip_slug", "checked", "created_by", "created_at",
]


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
    """密碼錯時 RLS 只會回空陣列，備份出來是空的卻看不出來，所以先驗一次。"""
    req = urllib.request.Request(
        f"{SUPABASE_URL}/rest/v1/rpc/dating_map_check_passphrase",
        data=json.dumps({"p_passphrase": passphrase}).encode(),
        headers={"apikey": SUPABASE_KEY, "Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=15) as res:
        return json.load(res) is True


def fetch_all(passphrase: str, table: str, order: str) -> list[dict]:
    """分頁讀完整張表（PostgREST 單次上限 1000 筆）。"""
    rows: list[dict] = []
    offset = 0
    while True:
        qs = urllib.parse.urlencode({"select": "*", "order": f"{order}.asc", "limit": PAGE, "offset": offset})
        req = urllib.request.Request(
            f"{SUPABASE_URL}/rest/v1/{table}?{qs}",
            headers={"apikey": SUPABASE_KEY, "x-dating-map-pass": passphrase},
        )
        with urllib.request.urlopen(req, timeout=30) as res:
            page = json.load(res)
        rows.extend(page)
        if len(page) < PAGE:
            return rows
        offset += PAGE


def main() -> int:
    """備份四張表；任何一張讀不到就失敗，不留半份備份。"""
    sys.stdout.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT, help="備份資料夾（預設 ledger-backups/）")
    args = parser.parse_args()

    passphrase = load_passphrase()
    if not passphrase:
        print("✗ 請在 .env 設 DATING_MAP_PASSPHRASE=<破關地圖密碼>")
        return 1
    if not check_passphrase(passphrase):
        print("✗ .env 的 DATING_MAP_PASSPHRASE 不對")
        return 1

    data = {table: fetch_all(passphrase, table, order) for table, order in TABLES.items()}
    if not data["dating_map_ledger"]:
        print("✗ 流水是空的，沒有寫入備份（密碼或權限可能有問題）")
        return 1

    args.out.mkdir(parents=True, exist_ok=True)
    stamp = date.today().strftime("%Y%m%d")
    json_path = args.out / f"公帳-{stamp}.json"
    json_path.write_text(
        json.dumps({"backed_up_on": date.today().isoformat(), **data}, ensure_ascii=False, indent=1),
        encoding="utf-8",
    )
    csv_path = args.out / f"公帳-{stamp}.csv"
    # utf-8-sig：Excel 才會用 UTF-8 開
    with csv_path.open("w", encoding="utf-8-sig", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=CSV_FIELDS, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(data["dating_map_ledger"])

    counts = "、".join(f"{t.removeprefix('dating_map_')} {len(rows)} 筆" for t, rows in data.items())
    print(f"✓ 已備份到 {args.out}（{counts}）")
    return 0


if __name__ == "__main__":
    sys.exit(main())
