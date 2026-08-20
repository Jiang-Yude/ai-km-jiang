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
  /* 來源圖示（2026-08-12 加）。咪卡從「只推文章」擴成推全站八類之後，
     每一筆都畫 📄 會讓技能包、服務方案看起來像文章。舊訊息沒有 type 欄位，退回 📄。 */
  var SOURCE_ICONS = {
    article: '📄', course: '🎓', skill: '🧩', offer: '💼',
    case: '🏆', resource: '📦', tool: '🔧', page: '🔗',
  };
  function SOURCE_ICON(t) { return SOURCE_ICONS[t] || '📄'; }
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
  /* 簡單模式（2026-08-20 江江拍板）：學員說一句「簡單模式」或按新手鈕就切過去，
     之後一直維持（存 localStorage，跨頁沿用）。複雜版沒有退場，只是不再一次攤在他眼前。 */
  var SIMPLE_KEY = 'mikaChat.simple.v1';
  var SIMPLE_CHIP = '我是新手，帶我簡單做';
  var SIMPLE_RE = /簡單模式|簡單版|簡易模式|簡單一點|簡單點|我是新手|新手模式|帶我做|不會用/;
  function isSimple() {
    try { return localStorage.getItem(SIMPLE_KEY) === '1'; } catch (e) { return false; }
  }
  function setSimple(v) {
    try { localStorage.setItem(SIMPLE_KEY, v ? '1' : '0'); } catch (e) {}
  }

  var CHIPS = [
    '江江提供哪些服務？',
    '怎麼預約 1 對 1？',
    '免費講座什麼時候？'
  ];

  /* ── 這一頁的內容（2026-08-17 江江拍板）──
     學員上課掃 QR 進課程頁，找不到老師講的提示詞時直接問咪卡。原本咪卡只讀得到
     全站索引的摘要層（標題、一句簡介），頁面正文完全看不到，所以答不出「那段提示詞」。
     做法＝訪客按一下「我要問這一頁的內容」，widget 才把當頁文字一起送給後端。
     不預先送：整站每頁 200～25,000 字，沒人要問的時候送過去是白花成本。
     解鎖只是「多讀這一頁」，全站目錄照樣在，兩邊並存不互斥。
     首頁不放這顆（首頁就是預設模式，三顆常見問題照舊）。 */
  var UNLOCK_CHIP = '我要讀這一頁完整內容';
  var MAX_PAGE_CHARS = 30000;   // 最長的課程頁實測 25,542 字，留一點餘裕；後端另有一道截斷
  /* 免點按鈕的口語觸發（江江：學員不會每次都乖乖先按鈕）。
     命中就自動解鎖，但咪卡要先確認再答，不是悶頭當成在問這一頁。 */
  var PAGE_HINT_RE = /這一?[頁篇]|本頁|這堂|這場|這門課|剛剛|剛才|方才|老師|講師|上面(說|寫|講)|投影片|簡報|提示詞|指令/;
  var pageUnlocked = false;
  var pageAuto = false;      // 這一輪是關鍵詞自動解鎖（要先確認）還是訪客自己按的鈕

  /* 首頁不算，其餘頁面都可以解鎖 */
  function isHomePage() {
    var p = location.pathname.replace(/index\.html$/, '');
    return p === '/' || p === '' || p === '/en/';
  }

  /* 課程頁＝現場學員拿手機掃 QR 進來的那些頁，快捷鈕要換成他們用得到的 */
  function isCoursePage() {
    return /^\/(en\/)?courses\//.test(location.pathname);
  }

  /* 抽這一頁的文字。走原始 DOM 不動它（不 clone、不暫時隱藏），
     區塊標籤結尾補換行，段落結構才留得住；咪卡自己的對話框與 script 排除在外。 */
  var BLOCK_TAGS = /^(P|DIV|LI|H[1-6]|SECTION|ARTICLE|HEADER|FOOTER|TR|TD|TH|DT|DD|BLOCKQUOTE|PRE|BR|FIGCAPTION|SUMMARY|DETAILS)$/;
  var SKIP_TAGS = /^(SCRIPT|STYLE|NOSCRIPT|SVG|TEMPLATE|IFRAME|CANVAS)$/;
  function collectText(node, out) {
    if (node.nodeType === 3) { out.push(node.nodeValue); return; }
    if (node.nodeType !== 1) return;
    if (node.id === 'mkw-root') return;
    var tag = String(node.tagName || '').toUpperCase();
    if (SKIP_TAGS.test(tag)) return;
    if (node.getAttribute && node.getAttribute('aria-hidden') === 'true') return;
    for (var i = 0; i < node.childNodes.length; i++) collectText(node.childNodes[i], out);
    if (BLOCK_TAGS.test(tag)) out.push('\n');
  }
  function extractPageText() {
    /* 課程頁與首頁沒有 <main>，文章頁有；一律從有內容的那層開始走。
       列表頁（courses.html、articles.html）的內容是 JS 跑出來的，
       從畫面上的 DOM 抽才拿得到，從原始檔讀只會拿到空殼。 */
    var src = document.querySelector('main') || document.body;
    var out = [];
    try { collectText(src, out); } catch (e) { return ''; }
    return out.join('')
      .replace(/[ \t ]+/g, ' ')
      .replace(/ ?\n ?/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
      .slice(0, MAX_PAGE_CHARS);
  }
  function pageTitle() {
    var h1 = document.querySelector('h1');
    var t = (h1 && h1.textContent) || document.title || '';
    return String(t).replace(/\s+/g, ' ').trim().slice(0, 80);
  }

  /* ── 稱呼（訪客自報，純標籤：不驗證、不是帳號） ── */
  function getName() {
    try { return localStorage.getItem(NAME_KEY) || ''; } catch (e) { return ''; }
  }
  function setName(n) {
    try { localStorage.setItem(NAME_KEY, n); } catch (e) {}
  }
  /* 看起來像問題就不是稱呼（訪客跳過提問也沒關係，不追問） */
  /* 第一句要不要收成稱呼（2026-08-20 收窄，事故驅動）──
     舊寫法是「10 字以內又沒有疑問詞就當名字」，門檻太鬆。8/20 樂齡課現場有學員
     第一句打「suno 指令 給我」（剛好 10 字、沒有問號），整串被存成稱呼，標題變成
     「嗨，suno 指令 給我」，而且他真正的需求被吃掉，咪卡只回了一句「你好」。
     改成正面判定「這看起來像名字嗎」：超過 6 字、帶空格、或含需求詞一律不算。
     判錯的代價是不對稱的——當成問題只是少喊一聲名字，當成名字卻會一直掛在標題上，
     所以這裡故意從嚴。 */
  var NOT_NAME_RE = /[?？，。！、·]|給我|指令|提示詞|教我|幫我|怎麼|什麼|如何|哪|嗎|請問|可以|想要|要問|想問|我想|生成|圖片|課程|老師|模式|新手/;
  function looksLikeName(t) {
    return t.length <= 6 && !/\s/.test(t) && !NOT_NAME_RE.test(t);
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
    var payload = { messages: recent, name: getName() || undefined, page: location.pathname };
    if (isSimple()) payload.simple = true;
    /* 解鎖了才帶這一頁的內容過去。每次都重抽，不快取：
       課程頁與列表頁的內容可能在瀏覽過程中才長出來（展開段落、JS 渲染）。 */
    if (pageUnlocked) {
      var t = extractPageText();
      if (t) {
        payload.pageText = t;
        payload.pageTitle = pageTitle();
        if (pageAuto) payload.pageAuto = 1;
      }
    }
    fetch(CHAT_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
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

  /* ── 可一鍵複製的區塊（2026-08-17 江江拍板 B 案）──
     學員要的是「提示詞整段貼進自己的 ChatGPT」，所以複製出去必須是純提示詞，
     不能夾帶「這是自訂指令的提示詞喔」這種前後話。做法＝咪卡把要給人複製的內容
     用 ``` 圍起來，這裡切出來單獨成一塊，配自己的複製鈕。
     ⚠️ 安全：結構用 DOM 建、文字一律走 textContent，不用 innerHTML 塞模型輸出。 */
  function copyBlock(code) {
    var wrap = document.createElement('div');
    wrap.className = 'mkw-code';
    var pre = document.createElement('pre');
    pre.className = 'mkw-code-text';
    pre.textContent = code;
    var btn = document.createElement('button');
    btn.className = 'mkw-copy';
    btn.type = 'button';
    btn.textContent = '複製';
    btn.setAttribute('aria-label', '複製這段文字');
    btn.addEventListener('click', function () {
      function ok() {
        btn.textContent = '已複製 ✓';
        btn.classList.add('mkw-copied');
        setTimeout(function () { btn.textContent = '複製'; btn.classList.remove('mkw-copied'); }, 2000);
      }
      /* 複製不到就把整段選起來，讓訪客長按或 Ctrl+C 自己複製，不要卡在那裡。
         手機瀏覽器對 clipboard 權限的處理各有差異，這個 fallback 一定要留。 */
      function fallback() {
        try {
          var range = document.createRange();
          range.selectNodeContents(pre);
          var sel = window.getSelection();
          sel.removeAllRanges();
          sel.addRange(range);
          btn.textContent = '已選取，請自行複製';
          setTimeout(function () { btn.textContent = '複製'; }, 3000);
        } catch (e) {}
      }
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(code).then(ok).catch(fallback);
        } else { fallback(); }
      } catch (e) { fallback(); }
    });
    wrap.appendChild(btn);
    wrap.appendChild(pre);
    return wrap;
  }

  /* 依 ``` 切段：偶數段是一般說明，奇數段是要給人複製的內容 */
  function fillBubble(bub, text) {
    var parts = String(text).split(/```/);
    if (parts.length < 3) { bub.textContent = text; return; }
    parts.forEach(function (seg, i) {
      if (i % 2 === 1) {
        /* 圍欄後面可能跟著語言標記（```text），整行去掉 */
        var code = seg.replace(/^[^\n]{0,20}\n/, '').replace(/\s+$/, '');
        if (code) bub.appendChild(copyBlock(code));
        return;
      }
      var t = seg.replace(/^\n+|\n+$/g, '');
      if (!t) return;
      var p = document.createElement('div');
      p.className = 'mkw-text';
      p.textContent = t;
      bub.appendChild(p);
    });
  }

  function renderMsg(msg) {
    var el = document.createElement('div');
    el.className = 'mkw-msg ' + (msg.role === 'user' ? 'mkw-user' : 'mkw-bot');
    var bubble = '<div class="mkw-bubble"></div>';
    el.innerHTML = (msg.role === 'user' ? '' : '<span class="mkw-msg-avatar"></span>') + bubble;
    var bub = el.querySelector('.mkw-bubble');
    fillBubble(bub, msg.text);
    /* 咪卡引用的站內連結（來自自家端點，逐一 DOM 建立，不用 innerHTML） */
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
        a.textContent = SOURCE_ICON(s.type) + ' ' + (s.title || s.url);
        /* 日期另起一個小字（2026-08-11 江江實測回報：推薦文章看不到日期，日期很重要） */
        if (s.date) {
          var d = document.createElement('span');
          d.className = 'mkw-source-date';
          d.textContent = s.date;
          a.appendChild(d);
        }
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
    var asked = history.some(function (m) {
      return m.role === 'user' && !m.isName && !m.isUnlock;
    });
    if (asked) return;
    /* 首頁維持三顆常見問題；課程頁把「江江提供哪些服務」換成新手鈕（現場學員用不到服務介紹）；
       其他內頁照舊解鎖鈕＋兩顆常見問題。 */
    var list;
    if (isHomePage()) list = CHIPS;
    /* 課程簡報頁只給兩顆（江江 2026-08-20 拍板）：現場是他一步一步帶，
       選項越少越好，服務方案那類問題對現場學員沒用。 */
    else if (isCoursePage()) list = pageUnlocked ? [SIMPLE_CHIP] : [UNLOCK_CHIP, SIMPLE_CHIP];
    else list = pageUnlocked ? CHIPS : [UNLOCK_CHIP].concat(CHIPS.slice(1));
    list.forEach(function (q) {
      var b = document.createElement('button');
      b.className = 'mkw-chip' + (q === UNLOCK_CHIP ? ' mkw-chip-page' : '');
      b.type = 'button';
      b.textContent = q;
      b.addEventListener('click', function () {
        if (q === UNLOCK_CHIP) { unlockPage(); return; }
        if (q === SIMPLE_CHIP) {
          setSimple(true);
          /* 新手鈕自動先讀這一頁（2026-08-20 江江看實測後加）：
             沒讀到頁面時咪卡不知道今天有哪幾段，只能自己編選項，學員就選錯段落。
             現場只教一顆按鈕最單純，所以這裡替他把「讀這一頁」一起做掉。 */
          if (!pageUnlocked && !isHomePage()) { unlockPage(q); return; }
        }
        send(q);
      });
      chipsBox.appendChild(b);
    });
  }

  /* 學員問了這一頁的事但還沒開助教模式：只遞一顆按鈕給他，按了會接著回答他剛才那句 */
  function renderUnlockChip(pending) {
    chipsBox.innerHTML = '';
    var b = document.createElement('button');
    b.className = 'mkw-chip mkw-chip-page';
    b.type = 'button';
    b.textContent = UNLOCK_CHIP;
    b.addEventListener('click', function () { unlockPage(pending); });
    chipsBox.appendChild(b);
  }

  /* 按下解鎖鈕：本地回應不花 LLM，只把這一頁掛上來並告訴訪客可以問了。
     帶 pending 進來時（他剛才已經問過了），就不講場面話，直接把那句重問一次。 */
  function unlockPage(pending) {
    var text = extractPageText();
    pageUnlocked = true;
    /* 標記 isUnlock：按解鎖鈕不算「問過問題」，快捷鈕要留著，
       學員的下一步（新手鈕）才不會憑空消失（2026-08-20 實測抓到）。 */
    var u = { role: 'user', text: UNLOCK_CHIP, isUnlock: true };
    history.push(u);
    saveHistory(history);
    renderMsg(u);
    renderChips();
    scrollBottom();
    logMsg('user', UNLOCK_CHIP);

    if (pending) { send(pending); return; }

    var typing = showTyping();
    setTimeout(function () {
      typing.remove();
      var t = pageTitle();
      var reply = {
        role: 'bot',
        text: text
          ? '好，這一頁我讀好了 🐾\n' + (t ? '《' + t + '》' : '這一頁')
            + '想問哪一段都可以。直接打關鍵字最快，例如老師剛講的段落名稱。'
          : '（咪卡歪歪頭）這一頁的內容我讀不到耶。你直接問我看看，我從官網其他地方幫你找。'
      };
      history.push(reply);
      saveHistory(history);
      renderMsg(reply);
      scrollBottom();
      logMsg('bot', reply.text);
    }, 500);
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
      && looksLikeName(text);
    if (isNameReply) setName(text.slice(0, 20));

    /* 學員自己打「簡單模式」「我是新手」也算，不必按鈕（江江：他就是會直接用講的） */
    if (SIMPLE_RE.test(text)) setSimple(true);

    /* 純按鈕制（2026-08-20 江江拍板）：關鍵詞自動解鎖退場。
       「我要問這一頁的內容」是課程助教模式的唯一開關，咪卡不再自己猜。
       立因＝猜就會猜錯（打「老師」也可能是在問江江是什麼樣的老師），猜錯就要先確認，
       現場多這一輪確認只會讓學員更亂。改成：看得出他在問這一頁但還沒開，
       就本地回一句、把按鈕遞到他面前，他按了才進助教模式，這一輪不花 LLM。
       他按下去之後，剛才那個問題會自動重問一次，不用他再打一遍。 */
    pageAuto = false;
    var needsPage = !isNameReply && !pageUnlocked && !isHomePage() && PAGE_HINT_RE.test(text);

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

    if (needsPage) {
      setTimeout(function () {
        finish('這一頁的內容我還沒讀到喔 🐾\n按一下下面這顆，我把整頁看過就回來回答你。');
        renderUnlockChip(text);
      }, 600);
    } else if (isNameReply) {
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

  /* 視窗大小：兩邊都兩段（2026-08-11 江江拍板）。
     電腦＝中 480×660 與 大全螢幕（原本的小 384×560 退場，桌機看太小）；
     手機＝貼底與全螢幕（原本三段共用一組循環，但手機 CSS 只有一種尺寸，
     按放大鈕循環三次畫面完全不變，多按的那次是空的）。存 localStorage，跨頁沿用。 */
  var SIZES = ['s', 'm', 'l'];
  var SIZE_LABEL = { s: '小視窗', m: '中視窗', l: '大視窗' };
  function isPhone() {
    try { return window.matchMedia('(max-width: 520px)').matches; } catch (e) { return false; }
  }
  function sizeSteps() { return isPhone() ? ['s', 'l'] : ['m', 'l']; }
  /* 存的那段不在本裝置的循環裡（換裝置、或舊版存了已退場的小視窗）就回到第一段 */
  function getSize() {
    var steps = sizeSteps();
    try { var v = localStorage.getItem(SIZE_KEY); return steps.indexOf(v) >= 0 ? v : steps[0]; } catch (e) { return steps[0]; }
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
    var steps = sizeSteps();
    // 目前這段不在本裝置的循環裡（例如電腦調成中視窗後換到手機）就從頭開始
    var i = steps.indexOf(getSize());
    applySize(steps[(i + 1) % steps.length]);
    scrollBottom();
  });

  launcher.addEventListener('click', function () { setOpen(true); input.focus(); });
  root.querySelector('.mkw-close').addEventListener('click', function () { setOpen(false); });
  root.querySelector('.mkw-clear').addEventListener('click', function () {
    history = [];
    saveHistory(history);
    /* 稱呼與模式一起清（2026-08-20 加）。原本只清對話，誤收的稱呼會一直留在標題上，
       學員想重來只能換瀏覽器。 */
    try { localStorage.removeItem(NAME_KEY); } catch (e) {}
    setSimple(false);
    updateSub();
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
