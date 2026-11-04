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
    '#jy-comments .jc-crop{margin:8px 0 12px}' +
    '#jy-comments .jc-crop canvas{display:block;margin:0 auto 10px;border-radius:12px;touch-action:none;cursor:grab;background:#eee}' +
    '#jy-comments .jc-crop label{display:flex;align-items:center;gap:10px;max-width:260px;margin:0 auto}' +
    '#jy-comments .jc-crop input[type=range]{flex:1}' +
    '#jy-comments .jc-crop .jc-note{text-align:center;margin:8px 0 0}' +
    '#jy-comments .jc-main{flex:1;min-width:0}' +
    '#jy-comments .jc-meta{font-size:.9rem;color:var(--ink-soft,#635c53)}' +
    '#jy-comments .jc-meta b{color:var(--ink,#1a1612);margin-right:8px}' +
    '#jy-comments .jc-body{white-space:pre-wrap;overflow-wrap:anywhere;margin:2px 0 0}' +
    '#jy-comments .jc-act{background:none!important;border:0!important;color:var(--ink-soft,#635c53)!important;padding:0!important;font-size:.88rem!important;text-decoration:underline;margin-left:10px}';

  // 上傳頭像：10MB 以內的照片都可以，網站自動處理；跳出裁切框讓讀者拖動位置、放大縮小，
  // 確定後在瀏覽器裡轉成 256px 小圖再送（重新繪製也會去掉照片裡的拍攝地點等 EXIF 資訊）
  var PHOTO_MAX = 10 * 1024 * 1024;
  function loadImage(file) {
    return new Promise(function (resolve, reject) {
      if (!file || !/^image\//.test(file.type || 'image/')) return reject(new Error('請選一張照片'));
      if (file.size > PHOTO_MAX) return reject(new Error('照片超過 10MB，請換一張小一點的'));
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () { URL.revokeObjectURL(url); img.naturalWidth ? resolve(img) : reject(new Error('讀不到這張照片')); };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('這個格式讀不了，請換 JPG 或 PNG 照片')); };
      img.src = url;
    });
  }
  function encodeAvatar(canvas) {
    var out = canvas.toDataURL('image/webp', 0.85);
    if (out.indexOf('data:image/webp') !== 0) out = canvas.toDataURL('image/jpeg', 0.85);
    var q = 0.75;
    while (out.length * 0.75 > 280 * 1024 && q > 0.3) { out = canvas.toDataURL('image/jpeg', q); q -= 0.15; }
    return out;
  }
  // 裁切框：拖動調位置、滑桿調大小；回傳 Promise<dataURL>，取消回傳 null
  function cropper(container, img) {
    return new Promise(function (resolve) {
      var VIEW = 240, OUT = 256;
      var wrap = el('div', 'jc-crop');
      var cv = el('canvas'); var dpr = Math.min(window.devicePixelRatio || 1, 3);
      cv.width = cv.height = Math.round(VIEW * dpr); cv.style.width = cv.style.height = VIEW + 'px';
      cv.setAttribute('aria-label', '拖動照片調整位置');
      var zl = el('label', null, '大小'); var zoom = el('input'); zoom.type = 'range'; zoom.min = '1'; zoom.max = '4'; zoom.step = '0.01'; zoom.value = '1';
      zoom.setAttribute('aria-label', '放大縮小'); zl.appendChild(zoom);
      var tip = el('p', 'jc-note', '拖動照片調整位置，用滑桿放大縮小，圓圈裡就是頭像會顯示的樣子。');
      var row = el('div', 'jc-row'); var right = el('span');
      var cancel = el('button', 'jc-ghost', '取消'); cancel.type = 'button';
      var ok = el('button', null, '使用這張'); ok.type = 'button';
      right.appendChild(cancel); right.appendChild(document.createTextNode(' ')); right.appendChild(ok);
      row.appendChild(el('span')); row.appendChild(right);
      wrap.appendChild(cv); wrap.appendChild(zl); wrap.appendChild(tip); wrap.appendChild(row);
      container.appendChild(wrap);
      var W = img.naturalWidth, H = img.naturalHeight;
      var base = Math.max(VIEW / W, VIEW / H);      // 剛好蓋滿方框的縮放
      var scale = base, cx = W / 2, cy = H / 2;      // cx, cy：方框中心對到照片的哪一點
      function clamp() {
        var half = VIEW / 2 / scale;
        cx = Math.min(Math.max(cx, half), W - half); cy = Math.min(Math.max(cy, half), H - half);
      }
      function drawTo(canvas, size) {
        var ctx = canvas.getContext('2d'), k = size / VIEW, half = VIEW / 2 / scale;
        ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, size, size);
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, cx - half, cy - half, half * 2, half * 2, 0, 0, size, size);
        return ctx;
      }
      function draw() {
        clamp();
        var ctx = drawTo(cv, cv.width), s = cv.width;
        ctx.save(); ctx.fillStyle = 'rgba(0,0,0,.45)'; ctx.beginPath(); ctx.rect(0, 0, s, s);
        ctx.arc(s / 2, s / 2, s / 2 - 1, 0, Math.PI * 2, true); ctx.fill('evenodd'); ctx.restore();
      }
      var drag = null;
      cv.addEventListener('pointerdown', function (e) { drag = { x: e.clientX, y: e.clientY, cx: cx, cy: cy }; cv.setPointerCapture(e.pointerId); e.preventDefault(); });
      cv.addEventListener('pointermove', function (e) {
        if (!drag) return;
        cx = drag.cx - (e.clientX - drag.x) / scale; cy = drag.cy - (e.clientY - drag.y) / scale; draw();
      });
      var end = function () { drag = null; };
      cv.addEventListener('pointerup', end); cv.addEventListener('pointercancel', end);
      cv.addEventListener('wheel', function (e) {
        e.preventDefault(); zoom.value = String(Math.min(4, Math.max(1, Number(zoom.value) * (e.deltaY < 0 ? 1.08 : 0.93))));
        zoom.dispatchEvent(new Event('input'));
      }, { passive: false });
      zoom.addEventListener('input', function () { scale = base * Number(zoom.value); draw(); });
      function done(v) { if (wrap.parentNode) wrap.parentNode.removeChild(wrap); resolve(v); }
      cancel.addEventListener('click', function () { done(null); });
      ok.addEventListener('click', function () {
        var out = document.createElement('canvas'); out.width = out.height = OUT; drawTo(out, OUT); done(encodeAvatar(out));
      });
      draw();
    });
  }

  function avatar(name, picture, emoji) {
    var a = el('div', 'jc-av' + (emoji ? ' jc-emoji' : ''));
    var initial = el('span', null, emoji || Array.from(name || '讀')[0]);
    if (picture && (/^https:\/\/[a-z0-9.-]+\.googleusercontent\.com\//.test(picture) || /^\/member\/avatar\/[A-Za-z0-9_-]{12}\?v=[a-z0-9]+$/.test(picture))) {
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
    sec.appendChild(el('p', 'jc-note', '用 Google 帳號登入就能留言，登入後可以自己取暱稱、上傳頭像照片。不會顯示 email。請不要在留言裡放個資。'));
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
      var msg = el('span', 'jc-msg');
      var chosen = user.avatar;
      var newImage = '';
      var opts = [];
      var file = el('input'); file.type = 'file'; file.accept = 'image/*'; file.style.display = 'none';
      var upBtn = el('button', null, '＋'); upBtn.type = 'button'; upBtn.title = '上傳照片'; upBtn.setAttribute('aria-label', '上傳照片');
      if (user.uploaded) { var upImg = el('img'); upImg.alt = ''; upImg.src = user.uploaded; upBtn.textContent = ''; upBtn.appendChild(upImg); }
      opts.push({ v: 'upload', node: upBtn, label: '上傳照片' });
      if (user.googlePicture) opts.push({ v: 'google', pic: user.googlePicture, label: 'Google 照片' });
      opts.push({ v: 'initial', text: Array.from((input.value.trim() || user.googleName || '讀'))[0], label: '名字首字' });
      EMOJIS.forEach(function (e) { opts.push({ v: 'e:' + e, text: e, label: e }); });
      var buttons = [];
      opts.forEach(function (o) {
        var b = o.node || el('button'); b.type = 'button'; b.setAttribute('aria-label', o.label); b.title = o.label;
        if (o.pic) { var im = el('img'); im.alt = ''; im.referrerPolicy = 'no-referrer'; im.src = o.pic; b.appendChild(im); }
        else if (!o.node) b.textContent = o.text;
        b.setAttribute('aria-pressed', String(o.v === chosen));
        var pick = function () { chosen = o.v; buttons.forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); }); };
        b.addEventListener('click', function () {
          if (o.v === 'upload' && (!user.uploaded || newImage || chosen === 'upload')) { file.click(); return; }
          pick();
        });
        if (o.v === 'upload') {
          file.addEventListener('change', function () {
            msg.textContent = '照片讀取中…';
            var f = file.files[0]; file.value = '';
            loadImage(f).then(function (img) {
              msg.textContent = '';
              grid.style.display = 'none';
              return cropper(cropSlot, img);
            }).then(function (data) {
              grid.style.display = '';
              if (!data) return;
              newImage = data;
              b.textContent = ''; var im2 = el('img'); im2.alt = ''; im2.src = data; b.appendChild(im2);
              pick();
            }).catch(function (e) { grid.style.display = ''; msg.textContent = e.message; });
          });
        }
        buttons.push(b); grid.appendChild(b);
      });
      var cropSlot = el('div');
      ed.appendChild(grid); ed.appendChild(cropSlot); ed.appendChild(file);
      ed.appendChild(el('p', 'jc-note', '按「＋」選一張照片（10MB 以內），可以拖動、放大調整，網站會自動縮成小頭像再上傳，也會去掉照片裡的拍攝地點資訊。'));
      var row = el('div', 'jc-row');
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
        var first = (chosen === 'upload' && newImage)
          ? api('/member/avatar', { method: 'POST', body: { image: newImage } })
          : Promise.resolve({ _status: 200 });
        first.then(function (up) {
          if (up._status !== 200) throw new Error(up.error || '照片上傳失敗，請換一張再試');
          newImage = '';
          return api('/member/profile', { method: 'POST', body: { nick: input.value, avatar: chosen } });
        }).then(function (d) {
          if (d._status === 200 && d.user) { user = d.user; renderBox(); refresh(); }
          else { msg.textContent = d.error || '儲存失敗，請稍後再試'; save.disabled = false; }
        }).catch(function (e) { msg.textContent = (e && e.message) || '儲存失敗，請稍後再試'; save.disabled = false; });
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
      if (user && user.admin && !c.mine && /^\/member\/avatar\//.test(c.picture || '')) {
        var rm = el('button', 'jc-act', '移除頭像'); rm.type = 'button';
        rm.addEventListener('click', function () {
          if (!confirm('移除這位讀者上傳的頭像？')) return;
          api('/member/comments/reset-avatar', { method: 'POST', body: { page: page, id: c.id } }).then(function (d) { if (d.ok) refresh(); });
        });
        meta.appendChild(rm);
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
