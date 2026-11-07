/**
 * 비북스 도서 주문 — 통합관리 시트에 붙이는 Apps Script (시트 > 확장 프로그램 > Apps Script)
 * 웹앱 배포: 실행 = 나, 액세스 = 모든 사용자. 나온 URL 을 site/config.js 의 inventoryUrl · ordersUrl 에 넣는다.
 * GET ?action=inventory  → 공개 가능한 필드만(서가·제목·구분·가격·재고). 연락처·계좌는 절대 내보내지 않는다.
 * POST {action:'order'}   → '온라인주문' 탭에 접수(서버가 가격·재고를 다시 검증), 운영자 메일 알림
 * GET ?action=lookup&no=&phone= → 주문 조회
 * 재고 = 시트의 현재고(수식) − 접수/입금확인 상태의 온라인주문 수량 (이중 판매 방지)
 */
const ORDER_TAB = '온라인주문';
const OPEN_STATUS = ['접수', '입금확인'];
const HEAD = ['주문번호', '접수시각', '상태', '이름', '연락처', '받는방법', '주소', '입금자명', '요청', '배송비', '합계', '주문내용(JSON)'];

function doGet(e) {
  const a = (e.parameter || {}).action;
  if (a === 'inventory') return out_(inventory_());
  if (a === 'lookup') return out_(lookup_(e.parameter.no, e.parameter.phone));
  return out_({ ok: true });
}
function doPost(e) {
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    const b = JSON.parse(e.postData.contents);
    if (b.action === 'order') return out_(order_(b.order));
    return out_({ ok: false, error: 'unknown' });
  } catch (err) { return out_({ ok: false, error: String(err) }); } finally { lock.releaseLock(); }
}
function out_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
const norm_ = s => String(s || '').replace(/\s+/g, '').toLowerCase();
const bc_ = v => String(v == null ? '' : v).replace(/\.0$/, '').trim();

function reserved_() {   // 상품 id(서가|바코드또는제목) → 예약 수량
  const sh = SpreadsheetApp.getActive().getSheetByName(ORDER_TAB), m = {};
  if (!sh || sh.getLastRow() < 2) return m;
  sh.getRange(2, 1, sh.getLastRow() - 1, HEAD.length).getValues().forEach(r => {
    if (OPEN_STATUS.indexOf(r[2]) < 0) return;
    JSON.parse(r[11]).forEach(l => { const k = l.shelf + '|' + (l.barcode || norm_(l.title)); m[k] = (m[k] || 0) + l.qty; });
  });
  return m;
}

function inventory_() {
  const ss = SpreadsheetApp.getActive(), owners = {};
  ss.getSheetByName('점주').getDataRange().getValues().slice(1).forEach(r => { if (r[0]) owners[r[0]] = { name: r[3], status: r[7] }; });
  const res = reserved_(), items = [];
  ss.getSheets().forEach(sh => {
    const t = sh.getName(); let sid;
    if (t === '비북스 직영') sid = 'B'; else { const m = t.match(/^([A-Z]-\d+)\s/); if (!m) return; sid = m[1]; }
    const o = owners[sid] || {}; if (o.status === '제외') return;
    const n = sh.getLastRow() - 6; if (n < 1) return;
    const rows = sh.getRange(7, 1, n, 18).getValues(), g = {};
    rows.forEach(r => {
      if (!r[3]) return;
      const k = bc_(r[4]) || norm_(r[3]);
      const d = g[k] || (g[k] = { title: String(r[3]).trim(), barcode: bc_(r[4]), cat: r[2], cur: null, price: 0, list: 0, pub: r[12], added: '' });
      if (typeof r[8] === 'number') d.cur = (d.cur || 0) + r[8];
      if (Number(r[9])) d.price = Number(r[9]); if (Number(r[10])) d.list = Number(r[10]);
      if (r[12] && !d.pub) d.pub = r[12];
      const dt = r[1] || r[0]; if (dt instanceof Date) { const s = Utilities.formatDate(dt, 'Asia/Seoul', 'yyyy-MM-dd'); if (s > d.added) d.added = s; }
    });
    Object.keys(g).forEach(k => {
      const d = g[k]; if (d.cat === '굿즈' || d.cat === '기타' || d.cat === '대관' || !(d.price > 0)) return;
      const id = sid + '|' + (d.barcode || norm_(d.title)), stock = (d.cur || 0) - (res[id] || 0);
      if (stock > 0) items.push({ shelf: sid, shelfName: sid === 'B' ? '비북스 직영' : o.name, cat: d.cat || '', title: d.title, barcode: d.barcode, price: d.price, listPrice: d.list, publisher: d.pub || '', stock: stock, added: d.added });
    });
  });
  return { generatedAt: new Date().toISOString(), items: items };
}

function order_(o) {
  if (!o || !o.name || !o.phone || !o.lines || !o.lines.length) return { ok: false, error: '주문 정보가 부족해요' };
  const inv = inventory_().items, map = {}; inv.forEach(i => map[i.shelf + '|' + (i.barcode || norm_(i.title))] = i);
  let sub = 0;
  for (const l of o.lines) {
    const i = map[l.shelf + '|' + (l.barcode || norm_(l.title))];
    if (!i) return { ok: false, error: '품절된 책이 있어요: ' + l.title };
    if (l.qty < 1 || l.qty > i.stock) return { ok: false, error: '재고가 부족해요: ' + l.title };
    l.price = i.price; l.cat = i.cat; sub += i.price * l.qty;   // 가격은 서버 기준
  }
  const ship = o.method === 'parcel' && sub < 30000 ? 3000 : 0;
  const no = 'BB-' + Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyMMdd') + '-' + Math.random().toString(36).slice(2, 6).toUpperCase();
  const ss = SpreadsheetApp.getActive(); let sh = ss.getSheetByName(ORDER_TAB);
  if (!sh) { sh = ss.insertSheet(ORDER_TAB); sh.appendRow(HEAD); sh.setFrozenRows(1); }
  sh.appendRow([no, new Date(), '접수', o.name, "'" + o.phone, o.method === 'pickup' ? '매장 픽업' : '택배', o.address || '', o.depositor || o.name, o.memo || '', ship, sub + ship, JSON.stringify(o.lines)]);
  try { MailApp.sendEmail(Session.getEffectiveUser().getEmail(), '[비북스 도서주문] ' + no + ' · ' + (sub + ship) + '원', o.name + ' / ' + o.phone + '\n' + o.lines.map(l => l.shelf + ' ' + l.title + ' x' + l.qty).join('\n')); } catch (e) {}
  return { ok: true, no: no, total: sub + ship };
}

function lookup_(no, phone) {
  const sh = SpreadsheetApp.getActive().getSheetByName(ORDER_TAB); if (!sh || sh.getLastRow() < 2) return { ok: false };
  const rows = sh.getRange(2, 1, sh.getLastRow() - 1, HEAD.length).getValues();
  const r = rows.find(r => r[0] === no && String(r[4]).replace(/\D/g, '') === String(phone).replace(/\D/g, ''));
  return r ? { ok: true, order: { no: r[0], status: r[2], total: r[10], lines: JSON.parse(r[11]) } } : { ok: false };
}
