#!/bin/sh
# site/ → docs/ (GitHub Pages 가 /docs 를 서비스) 복사 후 커밋. 푸시는 사용자 확인 후: git push
set -e
cd "$(dirname "$0")"
rm -rf docs && mkdir docs && cp -R site/. docs/ && touch docs/.nojekyll; echo shop.bbooks.co.kr > docs/CNAME
git add -A && git commit -m "${1:-update}" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>" || echo "변경 없음"
