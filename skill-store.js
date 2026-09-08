// 技能包商店前端（2026-09-08）：畫卡片、會員框、下載、送禮、領禮物碼。
// 資料來源：window.SKILL_STORE（skill-store-data.js）＋ /api/skill-access。
// 沒登入：顯示價格與「傳送門購買」；登入後：能下載的包按鈕變「會員下載」，其餘顯示原因。
// 暱稱與密碼只放 sessionStorage，關分頁就忘，不放 cookie、不放 localStorage。
// 2026-09-08 SSR 走查後修：新用戶表單一氣呵成、待核對狀態說清楚、開 Drive 先開分頁再導向（Safari 擋彈窗）、
// 禮物連結帶 ?gift= 自動帶入、訂單編號送出前確認一次。
(function () {
  'use strict';
  const API = '/api/skill-access';
  const STORE = window.SKILL_STORE || { packs: [] };
  const $ = (sel, root) => (root || document).querySelector(sel);
  const el = (tag, attrs, ...kids) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (k === 'class') n.className = v;
      else if (k === 'html') n.innerHTML = v;
      else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v);
    }
    for (const k of kids) if (k != null) n.append(k.nodeType ? k : document.createTextNode(String(k)));
    return n;
  };
  const fmtPrice = (p) => (p == null ? '定價中' : 'NT$' + Number(p).toLocaleString('zh-Hant-TW'));
  const HELP = '急的話找右下角的咪卡留言，或 LINE 江江。';

  let session = null;   // {nick, pw}
  let state = null;     // API 回的 state
  let ready = [];       // 已有 Drive 連結的包
  let giftPrefill = ''; // 網址 ?gift= 帶進來的禮物碼

  const load = () => { try { session = JSON.parse(sessionStorage.getItem('skillstore.session') || 'null'); } catch { session = null; } };
  const save = () => { try { session ? sessionStorage.setItem('skillstore.session', JSON.stringify(session)) : sessionStorage.removeItem('skillstore.session'); } catch {} };

  async function call(payload) {
    let r;
    try { r = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }); }
    catch { return { ok: false, error: '連不上後端，請檢查網路後再試' }; }
    let j; try { j = await r.json(); } catch { j = { ok: false, error: '後端沒有回應' }; }
    return j;
  }
  const auth = (extra) => Object.assign({ nick: session.nick, pw: session.pw }, extra);
  const hasPending = () => !!(state && state.codes && state.codes.some((c) => c.status !== 'ok'));

  // Safari／iPhone 會擋「網路請求完成後」才開的分頁：點擊當下先開空白分頁，成功再導向，失敗就關掉。
  // 不管有沒有被擋，訊息區一律再放一個可點連結當保險。
  function preOpen() { try { return window.open('about:blank', '_blank'); } catch { return null; } }
  function deliver(win, url, text) {
    let opened = false;
    if (win && !win.closed) { try { win.location.href = url; opened = true; } catch {} }
    const m = $('#ss-msg'); if (!m) return;
    m.className = 'ss-msg ok'; m.innerHTML = '';
    m.append(el('div', {}, text + (opened ? '（已開新分頁）' : '')), el('a', { href: url, target: '_blank', rel: 'noopener', class: 'ss-link' }, '沒跳出來？點這裡開 Drive'));
  }
  function closeWin(win) { if (win && !win.closed) { try { win.close(); } catch {} } }

  // ── 卡片 ──
  function renderGrid() {
    const grid = $('#skill-store-grid');
    if (!grid) return;
    grid.innerHTML = '';
    for (const p of STORE.packs) {
      const st = state && state.packs.find((x) => x.id === p.id);
      const isReady = ready.includes(p.id);
      const actions = el('div', { class: 'skill-actions' });
      const row = el('div', { class: 'skill-action-row' });
      if (st && st.can) {
        row.append(el('button', { class: 'skill-btn-primary', type: 'button', onclick: () => download(p.id) }, st.downloaded ? '再下載一次' : '會員下載'));
        if (state.gifts > 0) row.append(el('button', { class: 'skill-btn-copy', type: 'button', onclick: () => gift(p.id) }, '送一份給朋友'));
      } else {
        if (p.portalyUrl && p.price != null && isReady) row.append(el('a', { class: 'skill-btn-primary', href: p.portalyUrl, target: '_blank', rel: 'noopener' }, '傳送門購買'));
        else row.append(el('span', { class: 'skill-btn-primary is-disabled', 'aria-disabled': 'true' }, !isReady ? '準備中' : '定價中'));
        // 登入了但什麼方案都還沒有（訂單待核對）：每張卡都寫「不在你的方案內」像被拒，原因改集中寫在會員框
        const showWhy = st && st.why && st.why !== '準備中' && state.plan !== 'none';
        if (showWhy) row.append(el('span', { class: 'ss-why' }, st.why));
      }
      actions.append(row);
      grid.append(el('article', { class: 'skill-card ss-card', 'data-pack': p.id },
        el('div', { class: 'skill-id' }, p.id + (isReady ? '' : ' · 準備中')),
        el('h3', {}, p.title),
        el('p', {}, p.line),
        el('div', { class: 'ss-price' }, fmtPrice(p.price)),
        actions));
    }
  }

  // ── 會員框 ──
  function msg(text, kind) {
    const m = $('#ss-msg'); if (!m) return;
    m.textContent = text || ''; m.className = 'ss-msg' + (kind ? ' ' + kind : '');
  }
  function renderMember() {
    const box = $('#ss-member'); if (!box) return;
    box.innerHTML = '';
    if (!state) {
      const giftDetails = el('details', { class: 'ss-details', id: 'ss-gift-details' },
        el('summary', {}, '朋友送你禮物碼？'),
        el('p', { class: 'ss-note' }, '不用建立帳號，直接輸入就能拿到 Drive 連結。禮物碼 30 天內有效，只能用一次。'),
        el('div', { class: 'ss-form' },
          el('input', { id: 'ss-token', placeholder: '禮物碼（8 碼）', maxlength: '12', value: giftPrefill }),
          el('button', { class: 'skill-btn-copy', type: 'button', onclick: redeem }, '領取')));
      if (giftPrefill) giftDetails.open = true;
      box.append(
        el('div', { class: 'ss-title' }, '會員登入'),
        el('p', { class: 'ss-note' }, '買過課程（有傳送門訂單編號）、或拿到江江給的通關碼，就能在這裡登入下載。沒有 email、不留個資，只要暱稱和密碼。'),
        el('div', { class: 'ss-form' },
          el('input', { id: 'ss-nick', placeholder: '暱稱', maxlength: '20', autocomplete: 'username' }),
          el('input', { id: 'ss-pw', placeholder: '密碼', type: 'password', maxlength: '20', autocomplete: 'current-password' }),
          el('button', { class: 'skill-btn-primary', type: 'button', onclick: login }, '登入')),
        el('p', { class: 'ss-note ss-small' }, '忘記密碼？找江江重設（右下角咪卡留言或 LINE），訂單不會不見。'),
        el('details', { class: 'ss-details', id: 'ss-reg-details' },
          el('summary', {}, '第一次來？在這裡建立暱稱'),
          el('p', { class: 'ss-note' }, '三格都填，按一次就好。通關碼＝傳送門（Portaly）訂單編號（買完的訂單頁上有），或江江給你的碼。訂單編號送出後由江江人工核對，核對完權益才生效。'),
          el('div', { class: 'ss-form' },
            el('input', { id: 'ss-rnick', placeholder: '想用的暱稱（2 到 20 字，不能有空白）', maxlength: '20', autocomplete: 'off' }),
            el('input', { id: 'ss-rpw', placeholder: '自己設一組密碼（4 到 20 字）', type: 'password', maxlength: '20', autocomplete: 'new-password' }),
            el('input', { id: 'ss-code0', placeholder: '通關碼或訂單編號', maxlength: '40', autocomplete: 'off' }),
            el('button', { class: 'skill-btn-copy', type: 'button', onclick: register }, '建立並登入'))),
        giftDetails,
        el('div', { id: 'ss-msg', class: 'ss-msg' }));
      return;
    }
    const remain = state.remainingKind === 'unlimited' ? '不限' : state.remainingKind === 'monthly_budget' ? `本月還有 ${state.remaining} 元額度` : state.remainingKind === 'count' ? `還可下載 ${state.remaining} 包` : '';
    const codes = el('ul', { class: 'ss-codes' });
    for (const c of state.codes) codes.append(el('li', {}, `${c.type === 'order' ? '訂單' : '通關碼'} ${c.value}`, el('span', { class: 'ss-tag ' + c.status }, c.status === 'ok' ? '已生效' : '待核對')));
    let statusLine;
    if (state.plan === 'none' && hasPending()) statusLine = el('p', { class: 'ss-note ss-pending' }, '訂單核對中。江江會分批人工核對，核對完成後這裡會出現可下載的包，到時再登入看一次就好。' + HELP);
    else if (state.plan === 'none') statusLine = el('p', { class: 'ss-note' }, '目前沒有可下載的方案。' + HELP);
    else statusLine = el('p', { class: 'ss-note' }, remain + (state.gifts > 0 ? `｜可送朋友 ${state.gifts} 次` : ''));
    box.append(...[
      el('div', { class: 'ss-title' }, `你好，${state.nick}`),
      statusLine,
      state.sources.length ? el('p', { class: 'ss-note' }, '權益來源：' + state.sources.join('、')) : null,
      codes,
      el('details', { class: 'ss-details' },
        el('summary', {}, '又買了課？加一組碼'),
        el('div', { class: 'ss-form' },
          el('input', { id: 'ss-code1', placeholder: '通關碼或訂單編號', maxlength: '40' }),
          el('button', { class: 'skill-btn-copy', type: 'button', onclick: addCode }, '加入'))),
      el('p', { class: 'ss-note ss-small' }, '訂單編號打錯了？找江江幫你改（右下角咪卡留言或 LINE）。'),
      el('div', { class: 'ss-form' }, el('button', { class: 'skill-btn-copy', type: 'button', onclick: logout }, '登出')),
      el('div', { id: 'ss-msg', class: 'ss-msg' }),
    ].filter(Boolean)); // DOM append(null) 會印出字串 null，先濾掉
  }

  // 訂單編號送出後自己改不了：看起來像訂單編號（不是江江發的短碼）就先確認一次
  function confirmCode(code) {
    return confirm(`你輸入的是「${code}」。\n送出後自己不能改，打錯要找江江。確定沒錯？`);
  }

  async function login() {
    const nick = $('#ss-nick').value.trim(), pw = $('#ss-pw').value;
    if (!nick || !pw) return msg('暱稱和密碼都要填', 'err');
    msg('登入中…');
    const j = await call({ action: 'login', nick, pw });
    if (!j.ok) return msg(j.error, 'err');
    session = { nick, pw }; save(); state = j.state; renderMember(); renderGrid();
  }
  async function register() {
    const nick = $('#ss-rnick').value.trim(), pw = $('#ss-rpw').value, code = $('#ss-code0').value.trim();
    if (!nick) return msg('先想一個暱稱', 'err');
    if (!pw) return msg('設一組密碼（4 到 20 字）', 'err');
    if (!code) return msg('要帶一組通關碼或訂單編號', 'err');
    if (!confirmCode(code)) return;
    msg('建立中…');
    const j = await call({ action: 'register', nick, pw, code });
    if (!j.ok) return msg(j.error, 'err');
    session = { nick, pw }; save(); state = j.state; renderMember(); renderGrid();
    if (j.note) msg(j.note, 'ok');
  }
  async function addCode() {
    const code = $('#ss-code1').value.trim();
    if (!code) return msg('請貼上通關碼或訂單編號', 'err');
    if (!confirmCode(code)) return;
    msg('加入中…');
    const j = await call(auth({ action: 'add-code', code }));
    if (!j.ok) return msg(j.error, 'err');
    state = j.state; renderMember(); renderGrid(); msg(j.note || '已加入', 'ok');
  }
  function logout() { session = null; state = null; save(); renderMember(); renderGrid(); }
  async function download(pack) {
    const win = preOpen();
    msg('取得連結中…');
    const j = await call(auth({ action: 'download', pack }));
    if (!j.ok) { closeWin(win); return msg(j.error, 'err'); }
    state = j.state; renderGrid();
    deliver(win, j.url, `${pack} 的 Drive 連結拿到了。這是你個人的使用授權，請不要轉傳。`);
  }
  async function gift(pack) {
    if (!confirm(`送一份「${pack}」給朋友？會用掉一次送禮額度。`)) return;
    msg('產生禮物碼…');
    const j = await call(auth({ action: 'gift', pack }));
    if (!j.ok) return msg(j.error, 'err');
    state = j.state; renderMember(); renderGrid();
    const link = `${location.origin}/skills.html?gift=${j.token}#ss-member`;
    const text = `江江教練技能包「${j.pack} ${j.title}」禮物碼：${j.token}\n打開 ${link} 按「領取」就好，不用建立帳號。${j.days} 天內有效，只能用一次。`;
    try { await navigator.clipboard.writeText(text); } catch {}
    const m = $('#ss-msg'); m.className = 'ss-msg ok'; m.innerHTML = '';
    m.append(el('div', {}, '禮物碼已產生並複製到剪貼簿，貼給朋友：'), el('pre', { class: 'ss-pre' }, text));
  }
  async function redeem() {
    const token = $('#ss-token').value.trim();
    if (!token) return msg('請輸入禮物碼', 'err');
    const win = preOpen();
    msg('領取中…');
    const j = await call({ action: 'redeem', token });
    if (!j.ok) { closeWin(win); return msg(j.error, 'err'); }
    deliver(win, j.url, `已領取「${j.pack} ${j.title}」。這組碼已使用，Drive 連結請自己收好。`);
  }

  async function init() {
    if (!$('#skill-store-grid')) return;
    load();
    try { giftPrefill = (new URLSearchParams(location.search).get('gift') || '').trim().toUpperCase(); } catch {}
    try { const c = await call({ action: 'catalog' }); if (c.ok) ready = c.ready; } catch {}
    if (session) {
      const j = await call({ action: 'login', nick: session.nick, pw: session.pw });
      if (j.ok) state = j.state; else { session = null; save(); }
    }
    renderMember(); renderGrid();
    if (giftPrefill) { const box = $('#ss-member'); if (box) box.scrollIntoView({ block: 'start' }); }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
