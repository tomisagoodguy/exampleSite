"""統一 lifestyle 食譜文章的 categories 分類。

用法：
    python scripts/normalize_recipe_categories.py          # dry-run，只印變更
    python scripts/normalize_recipe_categories.py --apply  # 實際寫檔
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LIFESTYLE = ROOT / "content" / "lifestyle"

CANON = "食譜筆記"
# 需要被收斂成 CANON 的別名
ALIASES = {"【食譜筆記】", "烹飪筆記"}


def parse_categories(fm_lines: list[str]) -> tuple[int, int, list[str], str]:
    """回傳 (起始行, 結束行(不含), 分類清單, 樣式 'block'|'inline')。

    找不到時回傳 (-1, -1, [], '')。
    """
    for i, line in enumerate(fm_lines):
        m = re.match(r"^categories:\s*(.*)$", line)
        if not m:
            continue
        rest = m.group(1).strip()
        # inline： categories: ["a", "b"]
        if rest.startswith("["):
            items = re.findall(r'"([^"]*)"|\'([^\']*)\'', rest)
            cats = [a or b for a, b in items]
            return i, i + 1, cats, "inline"
        # block： categories:\n  - "a"\n  - "b"
        cats: list[str] = []
        j = i + 1
        while j < len(fm_lines):
            item = re.match(r'^\s*-\s*"?\'?([^"\'\n]*)"?\'?\s*$', fm_lines[j])
            if item is None:
                break
            cats.append(item.group(1).strip())
            j += 1
        return i, j, cats, "block"
    return -1, -1, [], ""


def normalize(cats: list[str]) -> list[str]:
    out: list[str] = []
    for c in cats:
        c = c.strip()
        if not c:
            continue
        c = CANON if c in ALIASES else c
        if c not in out:
            out.append(c)
    if CANON not in out:
        out.insert(0, CANON)
    else:
        # 把 CANON 移到最前面，視覺一致
        out.remove(CANON)
        out.insert(0, CANON)
    return out


def main() -> None:
    apply = "--apply" in sys.argv
    changed = 0
    for path in sorted(LIFESTYLE.glob("*/index.md")):
        raw = path.read_bytes()
        had_bom = raw.startswith(b"\xef\xbb\xbf")
        text = raw.decode("utf-8-sig")
        newline = "\r\n" if "\r\n" in text else "\n"
        text_lf = text.replace("\r\n", "\n")
        lines = text_lf.split("\n")

        if lines[0].strip() != "---":
            print(f"[skip] 無前言: {path.name}")
            continue
        end = next((k for k in range(1, len(lines)) if lines[k].strip() == "---"), -1)
        if end == -1:
            print(f"[skip] 前言未閉合: {path.name}")
            continue

        fm = lines[1:end]
        ci, cj, cats, style = parse_categories(fm)
        new_cats = normalize(cats)

        if ci == -1:
            # 沒有 categories，插在 type: 之後或前言開頭
            insert_at = next((k + 1 for k, l in enumerate(fm) if l.startswith("type:")), 0)
            block = ["categories:"] + [f'  - "{c}"' for c in new_cats]
            new_fm = fm[:insert_at] + block + fm[insert_at:]
        else:
            block = ["categories:"] + [f'  - "{c}"' for c in new_cats]
            new_fm = fm[:ci] + block + fm[cj:]

        if new_fm == fm and not had_bom:
            continue

        changed += 1
        print(f"\n=== {path.parent.name} ===")
        print(f"  舊 ({style or 'none'}): {cats}")
        print(f"  新 (block): {new_cats}" + ("  [清除 BOM]" if had_bom else ""))

        if apply:
            new_lines = [lines[0]] + new_fm + lines[end:]
            out = newline.join(new_lines)
            path.write_text(out, encoding="utf-8", newline="")

    print(f"\n{'已套用' if apply else 'dry-run'}：共 {changed} 個檔案有變更。")


if __name__ == "__main__":
    main()
