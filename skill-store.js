// 技能包商店前端（2026-09-08）：畫卡片、會員框、下載、送禮、領禮物碼。
// 資料來源：window.SKILL_STORE（skill-store-data.js）＋ /api/skill-access。
// 沒登入：顯示價格與「傳送門購買」；登入後：能下載的包按鈕變「會員下載」，其餘顯示原因。
// 暱稱與密碼只放 sessionStorage，關分頁就忘，不放 cookie、不放 localStorage。
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

  let session = null;   // {nick, pw}
  let state = null;     // API 回的 state
  let ready = [];       // 已有 Drive 連結的包

  const load = () => { try { session = JSON.parse(sessionStorage.getItem('skillstore.session') || 'null'); } catch { session = null; } };
  const save = () => { try { session ? sessionStorage.setItem('skillstore.session', JSON.stringify(session)) : sessionStorage.removeItem('skillstore.session'); } catch {} };

  async function call(payload) {
    const r = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    let j; try { j = await r.json(); } catch { j = { ok: false, error: '後端沒有回應' }; }
    return j;
  }
  const auth = (extra) => Object.assign({ nick: session.nick, pw: session.pw }, extra);

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
        if (p.portalyUrl && p.price != null) row.append(el('a', { class: 'skill-btn-primary', href: p.portalyUrl, target: '_blank', rel: 'noopener' }, '傳送門購買'));
        else row.append(el('span', { class: 'skill-btn-primary is-disabled', 'aria-disabled': 'true' }, p.price == null ? '定價中' : '準備中'));
        if (st && st.why && st.why !== '準備中') row.append(el('span', { class: 'ss-why' }, st.why));
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
      box.append(
        el('div', { class: 'ss-title' }, '會員登入'),
        el('p', { class: 'ss-note' }, '買過課程或技能包、或拿到江江給的通關碼，就能在這裡登入下載。沒有 email、不留個資，只要暱稱和密碼。'),
        el('div', { class: 'ss-form' },
          el('input', { id: 'ss-nick', placeholder: '暱稱', maxlength: '20', autocomplete: 'username' }),
          el('input', { id: 'ss-pw', placeholder: '密碼（4 到 20 字）', type: 'password', maxlength: '20', autocomplete: 'current-password' }),
          el('button', { class: 'skill-btn-primary', type: 'button', onclick: login }, '登入')),
        el('details', { class: 'ss-details' },
          el('summary', {}, '第一次使用？建立暱稱'),
          el('p', { class: 'ss-note' }, '要帶一組通關碼：Portaly 訂單編號（買完課程的訂單頁上有）、或江江給你的碼。訂單編號會先送去核對，江江確認後權益才生效。'),
          el('div', { class: 'ss-form' },
            el('input', { id: 'ss-code0', placeholder: '通關碼或訂單編號', maxlength: '40' }),
            el('button', { class: 'skill-btn-copy', type: 'button', onclick: register }, '建立並登入'))),
        el('details', { class: 'ss-details' },
          el('summary', {}, '朋友送你禮物碼？'),
          el('div', { class: 'ss-form' },
            el('input', { id: 'ss-token', placeholder: '禮物碼（8 碼）', maxlength: '12' }),
            el('button', { class: 'skill-btn-copy', type: 'button', onclick: redeem }, '領取'))),
        el('div', { id: 'ss-msg', class: 'ss-msg' }));
      return;
    }
    const remain = state.remainingKind === 'unlimited' ? '不限' : state.remainingKind === 'monthly_budget' ? `本月還有 ${state.remaining} 元額度` : state.remainingKind === 'count' ? `還可下載 ${state.remaining} 包` : '目前沒有下載方案';
    const codes = el('ul', { class: 'ss-codes' });
    for (const c of state.codes) codes.append(el('li', {}, `${c.type === 'order' ? '訂單' : '通關碼'} ${c.value}`, el('span', { class: 'ss-tag ' + c.status }, c.status === 'ok' ? '已生效' : '待核對')));
    box.append(...[
      el('div', { class: 'ss-title' }, `你好，${state.nick}`),
      el('p', { class: 'ss-note' }, remain + (state.gifts > 0 ? `｜可送朋友 ${state.gifts} 次` : '')),
      state.sources.length ? el('p', { class: 'ss-note' }, '權益來源：' + state.sources.join('、')) : null,
      codes,
      el('details', { class: 'ss-details' },
        el('summary', {}, '又買了課？加一組碼'),
        el('div', { class: 'ss-form' },
          el('input', { id: 'ss-code1', placeholder: '通關碼或訂單編號', maxlength: '40' }),
          el('button', { class: 'skill-btn-copy', type: 'button', onclick: addCode }, '加入'))),
      el('div', { class: 'ss-form' }, el('button', { class: 'skill-btn-copy', type: 'button', onclick: logout }, '登出')),
      el('div', { id: 'ss-msg', class: 'ss-msg' }),
    ].filter(Boolean)); // DOM append(null) 會印出字串 null，先濾掉
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
    const nick = $('#ss-nick').value.trim(), pw = $('#ss-pw').value, code = $('#ss-code0').value.trim();
    if (!nick || !pw) return msg('先在上面填暱稱和密碼', 'err');
    if (!code) return msg('要帶一組通關碼或訂單編號', 'err');
    msg('建立中…');
    const j = await call({ action: 'register', nick, pw, code });
    if (!j.ok) return msg(j.error, 'err');
    session = { nick, pw }; save(); state = j.state; renderMember(); renderGrid();
    if (j.note) msg(j.note, 'ok');
  }
  async function addCode() {
    const code = $('#ss-code1').value.trim();
    if (!code) return msg('請貼上通關碼或訂單編號', 'err');
    msg('加入中…');
    const j = await call(auth({ action: 'add-code', code }));
    if (!j.ok) return msg(j.error, 'err');
    state = j.state; renderMember(); renderGrid(); msg(j.note || '已加入', 'ok');
  }
  function logout() { session = null; state = null; save(); renderMember(); renderGrid(); }
  async function download(pack) {
    msg('取得連結中…');
    const j = await call(auth({ action: 'download', pack }));
    if (!j.ok) return msg(j.error, 'err');
    state = j.state; renderGrid();
    window.open(j.url, '_blank', 'noopener');
    msg(`${pack} 已開新分頁。連結是你個人的使用授權，請不要轉傳。`, 'ok');
  }
  async function gift(pack) {
    if (!confirm(`送一份「${pack}」給朋友？會用掉一次送禮額度。`)) return;
    msg('產生禮物碼…');
    const j = await call(auth({ action: 'gift', pack }));
    if (!j.ok) return msg(j.error, 'err');
    state = j.state; renderMember(); renderGrid();
    const text = `江江教練技能包「${j.pack} ${j.title}」禮物碼：${j.token}\n到 ${location.origin}/skills.html 的會員框「朋友送你禮物碼？」輸入，${j.days} 天內有效，只能用一次。`;
    try { await navigator.clipboard.writeText(text); } catch {}
    const m = $('#ss-msg'); m.className = 'ss-msg ok'; m.innerHTML = '';
    m.append(el('div', {}, '禮物碼已產生並複製到剪貼簿，貼給朋友：'), el('pre', { class: 'ss-pre' }, text));
  }
  async function redeem() {
    const token = $('#ss-token').value.trim();
    if (!token) return msg('請輸入禮物碼', 'err');
    msg('領取中…');
    const j = await call({ action: 'redeem', token });
    if (!j.ok) return msg(j.error, 'err');
    window.open(j.url, '_blank', 'noopener');
    msg(`已領取「${j.pack} ${j.title}」，Drive 已開新分頁。這組碼已作廢。`, 'ok');
  }

  async function init() {
    if (!$('#skill-store-grid')) return;
    load();
    try { const c = await call({ action: 'catalog' }); if (c.ok) ready = c.ready; } catch {}
    if (session) {
      const j = await call({ action: 'login', nick: session.nick, pw: session.pw });
      if (j.ok) state = j.state; else { session = null; save(); }
    }
    renderMember(); renderGrid();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
