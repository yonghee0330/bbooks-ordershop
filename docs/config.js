// 운영 설정 — 비어 있으면 데모 모드(주문은 이 브라우저에만 저장)
window.BB = {
  inventoryUrl: "https://script.google.com/macros/s/AKfycbx-DAH6XsDCzRQsUyI6tMBEc-UzIkuGDZB10vAxyYO1Sn7PKr9NnID0X7pWkAtvBxkq/exec",   // Apps Script 웹앱 URL (?action=inventory 로 실시간 재고). 비우면 data/inventory.json 사용
  ordersUrl: "https://script.google.com/macros/s/AKfycbx-DAH6XsDCzRQsUyI6tMBEc-UzIkuGDZB10vAxyYO1Sn7PKr9NnID0X7pWkAtvBxkq/exec",      // 주문 접수 웹앱 URL (보통 inventoryUrl 과 같음)
  kakaoProxy: "/api/kakao",   // 새 제목 보충용 카카오책 검색 프록시 (Vercel)
  bank: { name: "카카오뱅크", account: "7942-33-45474", holder: "경규환" },   // 무통장입금 정보 — 운영자가 입력
  shipping: { fee: 3000, freeOver: 30000 },
  pickupPlace: "비북스 · 부천 원미동"
};
