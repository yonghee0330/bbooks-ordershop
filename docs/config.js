// 운영 설정 — 비어 있으면 데모 모드(주문은 이 브라우저에만 저장)
window.BB = {
  inventoryUrl: "https://script.google.com/macros/s/AKfycbx-DAH6XsDCzRQsUyI6tMBEc-UzIkuGDZB10vAxyYO1Sn7PKr9NnID0X7pWkAtvBxkq/exec",   // Apps Script 웹앱 URL (?action=inventory 로 실시간 재고). 비우면 data/inventory.json 사용
  ordersUrl: "https://script.google.com/macros/s/AKfycbx-DAH6XsDCzRQsUyI6tMBEc-UzIkuGDZB10vAxyYO1Sn7PKr9NnID0X7pWkAtvBxkq/exec",      // 주문 접수 웹앱 URL (보통 inventoryUrl 과 같음)
  kakaoProxy: "",   // 새 제목 보충용 카카오책 검색 프록시 (Vercel)
  bank: { name: "카카오뱅크", account: "7942-33-45474", holder: "경규환" },   // 무통장입금 정보 — 운영자가 입력
  hideShelves: ["S-1", "S-2", "C-71"],   // S-1·S-2 비활성 / C-71 성인 인증 필요 도서(BL 만화 서가): 사이트에 표시하지 않음
  hideTitleWords: ["균일가", "블라인드북"],   // 제목에 이 단어가 있으면 표시하지 않음(묶음·안내·블라인드 상품)
  hideItems: [   // 개별 상품 제외: "서가|시트 제목"
    "B-45|(중고) 전천당 (권당 5천원)",
    "B-45|그림책",
    "C-95|꼬마소년 바다 키링",
    "B-45|미스터 램프",
    "B|맨질맨질하고 딱딱한 삶에 대한"
  ],
  shipping: { fee: 3000, freeOver: 30000 },
  pickupPlace: "비북스 · 부천 원미동"
};
