#!/usr/bin/env python3
"""카카오책에서 못 찾은 책(또는 잘못 연결된 책)에 표지·소개를 직접 넣는다. 값은 site/data/overrides.json 에 저장되고,
update.sh / kakao_link.py 를 다시 돌려도 지워지지 않는다. (수동 값이 카카오 값보다 우선)

  python3 tools/edit_book.py missing                       # 표지·소개가 없는 책 목록
  python3 tools/edit_book.py show "태훈이"                  # 현재 연결 상태
  python3 tools/edit_book.py set "스물두 살 태훈이" --cover ~/Desktop/a.jpg --desc "소개글…" [--author 저자] [--publisher 출판사] [--title 표시제목]
      (--cover 는 내 컴퓨터의 이미지 파일 또는 https 주소, --desc-file 소개글.txt 도 가능)
  python3 tools/edit_book.py unset "태훈이"                 # 수동 값 삭제 (카카오 값으로 복귀)
"""
import sys, re, json, shutil, argparse, subprocess, pathlib, hashlib
root = pathlib.Path(__file__).resolve().parent.parent
INV = root / "data/inventory.json"; BOOKS = root / "data/books.json"; OV = root / "site/data/overrides.json"; COV = root / "site/covers"
norm = lambda s: re.sub(r"[^\w]+", "", str(s or "").lower())
inv = json.loads(INV.read_text())["items"]
books = json.loads(BOOKS.read_text()) if BOOKS.exists() else {}
ov = json.loads(OV.read_text()) if OV.exists() else {}

def titles(): return sorted({i["title"] for i in inv})
def find(q):
    exact = [t for t in titles() if t == q or norm(t) == norm(q)]
    if exact: return exact
    return [t for t in titles() if norm(q) in norm(t)]
def status(t):
    k = norm(t); b = books.get(k); o = ov.get(k)
    return ("수동" if o else "") + (" 카카오" if b else "") or "없음"

ap = argparse.ArgumentParser(); sub = ap.add_subparsers(dest="cmd", required=True)
sub.add_parser("missing"); sh = sub.add_parser("show"); sh.add_argument("q")
st = sub.add_parser("set"); st.add_argument("q"); st.add_argument("--cover"); st.add_argument("--desc"); st.add_argument("--desc-file")
st.add_argument("--author"); st.add_argument("--publisher"); st.add_argument("--title")
us = sub.add_parser("unset"); us.add_argument("q")
a = ap.parse_args()

if a.cmd == "missing":
    miss = [t for t in titles() if not books.get(norm(t)) and norm(t) not in ov]
    print(len(miss), "종 (표지·소개 없음)")
    for t in miss: print(" ", t)
    sys.exit()
m = find(a.q)
if not m: sys.exit(f"재고에서 '{a.q}' 를 못 찾았어요. missing 으로 목록을 확인해 주세요.")
if len(m) > 1 and a.cmd != "show":
    print("여러 권이 걸렸어요. 제목을 정확히 적어 주세요:"); [print("  ", t) for t in m]; sys.exit(1)
if a.cmd == "show":
    for t in m: print(status(t).ljust(8), t, "|", json.dumps(ov.get(norm(t)) or {}, ensure_ascii=False)[:160])
    sys.exit()
t = m[0]; k = norm(t)
if a.cmd == "unset":
    ov.pop(k, None); OV.write_text(json.dumps(ov, ensure_ascii=False, indent=1)); print("수동 값 삭제:", t); sys.exit()
rec = dict(ov.get(k, {}))
if a.cover:
    src = a.cover
    if re.match(r"https?://", src): rec["cover"] = src
    else:
        p = pathlib.Path(src).expanduser()
        if not p.exists(): sys.exit("이미지 파일이 없어요: " + src)
        name = "c-" + hashlib.md5(t.encode()).hexdigest()[:10] + ".jpg"
        COV.mkdir(parents=True, exist_ok=True); dst = COV / name
        # 가로 600px 이하 JPEG 로 줄여 저장 (macOS sips)
        r = subprocess.run(["sips", "-s", "format", "jpeg", "-s", "formatOptions", "80", "--resampleWidth", "600", str(p), "--out", str(dst)], capture_output=True, text=True)
        if r.returncode or not dst.exists(): shutil.copy(p, dst)
        rec["cover"] = "covers/" + name
if a.desc_file: rec["desc"] = pathlib.Path(a.desc_file).expanduser().read_text().strip()
if a.desc: rec["desc"] = a.desc.strip()
for f in ("author", "publisher", "title"):
    if getattr(a, f): rec[f] = getattr(a, f)
ov[k] = rec; OV.write_text(json.dumps(ov, ensure_ascii=False, indent=1))
print("저장:", t, "→", {x: (v[:40] + "…" if len(v) > 40 else v) for x, v in rec.items()})
