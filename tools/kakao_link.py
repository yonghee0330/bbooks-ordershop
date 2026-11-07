#!/usr/bin/env python3
"""inventory.json 의 제목을 카카오 책 검색 API(dapi.kakao.com/v3/search/book)로 연결 → data/books.json
키는 환경변수 KAKAO_REST_KEY 또는 프로젝트 루트 .env (gitignore). 이미 연결된 제목은 건너뜀(이어하기).
usage: kakao_link.py [--force-missing]"""
import os, sys, re, json, time, difflib, pathlib, urllib.request, urllib.parse
root = pathlib.Path(__file__).resolve().parent.parent
env = root / ".env"
key = os.environ.get("KAKAO_REST_KEY", "")
if not key and env.exists():
    for l in env.read_text().splitlines():
        if l.startswith("KAKAO_REST_KEY="): key = l.split("=", 1)[1].strip()
if not key: sys.exit("KAKAO_REST_KEY 가 없습니다 (.env 에 넣어 주세요)")

def norm(s): return re.sub(r"[\s\W_]+", "", str(s or "").lower())
def clean(t):
    """'제목 (저자)' → ('제목', '저자')"""
    m = re.match(r"^(.*?)\s*[\(（]([^()（）]*)[\)）]\s*$", t.strip())
    return (m.group(1), m.group(2)) if m else (t.strip(), "")
def ckey(title): return norm(title)

def search(q, size=5):
    url = "https://dapi.kakao.com/v3/search/book?" + urllib.parse.urlencode({"query": q, "size": size, "target": "title"})
    req = urllib.request.Request(url, headers={"Authorization": "KakaoAK " + key})
    with urllib.request.urlopen(req, timeout=15) as r: return json.load(r).get("documents", [])

def pick(docs, title, hint, pub):
    best, bs = None, 0
    for d in docs:
        s = difflib.SequenceMatcher(None, norm(title), norm(d["title"])).ratio()
        if norm(title) and norm(title) in norm(d["title"]): s = max(s, 0.85)
        if hint and any(norm(hint) in norm(a) or norm(a) in norm(hint) for a in d.get("authors", []) if norm(a)): s += 0.12
        if pub and norm(pub) and norm(pub) in norm(d.get("publisher", "")): s += 0.05
        if s > bs: best, bs = d, s
    return (best, bs) if bs >= 0.62 else (None, bs)

inv = json.loads((root / "data/inventory.json").read_text())["items"]
outp = root / "data/books.json"
books = json.loads(outp.read_text()) if outp.exists() else {}
todo = {}
for i in inv:
    if re.fullmatch(r"97[89]\d{10}", i["barcode"] or ""): todo.setdefault(ckey(i["title"]), i)
    else: todo.setdefault(ckey(i["title"]), i)
n = ok = 0
for k, i in todo.items():
    if k in books and (books[k] or "--force-missing" not in sys.argv): continue
    title, hint = clean(i["title"])
    try:
        docs = []
        if re.fullmatch(r"97[89]\d{10}", i["barcode"] or ""):
            u = "https://dapi.kakao.com/v3/search/book?" + urllib.parse.urlencode({"query": i["barcode"], "target": "isbn"})
            docs = json.load(urllib.request.urlopen(urllib.request.Request(u, headers={"Authorization": "KakaoAK " + key}), timeout=15)).get("documents", [])
            hit = docs[0] if docs else None
        else: hit = None
        if not hit:
            hit, _ = pick(search(title), title, hint, i.get("publisher"))
        if not hit and hint: hit, _ = pick(search(title + " " + hint), title, hint, i.get("publisher"))
    except Exception as e:
        print("ERR", i["title"], e); time.sleep(2); continue
    if hit:
        isbn = (hit.get("isbn") or "").split()[-1]
        books[k] = {"isbn": isbn, "title": hit["title"], "authors": hit.get("authors", []), "translators": hit.get("translators", []),
                    "publisher": hit.get("publisher", ""), "thumbnail": hit.get("thumbnail", ""), "contents": hit.get("contents", ""),
                    "url": hit.get("url", ""), "listPrice": hit.get("price", 0), "pubdate": (hit.get("datetime") or "")[:10]}
        ok += 1
    else: books[k] = None
    n += 1
    if n % 25 == 0: outp.write_text(json.dumps(books, ensure_ascii=False)); print(n, "/", len(todo), "연결", ok)
    time.sleep(0.12)
outp.write_text(json.dumps(books, ensure_ascii=False))
print("완료:", len([b for b in books.values() if b]), "연결 /", len(books), "제목")
