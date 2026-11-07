#!/bin/sh
# 재고 갱신: 통합관리 시트 → inventory.json → 카카오책 연결 → site/data → 커밋(푸시는 별도)
# usage: ./update.sh ["커밋 메시지"]
set -e
cd "$(dirname "$0")"
SHEET=1PwAYaYTmrRVT5jdgeZo3c1yJBwzIGdeUDgPDiLjNYeY
TMP=$(mktemp -d)
curl -sfL -m 180 -o "$TMP/live.xlsx" "https://docs.google.com/spreadsheets/d/$SHEET/export?format=xlsx"
python3 tools/build_inventory.py "$TMP/live.xlsx"
rm -rf "$TMP"
python3 tools/kakao_link.py
cp data/inventory.json data/books.json site/data/
./deploy.sh "${1:-chore: 재고 갱신 $(date +%Y-%m-%d)}"
echo "커밋 완료. 올리려면: git push"
