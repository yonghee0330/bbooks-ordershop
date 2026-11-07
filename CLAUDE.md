# 비북스 도서 주문 (bbooks-ordershop)
shop.bbooks.co.kr 교체용(GitHub Pages, docs/CNAME). 입금: 카카오뱅크 7942-33-45474 경규환, 사업자 697-05-03470, 배송 3,000원/3만원 이상 무료. 비북스 직영 + 0.1평 점주 서가의 재고를 한 곳에서 주문. 사용자는 한국어(비개발자). 톤은 비북스 메인(흰·옅은 그린 + 딜 그린 #4E6813), 헌책방 스타일 아님.
- 재고 원본: 구글시트 「비북스 0.1평 서가 통합관리」 1PwAYaYTmrRVT5jdgeZo3c1yJBwzIGdeUDgPDiLjNYeY (링크 공유 열림). 서가 탭 = `A-1 여백공작소` 식 + `비북스 직영`. 현재고(I열)가 시트 수식으로 계산됨.
- 갱신: `curl -L -o live.xlsx ".../export?format=xlsx"` → `python3 tools/build_inventory.py live.xlsx` (굿즈·기타·대관 제외, 연락처 등 비공개 정보는 내보내지 않음) → `python3 tools/kakao_link.py` (KAKAO_REST_KEY 필요, .env) → site/data/ 로 복사.
- 바코드는 대부분 내부코드(7777…)라 카카오책 연결은 제목(+괄호 속 저자) 검색. ISBN 이 있으면 isbn 검색.
- 라이브: apps-script/Shop.gs 를 통합관리 시트에 붙여 웹앱 배포 → site/config.js 의 inventoryUrl/ordersUrl. 비우면 데모 모드(주문은 브라우저에만 저장).
- 미리보기: `python3 -m http.server 8880 --directory site`. 배포: Vercel(api/kakao.js 프록시 포함), push·도메인 교체는 사용자 확인 후.
- 사업자 정보·입금계좌는 사용자가 직접 줌(config.js bank). 찾아 넣지 말 것.

## 주문 처리 흐름 (Shop.gs, '온라인주문' 탭 C열 드롭다운)
접수 → 입금확인(사이트 재고에서 빠짐) → 준비·발송(손님 안내 메일 자동·1회) → 완료(서가 탭 판매 표 T~Y열에 자동 기록·1회, 비고=주문번호) / 취소(재고 복귀).
접수 상태는 재고를 잡지 않음. 완료 후 취소·변경은 판매 행을 자동 삭제하지 않음(사용자가 서가 탭에서 직접). 코드 수정 후엔 시트 Apps Script 에 붙여넣고 setup 실행 + 배포 관리에서 새 버전.

## 표지·소개 수동 입력 (카카오책에서 못 찾은 책)
`python3 tools/edit_book.py missing`(목록) / `set "제목" --cover 이미지|URL --desc "소개" [--author --publisher --title]` / `show` / `unset`. 값은 site/data/overrides.json + site/covers/ (update.sh·kakao_link.py 를 다시 돌려도 유지, 수동 값이 우선). 이미지는 가로 600px JPEG 로 자동 축소. 사용자가 채팅에 이미지·소개글을 주면 이 도구로 넣고 deploy.sh → 확인 후 push.
