/**
 * 비북스 도서 주문 — 통합관리 시트에 붙이는 Apps Script (시트 > 확장 프로그램 > Apps Script)
 * 웹앱 배포: 실행 = 나, 액세스 = 모든 사용자. 나온 URL 을 site/config.js 의 inventoryUrl · ordersUrl 에 넣는다.
 *
 * ■ 주문 처리 흐름 ('온라인주문' 탭 C열 상태 = 드롭다운)
 *   접수  → 손님이 주문서를 낸 상태. 재고는 아직 안 빠진다.
 *   입금확인 → 사이트 재고에서 빠진다(예약).
 *   준비·발송 → 재고 계속 예약 + 손님에게 안내 메일 자동 발송(한 번만).
 *   완료 → 해당 서가 탭(점주 시트)의 '판매' 표에 판매 행을 자동 기록(한 번만) → 시트 현재고가 줄고 정산에 잡힌다.
 *   취소 → 예약이 풀려 사이트 재고에 다시 반영된다.
 *   ※ 완료로 한 번 기록된 판매는 취소·상태변경으로 자동 삭제되지 않는다(서가 탭의 비고=주문번호 행을 직접 지울 것).
 *
 * ■ 처음 한 번: setup() 실행 (재고 스냅샷 트리거 + 상태 편집 트리거 + 드롭다운 + 머리글 정리)
 * ■ API  GET ?action=inventory · GET ?action=lookup&no=&phone= · POST {action:'order'}
 */
const ORDER_TAB = '온라인주문';
const ST = { NEW: '접수', PAID: '입금확인', SHIP: '준비·발송', DONE: '완료', CANCEL: '취소' };
const HOLD_STATUS = [ST.PAID, ST.SHIP];          // 사이트 재고에서 빠지는 상태
const HEAD = ['주문번호', '접수시각', '상태', '이름', '연락처', '받는방법', '주소', '입금자명', '요청', '배송비', '합계',
              '주문내용(JSON)', '이메일', '완료시각', '판매기록', '안내메일'];
const C = { NO: 0, AT: 1, ST: 2, NAME: 3, PHONE: 4, METHOD: 5, ADDR: 6, DEP: 7, MEMO: 8, SHIP: 9, TOTAL: 10, JSON: 11, MAIL: 12, DONE_AT: 13, SALE: 14, MAILED: 15 };
const FREE_OVER = 30000, SHIP_FEE = 3000;

// ───────── 웹앱 ─────────
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
const lineKey_ = l => l.shelf + '|' + (l.barcode || norm_(l.title));

// ───────── 재고 예약 ─────────
/** 상품 id → 예약 수량. 입금확인·준비·발송 + (완료됐지만 아직 재고 스냅샷에 반영 전인 주문) */
function reserved_(snapStartedAt) {
  const sh = SpreadsheetApp.getActive().getSheetByName(ORDER_TAB), m = {};
  if (!sh || sh.getLastRow() < 2) return m;
  sh.getRange(2, 1, sh.getLastRow() - 1, HEAD.length).getValues().forEach(r => {
    if (!r[C.JSON]) return;
    const st = r[C.ST];
    let hold = HOLD_STATUS.indexOf(st) >= 0;
    if (st === ST.DONE && String(r[C.SALE]).indexOf('기록완료') === 0 && r[C.DONE_AT] instanceof Date &&
        (!snapStartedAt || r[C.DONE_AT].getTime() > new Date(snapStartedAt).getTime())) hold = true;   // 스냅샷이 판매를 아직 못 본 구간
    if (!hold) return;
    JSON.parse(r[C.JSON]).forEach(l => { const k = lineKey_(l); m[k] = (m[k] || 0) + l.qty; });
  });
  return m;
}

// ───────── 재고 계산(느림) → 스냅샷 ─────────
function computeBase_() {
  const startedAt = new Date().toISOString();
  const ss = SpreadsheetApp.getActive(), owners = {};
  ss.getSheetByName('점주').getDataRange().getValues().slice(1).forEach(r => { if (r[0]) owners[r[0]] = { name: r[3], status: r[7] }; });
  const items = [];
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
      const stock = d.cur || 0;
      if (stock > 0) items.push({ shelf: sid, shelfName: sid === 'B' ? '비북스 직영' : o.name, cat: d.cat || '', title: d.title, barcode: d.barcode, price: d.price, listPrice: d.list, publisher: d.pub || '', stock: stock, added: d.added });
    });
  });
  return { generatedAt: startedAt, items: items };   // generatedAt = 계산 '시작' 시각 (이후 완료된 판매는 예약으로 계속 반영)
}

const CACHE_TAB = '_재고캐시', CHUNK = 40000;
function refreshSnapshot() {
  const base = JSON.stringify(computeBase_()), ss = SpreadsheetApp.getActive();
  let sh = ss.getSheetByName(CACHE_TAB) || ss.insertSheet(CACHE_TAB);
  sh.hideSheet(); sh.clear();
  const parts = []; for (let i = 0; i < base.length; i += CHUNK) parts.push([base.slice(i, i + CHUNK)]);
  sh.getRange(1, 1, parts.length, 1).setNumberFormat('@').setValues(parts);
}
function readSnapshot_() {
  const sh = SpreadsheetApp.getActive().getSheetByName(CACHE_TAB);
  if (!sh || sh.getLastRow() < 1) return null;
  return JSON.parse(sh.getRange(1, 1, sh.getLastRow(), 1).getValues().map(r => r[0]).join(''));
}
function inventory_() {
  const base = readSnapshot_();
  if (!base) return { generatedAt: null, items: [], error: 'snapshot 없음 — Apps Script 에서 setup 을 한 번 실행하세요' };
  const res = reserved_(base.generatedAt);
  base.items = base.items.map(i => Object.assign({}, i, { stock: i.stock - (res[lineKey_(i)] || 0) })).filter(i => i.stock > 0);
  return base;
}

// ───────── 설치 ─────────
/** 처음 한 번 실행. 다시 실행해도 안전(트리거 중복 제거, 드롭다운·머리글 갱신). */
function setup() {
  const ss = SpreadsheetApp.getActive();
  ScriptApp.getProjectTriggers().forEach(t => {
    const f = t.getHandlerFunction(); if (f === 'refreshSnapshot' || f === 'onOrderEdit') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('refreshSnapshot').timeBased().everyMinutes(10).create();
  ScriptApp.newTrigger('onOrderEdit').forSpreadsheet(ss).onEdit().create();
  prepareOrderTab_();
  refreshSnapshot();
}
function prepareOrderTab_() {
  const ss = SpreadsheetApp.getActive();
  let sh = ss.getSheetByName(ORDER_TAB) || ss.insertSheet(ORDER_TAB);
  sh.getRange(1, 1, 1, HEAD.length).setValues([HEAD]).setFontWeight('bold');
  sh.setFrozenRows(1);
  const rule = SpreadsheetApp.newDataValidation().requireValueInList(Object.keys(ST).map(k => ST[k]), true).setAllowInvalid(false).build();
  sh.getRange(2, C.ST + 1, 998, 1).setDataValidation(rule);
  const colors = [[ST.NEW, '#fff2cc'], [ST.PAID, '#d9ead3'], [ST.SHIP, '#cfe2f3'], [ST.DONE, '#e6e6e6'], [ST.CANCEL, '#f4cccc']];
  sh.setConditionalFormatRules(colors.map(c => SpreadsheetApp.newConditionalFormatRule()
    .whenTextEqualTo(c[0]).setBackground(c[1]).setRanges([sh.getRange(2, C.ST + 1, 998, 1)]).build()));
  sh.setColumnWidth(C.JSON + 1, 120);
  return sh;
}

// ───────── 주문 접수 ─────────
function order_(o) {
  if (!o || !o.name || !o.phone || !o.lines || !o.lines.length) return { ok: false, error: '주문 정보가 부족해요' };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(o.email || '')) return { ok: false, error: '이메일을 확인해 주세요' };
  const inv = inventory_().items, map = {}; inv.forEach(i => map[lineKey_(i)] = i);
  let sub = 0;
  for (const l of o.lines) {
    const i = map[lineKey_(l)];
    if (!i) return { ok: false, error: '품절된 책이 있어요: ' + l.title };
    if (l.qty < 1 || l.qty > i.stock) return { ok: false, error: '재고가 부족해요: ' + l.title };
    l.price = i.price; l.cat = i.cat; l.title = i.title; l.barcode = i.barcode; sub += i.price * l.qty;   // 가격·제목·바코드는 서버 기준
  }
  const ship = o.method === 'parcel' && sub < FREE_OVER ? SHIP_FEE : 0;
  const no = 'BB-' + Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyMMdd') + '-' + Math.random().toString(36).slice(2, 6).toUpperCase();
  const sh = prepareOrderTabIfMissing_();
  const row = new Array(HEAD.length).fill('');
  row[C.NO] = no; row[C.AT] = new Date(); row[C.ST] = ST.NEW; row[C.NAME] = o.name; row[C.PHONE] = "'" + o.phone;
  row[C.METHOD] = o.method === 'pickup' ? '매장 픽업' : '택배'; row[C.ADDR] = o.address || ''; row[C.DEP] = o.depositor || o.name;
  row[C.MEMO] = o.memo || ''; row[C.SHIP] = ship; row[C.TOTAL] = sub + ship; row[C.JSON] = JSON.stringify(o.lines); row[C.MAIL] = o.email;
  sh.appendRow(row);
  try { MailApp.sendEmail(Session.getEffectiveUser().getEmail(), '[비북스 도서주문] ' + no + ' · ' + (sub + ship) + '원', o.name + ' / ' + o.phone + '\n' + o.lines.map(l => l.shelf + ' ' + l.title + ' x' + l.qty).join('\n')); } catch (e) {}
  return { ok: true, no: no, total: sub + ship };
}
function prepareOrderTabIfMissing_() { return SpreadsheetApp.getActive().getSheetByName(ORDER_TAB) || prepareOrderTab_(); }

function lookup_(no, phone) {
  const sh = SpreadsheetApp.getActive().getSheetByName(ORDER_TAB); if (!sh || sh.getLastRow() < 2) return { ok: false };
  const rows = sh.getRange(2, 1, sh.getLastRow() - 1, HEAD.length).getValues();
  const r = rows.find(r => r[C.NO] === no && String(r[C.PHONE]).replace(/\D/g, '') === String(phone).replace(/\D/g, ''));
  return r ? { ok: true, order: { no: r[C.NO], status: r[C.ST], total: r[C.TOTAL], lines: JSON.parse(r[C.JSON]) } } : { ok: false };
}

// ───────── 상태 변경 처리 (설치형 편집 트리거) ─────────
function onOrderEdit(e) {
  if (!e || !e.range) return;
  const sh = e.range.getSheet();
  if (sh.getName() !== ORDER_TAB || e.range.getColumn() !== C.ST + 1 || e.range.getRow() < 2 || e.range.getNumRows() > 1) return;
  const row = e.range.getRow(), r = sh.getRange(row, 1, 1, HEAD.length).getValues()[0], st = r[C.ST];
  if (!r[C.JSON]) return;
  if (st === ST.SHIP) sendShipMail_(sh, row, r);
  else if (st === ST.DONE) completeOrder_(sh, row, r);
  else if (st !== ST.DONE && String(r[C.SALE]).indexOf('기록완료') === 0 && st !== ST.PAID && st !== ST.SHIP)
    sh.getRange(row, C.SALE + 1).setValue(r[C.SALE] + ' ※ 취소/변경: 서가 탭 판매 행(비고=' + r[C.NO] + ')을 직접 지워 주세요');
  // 입금확인·취소는 별도 작업 없음: 재고 예약은 상태값만 보고 계산된다
}

function sendShipMail_(sh, row, r) {
  if (r[C.MAILED]) return;                                   // 이미 보냈으면 다시 보내지 않음
  if (!r[C.MAIL]) { sh.getRange(row, C.MAILED + 1).setValue('이메일 없음'); return; }
  const lines = JSON.parse(r[C.JSON]), pickup = r[C.METHOD] === '매장 픽업';
  const list = lines.map(l => '· ' + String(l.title).replace(/\s*[\(（][^()（）]*[\)）]\s*$/, '') + ' × ' + l.qty).join('\n');
  const body = r[C.NAME] + '님, 안녕하세요. 비북스입니다.\n\n주문하신 책을 ' + (pickup ? '준비했어요. 매장에서 받아 가실 수 있어요.' : '포장해 발송 준비를 마쳤어요. 곧 택배로 출발해요.') +
    '\n\n주문번호: ' + r[C.NO] + '\n' + list + '\n합계: ' + Number(r[C.TOTAL]).toLocaleString('ko-KR') + '원\n' +
    (pickup ? '\n픽업 장소: 비북스 · 부천 원미동\n방문 전 운영 시간을 확인해 주세요.\n' : '\n받는 주소: ' + r[C.ADDR] + '\n') +
    '\n문의는 이 메일에 회신해 주세요.\n비북스';
  try {
    MailApp.sendEmail({ to: r[C.MAIL], subject: '[비북스] 주문하신 책을 ' + (pickup ? '준비했어요' : '발송해요') + ' (' + r[C.NO] + ')', body: body, name: '비북스' });
    sh.getRange(row, C.MAILED + 1).setValue(Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd HH:mm') + ' 발송');
  } catch (err) { sh.getRange(row, C.MAILED + 1).setValue('실패: ' + err); }
}

function completeOrder_(sh, row, r) {
  if (String(r[C.SALE]).indexOf('기록완료') === 0) return;   // 이미 기록됨 (상태를 껐다 켜도 중복 기록 안 함)
  const lock = LockService.getScriptLock(); lock.waitLock(30000);
  let res;
  try { res = recordSales_(r[C.NO], JSON.parse(r[C.JSON])); } finally { lock.releaseLock(); }
  const now = new Date();
  if (res.ok) {
    sh.getRange(row, C.DONE_AT + 1).setValue(now);
    sh.getRange(row, C.SALE + 1).setValue('기록완료 ' + Utilities.formatDate(now, 'Asia/Seoul', 'yyyy-MM-dd HH:mm') + ' · ' + res.msg);
    SpreadsheetApp.flush();
    try { refreshSnapshot(); } catch (e) {}                    // 사이트 재고를 바로 맞춤(실패해도 10분 트리거가 보정)
  } else {
    sh.getRange(row, C.SALE + 1).setValue('실패: ' + res.msg + ' (상태를 다시 바꾸면 재시도)');
  }
}

/** 서가 탭의 '판매' 표(T열~)에서 빈 줄을 찾아 기록. 한 줄이라도 못 쓰면 아무것도 쓰지 않는다. */
function recordSales_(orderNo, lines) {
  const ss = SpreadsheetApp.getActive(), byShelf = {};
  lines.forEach(l => (byShelf[l.shelf] = byShelf[l.shelf] || []).push(l));
  const plan = [];
  for (const sid of Object.keys(byShelf)) {
    const sh = tabFor_(ss, sid); if (!sh) return { ok: false, msg: '서가 탭을 못 찾음: ' + sid };
    const n = sh.getMaxRows() - 6, block = sh.getRange(7, 20, n, 5).getValues();   // T..X
    const empties = []; for (let i = 0; i < block.length && empties.length < byShelf[sid].length; i++) if (!block[i][0] && !block[i][2]) empties.push(7 + i);
    if (empties.length < byShelf[sid].length) return { ok: false, msg: sid + ' 탭 판매 표에 빈 줄이 부족해요' };
    byShelf[sid].forEach((l, i) => plan.push({ sh: sh, row: empties[i], l: l }));
  }
  const today = new Date(); today.setHours(0, 0, 0, 0);
  plan.forEach(p => {
    p.sh.getRange(p.row, 20, 1, 6).setValues([[today, p.l.cat || '', p.l.title, p.l.barcode || '', p.l.qty, p.l.price]]);   // T..Y 판매일·구분·제목·바코드·수량·판매가
    p.sh.getRange(p.row, 29, 1, 2).setValues([['온라인주문', orderNo]]);                                                      // AC 출처 · AD 비고
  });
  return { ok: true, msg: plan.length + '줄 (' + Object.keys(byShelf).join(', ') + ')' };
}
function tabFor_(ss, sid) {
  if (sid === 'B') return ss.getSheetByName('비북스 직영');
  return ss.getSheets().find(s => s.getName().indexOf(sid + ' ') === 0) || null;
}
