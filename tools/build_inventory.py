#!/usr/bin/env python3
"""통합관리 엑셀 → data/inventory.json (공개 가능한 필드만: 서가·서점명·구분·제목·바코드·가격·재고).
점주 연락처·계좌·접근코드는 절대 내보내지 않는다.
usage: build_inventory.py <통합관리.xlsx>"""
import sys, re, json, collections, openpyxl, datetime, pathlib
src = sys.argv[1]
out = pathlib.Path(__file__).resolve().parent.parent / "data" / "inventory.json"
wb = openpyxl.load_workbook(src, read_only=True, data_only=True)

def num(v):
    try: return float(v)
    except: return 0
def norm(s): return re.sub(r"\s+", "", str(s or "")).lower()
def bc(v):
    if v is None: return ""
    s = str(v).strip()
    if re.fullmatch(r"\d+\.0", s): s = s[:-2]
    return s

# 점주 목록 (이름·상태만)
owners = {}
for r in wb["점주"].iter_rows(min_row=2, values_only=True):
    r = tuple(r) + (None,) * 10
    if r[0]: owners[r[0]] = {"tab": r[1], "name": r[3], "status": r[7]}
owners["B"] = {"tab": "비북스 직영", "name": "비북스 직영", "status": "운영"}

HIDE = {"S-1", "S-2", "C-71"}   # S-1·S-2 비활성 / C-71 성인 인증 필요 도서(BL 만화)
HIDE_WORDS = ("균일가", "블라인드북")   # 제목에 있으면 제외
items = []
for ws in wb:
    t = ws.title
    if t == "비북스 직영": sid = "B"
    else:
        m = re.match(r"^([A-Z]-\d+)\s", t)
        if not m: continue
        sid = m.group(1)
    if sid in HIDE: continue
    o = owners.get(sid, {})
    if o.get("status") == "제외": continue
    rows = [tuple(r) + (None,) * 34 for r in ws.iter_rows(min_row=7, max_col=33, values_only=True)]
    stock = collections.OrderedDict()   # key -> dict
    for r in rows:
        if not r[3] or r[2] in (None, "") and not r[5]: continue
        key = bc(r[4]) or norm(r[3])
        d = stock.setdefault(key, {"title": str(r[3]).strip(), "barcode": bc(r[4]), "cat": r[2], "in": 0, "adj": 0,
                                   "price": 0, "list": 0, "cur": None, "pub": r[12], "date": None, "memo": []})
        d["in"] += num(r[5]); d["adj"] += num(r[7])
        if isinstance(r[8], (int, float)): d["cur"] = (d["cur"] or 0) + r[8]   # 시트가 계산한 현재고(재고조정 반영)
        if num(r[9]): d["price"] = num(r[9])
        if num(r[10]): d["list"] = num(r[10])
        if r[12] and not d["pub"]: d["pub"] = r[12]
        dt = r[1] or r[0]
        if isinstance(dt, datetime.datetime) and (d["date"] is None or dt > d["date"]): d["date"] = dt
    # 판매 표 (T열~)
    sold = collections.Counter()
    title_idx = {norm(v["title"]): k for k, v in stock.items()}
    for r in rows:
        if not r[21] or not num(r[23]): continue
        k = bc(r[22])
        if k not in stock: k = title_idx.get(norm(r[21]))
        if k: sold[k] += num(r[23])
    for k, d in stock.items():
        cur = d["cur"] if d["cur"] is not None else d["in"] - sold[k] - d["adj"]
        if cur <= 0 or d["cat"] == "굿즈" or d["cat"] is None and False: continue
        items.append({"shelf": sid, "shelfName": o.get("name", sid), "cat": d["cat"] or "", "title": d["title"],
                      "barcode": d["barcode"], "price": int(d["price"]), "listPrice": int(d["list"]),
                      "publisher": d["pub"] or "", "stock": int(cur),
                      "added": d["date"].strftime("%Y-%m-%d") if d["date"] else ""})
items = [i for i in items if not any(w in i["title"] for w in HIDE_WORDS)]
items = [i for i in items if i["cat"] != "굿즈" and i["cat"] not in ("기타", "대관") and i["price"] > 0]
out.write_text(json.dumps({"generatedAt": datetime.datetime.now().isoformat(timespec="minutes"), "source": pathlib.Path(src).name, "items": items}, ensure_ascii=False, indent=0))
c = collections.Counter((i["shelf"] == "B", i["cat"]) for i in items)
print(len(items), "건,", len({i["shelf"] for i in items}), "개 서가", dict(c))
