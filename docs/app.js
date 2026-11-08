(() => {
const C = window.BB, $ = s => document.querySelector(s);
const won = n => n.toLocaleString("ko-KR") + "원";
const norm = s => String(s || "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const store = { get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d } catch { return d } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)) } catch {} } };
const split = t => { const m = String(t).trim().match(/^(.*?)\s*[\(（]([^()（）]*)[\)）]\s*$/); return m ? [m[1], m[2]] : [String(t).trim(), ""] };

let L = [], BOOKS = {}, cart = store.get("bb-cart", {}), st = { q: "", shelf: "", cat: "", sort: "new", shown: 48 };
const NOCOVER = new URLSearchParams(location.search).has("nocover");   // 임시 작업용: 표지 없는 책만 보기
const PAGE = 48, TS = Math.floor(Date.now() / 60000);   // 데이터 파일은 1분 단위로 캐시 무효화

async function load() {
  let inv, live = false;
  if (C.inventoryUrl) { try { const j = await (await fetch(C.inventoryUrl + "?action=inventory")).json(); if (j.items && j.items.length) { inv = j; live = true } } catch (e) { console.warn("라이브 재고 실패 → 정적 재고", e) } }
  if (!inv) inv = await (await fetch("data/inventory.json?t=" + TS)).json();
  try { BOOKS = await (await fetch("data/books.json?t=" + TS)).json() } catch { BOOKS = {} }
  BOOKS = { ...BOOKS, ...store.get("bb-kk", {}) };
  try {   // 수동 입력(표지·소개) — 카카오 값보다 우선
    const ov = await (await fetch("data/overrides.json?t=" + TS)).json();
    for (const [k, o] of Object.entries(ov)) {
      const b = { ...(BOOKS[k] || {}) };
      if (o.cover) b.thumbnail = o.cover; if (o.desc) b.contents = o.desc; if (o.title) b.title = o.title;
      if (o.author) b.authors = [o.author]; if (o.publisher) b.publisher = o.publisher;
      if (!b.title) b.title = "";
      BOOKS[k] = b;
    }
  } catch {}
  L = inv.items.map(i => {
    const [t0, hint] = split(i.title), b = BOOKS[norm(i.title)];
    return { ...i, id: i.shelf + "|" + (i.barcode || norm(i.title)), name: (b && b.title) || t0, author: b ? [...(b.authors || [])].join(", ") : hint,
      pub: b?.publisher || i.publisher, cover: b?.thumbnail || "", book: b || null };
  }).filter(i => i.stock > 0 && !(C.hideShelves || []).includes(i.shelf) && !(C.hideTitleWords || []).some(w => i.title.includes(w)) && !(C.hideItems || []).includes(i.shelf + "|" + i.title.trim()));
  $("#stats").innerHTML = `<div><b>${L.reduce((a, i) => a + i.stock, 0).toLocaleString()}</b>권 주문 가능</div><div><b>${new Set(L.map(i => i.shelf)).size}</b>개 서가</div><div><b>${L.filter(i => i.cat === "중고").length}</b>종 중고책</div>`;
  const shelves = {}; L.forEach(i => (shelves[i.shelf] ||= { n: i.shelfName, c: 0 }).c++);
  $("#shelf").innerHTML = `<option value="">모든 서가 (${Object.keys(shelves).length})</option>` + Object.entries(shelves)
    .sort((a, b) => (a[0] === "B" ? -1 : b[0] === "B" ? 1 : a[0].localeCompare(b[0], "ko", { numeric: true })))
    .map(([k, v]) => `<option value="${esc(k)}">${k === "B" ? "비북스 직영" : esc(k + " · " + v.n)} (${v.c})</option>`).join("");
  const cats = ["", "새책", "중고"];
  $("#cats").innerHTML = cats.map(c => `<button class="chip" data-c="${c}">${c || "전체"}</button>`).join("");
  if (NOCOVER) { st.sort = "title"; $("#sort").value = "title";
    const n = L.filter(i => !i.cover).length;
    $(".hero .sub").innerHTML = `<b style="color:#a4411f">작업용 보기</b> — 표지가 없는 책 ${n}권만 보여요. (일반 화면은 주소에서 ?nocover 를 빼세요)`; }
  render(); updateCart();
}
const catOf = i => i.cat === "중고" ? "중고" : "새책";

function filtered() {
  const q = norm(st.q);
  let r = L.filter(i => (!NOCOVER || !i.cover) && (!st.shelf || i.shelf === st.shelf) && (!st.cat || catOf(i) === st.cat) &&
    (!q || norm([i.name, i.title, i.author, i.pub, i.shelfName, i.shelf].join(" ")).includes(q)));
  const by = { new: (a, b) => (b.added || "").localeCompare(a.added || ""), low: (a, b) => a.price - b.price, high: (a, b) => b.price - a.price, title: (a, b) => a.name.localeCompare(b.name, "ko") };
  return r.sort(by[st.sort]);
}
function coverHtml(i) { return i.cover ? `<img src="${esc(i.cover)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : `<div class="ph">${esc(i.name)}</div>` }
function render() {
  const r = filtered(), vis = r.slice(0, st.shown);
  document.querySelectorAll(".chip").forEach(b => b.classList.toggle("on", b.dataset.c === st.cat));
  $("#count").textContent = `${r.length.toLocaleString()}권`;
  $("#grid").innerHTML = vis.length ? vis.map(i => `
  <article class="card" data-id="${esc(i.id)}">
    <div class="cov" data-open>${coverHtml(i)}<span class="tag ${i.cat === "중고" ? "used" : ""}">${catOf(i)}</span></div>
    <div class="info"><div class="ttl" data-open>${esc(i.name)}</div><div class="au">${esc(i.author || " ")}${i.pub ? " · " + esc(i.pub) : ""}</div>
      <div class="shelf">${i.shelf === "B" ? "비북스 직영" : esc(i.shelf + " " + i.shelfName)}</div>
      ${NOCOVER ? `<div class="au" style="white-space:normal;font-size:11px">시트: ${esc(i.title)}</div>` : ""}
      <div class="price">${i.listPrice > i.price ? `<s>${won(i.listPrice)}</s>` : ""}${won(i.price)}</div>
      ${i.stock <= 2 ? `<div class="stock">${i.stock}권 남음</div>` : ""}
      <button class="add ${cart[i.id] ? "in" : ""}" data-add>${cart[i.id] ? "담김 ✓" : "담기"}</button></div>
  </article>`).join("") : `<p class="empty">조건에 맞는 책이 없어요.</p>`;
  $("#more").hidden = r.length <= st.shown;
  enrich(vis);
}

// ── 카카오책 보충 (정적 연결에 없는 새 제목)
const q2 = []; let busy = 0; const tried = new Set();
function enrich(list) {
  if (!C.kakaoProxy) return;
  list.filter(i => !i.book && !tried.has(i.id)).slice(0, 24).forEach(i => { tried.add(i.id); q2.push(i) }); pump();
}
async function pump() {
  while (busy < 3 && q2.length) {
    const i = q2.shift(); busy++;
    (async () => {
      try {
        const [t] = split(i.title);
        const j = await (await fetch(`${C.kakaoProxy}?query=${encodeURIComponent(t)}`)).json();
        const d = (j.documents || []).find(d => norm(d.title).includes(norm(t)) || norm(t).includes(norm(d.title)));
        if (d) {
          const b = { isbn: (d.isbn || "").split(" ").pop(), title: d.title, authors: d.authors, publisher: d.publisher, thumbnail: d.thumbnail, contents: d.contents, url: d.url, listPrice: d.price };
          const kk = store.get("bb-kk", {}); kk[norm(i.title)] = b; store.set("bb-kk", kk);
          L.filter(x => norm(x.title) === norm(i.title)).forEach(x => Object.assign(x, { book: b, cover: b.thumbnail, name: b.title, author: b.authors.join(", "), pub: b.publisher }));
          const el = document.querySelector(`[data-id="${CSS.escape(i.id)}"] .cov`); if (el) el.innerHTML = coverHtml(i) + el.querySelector(".tag").outerHTML;
        }
      } catch {} finally { busy--; pump() }
    })();
  }
}

// ── 장바구니
const byId = id => L.find(i => i.id === id);
const lines = () => Object.entries(cart).map(([id, q]) => ({ i: byId(id), q })).filter(x => x.i);
function totals() {
  const sub = lines().reduce((a, { i, q }) => a + i.price * q, 0);
  return { sub, ship: 0 };
}
function setQty(id, q) { const i = byId(id); if (!i) return; q = Math.min(q, i.stock); if (q <= 0) delete cart[id]; else cart[id] = q; store.set("bb-cart", cart); updateCart(); }
function updateCart() { $("#cartCount").textContent = lines().reduce((a, x) => a + x.q, 0); if (!$("#drawer").hidden) drawCart(); }
function open(el) { $("#scrim").hidden = false; el.hidden = false }
function closeAll() { $("#scrim").hidden = true; $("#drawer").hidden = true; $("#modal").hidden = true; document.body.style.overflow = "" }
function drawCart() {
  const ls = lines(), t = totals();
  $("#drawer").innerHTML = `<div class="dh">장바구니 <button class="x" data-close>×</button></div><div class="db">${ls.length ? ls.map(({ i, q }) => `
    <div class="line">${i.cover ? `<img src="${esc(i.cover)}" alt="" referrerpolicy="no-referrer">` : `<div class="ph2"></div>`}
      <div><div class="t">${esc(i.name)}</div><div class="s">${i.shelf === "B" ? "비북스 직영" : esc(i.shelfName)} · ${catOf(i)}</div>
      <div class="qty"><button data-dec="${esc(i.id)}">−</button>${q}<button data-inc="${esc(i.id)}">+</button><button class="rm" data-rm="${esc(i.id)}">삭제</button></div></div>
      <div><b>${won(i.price * q)}</b></div></div>`).join("") : `<p class="empty">담긴 책이 없어요.</p>`}</div>
    <div class="df"><div class="sum"><span>책값</span><span>${won(t.sub)}</span></div><div class="sum"><span>배송비</span><span>${C.shipping ? "주문 단계에서 선택" : "-"}</span></div>
    <button class="cta" data-checkout ${ls.length ? "" : "disabled"}>주문하기</button></div>`;
}
function shipFee(sub, method) { return method === "pickup" || !sub || sub >= C.shipping.freeOver ? 0 : C.shipping.fee }

function detail(id) {
  const i = byId(id), b = i.book, others = L.filter(x => x !== i && ((b?.isbn && x.book?.isbn === b.isbn) || (norm(i.name).length >= 2 && norm(x.name) === norm(i.name))));
  $("#modal").innerHTML = `<div class="sheet"><button class="x" data-close>×</button><div class="det">${i.cover ? `<img src="${esc(i.cover)}" alt="" referrerpolicy="no-referrer">` : `<div class="cov"><div class="ph">${esc(i.name)}</div></div>`}
    <div><h2>${esc(i.name)}</h2><div class="au" style="white-space:normal">${esc(i.author)}${i.pub ? " · " + esc(i.pub) : ""}${b?.pubdate ? " · " + b.pubdate.slice(0, 4) : ""}</div>
    <div class="shelf">${i.shelf === "B" ? "비북스 직영" : esc(i.shelf + " " + i.shelfName)} · ${i.cat === "중고" ? "중고" : "새책"} · 재고 ${i.stock}권</div>
    <div class="price" style="font-size:18px;margin:8px 0">${i.listPrice > i.price ? `<s>${won(i.listPrice)}</s>` : ""}${won(i.price)}</div>
    <button class="add ${cart[i.id] ? "in" : ""}" data-add data-id="${esc(i.id)}" style="width:100%">${cart[i.id] ? "담김 ✓" : "장바구니에 담기"}</button></div></div>
    ${b?.contents ? `<p class="desc">${esc(b.contents)}${b.contents.length > 190 ? "…" : ""}</p>` : ""}
    ${b?.url ? `<p class="au" style="margin-top:8px"><a href="${esc(b.url)}" target="_blank" rel="noopener">카카오 책 정보 보기 ↗</a></p>` : ""}
    ${others.length ? `<div class="others"><b>같은 책을 가진 다른 서가</b>${others.map(o => `<div><span>${esc(o.shelf === "B" ? "비북스 직영" : o.shelf + " " + o.shelfName)} · ${catOf(o)}</span><span>${won(o.price)}</span></div>`).join("")}</div>` : ""}</div>`;
  $("#scrim").hidden = false; $("#modal").hidden = false; document.body.style.overflow = "hidden";
}

function checkout() {
  const t = totals();
  $("#drawer").hidden = true;
  $("#modal").innerHTML = `<div class="sheet form"><button class="x" data-close>×</button><h2 style="font:700 20px 'Noto Serif KR';color:var(--head)">주문하기</h2>
  <label>받는 방법</label><div class="seg"><label><input type="radio" name="m" value="pickup" checked>매장 픽업 (무료)</label><label><input type="radio" name="m" value="parcel">택배 (${won(C.shipping.fee)} · ${won(C.shipping.freeOver)} 이상 무료)</label></div>
  <div id="addrBox" hidden><label>주소</label><input id="addr" placeholder="택배 받을 주소"></div>
  <label>이름</label><input id="nm" autocomplete="name"><label>연락처</label><input id="ph" type="tel" inputmode="tel" placeholder="010-0000-0000" autocomplete="tel">
  <label>이메일 (발송 안내를 보내 드려요)</label><input id="em" type="email" inputmode="email" autocomplete="email" placeholder="name@example.com">
  <label>입금자명 (다르면 적어 주세요)</label><input id="dep"><label>요청사항</label><textarea id="memo" rows="2"></textarea>
  <div class="box" id="sumBox"></div>
  <div class="box">무통장입금 ${C.bank.account ? `<br><b>${esc(C.bank.name)} ${esc(C.bank.account)}</b> (${esc(C.bank.holder)})` : `<br>입금 계좌는 운영자가 입력하면 표시돼요.`}<br>주문 접수 후 24시간 안에 입금해 주세요.</div>
  <button class="cta" id="submit" style="margin-top:14px">주문 접수하기</button></div>`;
  $("#scrim").hidden = false; $("#modal").hidden = false; document.body.style.overflow = "hidden";
  const upd = () => { const m = document.querySelector("[name=m]:checked").value, f = shipFee(t.sub, m); $("#addrBox").hidden = m === "pickup";
    $("#sumBox").innerHTML = `<div class="sum"><span>책값</span><span>${won(t.sub)}</span></div><div class="sum"><span>배송비</span><span>${won(f)}</span></div><div class="sum big"><span>입금하실 금액</span><span>${won(t.sub + f)}</span></div>` };
  document.querySelectorAll("[name=m]").forEach(e => e.onchange = upd); upd();
  $("#submit").onclick = submit;
}
async function submit() {
  const m = document.querySelector("[name=m]:checked").value, nm = $("#nm").value.trim(), ph = $("#ph").value.replace(/[^\d]/g, ""), addr = $("#addr").value.trim();
  const em = $("#em").value.trim();
  if (!nm || ph.length < 9 || (m === "parcel" && !addr)) return alert("이름·연락처" + (m === "parcel" ? "·주소" : "") + "를 확인해 주세요.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) return alert("이메일을 확인해 주세요.");
  const t = totals(), f = shipFee(t.sub, m);
  const order = { name: nm, phone: ph, email: em, method: m, address: addr, depositor: $("#dep").value.trim() || nm, memo: $("#memo").value.trim(), shipping: f, total: t.sub + f,
    lines: lines().map(({ i, q }) => ({ shelf: i.shelf, shelfName: i.shelfName, barcode: i.barcode, title: i.title, cat: i.cat, price: i.price, qty: q })) };
  const btn = $("#submit"); btn.disabled = true; btn.textContent = "접수 중…";
  let no, demo = !C.ordersUrl;
  try {
    if (demo) { no = "BB-" + new Date().toISOString().slice(2, 10).replace(/-/g, "") + "-" + Math.random().toString(36).slice(2, 6).toUpperCase(); const o = store.get("bb-orders", []); o.push({ no, at: new Date().toISOString(), ...order }); store.set("bb-orders", o) }
    else { const r = await (await fetch(C.ordersUrl, { method: "POST", headers: { "Content-Type": "text/plain" }, body: JSON.stringify({ action: "order", order }) })).json(); if (!r.ok) throw new Error(r.error || "접수 실패"); no = r.no }
  } catch (e) { btn.disabled = false; btn.textContent = "주문 접수하기"; return alert("주문을 접수하지 못했어요. " + e.message) }
  cart = {}; store.set("bb-cart", cart); updateCart();
  $("#modal").innerHTML = `<div class="sheet ok"><button class="x" data-close>×</button>${demo ? `<div class="demo">데모 모드 — 실제로 접수되지 않았어요</div>` : ""}<h2>주문이 접수됐어요</h2><div class="ono">${esc(no)}</div>
   <p>입금하실 금액 <b>${won(order.total)}</b><br>${C.bank.account ? `${esc(C.bank.name)} ${esc(C.bank.account)} (${esc(C.bank.holder)})` : "입금 계좌 안내는 곧 문자로 드릴게요."}<br>입금 확인 후 ${m === "pickup" ? "픽업 안내를" : "발송 안내를"} 드려요.</p></div>`;
}
function lookup() {
  $("#modal").innerHTML = `<div class="sheet form"><button class="x" data-close>×</button><h2 style="font:700 20px 'Noto Serif KR';color:var(--head)">주문 조회</h2>
  <label>주문번호</label><input id="lno" placeholder="BB-…"><label>연락처</label><input id="lph" type="tel"><button class="cta" id="lgo" style="margin-top:14px">조회</button><div id="lres" class="box" hidden></div></div>`;
  $("#scrim").hidden = false; $("#modal").hidden = false;
  $("#lgo").onclick = async () => {
    const no = $("#lno").value.trim(), ph = $("#lph").value.replace(/[^\d]/g, ""); let o;
    if (!C.ordersUrl) o = store.get("bb-orders", []).find(x => x.no === no && x.phone === ph);
    else { try { const r = await (await fetch(`${C.ordersUrl}?action=lookup&no=${encodeURIComponent(no)}&phone=${ph}`)).json(); o = r.ok ? r.order : null } catch {} }
    const el = $("#lres"); el.hidden = false;
    el.innerHTML = o ? `<b>${esc(o.status || "접수")}</b> · ${o.lines.map(l => esc(split(l.title)[0]) + " ×" + l.qty).join(", ")}<br>합계 ${won(o.total)}` : "일치하는 주문이 없어요.";
  };
}

// ── 이벤트
document.addEventListener("click", e => {
  const t = e.target, el = t.closest("[data-c],[data-add],[data-open],[data-close],[data-inc],[data-dec],[data-rm],[data-checkout]");
  if (t.id === "scrim" || el?.hasAttribute("data-close")) return closeAll();
  if (t.id === "modal") return closeAll();
  if (!el) return;
  if (el.dataset.c !== undefined) { st.cat = el.dataset.c; st.shown = PAGE; return render() }
  if ("add" in el.dataset) { const id = el.dataset.id || el.closest("[data-id]").dataset.id; if (!cart[id]) setQty(id, 1); render(); drawCart(); $("#modal").hidden = true; open($("#drawer")); return }
  if ("open" in el.dataset) return detail(el.closest("[data-id]").dataset.id);
  if (el.dataset.inc) return setQty(el.dataset.inc, (cart[el.dataset.inc] || 0) + 1);
  if (el.dataset.dec) return setQty(el.dataset.dec, (cart[el.dataset.dec] || 0) - 1);
  if (el.dataset.rm) return setQty(el.dataset.rm, 0);
  if ("checkout" in el.dataset) return checkout();
});
$("#cartBtn").onclick = () => { drawCart(); open($("#drawer")) };
$("#lookupBtn").onclick = e => { e.preventDefault(); lookup() };
$("#q").oninput = e => { st.q = e.target.value; st.shown = PAGE; render() };
$("#shelf").onchange = e => { st.shelf = e.target.value; st.shown = PAGE; render() };
$("#sort").onchange = e => { st.sort = e.target.value; render() };
$("#more").onclick = () => { st.shown += PAGE; render() };
document.addEventListener("keydown", e => e.key === "Escape" && closeAll());
load().catch(e => { $("#grid").innerHTML = `<p class="empty">서가를 불러오지 못했어요. (${esc(e.message)})</p>` });
})();
