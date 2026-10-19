/* ============================================================
   member.js  ·  會員系統前端（Google 登入、留言區、會員頁）
   ------------------------------------------------------------
   文章頁：放 <section id="member-comments" class="member-comments" data-page="articles/<slug>/"></section>
           與 <script src="/member.js" defer></script>。
           留言區會自動移到頁尾（footer）前面，也就是「相關文章」區塊之後。
   會員頁：member/index.html 放 <div id="member-panel"></div>。
   安全：登入狀態只靠 HttpOnly cookie，這支程式讀不到也不存任何身分資料；
        伺服器回來的文字都已跳脫，這裡用 innerHTML 顯示時不再重複跳脫。
   樣式：寫在 styles.css 的「會員系統」區塊（.member- 前綴）。文章頁沒有載入 styles.css，
        這支會只抽出那一段注入，樣式只有一份正本。
   ============================================================ */
(function () {
  'use strict';

  var GSI_SRC = 'https://accounts.google.com/gsi/client';
  var me = null, gsiPromise = null, gsiReady = false, listeners = [];

  function api(path, method, body) {
    var opt = {method: method || 'GET', credentials: 'same-origin', headers: {}};
    if (body !== undefined) { opt.headers['Content-Type'] = 'application/json'; opt.body = JSON.stringify(body); }
    return fetch(path, opt).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) { j._status = r.status; return j; });
    }).catch(function () { return {_status: 0, error: 'network'}; });
  }
  function unesc(s) { var t = document.createElement('textarea'); t.innerHTML = s || ''; return t.value; }
  function el(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  function fmtTime(ts) {
    try { return new Date(ts).toLocaleString('zh-TW', {timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false}); }
    catch (e) { return ''; }
  }
  function errText(j) {
    if (j._status === 429) return '操作太頻繁，請稍後再試。';
    if (j._status === 401) return '請先登入。';
    if (j._status === 0) return '網路連線失敗，請稍後再試。';
    if (j._status === 400 && j.error && /[一-鿿]/.test(j.error)) return j.error;
    return '暫時無法完成，請稍後再試。';
  }

  /* ── 樣式：文章頁沒有 styles.css，只抽會員區塊注入 ── */
  function ensureCss() {
    var flag = getComputedStyle(document.documentElement).getPropertyValue('--member-css');
    if (flag && flag.trim()) return;
    if (document.getElementById('member-css')) return;
    fetch('/styles.css', {credentials: 'same-origin'}).then(function (r) { return r.text(); }).then(function (css) {
      var a = css.indexOf('/* member:start */'), b = css.indexOf('/* member:end */');
      if (a < 0 || b < a) return;
      var st = document.createElement('style'); st.id = 'member-css'; st.textContent = css.slice(a, b);
      document.head.appendChild(st);
    }).catch(function () {});
  }

  /* ── 登入狀態 ── */
  function loadMe() { return api('/member/me').then(function (j) { me = j; return j; }); }
  function onChange(fn) { listeners.push(fn); }
  function refreshAll() { return loadMe().then(function () { listeners.forEach(function (fn) { fn(); }); }); }

  function loadGsi() {
    if (gsiPromise) return gsiPromise;
    gsiPromise = new Promise(function (resolve, reject) {
      var s = document.createElement('script'); s.src = GSI_SRC; s.async = true; s.defer = true;
      s.onload = function () { resolve(); }; s.onerror = function () { gsiPromise = null; reject(); };
      document.head.appendChild(s);
    });
    return gsiPromise;
  }
  function onCredential(resp) {
    api('/member/login', 'POST', {credential: resp && resp.credential}).then(function (j) {
      if (!j.ok) { alert(j._status === 401 ? 'Google 登入驗證失敗，請再試一次。' : errText(j)); return; }
      refreshAll();
    });
  }
  function renderLoginButton(box) {
    box.innerHTML = '';
    if (!me || !me.googleClientId) { box.appendChild(el('p', 'member-hint', '登入功能尚未開放。')); return; }
    var holder = el('div', 'member-gsi');
    box.appendChild(holder);
    loadGsi().then(function () {
      if (!window.google || !google.accounts || !google.accounts.id) throw new Error('gsi');
      if (!gsiReady) {
        google.accounts.id.initialize({client_id: unesc(me.googleClientId), callback: onCredential, auto_select: false, ux_mode: 'popup'});
        gsiReady = true;
      }
      google.accounts.id.renderButton(holder, {theme: 'outline', size: 'large', text: 'signin_with', shape: 'pill', locale: 'zh-TW'});
    }).catch(function () { holder.innerHTML = '<p class="member-hint">Google 登入元件載入失敗，請重新整理頁面。</p>'; });
  }

  // 已登入：頭像、暱稱、改暱稱、登出
  function renderUserBar(box) {
    var m = me.member;
    box.innerHTML = '';
    var bar = el('div', 'member-user');
    if (m.picture) { var img = el('img', 'member-avatar'); img.src = unesc(m.picture); img.alt = ''; img.referrerPolicy = 'no-referrer'; bar.appendChild(img); }
    bar.appendChild(el('span', 'member-nick', m.nick));
    var edit = el('button', 'member-link', '改暱稱'); edit.type = 'button';
    var out = el('button', 'member-link', '登出'); out.type = 'button';
    bar.appendChild(edit); bar.appendChild(out);
    box.appendChild(bar);
    var form = el('form', 'member-nick-form'); form.hidden = true;
    form.innerHTML = '<label>新暱稱 <input name="nick" maxlength="20" required></label> <button type="submit" class="member-btn">儲存</button> <span class="member-msg" role="status"></span>';
    box.appendChild(form);
    edit.addEventListener('click', function () { form.hidden = !form.hidden; form.nick.value = unesc(m.nick); form.nick.focus(); });
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var msg = form.querySelector('.member-msg');
      api('/member/nick', 'POST', {nick: form.nick.value}).then(function (j) {
        if (!j.ok) { msg.textContent = errText(j); return; }
        refreshAll();
      });
    });
    out.addEventListener('click', function () {
      api('/member/logout', 'POST', {}).then(function () {
        if (window.google && google.accounts && google.accounts.id) google.accounts.id.disableAutoSelect();
        refreshAll();
      });
    });
  }
  function renderAuth(box) { if (me && me.loggedIn) renderUserBar(box); else renderLoginButton(box); }

  /* ── 文章留言區 ── */
  function initComments(sec) {
    var page = sec.getAttribute('data-page') || '';
    // 移到頁尾前（相關文章區塊之後）
    var footer = document.querySelector('footer.footer') || document.querySelector('footer');
    if (footer && footer.parentNode && (sec.compareDocumentPosition(footer) & Node.DOCUMENT_POSITION_PRECEDING)) footer.parentNode.insertBefore(sec, footer);
    sec.innerHTML = '<div class="member-inner">' +
      '<h2 class="member-title">留言與提問</h2>' +
      '<p class="member-hint">看完有問題，歡迎在下面留言。用 Google 登入後以暱稱顯示，不會公開你的 Email。</p>' +
      '<div class="member-auth"></div>' +
      '<form class="member-form" hidden>' +
      '<div class="member-replying" hidden></div>' +
      '<label class="member-guest" hidden>暱稱 <input name="nick" maxlength="20"></label>' +
      '<textarea name="text" rows="4" maxlength="1000" placeholder="寫下你的問題或想法（2 到 1000 字）" required></textarea>' +
      '<div class="member-form-row"><span class="member-count">0 / 1000</span><button type="submit" class="member-btn">送出留言</button></div>' +
      '<p class="member-msg" role="status"></p></form>' +
      '<ol class="member-list"></ol></div>';
    var auth = sec.querySelector('.member-auth'), form = sec.querySelector('.member-form'), list = sec.querySelector('.member-list');
    var count = sec.querySelector('.member-count'), msg = form.querySelector('.member-msg'), replying = sec.querySelector('.member-replying');
    var guestBox = sec.querySelector('.member-guest'), parentId = null;

    function setReply(id, nick) {
      parentId = id;
      if (!id) { replying.hidden = true; replying.innerHTML = ''; return; }
      replying.hidden = false;
      replying.innerHTML = '回覆 ' + nick + ' <button type="button" class="member-link">取消</button>';
      replying.querySelector('button').addEventListener('click', function () { setReply(null); });
      form.text.focus();
    }
    function draw() {
      renderAuth(auth);
      var canWrite = me && (me.loggedIn || me.guestComment);
      form.hidden = !canWrite;
      guestBox.hidden = !(me && !me.loggedIn && me.guestComment);
    }
    function loadList() {
      api('/member/comments?page=' + encodeURIComponent(page)).then(function (j) {
        list.innerHTML = '';
        if (!j.comments) { list.appendChild(el('li', 'member-empty', '留言暫時載入不了。')); return; }
        if (!j.comments.length) { list.appendChild(el('li', 'member-empty', '還沒有留言，歡迎第一個提問。')); return; }
        var byId = {}, roots = [];
        j.comments.forEach(function (c) { c.children = []; byId[c.id] = c; });
        j.comments.forEach(function (c) { if (c.parent && byId[c.parent]) byId[c.parent].children.push(c); else roots.push(c); });
        roots.forEach(function (c) { list.appendChild(item(c, true)); });
      });
    }
    function item(c, top) {
      var li = el('li', 'member-item' + (c.mine ? ' is-mine' : ''));
      li.innerHTML = '<div class="member-meta"><b>' + c.nick + '</b> <time>' + fmtTime(c.ts) + '</time></div>' +
        '<div class="member-text">' + String(c.text).replace(/\n/g, '<br>') + '</div>';
      if (top && me && (me.loggedIn || me.guestComment)) {
        var b = el('button', 'member-link', '回覆'); b.type = 'button';
        b.addEventListener('click', function () { setReply(c.id, c.nick); });
        li.appendChild(b);
      }
      if (c.children && c.children.length) {
        var ol = el('ol', 'member-replies');
        c.children.forEach(function (k) { ol.appendChild(item(k, false)); });
        li.appendChild(ol);
      }
      return li;
    }
    form.text.addEventListener('input', function () { count.textContent = Array.from(form.text.value.trim()).length + ' / 1000'; });
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var btn = form.querySelector('button[type=submit]'); btn.disabled = true; msg.textContent = '';
      var body = {page: page, text: form.text.value, parent: parentId};
      if (!me.loggedIn) body.nick = form.nick.value;
      api('/member/comments', 'POST', body).then(function (j) {
        btn.disabled = false;
        if (!j.ok) { msg.textContent = errText(j); return; }
        form.text.value = ''; count.textContent = '0 / 1000'; setReply(null);
        msg.textContent = j.status === 'pending' ? '已收到，審核後會顯示。' : '留言已送出。';
        loadList();
      });
    });
    onChange(function () { draw(); loadList(); });
    draw(); loadList();
  }

  /* ── 會員頁 ── */
  function initPanel(panel) {
    function draw() {
      panel.innerHTML = '';
      var auth = el('div', 'member-auth'); panel.appendChild(auth);
      renderAuth(auth);
      if (!me || !me.loggedIn) {
        panel.appendChild(el('p', 'member-hint', '用 Google 帳號登入。登入後會用暱稱顯示，Email 只有你自己和站長看得到。'));
        return;
      }
      var m = me.member;
      var info = el('div', 'member-card');
      info.innerHTML = '<h2 class="member-title">我的等級</h2><ul class="member-tiers">' +
        m.tiers.map(function (t) { return '<li>' + t.name + '</li>'; }).join('') + '</ul>' +
        '<p class="member-hint">登入帳號：' + m.email + '。如果你在傳送門買過課程但這裡沒顯示，請把購買時用的 Email 告訴江江補登記。</p>';
      panel.appendChild(info);
      var box = el('div', 'member-card', '<h2 class="member-title">我能看的內容</h2><p class="member-hint">載入中…</p>');
      panel.appendChild(box);
      api('/member/entitlements').then(function (j) {
        var items = (j.content || []).map(function (c) {
          return '<li><a href="' + c.url + '">' + c.title + '</a> <span class="member-tag">' + c.tierName + '</span></li>';
        });
        box.innerHTML = '<h2 class="member-title">我能看的內容</h2>' +
          (items.length ? '<ul class="member-content-list">' + items.join('') + '</ul>' : '<p class="member-hint">目前沒有專屬內容。</p>');
      });
    }
    onChange(draw);
    draw();
  }

  function init() {
    var sec = document.getElementById('member-comments'), panel = document.getElementById('member-panel');
    if (!sec && !panel) return;
    ensureCss();
    loadMe().then(function () {
      if (sec) initComments(sec);
      if (panel) initPanel(panel);
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
