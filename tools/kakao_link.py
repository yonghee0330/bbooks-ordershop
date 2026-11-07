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
    """제목·저자·출판사 기준. 제목이 거의 같으면(≥0.9) 통과, 아니면 저자 또는 출판사가 함께 맞아야 통과."""
    best, bs = None, 0
    for d in docs:
        t = difflib.SequenceMatcher(None, norm(title), norm(d["title"])).ratio()
        if len(norm(title)) >= 4 and norm(title) in norm(d["title"]) and len(norm(title)) >= 0.6 * len(norm(d["title"])): t = max(t, 0.85)
        au = bool(hint) and any(norm(hint) in norm(a) or norm(a) in norm(hint) for a in d.get("authors", []) + d.get("translators", []) if norm(a))
        pb = bool(pub) and len(norm(pub)) >= 2 and (norm(pub) in norm(d.get("publisher", "")) or norm(d.get("publisher", "")) in norm(pub))
        if t >= 0.9: ok = True
        elif t >= 0.62: ok = au or (pb and t >= 0.75) or (not hint and not pub and t >= 0.8)
        else: ok = False
        s = t + (0.12 if au else 0) + (0.08 if pb else 0)
        if ok and s > bs: best, bs = d, s
    return best, bs

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
        if not hit:   # 괄호(시리즈·판형 등)를 전부 떼고 다시
            plain = re.sub(r"[\(（][^()（）]*[\)）]", " ", i["title"]).strip()
            if plain and plain != title: hit, _ = pick(search(plain), plain, hint, i.get("publisher"))
    except Exception as e:
        print("ERR", i["title"], e); time.sleep(2); continue
    if hit:
        isbn = ((hit.get("isbn") or "").split() or [""])[-1]
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
