# 비북스 도서 주문 (bbooks-ordershop)
shop.bbooks.co.kr 교체용. 비북스 직영 + 0.1평 점주 서가의 재고를 한 곳에서 주문. 사용자는 한국어(비개발자). 톤은 비북스 메인(흰·옅은 그린 + 딜 그린 #4E6813), 헌책방 스타일 아님.
- 재고 원본: 구글시트 「비북스 0.1평 서가 통합관리」 1PwAYaYTmrRVT5jdgeZo3c1yJBwzIGdeUDgPDiLjNYeY (링크 공유 열림). 서가 탭 = `A-1 여백공작소` 식 + `비북스 직영`. 현재고(I열)가 시트 수식으로 계산됨.
- 갱신: `curl -L -o live.xlsx ".../export?format=xlsx"` → `python3 tools/build_inventory.py live.xlsx` (굿즈·기타·대관 제외, 연락처 등 비공개 정보는 내보내지 않음) → `python3 tools/kakao_link.py` (KAKAO_REST_KEY 필요, .env) → site/data/ 로 복사.
- 바코드는 대부분 내부코드(7777…)라 카카오책 연결은 제목(+괄호 속 저자) 검색. ISBN 이 있으면 isbn 검색.
- 라이브: apps-script/Shop.gs 를 통합관리 시트에 붙여 웹앱 배포 → site/config.js 의 inventoryUrl/ordersUrl. 비우면 데모 모드(주문은 브라우저에만 저장).
- 미리보기: `python3 -m http.server 8880 --directory site`. 배포: Vercel(api/kakao.js 프록시 포함), push·도메인 교체는 사용자 확인 후.
- 사업자 정보·입금계좌는 사용자가 직접 줌(config.js bank). 찾아 넣지 말 것.
