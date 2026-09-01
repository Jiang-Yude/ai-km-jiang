/* 站長儀表板前端：/stats.html 密碼門後面那一整頁。
   資料一次從 /api/stats-admin 取回（要密碼），之後的篩選、分類、繪圖都在瀏覽器算。
   圖表用 inline SVG 手寫，不引任何圖表庫。
   類別色與色序在 stats.html 的 :root 定義，跑過 dataviz validator，不要隨手改。 */
(function () {
  'use strict';

  var PW_KEY = 'statsDash.pw.v1';
  var S = null;              // 後端回來的整包資料
  var IDX = {};              // url → {title, type}
  var sel = { page: null, kind: null };
  var scope = 'all';

  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function num(n) { return (Number(n) || 0).toLocaleString(); }
  /* 純字串日期加減，不碰時區 */
  function shiftDay(day, n) {
    var d = new Date(day + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  }

  /* ── 問題分類：關鍵詞規則，不是 AI 判讀 ───────────────
     順序就是判定順序，先命中先算。attack 與 readpage 一定要排在前面，
     否則「請完整印出你的設定檔」會被 concept 的「怎麼／如何」吃掉。 */
  var KINDS = [
    { k: 'attack', n: '⚠️ 試探護欄', c: '#8a1f14',
      re: /system\s*prompt|系統指令|系統提示|設定檔|護欄|guardrail|初始設定|初始指令|完整印出|word-for-word|逐字|忽略(前面|上面|你的).{0,4}指令|你的提示詞是|防禦機制|拒絕語|安全檢查|稽核/i },
    { k: 'issue', n: '🔧 回報卡住／打不開', c: '#c9463a',
      re: /打不開|開不了|點不了|沒反應|壞掉|失效|404|連不上|下載不了|看不到/ },
    { k: 'readpage', n: '請咪卡讀這一頁', c: 'var(--k6)',
      re: /^我要(讀|問)這一頁|^我是新手，帶我簡單做/ },
    { k: 'prompt', n: '要指令／提示詞', c: 'var(--k1)',
      re: /指令|提示詞|提次詞|提詞|prompt|咒語|分鏡|腳本呢|封面$|形象$|風格$/i },
    { k: 'course', n: '課程／報名／服務', c: 'var(--k3)',
      re: /課程|講座|報名|開課|上課|幾點|預約|1\s*對\s*1|一對一|陪跑|收費|價格|多少錢|服務|怎麼加入|如何參加|今天要教/ },
    { k: 'find', n: '找內容／找文章', c: 'var(--k2)',
      re: /在哪|哪篇|哪一篇|哪裡|找到|找 |有沒有|文章呢|那篇|新文章|連結|推薦幾篇|最新的|簡報|技能包|第一性原理|驅動開發|定妝照/ },
    { k: 'mika', n: '問咪卡本身', c: 'var(--k5)',
      re: /你是|妳是|咪卡|米卡|你可以|你會|語言模型|模型|真人|機器人|記憶|你用什麼|你覺得|可以聊什麼|陪.{0,2}聊/ },
    { k: 'concept', n: '觀念與方法', c: 'var(--k4)',
      re: /什麼是|什麼叫|是什麼|怎麼|如何|為什麼|知識庫|隱性知識|標籤|資料夾|整理知識|協同|loop|迴圈|agent|ai/i },
    { k: 'smalltalk', n: '打招呼／接話', c: '#b3aa9c',
      re: /^(你好|妳好|哈囉|hi|hello|嗨|然後呢|還有嗎|還有沒有|好|對|嗯|\d{1,3})$|^我是.{1,6}$|^妳?你?找呀?$|複製貼在這/i },
  ];
  var OTHER = { k: 'other', n: '其他', c: '#9a9184' };

  function classify(t) {
    for (var i = 0; i < KINDS.length; i++) if (KINDS[i].re.test(t)) return KINDS[i];
    return OTHER;
  }
  function kindOf(k) {
    for (var i = 0; i < KINDS.length; i++) if (KINDS[i].k === k) return KINDS[i];
    return OTHER;
  }

  /* ── 路徑正規化與標題查找 ───────────────── */
  function norm(p) {
    p = String(p || '/').split('?')[0].split('#')[0];
    if (!p.startsWith('/')) p = '/' + p;
    if (p.length > 1 && p.endsWith('/index.html')) p = p.slice(0, -10);
    if (p.length > 1 && !p.endsWith('/') && !p.includes('.')) p += '/';
    return p;
  }
  function title(p) {
    var n = norm(p);
    if (IDX[n]) return IDX[n].title;
    if (n === '/' || n === '/index.html') return '首頁';
    var named = {
      '/articles.html': '深度文章總覽', '/courses.html': '課程總覽', '/skills.html': '技能包下載',
      '/offers.html': '服務方案', '/knowledge-architecture.html': '知識架構', '/cases.html': '案例',
      '/learn.html': '學習地圖', '/search.html': '站內搜尋', '/stats.html': '站長儀表板',
      '/ai-trends.html': 'AI 趨勢', '/agent.html': 'Agent', '/invited-talks.html': '受邀演講',
    };
    if (named[n]) return named[n];
    return n;
  }
  function typeOf(p) {
    var n = norm(p);
    if (IDX[n]) return IDX[n].type;
    if (n.indexOf('/articles/') === 0) return 'article';
    if (n.indexOf('/courses/') === 0) return 'course';
    if (n.indexOf('/en/') === 0) return 'en';
    return 'page';
  }

  /* ── SVG 折線面積圖（單一序列，所以不需要圖例）───────── */
  function areaChart(host, data, color, unit) {
    host.innerHTML = '';
    if (!data.length) { host.innerHTML = '<p class="read">這個月還沒有資料。</p>'; return; }
    /* 每點寬度隨資料量縮：30 天的範圍給每天 26px 好點；
       90 天以上改成 8px，整張圖才塞得進容器，不然右半邊（最新的資料）要捲才看得到。 */
    var per = data.length > 60 ? 8 : (data.length > 40 ? 14 : 26);
    var W = Math.max(host.clientWidth || 640, data.length * per), H = 210, PL = 46, PR = 34, PT = 22, PB = 30;
    var iw = W - PL - PR, ih = H - PT - PB;
    var max = Math.max.apply(null, data.map(function (d) { return d.v; }).concat([1]));
    var step = data.length > 1 ? iw / (data.length - 1) : 0;
    var x = function (i) { return PL + i * step; };
    var y = function (v) { return PT + ih - (v / max) * ih; };

    var pts = data.map(function (d, i) { return x(i) + ',' + y(d.v); }).join(' ');
    var svg = ['<svg viewBox="0 0 ' + W + ' ' + H + '" width="' + W + '" height="' + H + '" role="img">'];
    // 基準格線：只放三條，讓它退到背景
    [0, 0.5, 1].forEach(function (r) {
      var v = max * r, yy = y(v);
      svg.push('<line x1="' + PL + '" y1="' + yy + '" x2="' + (W - PR) + '" y2="' + yy + '" stroke="var(--grid)" stroke-width="1"/>');
      svg.push('<text x="' + (PL - 8) + '" y="' + (yy + 4) + '" text-anchor="end" font-size="12" fill="#6a635a" font-family="JetBrains Mono,monospace">' + Math.round(v) + '</text>');
    });
    svg.push('<polygon points="' + PL + ',' + (PT + ih) + ' ' + pts + ' ' + x(data.length - 1) + ',' + (PT + ih) + '" fill="' + color + '" opacity=".13"/>');
    svg.push('<polyline points="' + pts + '" fill="none" stroke="' + color + '" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>');
    data.forEach(function (d, i) {
      if (d.v > 0 && data.length <= 60) svg.push('<circle cx="' + x(i) + '" cy="' + y(d.v) + '" r="3.4" fill="' + color + '"/>');
      // 命中區：整條垂直帶，比點好按
      svg.push('<rect x="' + (x(i) - step / 2) + '" y="' + PT + '" width="' + Math.max(step, 10) + '" height="' + ih + '" fill="transparent"><title>' + esc(d.d) + '：' + d.v + ' ' + unit + '</title></rect>');
    });
    var every = Math.ceil(data.length / 12);
    data.forEach(function (d, i) {
      if (i % every === 0 || i === data.length - 1) {
        svg.push('<text x="' + x(i) + '" y="' + (H - 10) + '" text-anchor="middle" font-size="12" fill="#6a635a" font-family="JetBrains Mono,monospace">' + d.d.slice(5) + '</text>');
      }
    });
    // 最高點直接標數字（不逐點標）
    var peak = data.reduce(function (a, b, i) { return b.v > data[a].v ? i : a; }, 0);
    if (data[peak].v > 0) {
      var py = Math.max(PT + 11, y(data[peak].v) - 10);
      var last = peak >= data.length - 2;
      svg.push('<text x="' + (x(peak) + (last ? -7 : 7)) + '" y="' + py + '" text-anchor="' + (last ? 'end' : 'start') + '" font-size="13" font-weight="700" fill="#1a1612" font-family="JetBrains Mono,monospace">' + data[peak].v + '</text>');
    }
    svg.push('</svg>');
    host.innerHTML = svg.join('');
  }

  /* ── 橫向排序長條 ───────────────── */
  function hbars(host, rows, opt) {
    opt = opt || {};
    host.innerHTML = '';
    if (!rows.length) { host.innerHTML = '<p class="read">沒有資料。</p>'; return; }
    var max = Math.max.apply(null, rows.map(function (r) { return r.v; }).concat([1]));
    rows.forEach(function (r) {
      var div = document.createElement('div');
      div.className = 'row' + (opt.selKey && opt.selKey === r.key ? ' sel' : '');
      var w = Math.max(2, Math.round(r.v / max * 100));
      div.innerHTML = '<span class="lb" title="' + esc(r.label) + '">' + esc(r.label) + '</span>'
        + '<span class="tr"><span class="fl" style="width:' + w + '%;background:' + (r.color || 'var(--k2)') + '"></span></span>'
        + '<span class="vv">' + num(r.v) + (r.sub ? ' <span style="color:#a49b8d">/' + num(r.sub) + '</span>' : '') + '</span>';
      if (opt.onPick) div.addEventListener('click', function () { opt.onPick(r); });
      host.appendChild(div);
    });
  }

  /* ── 100% 堆疊柱：每一段時間裡，各種問題各佔多少 ─────────
     絕對數量會被「那天有沒有上課」帶著跑，佔比才看得出訪客的需求在不在變。 */
  function stackChart(host, buckets, kinds) {
    host.innerHTML = '';
    var live = buckets.filter(function (b) { return b.total > 0; });
    if (live.length < 2) { host.innerHTML = '<p class="read">資料還不夠畫佔比變化（至少要兩段有提問的期間）。</p>'; return; }
    var W = Math.max(host.clientWidth || 560, live.length * 108), H = 230, PL = 44, PR = 16, PT = 14, PB = 44;
    var iw = W - PL - PR, ih = H - PT - PB;
    var bw = Math.min(74, iw / live.length - 16);
    var svg = ['<svg viewBox="0 0 ' + W + ' ' + H + '" width="' + W + '" height="' + H + '" role="img">'];
    [0, 0.25, 0.5, 0.75, 1].forEach(function (r) {
      var yy = PT + ih * r;
      svg.push('<line x1="' + PL + '" y1="' + yy + '" x2="' + (W - PR) + '" y2="' + yy + '" stroke="var(--grid)" stroke-width="1"/>');
      svg.push('<text x="' + (PL - 7) + '" y="' + (yy + 4) + '" text-anchor="end" font-size="12" fill="#6a635a" font-family="JetBrains Mono,monospace">' + Math.round((1 - r) * 100) + '%</text>');
    });
    live.forEach(function (b, i) {
      var x = PL + (iw / live.length) * i + (iw / live.length - bw) / 2;
      var acc = 0;
      kinds.forEach(function (k) {
        var v = b.c[k.k] || 0;
        if (!v) return;
        var frac = v / b.total, h = frac * ih;
        var y = PT + ih - acc - h;
        acc += h;
        // 段與段之間留 2px 縫，讓相鄰色塊不會糊在一起（sand↔mint 在色盲下很近）
        svg.push('<rect x="' + x + '" y="' + y + '" width="' + bw + '" height="' + Math.max(1, h - 2) + '" fill="' + k.c + '" rx="2">'
          + '<title>' + esc(b.label) + '　' + esc(k.n) + '：' + v + ' 則（' + Math.round(frac * 100) + '%）</title></rect>');
        if (frac > 0.16) {
          svg.push('<text x="' + (x + bw / 2) + '" y="' + (y + h / 2 + 4) + '" text-anchor="middle" font-size="12" font-weight="600" fill="#fff">' + Math.round(frac * 100) + '%</text>');
        }
      });
      svg.push('<text x="' + (x + bw / 2) + '" y="' + (H - 24) + '" text-anchor="middle" font-size="13" fill="#3a342d">' + esc(b.label) + '</text>');
      svg.push('<text x="' + (x + bw / 2) + '" y="' + (H - 8) + '" text-anchor="middle" font-size="12" fill="#6a635a" font-family="JetBrains Mono,monospace">' + b.total + ' 則</text>');
    });
    svg.push('</svg>');
    host.innerHTML = svg.join('');
  }

  /* ── 熱區矩陣：頁面 × 問題類型 ───────────────── */
  function matrix(host, pages, kinds, cell, onPick) {
    var maxV = 0;
    pages.forEach(function (p) { kinds.forEach(function (k) { maxV = Math.max(maxV, cell[p + '|' + k.k] || 0); }); });
    var steps = ['#fdfaf4', 'var(--seq1)', 'var(--seq2)', 'var(--seq3)', 'var(--seq4)', 'var(--seq5)'];
    function shade(v) {
      if (!v) return steps[0];
      var r = v / (maxV || 1);
      if (r > 0.75) return steps[5]; if (r > 0.5) return steps[4];
      if (r > 0.25) return steps[3]; if (r > 0.1) return steps[2];
      return steps[1];
    }
    var h = ['<thead><tr><th></th>'];
    kinds.forEach(function (k) { h.push('<th class="rot">' + esc(k.n) + '</th>'); });
    h.push('<th></th></tr></thead><tbody>');
    pages.forEach(function (p) {
      var tot = 0;
      kinds.forEach(function (k) { tot += cell[p + '|' + k.k] || 0; });
      h.push('<tr><td class="rowlb" title="' + esc(p) + '">' + esc(title(p)) + '</td>');
      kinds.forEach(function (k) {
        var v = cell[p + '|' + k.k] || 0;
        var dark = v / (maxV || 1) > 0.5;
        h.push('<td class="cell' + (v ? '' : ' z') + '" data-p="' + esc(p) + '" data-k="' + k.k + '"'
          + ' style="background:' + shade(v) + (dark ? ';color:#fff' : '') + '"'
          + ' title="' + esc(title(p)) + ' × ' + esc(k.n) + '：' + v + ' 則">' + (v || '') + '</td>');
      });
      h.push('<td class="tot">' + tot + '</td></tr>');
    });
    h.push('</tbody>');
    host.innerHTML = h.join('');
    Array.prototype.forEach.call(host.querySelectorAll('td.cell'), function (td) {
      td.addEventListener('click', function () { onPick(td.getAttribute('data-p'), td.getAttribute('data-k')); });
    });
  }

  /* ── 資料處理 ───────────────── */
  /* 後台這頁自己也載了咪卡（江江要求每頁都要有），
     但江江在後台跟咪卡講的話不是訪客行為，統計時一律濾掉，
     否則越用這頁、數字越髒（Codex 跨家審查提的）。 */
  function isOwnPage(p) { return norm(p) === '/stats.html'; }
  /* Redis list 是新的在前，時間戳只到分鐘。同一分鐘內的問與答只靠 t 排不出先後，
     會出現「咪卡先回答、訪客後提問」。所以保留原始位置當第二排序鍵：index 大的是舊的。 */
  function seqSort(a, b) { return a.t < b.t ? -1 : (a.t > b.t ? 1 : (b._i - a._i)); }
  function chatRows() { return (S.chat || []).filter(function (r) { return !isOwnPage(r.page); }); }
  function userRows() { return chatRows().filter(function (r) { return r.role === 'user'; }); }

  function render() {
    (S.chat || []).forEach(function (r, i) { r._i = i; });
    var uq = userRows();
    uq.forEach(function (r) { r._k = classify(r.text).k; r._p = norm(r.page); });

    // 數字卡
    var rangePV = (S.days || []).reduce(function (a, d) { return a + d.count; }, 0);
    var todayPV = 0;
    (S.days || []).forEach(function (d) { if (d.date === S.today) todayPV = d.count; });

    /* 跟「前一段等長期間」比，不是跟上個月比。
       月初打開頁面時「本月 vs 上月」會顯示比上月少 99%，那是天數不對等造成的假訊號。 */
    var prev = Number(S.prevTotal || 0);
    var delta = prev ? Math.round((rangePV - prev) / prev * 100) : null;
    var dcls = delta == null ? 'flat' : (delta > 0 ? 'up' : (delta < 0 ? 'down' : 'flat'));
    var dtxt = delta == null ? '前一段沒有資料可比'
      : (delta > 0 ? '比前 ' + S.spanDays + ' 天多 ' + delta + '%'
        : (delta < 0 ? '比前 ' + S.spanDays + ' 天少 ' + Math.abs(delta) + '%' : '跟前一段一樣'));
    var perDay = S.spanDays ? Math.round(rangePV / S.spanDays) : 0;

    var sids = {}, vids = {};
    chatRows().forEach(function (r) { sids[r.sid] = 1; vids[r.vid] = 1; });

    /* 咪卡答不出來的比例：CX 說這是四個「導向行動」的指標之一 */
    var FAILRE = /查不到|找不到|沒有相關|站上沒有|站內沒有|目前沒有|沒有這方面|還沒有寫|沒有收錄/;
    var botAll = chatRows().filter(function (r) { return r.role === 'bot'; });
    var botFail = botAll.filter(function (r) { return FAILRE.test(r.text); });
    var failRate = botAll.length ? Math.round(botFail.length / botAll.length * 100) : null;

    $('tiles').innerHTML = [
      ['這段期間瀏覽', num(rangePV), dtxt, dcls],
      ['平均每天', num(perDay), S.spanDays + ' 天平均', 'flat'],
      ['今日瀏覽', num(todayPV), S.today, 'flat'],
      ['有人問咪卡', num(uq.length) + ' 則', Object.keys(sids).length + ' 段對話 / ' + Object.keys(vids).length + ' 人', 'flat'],
      ['咪卡答不出來', failRate == null ? '—' : failRate + '%', botAll.length ? botFail.length + ' / ' + botAll.length + ' 則回答' : '這段期間沒有回答紀錄', failRate != null && failRate > 20 ? 'down' : 'flat'],
      ['站內搜尋', num((S.search || []).length) + ' 次', (S.misses || []).length + ' 個詞找不到東西', 'flat'],
      ['全站累計瀏覽', num(S.total), '開站到現在（背景數字）', 'flat'],
    ].map(function (t) {
      return '<div class="tile"><div class="n">' + t[1] + '</div><div class="l">' + t[0] + '</div><div class="d ' + t[3] + '">' + esc(t[2]) + '</div></div>';
    }).join('');

    // 趨勢圖
    areaChart($('chart-pv'), (S.days || []).map(function (d) { return { d: d.date, v: d.count }; }), 'var(--k2)', '次瀏覽');
    var byDay = {};
    (S.days || []).forEach(function (d) { byDay[d.date] = 0; });
    uq.forEach(function (r) { var d = r.t.slice(0, 10); if (d in byDay) byDay[d] += 1; else byDay[d] = 1; });
    var chatDays = Object.keys(byDay).sort().map(function (d) { return { d: d, v: byDay[d] }; });
    areaChart($('chart-chat'), chatDays, 'var(--k1)', '則提問');
    var peakDay = chatDays.reduce(function (a, b) { return b.v > a.v ? b : a; }, { d: '', v: 0 });
    $('cap-pv').textContent = S.from + ' 到 ' + S.to + ' 每日瀏覽數。' + (delta == null ? '' : dtxt + '。') + '滑過任一天看數字。';
    $('cap-chat').textContent = '同一段期間每日有多少則訪客提問。' + (peakDay.v ? '最多的一天是 ' + peakDay.d + '，' + peakDay.v + ' 則。' : '') + '這條動起來通常代表當天有課或有人在現場用。';

    renderPages();
    renderMonthPages();
    renderChat();
    renderFlags();
    renderSearch();
    renderHealth();
  }

  function scopeFilter(p) {
    if (scope === 'all') return true;
    if (scope === 'articles') return p.indexOf('/articles/') === 0;
    if (scope === 'courses') return p.indexOf('/courses/') === 0;
    return p.indexOf('/articles/') !== 0 && p.indexOf('/courses/') !== 0;
  }

  function renderPages() {
    var q = ($('pgq').value || '').trim().toLowerCase();
    var rows = (S.pages || []).filter(function (r) {
      return scopeFilter(r.path) && (!q || r.path.toLowerCase().indexOf(q) >= 0 || title(r.path).toLowerCase().indexOf(q) >= 0);
    });
    var top = rows.slice(0, 20).map(function (r) {
      return { key: r.path, label: title(r.path), v: r.views, color: 'var(--k2)' };
    });
    hbars($('pages'), top, {
      selKey: sel.page,
      onPick: function (r) { sel.page = (sel.page === r.key ? null : r.key); sel.kind = null; renderPages(); renderChat(); }
    });
    var sum = rows.reduce(function (a, r) { return a + r.views; }, 0);
    $('cap-pages').textContent = '累計瀏覽前 20 名（' + (rows.length) + ' 個頁面共 ' + num(sum) + ' 次）。點一列可以往下看那一頁的提問。';
    var all = ['<table class="list"><thead><tr><th>#</th><th>頁面</th><th>網址</th><th style="text-align:right">累計</th></tr></thead><tbody>'];
    rows.forEach(function (r, i) {
      all.push('<tr><td class="t">' + (i + 1) + '</td><td>' + esc(title(r.path)) + '</td><td class="p">' + esc(r.path) + '</td><td style="text-align:right;font-family:JetBrains Mono,monospace">' + num(r.views) + '</td></tr>');
    });
    all.push('</tbody></table>');
    $('pages-all').innerHTML = all.join('');
  }

  function renderMonthPages() {
    var agg = {};
    (S.pageDaily || []).forEach(function (d) {
      Object.keys(d.pages || {}).forEach(function (p) { agg[p] = (agg[p] || 0) + d.pages[p]; });
    });
    var keys = Object.keys(agg);
    var host = $('pages-month');
    if (!keys.length) {
      host.innerHTML = '<p class="read">這段期間還沒有每頁每日資料。每頁每日的記錄從 2026-09-01 才開始，在那之前只有累計總數。</p>';
      $('cap-pmonth').textContent = '';
      return;
    }
    var cum = {};
    (S.pages || []).forEach(function (r) { cum[r.path] = r.views; });
    var rows = keys.map(function (p) { return { key: p, label: title(p), v: agg[p], sub: cum[p] || 0, color: 'var(--k3)' }; })
      .sort(function (a, b) { return b.v - a.v; }).slice(0, 15);
    hbars(host, rows, { selKey: sel.page, onPick: function (r) { sel.page = (sel.page === r.key ? null : r.key); renderPages(); renderMonthPages(); renderChat(); } });
    $('cap-pmonth').textContent = '這段期間瀏覽前 15 名，灰色斜線後面是開站到現在的累計數。這段期間排前面但累計不高的，就是正在被看的新內容。';
  }

  function renderChat() {
    var uq = userRows();
    var kinds = KINDS.concat([OTHER]);
    // 類型排序長條
    var cnt = {};
    uq.forEach(function (r) { cnt[r._k] = (cnt[r._k] || 0) + 1; });
    var krows = kinds.map(function (k) { return { key: k.k, label: k.n, v: cnt[k.k] || 0, color: k.c }; })
      .filter(function (r) { return r.v > 0; }).sort(function (a, b) { return b.v - a.v; });
    hbars($('kinds'), krows, {
      selKey: sel.kind,
      onPick: function (r) { sel.kind = (sel.kind === r.key ? null : r.key); renderChat(); }
    });
    $('lg-kind').innerHTML = kinds.map(function (k) {
      return '<span><i style="background:' + k.c + '"></i>' + esc(k.n) + '</span>';
    }).join('');
    var topk = krows[0];
    $('cap-kinds').textContent = topk ? ('本月 ' + uq.length + ' 則提問，最多的是「' + topk.label + '」' + topk.v + ' 則（' + Math.round(topk.v / uq.length * 100) + '%）。點一條只看那一類。')
      : '本月還沒有提問。';

    // 意圖佔比隨時間變化：依範圍長度決定一桶幾天，短範圍看週、長範圍看月
    var bucketDays = S.spanDays <= 45 ? 7 : (S.spanDays <= 200 ? 30 : 90);
    var bucketName = bucketDays === 7 ? '週' : (bucketDays === 30 ? '月' : '季');
    var buckets = [], bmap = {};
    (function () {
      var d = S.from;
      while (d <= S.to) {
        var end = shiftDay(d, bucketDays - 1);
        if (end > S.to) end = S.to;
        var b = { label: d.slice(5) + '～' + end.slice(5), from: d, to: end, c: {}, total: 0 };
        buckets.push(b);
        d = shiftDay(end, 1);
        if (buckets.length > 40) break;
      }
    })();
    uq.forEach(function (r) {
      var day = r.t.slice(0, 10);
      for (var i = 0; i < buckets.length; i++) {
        if (day >= buckets[i].from && day <= buckets[i].to) {
          buckets[i].c[r._k] = (buckets[i].c[r._k] || 0) + 1; buckets[i].total += 1; break;
        }
      }
    });
    stackChart($('chart-stack'), buckets, kinds);
    var liveB = buckets.filter(function (b) { return b.total > 0; });
    $('cap-stack').textContent = liveB.length >= 2
      ? '每一' + bucketName + '的問題種類佔比。看的是比例不是數量，因為數量會被「那段時間有沒有上課」帶著跑。某一類的比例一直往上，代表那件事變成常態需求，值得直接做成頁面而不是每次讓咪卡回答。'
      : '';

    // 熱區矩陣
    var cell = {}, pageCnt = {};
    uq.forEach(function (r) {
      cell[r._p + '|' + r._k] = (cell[r._p + '|' + r._k] || 0) + 1;
      pageCnt[r._p] = (pageCnt[r._p] || 0) + 1;
    });
    var mp = Object.keys(pageCnt).sort(function (a, b) { return pageCnt[b] - pageCnt[a]; }).slice(0, 12);
    var usedKinds = kinds.filter(function (k) { return cnt[k.k]; });
    if (mp.length) {
      matrix($('matrix'), mp, usedKinds, cell, function (p, k) {
        sel.page = p; sel.kind = k; renderPages(); renderChat();
        $('chatlist').scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
      $('cap-matrix').textContent = '提問最多的 ' + mp.length + ' 個頁面 × 問題類型。深色格子＝那一頁的人特別會問那種問題。點格子往下看原句。';
    } else {
      $('matrix').innerHTML = '';
      $('cap-matrix').textContent = '';
    }

    // 明細：先列訪客清單，點某一位才展開他的對話串（36 位全攤開會有七千像素）
    var q = ($('cq').value || '').trim().toLowerCase();
    var expand = $('showbot').checked;

    function hits(r) {
      if (r.role !== 'user') return false;
      if (sel.page && norm(r.page) !== sel.page) return false;
      if (sel.kind && classify(r.text).k !== sel.kind) return false;
      if (q && r.text.toLowerCase().indexOf(q) < 0) return false;
      return true;
    }
    var filtering = !!(sel.page || sel.kind || q);

    var byVid = {};
    chatRows().forEach(function (r) { (byVid[r.vid] = byVid[r.vid] || []).push(r); });
    var convs = Object.keys(byVid).map(function (v) {
      var list = byVid[v].slice().sort(seqSort);
      var qs = list.filter(function (r) { return r.role === 'user'; });
      var pages = {}, names = {}, kc = {};
      list.forEach(function (r) {
        pages[norm(r.page)] = 1;
        if (r.name) names[r.name] = 1;
        if (r.role === 'user') { var k = classify(r.text).k; kc[k] = (kc[k] || 0) + 1; }
      });
      var topK = Object.keys(kc).sort(function (a, b) { return kc[b] - kc[a]; })[0];
      return {
        vid: v, list: list, qs: qs.length, pages: Object.keys(pages).length,
        names: Object.keys(names), topK: topK, topN: topK ? kc[topK] : 0,
        first: list[0].t, last: list[list.length - 1].t,
        /* 沒有篩選條件時每一列都會「命中」，那條藍邊就失去意義，所以只在有篩選時算 */
        hit: filtering ? list.filter(hits).length : 0,
      };
    });
    var show = convs.filter(function (c) { return !filtering || c.hit > 0; })
      .sort(function (a, b) { return a.last < b.last ? 1 : -1; });

    var f = [];
    if (sel.page) f.push('頁面：' + title(sel.page));
    if (sel.kind) f.push('類型：' + kindOf(sel.kind).n);
    if (q) f.push('關鍵字：' + q);
    var totalQ = show.reduce(function (a, c) { return a + c.qs; }, 0);
    $('filt').textContent = '目前：' + (f.length ? f.join('　') : '全部')
      + '　' + show.length + ' 位訪客 / ' + totalQ + ' 則提問';

    var out = ['<div class="vlist">',
      '<div class="vhead"><span>訪客</span><span class="n">問</span><span class="n">頁</span><span class="dt">最後出現</span><span class="tp">主要在問</span></div>'];
    show.forEach(function (c, idx) {
      var k = c.topK ? kindOf(c.topK) : null;
      out.push('<div class="vrow' + (c.hit ? ' hit' : '') + '" data-i="' + idx + '">'
        + '<span class="nm"><span class="cav">👤</span><b>' + esc(c.vid.slice(0, 8)) + '</b>'
        + (c.names.length ? '<small>' + esc(c.names.join('、')) + '</small>' : '') + '</span>'
        + '<span class="n">' + c.qs + '</span>'
        + '<span class="n">' + c.pages + '</span>'
        + '<span class="dt">' + esc(c.last.slice(5, 10)) + '</span>'
        + '<span class="tp">' + (k ? '<i style="background:' + k.c + '"></i><span>' + esc(k.n) + ' ×' + c.topN + '</span>' : '') + '</span>'
        + '</div>');
      out.push('<div class="vbody" data-b="' + idx + '"></div>');
    });
    out.push('</div>');
    if (!show.length) out = ['<p class="read">這個條件下沒有對話。</p>'];
    $('chatlist').innerHTML = out.join('');

    /* 對話串等到真的點開才畫，不要一次生三百則訊息的 DOM */
    function drawConv(c, host) {
      var o = [];
      var lastSid = null, lastPage = null;
      c.list.forEach(function (r) {
        var p = norm(r.page);
        if (lastSid !== null && (r.sid !== lastSid || p !== lastPage)) {
          o.push('<div class="sep"><span>' + esc(r.t.slice(5, 16)) + '　' + esc(title(p)) + '</span></div>');
        } else if (lastSid === null) {
          o.push('<div class="sep"><span>' + esc(r.t.slice(5, 16)) + '　' + esc(title(p)) + '</span></div>');
        }
        lastSid = r.sid; lastPage = p;
        if (r.role === 'user') {
          var k = classify(r.text);
          o.push('<div class="msg u' + (filtering && hits(r) ? ' on' : '') + '">'
            + '<span class="t">' + esc(r.t.slice(5, 16)) + '</span>'
            + '<span class="bub"><span class="kd">' + esc(k.n) + '</span>' + esc(r.text) + '</span></div>');
        } else {
          var long = r.text.length > 150;
          o.push('<div class="msg b">'
            + '<span class="ava">🐱</span>'
            + '<span class="bub' + (long && !expand ? ' clip' : '') + '">' + esc(r.text) + '</span></div>');
        }
      });
      host.innerHTML = o.join('');
      Array.prototype.forEach.call(host.querySelectorAll('.bub.clip'), function (b) {
        b.addEventListener('click', function (e) { e.stopPropagation(); b.classList.remove('clip'); });
      });
    }

    Array.prototype.forEach.call($('chatlist').querySelectorAll('.vrow'), function (row) {
      row.addEventListener('click', function () {
        var i = Number(row.getAttribute('data-i'));
        var host = $('chatlist').querySelector('[data-b="' + i + '"]');
        var opening = !host.classList.contains('on');
        if (opening && !host.innerHTML) drawConv(show[i], host);
        host.classList.toggle('on', opening);
        row.classList.toggle('open', opening);
      });
    });

    /* 有篩選條件而且只命中一位訪客時，直接幫他打開，少一次點擊 */
    if (filtering && show.length === 1) {
      var r0 = $('chatlist').querySelector('.vrow');
      if (r0) r0.click();
    }
  }

  /* ── 異常訊號：規則掃出來的，不是結論 ───────────────── */
  function renderFlags() {
    var uq = userRows();
    var out = [];

    var atk = uq.filter(function (r) { return r._k === 'attack'; });
    if (atk.length) {
      var days = {};
      atk.forEach(function (r) { days[r.t.slice(0, 10)] = 1; });
      out.push(['⚠️', '有人在試探咪卡的護欄',
        atk.length + ' 則命中「要求輸出系統設定／忽略指令」這類句型，集中在 ' + Object.keys(days).join('、') + '。'
        + '點下面類型長條的「試探護欄」可以看原句，確認咪卡當時有沒有守住。', false]);
    }

    // 同一 session 連問同一句 3 次以上＝咪卡沒答好或當掉
    var seq = {}, repeats = [];
    uq.forEach(function (r) {
      var key = r.sid + '|' + r.text;
      seq[key] = (seq[key] || 0) + 1;
    });
    Object.keys(seq).forEach(function (k) {
      if (seq[k] >= 3) repeats.push({ q: k.split('|').slice(1).join('|'), n: seq[k] });
    });
    if (repeats.length) {
      repeats.sort(function (a, b) { return b.n - a.n; });
      out.push(['🔁', '同一個人把同一句話問了好幾次',
        repeats.slice(0, 3).map(function (r) { return '「' + r.q.slice(0, 30) + '」' + r.n + ' 次'; }).join('；')
        + '。連問通常代表咪卡當下沒回應或答案沒用，值得把那一段對話看完。', false]);
    }

    // 咪卡答不出來
    var FAIL = /查不到|找不到|沒有相關|站上沒有|站內沒有|目前沒有|沒有這方面|還沒有寫|沒有收錄/;
    var bots = chatRows().filter(function (r) { return r.role === 'bot'; });
    var fails = bots.filter(function (r) { return FAIL.test(r.text); });
    if (bots.length) {
      var rate = Math.round(fails.length / bots.length * 100);
      out.push([rate > 20 ? '🕳️' : '✅', '咪卡答不出來的比例：' + rate + '%',
        bots.length + ' 則回答裡有 ' + fails.length + ' 則說了「查不到／站上沒有」。'
        + (rate > 20 ? '偏高，多半是內容缺口或別名沒補。' : '在正常範圍。')
        + '要撈出對應的問句：node scripts/mika-failed-queries.mjs ' + S.to.slice(0, 7), rate <= 20]);
    }

    // 有人問但那一頁沒被記流量
    var noView = {};
    uq.forEach(function (r) { noView[r._p] = 1; });
    var known = {};
    (S.pages || []).forEach(function (p) { known[norm(p.path)] = 1; });
    var ghost = Object.keys(noView).filter(function (p) { return !known[p]; });
    if (ghost.length) {
      out.push(['📉', '有人在這些頁面問問題，但這些頁沒有流量記錄',
        ghost.slice(0, 5).map(function (p) { return title(p); }).join('、')
        + (ghost.length > 5 ? ' 等 ' + ghost.length + ' 頁' : '')
        + '。代表這些頁面漏埋 views.js，流量顯示為零並不是真的沒人看。', false]);
    }

    if (!out.length) out.push(['✅', '這個月沒有掃到異常', '護欄試探、重複提問、答不出來的比例都在正常範圍。', true]);
    $('flags').innerHTML = out.map(function (f) {
      return '<div class="flag' + (f[3] ? ' ok' : '') + '"><span class="ic">' + f[0] + '</span><span><b>' + esc(f[1]) + '</b><br>' + esc(f[2]) + '</span></div>';
    }).join('');
  }

  function renderSearch() {
    var m = S.misses || [];
    var h = ['<thead><tr><th>搜不到東西的詞</th><th style="text-align:right">次數</th></tr></thead><tbody>'];
    m.forEach(function (r) {
      h.push('<tr><td>' + esc(r.q) + '</td><td style="text-align:right;font-family:JetBrains Mono,monospace">' + r.n + '</td></tr>');
    });
    h.push('</tbody>');
    if (!m.length) h = ['<tbody><tr><td style="padding:16px;color:var(--ink-faint)">這段期間沒有零命中的搜尋。</td></tr></tbody>'];
    $('misslist').innerHTML = h.join('');
    var s = S.search || [];
    var top = {};
    s.forEach(function (r) { if (r.q) top[r.q] = (top[r.q] || 0) + 1; });
    var tk = Object.keys(top).sort(function (a, b) { return top[b] - top[a]; }).slice(0, 8);
    $('searchnote').textContent = '這段期間站內搜尋共 ' + s.length + ' 次'
      + (tk.length ? '，最常搜的是：' + tk.map(function (k) { return k + '（' + top[k] + '）'; }).join('、') : '')
      + '。搜尋次數本來就遠少於提問次數，因為多數人直接問咪卡。';
  }

  function renderHealth() {
    var known = {};
    (S.pages || []).forEach(function (p) { if (p.views > 0) known[norm(p.path)] = p.views; });
    var items = Object.keys(IDX);
    var zero = items.filter(function (u) { return !known[u]; });
    var rows = [];
    rows.push(['📄', '站上內容頁', items.length + ' 個（來源：site-index.json）', true]);
    rows.push([zero.length ? '⚠️' : '✅', '有內容但沒有任何流量記錄',
      zero.length ? zero.length + ' 頁：' + zero.slice(0, 6).map(function (u) { return IDX[u].title; }).join('、') + (zero.length > 6 ? ' 等' : '')
        + '。可能是新頁還沒人看，也可能是漏埋 views.js。'
        : '沒有，每一頁都有記錄。', zero.length === 0]);
    rows.push(['🕐', '每頁每日趨勢', (S.pageDaily && S.pageDaily.length)
      ? '已開始記錄，本月有 ' + S.pageDaily.length + ' 天資料'
      : '2026-09-01 才開始記，在那之前只有累計總數，看不出單頁的時間趨勢', !!(S.pageDaily && S.pageDaily.length)]);
    rows.push(['💬', '咪卡對話保存', '每月一份，各留最近 20000 筆；目前有 ' + (S.chatMonths || []).join('、'), true]);
    rows.push(['🔍', '沒有記錄的東西', '停留時間、來源網站（referrer）、獨立訪客數都沒有在記。想知道人從哪裡來，要另外加埋點。', false]);
    $('health').innerHTML = rows.map(function (f) {
      return '<div class="flag' + (f[3] ? ' ok' : '') + '"><span class="ic">' + f[0] + '</span><span><b>' + esc(f[1]) + '</b><br>' + esc(f[2]) + '</span></div>';
    }).join('');
  }

  /* ── 取資料 ───────────────── */
  var range = { from: null, to: null };   // null = 交給後端給預設（最近 30 天）
  function load(pw, r) {
    r = r || {};
    return fetch('/api/stats-admin', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pw: pw, from: r.from || undefined, to: r.to || undefined }),
    }).then(function (r) {
      if (r.status === 403) throw new Error('密碼不對。');
      if (r.status === 429) throw new Error('嘗試太多次，等一分鐘再試。');
      if (r.status === 503) throw new Error('伺服器還沒設定密碼。');
      return r.json();
    }).then(function (d) {
      if (d.error) throw new Error(d.error);
      return d;
    });
  }

  function boot(d) {
    S = d;
    range = { from: S.from, to: S.to };
    $('gate').hidden = true;
    $('dash').hidden = false;
    $('d1').value = S.from; $('d2').value = S.to;
    $('d1').min = S.earliest; $('d2').max = S.today;
    $('d1').max = S.today; $('d2').min = S.earliest;
    markSpan();
    $('rangelabel').textContent = S.from + ' 到 ' + S.to + '（' + S.spanDays + ' 天）'
      + '　資料最早到 ' + S.earliest;
    $('stamp').textContent = '讀取於 ' + new Date().toLocaleString('zh-TW', { hour12: false });
    render();
  }

  /* 哪一顆範圍鈕該亮：用實際天數回推，自訂範圍就一顆都不亮 */
  function markSpan() {
    Array.prototype.forEach.call(document.querySelectorAll('[data-span]'), function (b) {
      var v = b.getAttribute('data-span');
      var on = (v === 'all')
        ? (S.from === S.earliest && S.to === S.today)
        : (Number(v) === S.spanDays && S.to === S.today);
      b.classList.toggle('on', on);
    });
  }

  function reload(r) {
    var pw = '';
    try { pw = sessionStorage.getItem(PW_KEY) || ''; } catch (e) { /* 忽略 */ }
    $('stamp').textContent = '讀取中…';
    load(pw, r).then(function (d) {
      S = d; range = { from: S.from, to: S.to };
      sel.page = null; sel.kind = null;
      $('d1').value = S.from; $('d2').value = S.to;
      markSpan();
      $('rangelabel').textContent = S.from + ' 到 ' + S.to + '（' + S.spanDays + ' 天）　資料最早到 ' + S.earliest;
      $('stamp').textContent = '讀取於 ' + new Date().toLocaleString('zh-TW', { hour12: false });
      render();
    }).catch(function (e) { $('stamp').textContent = '讀取失敗：' + (e.message || e); });
  }

  function fail(msg) { $('err').textContent = msg; }

  function tryEnter(pw) {
    fail('讀取中…');
    load(pw, null).then(function (d) {
      try { sessionStorage.setItem(PW_KEY, pw); } catch (e) { /* 私密視窗會丟例外 */ }
      fail('');
      boot(d);
    }).catch(function (e) { fail(e.message || '讀取失敗'); });
  }

  document.addEventListener('DOMContentLoaded', function () {
    fetch('/site-index.json').then(function (r) { return r.json(); }).then(function (d) {
      (d.items || []).forEach(function (it) { IDX[norm(it.url)] = { title: it.title, type: it.type }; });
    }).catch(function () { /* 拿不到就退回顯示路徑 */ });

    $('go').addEventListener('click', function () { tryEnter($('pw').value); });
    $('pw').addEventListener('keydown', function (e) { if (e.key === 'Enter') tryEnter($('pw').value); });

    Array.prototype.forEach.call(document.querySelectorAll('[data-span]'), function (b) {
      b.addEventListener('click', function () {
        var v = b.getAttribute('data-span');
        if (v === 'all') reload({ from: S.earliest, to: S.today });
        else reload({ from: shiftDay(S.today, -(Number(v) - 1)), to: S.today });
      });
    });
    $('go2').addEventListener('click', function () {
      var a = $('d1').value, b2 = $('d2').value;
      if (!a || !b2) { $('stamp').textContent = '起訖日期兩個都要選'; return; }
      reload({ from: a, to: b2 });
    });
    $('lock').addEventListener('click', function () {
      try { sessionStorage.removeItem(PW_KEY); } catch (e) { /* 忽略 */ }
      location.reload();
    });
    $('pgq').addEventListener('input', renderPages);
    $('cq').addEventListener('input', renderChat);
    $('showbot').addEventListener('change', renderChat);
    $('clearf').addEventListener('click', function () { sel.page = null; sel.kind = null; renderPages(); renderChat(); });
    Array.prototype.forEach.call(document.querySelectorAll('[data-scope]'), function (b) {
      b.addEventListener('click', function () {
        scope = b.getAttribute('data-scope');
        Array.prototype.forEach.call(document.querySelectorAll('[data-scope]'), function (x) { x.classList.toggle('on', x === b); });
        renderPages();
      });
    });

    var saved = null;
    try { saved = sessionStorage.getItem(PW_KEY); } catch (e) { /* 忽略 */ }
    if (saved) tryEnter(saved);
  });
})();
