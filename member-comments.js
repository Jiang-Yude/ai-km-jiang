/* 文章留言區（Google 登入）｜2026-11-04
   後端：cloudflare/member.mjs（/member/*）。會員功能未啟用、或服務暫時連不上時，整區不出現，不影響文章。
   安全：所有留言、名稱一律用 textContent 放進畫面，不用 innerHTML；寫入帶 X-JY-Member 標頭。 */
(function () {
  'use strict';
  var page = location.pathname;
  if (!/^\/(articles|ai-trends)\/[a-z0-9][a-z0-9-]*\/$/.test(page)) return;
  if (document.getElementById('jy-comments')) return;

  var MAX = 1000;
  var NICK_MAX = 20;
  var EMOJIS = ['🐱', '🐶', '🦊', '🐼', '🐻', '🐰', '🦉', '🐢', '🐳', '🌻', '☕', '📚'];
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function api(path, opt) {
    opt = opt || {};
    var headers = { 'Accept': 'application/json' };
    if (opt.body) { headers['Content-Type'] = 'application/json'; headers['X-JY-Member'] = '1'; }
    return fetch(path, { method: opt.method || 'GET', headers: headers, body: opt.body ? JSON.stringify(opt.body) : undefined, credentials: 'same-origin' })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (d) { d._status = r.status; return d; }); });
  }
  function fmt(ts) {
    try { return new Intl.DateTimeFormat('zh-TW', { timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(ts)); }
    catch (e) { return ''; }
  }

  var css = '' +
    '#jy-comments{max-width:760px;margin:56px auto 40px;padding:0 16px;font-size:17px;line-height:1.8}' +
    '#jy-comments h2{font-size:1.5rem;margin:0 0 6px}' +
    '#jy-comments .jc-note{color:var(--ink-soft,#635c53);font-size:.95rem;margin:0 0 18px}' +
    '#jy-comments .jc-box{background:var(--bg-soft,#faf5ec);border-radius:14px;padding:16px;margin:0 0 22px}' +
    '#jy-comments textarea{width:100%;box-sizing:border-box;min-height:110px;padding:12px;border:1px solid var(--line,#e8dfc9);border-radius:10px;font:inherit;background:#fff;resize:vertical}' +
    '#jy-comments .jc-row{display:flex;flex-wrap:wrap;gap:10px;align-items:center;justify-content:space-between;margin-top:10px}' +
    '#jy-comments button,#jy-comments .jc-login{font:inherit;font-size:.98rem;padding:8px 18px;border-radius:999px;border:1px solid var(--ink,#1a1612);background:var(--ink,#1a1612);color:#fff;cursor:pointer;text-decoration:none;display:inline-block}' +
    '#jy-comments button.jc-ghost{background:transparent;color:var(--ink,#1a1612)}' +
    '#jy-comments button[disabled]{opacity:.5;cursor:default}' +
    '#jy-comments .jc-count{font-size:.9rem;color:var(--ink-soft,#635c53)}' +
    '#jy-comments .jc-msg{font-size:.95rem;color:var(--c-coral,#c9402f);min-height:1.2em}' +
    '#jy-comments ol{list-style:none;margin:0;padding:0}' +
    '#jy-comments li{display:flex;gap:12px;padding:14px 0;border-top:1px solid var(--line,#e8dfc9)}' +
    '#jy-comments li.jc-hidden{opacity:.5}' +
    '#jy-comments .jc-av{flex:0 0 40px;width:40px;height:40px;border-radius:50%;background:var(--line,#e8dfc9);display:flex;align-items:center;justify-content:center;font-weight:700;overflow:hidden}' +
    '#jy-comments .jc-av img{width:100%;height:100%;object-fit:cover}' +
    '#jy-comments .jc-av.jc-emoji{font-size:22px;background:#fff;border:1px solid var(--line,#e8dfc9)}' +
    '#jy-comments .jc-me{display:flex;align-items:center;gap:10px;margin:0 0 10px;flex-wrap:wrap}' +
    '#jy-comments .jc-me .jc-av{flex-basis:32px;width:32px;height:32px;font-size:15px}' +
    '#jy-comments .jc-edit{background:#fff;border:1px solid var(--line,#e8dfc9);border-radius:12px;padding:14px;margin:0 0 12px}' +
    '#jy-comments .jc-edit label{display:block;font-size:.95rem;margin:0 0 4px}' +
    '#jy-comments .jc-edit input{width:100%;box-sizing:border-box;padding:9px 12px;border:1px solid var(--line,#e8dfc9);border-radius:10px;font:inherit}' +
    '#jy-comments .jc-grid{display:flex;flex-wrap:wrap;gap:8px;margin:8px 0 12px}' +
    '#jy-comments .jc-grid button{width:46px;height:46px;padding:0!important;border-radius:50%!important;background:#fff!important;color:inherit!important;border:2px solid var(--line,#e8dfc9)!important;font-size:22px!important;overflow:hidden;display:flex;align-items:center;justify-content:center}' +
    '#jy-comments .jc-grid button[aria-pressed="true"]{border-color:var(--c-coral,#c9402f)!important;box-shadow:0 0 0 2px rgba(201,64,47,.25)}' +
    '#jy-comments .jc-grid img{width:100%;height:100%;object-fit:cover}' +
    '#jy-comments .jc-main{flex:1;min-width:0}' +
    '#jy-comments .jc-meta{font-size:.9rem;color:var(--ink-soft,#635c53)}' +
    '#jy-comments .jc-meta b{color:var(--ink,#1a1612);margin-right:8px}' +
    '#jy-comments .jc-body{white-space:pre-wrap;overflow-wrap:anywhere;margin:2px 0 0}' +
    '#jy-comments .jc-act{background:none!important;border:0!important;color:var(--ink-soft,#635c53)!important;padding:0!important;font-size:.88rem!important;text-decoration:underline;margin-left:10px}';

  function avatar(name, picture, emoji) {
    var a = el('div', 'jc-av' + (emoji ? ' jc-emoji' : ''));
    var initial = el('span', null, emoji || Array.from(name || '讀')[0]);
    if (picture && /^https:\/\/[a-z0-9.-]+\.googleusercontent\.com\//.test(picture)) {
      var img = el('img');
      img.alt = ''; img.loading = 'lazy'; img.referrerPolicy = 'no-referrer'; img.src = picture;
      img.onerror = function () { a.textContent = ''; a.appendChild(initial); };
      a.appendChild(img);
    } else a.appendChild(initial);
    return a;
  }

  function mount(data) {
    var style = el('style'); style.textContent = css; document.head.appendChild(style);
    var sec = el('section'); sec.id = 'jy-comments'; sec.setAttribute('aria-label', '留言');
    sec.appendChild(el('h2', null, '留言'));
    sec.appendChild(el('p', 'jc-note', '用 Google 帳號登入就能留言，登入後可以自己取暱稱、換頭像。不會顯示 email。請不要在留言裡放個資。'));
    var box = el('div', 'jc-box'); sec.appendChild(box);
    var list = el('ol'); sec.appendChild(list);
    var empty = el('p', 'jc-note', '還沒有留言，歡迎當第一個。');

    var user = data.user;
    function renderBox() {
      box.textContent = '';
      if (!user) {
        var p = el('p', null, '想留言或提問？');
        var a = el('a', 'jc-login', '用 Google 登入');
        a.href = '/member/login?return=' + encodeURIComponent(page + '#jy-comments');
        p.appendChild(document.createTextNode(' ')); p.appendChild(a);
        box.appendChild(p);
        return;
      }
      var me = el('div', 'jc-me');
      me.appendChild(avatar(user.name, user.picture, user.emoji));
      me.appendChild(el('span', null, '以「' + user.name + '」留言'));
      var editBtn = el('button', 'jc-act', '編輯暱稱與頭像'); editBtn.type = 'button';
      me.appendChild(editBtn);
      box.appendChild(me);
      editBtn.addEventListener('click', function () { openEditor(); });
      var ta = el('textarea'); ta.maxLength = MAX * 2; ta.placeholder = '想說什麼？';
      ta.setAttribute('aria-label', '留言內容');
      var row = el('div', 'jc-row');
      var count = el('span', 'jc-count', '0 / ' + MAX);
      var right = el('span');
      var out = el('button', 'jc-ghost', '登出'); out.type = 'button';
      var send = el('button', null, '送出留言'); send.type = 'button'; send.disabled = true;
      right.appendChild(out); right.appendChild(document.createTextNode(' ')); right.appendChild(send);
      row.appendChild(count); row.appendChild(right);
      var msg = el('div', 'jc-msg');
      box.appendChild(ta); box.appendChild(row); box.appendChild(msg);
      ta.addEventListener('input', function () {
        var n = Array.from(ta.value.trim()).length;
        count.textContent = n + ' / ' + MAX; send.disabled = n < 1 || n > MAX;
      });
      send.addEventListener('click', function () {
        send.disabled = true; msg.textContent = '';
        api('/member/comments', { method: 'POST', body: { page: page, body: ta.value } }).then(function (d) {
          if (d._status === 201 && d.comment) { ta.value = ''; count.textContent = '0 / ' + MAX; addItem(d.comment, true); }
          else { msg.textContent = d.error || '送出失敗，請稍後再試'; send.disabled = false; }
        }).catch(function () { msg.textContent = '送出失敗，請稍後再試'; send.disabled = false; });
      });
      out.addEventListener('click', function () {
        api('/member/logout', { method: 'POST', body: {} }).then(function () { user = null; renderBox(); refresh(); });
      });
    }

    function openEditor() {
      if (box.querySelector('.jc-edit')) return;
      var ed = el('div', 'jc-edit');
      var lab = el('label', null, '暱稱（留空就用 Google 名稱，最多 ' + NICK_MAX + ' 字）');
      var input = el('input'); input.type = 'text'; input.maxLength = NICK_MAX * 2; input.value = user.nick || ''; input.placeholder = user.googleName || '';
      lab.htmlFor = input.id = 'jc-nick';
      ed.appendChild(lab); ed.appendChild(input);
      ed.appendChild(el('label', null, '頭像'));
      var grid = el('div', 'jc-grid'); grid.setAttribute('role', 'group'); grid.setAttribute('aria-label', '選擇頭像');
      var chosen = user.avatar;
      var opts = [];
      if (user.googlePicture) opts.push({ v: 'google', pic: user.googlePicture, label: 'Google 照片' });
      opts.push({ v: 'initial', text: Array.from((input.value.trim() || user.googleName || '讀'))[0], label: '名字首字' });
      EMOJIS.forEach(function (e) { opts.push({ v: 'e:' + e, text: e, label: e }); });
      var buttons = [];
      opts.forEach(function (o) {
        var b = el('button'); b.type = 'button'; b.setAttribute('aria-label', o.label); b.title = o.label;
        if (o.pic) { var im = el('img'); im.alt = ''; im.referrerPolicy = 'no-referrer'; im.src = o.pic; b.appendChild(im); }
        else b.textContent = o.text;
        b.setAttribute('aria-pressed', String(o.v === chosen));
        b.addEventListener('click', function () { chosen = o.v; buttons.forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); }); });
        buttons.push(b); grid.appendChild(b);
      });
      ed.appendChild(grid);
      var row = el('div', 'jc-row');
      var msg = el('span', 'jc-msg');
      var right = el('span');
      var cancel = el('button', 'jc-ghost', '取消'); cancel.type = 'button';
      var save = el('button', null, '儲存'); save.type = 'button';
      right.appendChild(cancel); right.appendChild(document.createTextNode(' ')); right.appendChild(save);
      row.appendChild(msg); row.appendChild(right); ed.appendChild(row);
      box.insertBefore(ed, box.firstChild.nextSibling);
      input.focus();
      cancel.addEventListener('click', function () { ed.parentNode.removeChild(ed); });
      save.addEventListener('click', function () {
        save.disabled = true; msg.textContent = '';
        api('/member/profile', { method: 'POST', body: { nick: input.value, avatar: chosen } }).then(function (d) {
          if (d._status === 200 && d.user) { user = d.user; renderBox(); refresh(); }
          else { msg.textContent = d.error || '儲存失敗，請稍後再試'; save.disabled = false; }
        }).catch(function () { msg.textContent = '儲存失敗，請稍後再試'; save.disabled = false; });
      });
    }

    function addItem(c, isNew) {
      if (empty.parentNode) empty.parentNode.removeChild(empty);
      var li = el('li', c.hidden ? 'jc-hidden' : null);
      li.appendChild(avatar(c.name, c.picture, c.emoji));
      var main = el('div', 'jc-main');
      var meta = el('div', 'jc-meta');
      meta.appendChild(el('b', null, c.name));
      meta.appendChild(document.createTextNode(fmt(c.ts) + (c.hidden ? '（已隱藏）' : '')));
      if (c.mine || (user && user.admin)) {
        var act = el('button', 'jc-act', c.mine ? '刪除' : (c.hidden ? '取消隱藏' : '隱藏')); act.type = 'button';
        act.addEventListener('click', function () {
          if (c.mine && !confirm('確定刪除這則留言？')) return;
          api('/member/comments/delete', { method: 'POST', body: { page: page, id: c.id, restore: !!c.hidden } }).then(function (d) {
            if (d.deleted) li.parentNode && li.parentNode.removeChild(li);
            else if (d.ok) refresh();
          });
        });
        meta.appendChild(act);
      }
      main.appendChild(meta);
      main.appendChild(el('p', 'jc-body', c.body));
      li.appendChild(main);
      list.appendChild(li);
      if (isNew) li.scrollIntoView({ block: 'nearest' });
    }

    function render(comments) {
      list.textContent = '';
      if (!comments.length) list.appendChild(empty);
      comments.forEach(function (c) { addItem(c, false); });
    }
    function refresh() {
      api('/member/comments?page=' + encodeURIComponent(page)).then(function (d) {
        if (d._status === 200) { user = d.user; renderBox(); render(d.comments || []); }
      });
    }

    renderBox(); render(data.comments || []);
    var anchor = document.querySelector('footer.footer') || document.querySelector('footer');
    if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(sec, anchor);
    else document.body.appendChild(sec);
    if (location.hash === '#jy-comments') sec.scrollIntoView();
  }

  function start() {
    api('/member/config').then(function (cfg) {
      if (!cfg || cfg.enabled !== true) return;
      return api('/member/comments?page=' + encodeURIComponent(page)).then(function (d) {
        if (d._status === 200) mount(d);
      });
    }).catch(function () { /* 服務連不上就整區不出現 */ });
  }
  if ('IntersectionObserver' in window && document.querySelector('footer')) {
    var io = new IntersectionObserver(function (es) {
      if (es.some(function (e) { return e.isIntersecting; })) { io.disconnect(); start(); }
    }, { rootMargin: '1200px 0px' });
    io.observe(document.querySelector('footer'));
    if (location.hash === '#jy-comments') { io.disconnect(); start(); }
  } else start();
})();
