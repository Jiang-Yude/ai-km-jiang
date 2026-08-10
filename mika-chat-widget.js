/* ─── 咪卡 AI 客服 Widget ───
   用法：每個頁面加一行 <script src="mika-chat-widget.js" defer></script>
   會自動注入 CSS 與 HTML。聊天記錄與開合狀態存 localStorage，跨頁面延續。
   目前為純介面：回覆是示意文字，後端接上後把 fakeReply() 換成真 API 呼叫。 */
(function () {
  'use strict';
  if (document.getElementById('mkw-root')) return;

  var STORE_KEY = 'mikaChat.history.v1';
  var OPEN_KEY = 'mikaChat.open.v1';
  var VID_KEY = 'mikaChat.vid.v1';
  var SID_KEY = 'mikaChat.sid.v1';
  var NAME_KEY = 'mikaChat.name.v1';
  var SIZE_KEY = 'mikaChat.size.v1';   // s／m／l 三段，跨頁記住
  var MAX_HISTORY = 60;
  /* 端點（正式站＝同網域 serverless；file:// 校稿時自動走示意回覆）
     記錄＝匿名統計用：只看大家都問什麼，不追個人軌跡（江江 2026-08-07 拍板，去中心化原則） */
  var LOG_ENDPOINT = window.MIKA_CHAT_LOG_ENDPOINT || '/api/mika-chat-log';
  var CHAT_ENDPOINT = window.MIKA_CHAT_ENDPOINT || '/api/mika-chat';
  var IS_DEMO = !/^https?:$/.test(location.protocol);

  /* 依本支 script 的位置自動找 CSS 與圖片（同資料夾） */
  var scriptEl = document.currentScript;
  var base = scriptEl ? scriptEl.src.replace(/[^\/]*$/, '') : '';

  var css = document.createElement('link');
  css.rel = 'stylesheet';
  css.href = base + 'mika-chat-widget.css';
  document.head.appendChild(css);

  var GREETING = '嗨，我是咪卡，江江教練官網的 AI 小幫手 🐾\n關於課程、講座、1 對 1 陪跑或知識庫方法，都可以問我！\n先請問一下，怎麼稱呼你呢？';
  var CHIPS = [
    '江江提供哪些服務？',
    '怎麼預約 1 對 1？',
    '免費講座什麼時候？'
  ];

  /* ── 稱呼（訪客自報，純標籤：不驗證、不是帳號） ── */
  function getName() {
    try { return localStorage.getItem(NAME_KEY) || ''; } catch (e) { return ''; }
  }
  function setName(n) {
    try { localStorage.setItem(NAME_KEY, n); } catch (e) {}
  }
  /* 看起來像問題就不是稱呼（訪客跳過提問也沒關係，不追問） */
  function looksLikeQuestion(t) {
    return t.length > 10 || /[?？]|嗎|請問|怎麼|什麼|如何|哪/.test(t);
  }

  /* ── 示意回覆（file:// 校稿模式與斷線備援用） ── */
  function fakeReply(userText) {
    return '（介面預覽版，回覆為示意）\n咪卡收到你的問題：「' + userText + '」\n正式版上線後，我會根據江江的知識庫內容回答你。';
  }

  /* ── 真回覆：問咪卡的大腦端點（人設＋站內檢索＋LLM） ── */
  function askMika(done) {
    var recent = history.slice(-12).map(function (m) {
      return { role: m.role, text: m.text };
    });
    fetch(CHAT_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: recent, name: getName() || undefined, page: location.pathname })
    }).then(function (r) { return r.json(); }).then(function (data) {
      if (data && data.reply) done(data.reply, data.sources || []);
      else done('（咪卡歪歪頭）我這邊怪怪的，等一下再問我一次好嗎？', []);
    }).catch(function () {
      done('（咪卡抓抓頭）連線好像不太穩，等一下再試一次好嗎？', []);
    });
  }

  /* ── 狀態 ── */
  function loadHistory() {
    try {
      var raw = localStorage.getItem(STORE_KEY);
      var arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch (e) { return []; }
  }
  function saveHistory(list) {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(list.slice(-MAX_HISTORY))); } catch (e) {}
  }
  var history = loadHistory();

  /* ── 訪客識別（查詢後台用：vid=同一台瀏覽器、sid=同一次瀏覽） ── */
  function randId() {
    return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
  }
  function getId(store, key) {
    try {
      var v = store.getItem(key);
      if (!v) { v = randId(); store.setItem(key, v); }
      return v;
    } catch (e) { return 'na'; }
  }
  var vid = getId(localStorage, VID_KEY);
  var sid = getId(sessionStorage, SID_KEY);

  /* ── 對話記錄回傳（fire-and-forget，失敗不影響前台；name＝訪客自報稱呼） ── */
  function logMsg(role, text) {
    if (IS_DEMO) return;
    try {
      fetch(LOG_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        keepalive: true,
        body: JSON.stringify({
          vid: vid, sid: sid, role: role,
          name: getName() || undefined,
          text: String(text).slice(0, 500),
          page: location.pathname
        })
      }).catch(function () {});
    } catch (e) {}
  }

  /* ── DOM ── */
  var root = document.createElement('div');
  root.id = 'mkw-root';
  root.innerHTML =
    '<button class="mkw-launcher" type="button" aria-label="打開咪卡聊天視窗">' +
      '<span class="mkw-launcher-avatar"></span>' +
      '<span class="mkw-launcher-text">找咪卡聊聊？</span>' +
      '<span class="mkw-launcher-dot"></span>' +
    '</button>' +
    '<div class="mkw-panel" role="dialog" aria-label="咪卡 AI 客服">' +
      '<div class="mkw-head">' +
        '<span class="mkw-head-avatar"></span>' +
        '<div><div class="mkw-head-title">咪卡</div>' +
        '<div class="mkw-head-sub">AI 小幫手</div></div>' +
        '<div class="mkw-head-actions">' +
          '<button class="mkw-icon-btn mkw-size" type="button" title="切換視窗大小" aria-label="切換視窗大小">⤢</button>' +
          '<button class="mkw-icon-btn mkw-clear" type="button" title="清除對話" aria-label="清除對話">⟲</button>' +
          '<button class="mkw-icon-btn mkw-close" type="button" title="收合" aria-label="收合聊天視窗">✕</button>' +
        '</div>' +
      '</div>' +
      '<div class="mkw-body"></div>' +
      '<div class="mkw-chips"></div>' +
      '<div class="mkw-foot">' +
        '<div class="mkw-input-row">' +
          '<input class="mkw-input" type="text" placeholder="我想問咪卡…" aria-label="輸入訊息" />' +
          '<button class="mkw-send" type="button" aria-label="送出">' +
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 2 11 13"/><path d="M22 2 15 22l-4-9-9-4z"/></svg>' +
          '</button>' +
        '</div>' +
        '<div class="mkw-limit" aria-live="polite"></div>' +
      '</div>' +
    '</div>';
  document.body.appendChild(root);

  var launcher = root.querySelector('.mkw-launcher');
  var body = root.querySelector('.mkw-body');
  var chipsBox = root.querySelector('.mkw-chips');
  var input = root.querySelector('.mkw-input');

  /* ── 渲染 ── */
  function scrollBottom() { body.scrollTop = body.scrollHeight; }

  function renderMsg(msg) {
    var el = document.createElement('div');
    el.className = 'mkw-msg ' + (msg.role === 'user' ? 'mkw-user' : 'mkw-bot');
    var bubble = '<div class="mkw-bubble"></div>';
    el.innerHTML = (msg.role === 'user' ? '' : '<span class="mkw-msg-avatar"></span>') + bubble;
    var bub = el.querySelector('.mkw-bubble');
    bub.textContent = msg.text;
    /* 咪卡引用的文章連結（來自自家端點，逐一 DOM 建立，不用 innerHTML） */
    if (msg.sources && msg.sources.length) {
      var box = document.createElement('div');
      box.className = 'mkw-sources';
      msg.sources.forEach(function (s) {
        if (!s || !s.url) return;
        var a = document.createElement('a');
        a.className = 'mkw-source-link';
        a.href = s.url;
        a.target = '_blank';
        a.rel = 'noopener';
        a.textContent = '📄 ' + (s.title || s.url);
        box.appendChild(a);
      });
      bub.appendChild(box);
    }
    body.appendChild(el);
  }

  function renderAll() {
    body.innerHTML = '';
    if (history.length === 0) {
      renderMsg({ role: 'bot', text: GREETING });
    } else {
      history.forEach(renderMsg);
    }
    renderChips();
    scrollBottom();
  }

  function renderChips() {
    /* 快捷問題在訪客問出第一個真問題前都顯示（自報稱呼那句不算問題） */
    chipsBox.innerHTML = '';
    var asked = history.some(function (m) { return m.role === 'user' && !m.isName; });
    if (asked) return;
    CHIPS.forEach(function (q) {
      var b = document.createElement('button');
      b.className = 'mkw-chip';
      b.type = 'button';
      b.textContent = q;
      b.addEventListener('click', function () { send(q); });
      chipsBox.appendChild(b);
    });
  }

  function showTyping() {
    var el = document.createElement('div');
    el.className = 'mkw-msg mkw-bot mkw-typing';
    el.innerHTML = '<span class="mkw-msg-avatar"></span><div class="mkw-bubble"><span>●</span> <span>●</span> <span>●</span></div>';
    body.appendChild(el);
    scrollBottom();
    return el;
  }

  /* ── 行為 ── */
  var MAX_INPUT = 500;
  var limitNote = root.querySelector('.mkw-limit');

  /* 字數提示：超過 400 字出現計數，超過 500 字變警告 */
  input.addEventListener('input', function () {
    var len = input.value.trim().length;
    if (len > MAX_INPUT) {
      limitNote.textContent = '（咪卡舉起小牌子）一次最多 ' + MAX_INPUT + ' 字，目前 ' + len + ' 字，分段問我吧！';
      limitNote.classList.add('mkw-limit-over');
    } else if (len > 400) {
      limitNote.textContent = len + ' / ' + MAX_INPUT + ' 字';
      limitNote.classList.remove('mkw-limit-over');
    } else {
      limitNote.textContent = '';
      limitNote.classList.remove('mkw-limit-over');
    }
  });

  function send(text) {
    text = (text || '').trim();
    if (!text) return;
    if (text.length > MAX_INPUT) {
      limitNote.textContent = '（咪卡舉起小牌子）一次最多 ' + MAX_INPUT + ' 字，目前 ' + text.length + ' 字，分段問我吧！';
      limitNote.classList.add('mkw-limit-over');
      return;
    }
    limitNote.textContent = '';
    limitNote.classList.remove('mkw-limit-over');

    /* 第一句而且不像問題 → 當成稱呼收下 */
    var isNameReply = !getName() && !history.some(function (m) { return m.role === 'user'; })
      && !looksLikeQuestion(text);
    if (isNameReply) setName(text.slice(0, 20));

    history.push({ role: 'user', text: text, isName: isNameReply || undefined });
    saveHistory(history);
    renderMsg(history[history.length - 1]);
    renderChips();
    input.value = '';
    scrollBottom();
    logMsg('user', text);

    var typing = showTyping();
    function finish(replyText, sources) {
      typing.remove();
      var reply = { role: 'bot', text: replyText };
      if (sources && sources.length) reply.sources = sources;
      history.push(reply);
      saveHistory(history);
      renderMsg(reply);
      updateSub();
      renderChips();
      scrollBottom();
      logMsg('bot', reply.text);
    }

    if (isNameReply) {
      /* 收稱呼不花 LLM，本地暖回應 */
      setTimeout(function () {
        finish(getName() + ' 你好，很高興認識你！🐾\n想了解什麼都可以直接問，下面幾個是大家常問的。');
      }, 900);
    } else if (IS_DEMO) {
      setTimeout(function () { finish(fakeReply(text)); }, 900);
    } else {
      askMika(finish);
    }
  }

  function updateSub() {
    var n = getName();
    root.querySelector('.mkw-head-sub').textContent = n ? '嗨，' + n : 'AI 小幫手';
  }

  function setOpen(open) {
    root.classList.toggle('mkw-open', open);
    try { localStorage.setItem(OPEN_KEY, open ? '1' : '0'); } catch (e) {}
    if (open) {
      renderAll();
      setTimeout(scrollBottom, 240);
    }
  }

  /* 三段視窗大小：小（原本）／中／大。存 localStorage，跨頁沿用。 */
  var SIZES = ['s', 'm', 'l'];
  var SIZE_LABEL = { s: '小視窗', m: '中視窗', l: '大視窗' };
  function getSize() {
    try { var v = localStorage.getItem(SIZE_KEY); return SIZES.indexOf(v) >= 0 ? v : 's'; } catch (e) { return 's'; }
  }
  function applySize(sz) {
    SIZES.forEach(function (x) { root.classList.remove('mkw-size-' + x); });
    root.classList.add('mkw-size-' + sz);
    try { localStorage.setItem(SIZE_KEY, sz); } catch (e) {}
    var btn = root.querySelector('.mkw-size');
    if (btn) btn.title = SIZE_LABEL[sz] + '（點一下換下一段）';
  }
  applySize(getSize());
  root.querySelector('.mkw-size').addEventListener('click', function () {
    var next = SIZES[(SIZES.indexOf(getSize()) + 1) % SIZES.length];
    applySize(next);
    scrollBottom();
  });

  launcher.addEventListener('click', function () { setOpen(true); input.focus(); });
  root.querySelector('.mkw-close').addEventListener('click', function () { setOpen(false); });
  root.querySelector('.mkw-clear').addEventListener('click', function () {
    history = [];
    saveHistory(history);
    renderAll();
  });
  root.querySelector('.mkw-send').addEventListener('click', function () { send(input.value); });
  input.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.isComposing) send(input.value);
  });

  /* 換頁後還原：視窗原本開著就繼續開著、稱呼跟著走。
     還原時跳過開窗動畫，換頁感覺是「一直開著」而不是重新彈出 */
  updateSub();
  renderAll();
  var wasOpen = false;
  try { wasOpen = localStorage.getItem(OPEN_KEY) === '1'; } catch (e) {}
  if (wasOpen) {
    var panel = root.querySelector('.mkw-panel');
    panel.style.transition = 'none';
    setOpen(true);
    setTimeout(function () { panel.style.transition = ''; }, 80);
  }
})();
