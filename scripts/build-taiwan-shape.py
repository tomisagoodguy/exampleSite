"""taiwan-atlas counties TopoJSON → 簡化後的 SVG path（viewBox 寬 300），輸出 TS。"""
import json
import math
import sys

src, out = sys.argv[1], sys.argv[2]
d = json.load(open(src, encoding="utf-8"))
sx, sy = d["transform"]["scale"]
tx, ty = d["transform"]["translate"]

arcs = []
for arc in d["arcs"]:
    x = y = 0
    pts = []
    for dx, dy in arc:
        x += dx
        y += dy
        pts.append((x * sx + tx, y * sy + ty))
    arcs.append(pts)


def ring(idx):
    pts = []
    for i in idx:
        a = arcs[i] if i >= 0 else arcs[~i][::-1]
        pts.extend(a if not pts else a[1:])
    return pts


NAMES = {
    "A": "台北市", "B": "台中市", "C": "基隆市", "D": "台南市", "E": "高雄市", "F": "新北市",
    "G": "宜蘭縣", "H": "桃園市", "I": "嘉義市", "J": "新竹縣", "K": "苗栗縣", "M": "南投縣",
    "N": "彰化縣", "O": "新竹市", "P": "雲林縣", "Q": "嘉義縣", "T": "屏東縣", "U": "花蓮縣",
    "V": "台東縣", "W": "金門縣", "X": "澎湖縣", "Z": "連江縣",
}

K = math.cos(math.radians(23.7))
LON0, LAT1 = 119.25, 25.45  # 主圖左上角
SCALE = 300 / ((122.12 - LON0) * K)
# 插圖：把原始經緯度平移到台灣海峽左上的空白處，並放大一點方便點
INSET = {
    "Z": dict(src=(119.88, 26.40), dst=(119.30, 25.42), zoom=1.6),
    "W": dict(src=(118.20, 24.53), dst=(119.37, 24.55), zoom=1.6),
}


def project(cid, lon, lat):
    if cid in INSET:
        ins = INSET[cid]
        lon = ins["dst"][0] + (lon - ins["src"][0]) * ins["zoom"]
        lat = ins["dst"][1] + (lat - ins["src"][1]) * ins["zoom"]
    return ((lon - LON0) * K * SCALE, (LAT1 - lat) * SCALE)


def area(p):
    return abs(sum(p[i][0] * p[i - 1][1] - p[i - 1][0] * p[i][1] for i in range(len(p)))) / 2


def dp(pts, eps):
    if len(pts) < 3:
        return pts
    a, b = pts[0], pts[-1]
    dx, dy = b[0] - a[0], b[1] - a[1]
    n = math.hypot(dx, dy) or 1e-9
    best, idx = 0, 0
    for i in range(1, len(pts) - 1):
        dist = abs(dy * (pts[i][0] - a[0]) - dx * (pts[i][1] - a[1])) / n
        if dist > best:
            best, idx = dist, i
    if best <= eps:
        return [a, b]
    return dp(pts[: idx + 1], eps)[:-1] + dp(pts[idx:], eps)


result = []
insets = []
height = 0
for g in d["objects"]["counties"]["geometries"]:
    cid = g["properties"]["COUNTYID"]
    polys = g["arcs"] if g["type"] == "MultiPolygon" else [g["arcs"]]
    rings = []
    for poly in polys:
        outer = [project(cid, *pt) for pt in ring(poly[0])]  # 洞（內環）忽略
        rings.append(outer)
    big = max(area(r) for r in rings)
    # 小島：本島縣市只留大於 3 平方單位的；離島縣市保留到 0.3
    min_area = 0.3 if cid in ("W", "Z", "X") else 3
    kept = [r for r in rings if (area(r) >= min_area and cid != "C") or area(r) == big]
    if cid == "W":  # 烏坵離金門很遠，平移後會跑到海峽中間
        kept = [r for r in kept if min(x for x, _ in r) < 70]
    parts = []
    for r in kept:
        h = len(r) // 2
        s = dp(r[: h + 1], 0.35)[:-1] + dp(r[h:], 0.35)
        if len(s) < 4:
            continue
        parts.append("M" + "L".join(f"{x:.1f},{y:.1f}" for x, y in s[:-1]) + "Z")
        height = max(height, max(y for _, y in s))
    if cid in INSET:
        xs = [x for r in kept for x, _ in r]
        ys = [y for r in kept for _, y in r]
        insets.append((NAMES[cid], min(xs), min(ys), max(xs), max(ys)))
    main = max(kept, key=area)
    # 標籤點：最大多邊形的面積重心
    A = cx = cy = 0
    for i in range(len(main)):
        x0, y0 = main[i - 1]
        x1, y1 = main[i]
        c = x0 * y1 - x1 * y0
        A += c
        cx += (x0 + x1) * c
        cy += (y0 + y1) * c
    cx, cy = cx / (3 * A), cy / (3 * A)
    result.append((NAMES[cid], "".join(parts), cx, cy, sum(area(r) for r in kept)))

# 大的先畫：台北市、嘉義市在新北市、嘉義縣的洞裡，後畫才不會被蓋住
result.sort(key=lambda r: -r[4])
lines = [
    "// 由 taiwan-atlas（MIT，https://github.com/dkaoster/taiwan-atlas）counties-10t.json 投影、簡化產生，勿手改",
    "// 金門、連江縣（馬祖）平移放大到左上角的插圖框；陣列由大到小排，小縣市後畫才不會被外圍縣市蓋住",
    f"export const TAIWAN_VIEWBOX = '0 0 300 {math.ceil(height) + 2}';",
    "",
    "export interface CountyShape {",
    "  name: string;",
    "  d: string;",
    "  /** 縣市名稱標籤位置 */",
    "  x: number;",
    "  y: number;",
    "}",
    "",
    "export const TAIWAN_COUNTIES: CountyShape[] = [",
]
for name, path, cx, cy, _ in result:
    lines.append(f"  {{ name: '{name}', x: {cx:.1f}, y: {cy:.1f}, d: '{path}' }},")
lines.append("];")
lines.append("")
lines.append("/** 金門、馬祖插圖框（含 4 單位留白） */")
lines.append("export const TAIWAN_INSETS = [")
for name, x0, y0, x1, y1 in sorted(insets):
    lines.append(f"  {{ name: '{name}', x: {x0 - 4:.0f}, y: {y0 - 4:.0f}, w: {x1 - x0 + 8:.0f}, h: {y1 - y0 + 8:.0f} }},")
lines.append("];")
lines.append("")
open(out, "w", encoding="utf-8", newline="\n").write("\n".join(lines))
print("height", height, "bytes", sum(len(r[1]) for r in result))
