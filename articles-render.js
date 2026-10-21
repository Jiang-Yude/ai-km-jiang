/* ============================================================
   articles-render.js  ·  深度文章總站渲染 + 交集篩選 + 搜尋
   ------------------------------------------------------------
   讀 window.ARTICLES，做四件事：
     1. 渲染所有文章卡片（依日期新到舊，最新在前）
     2. 從資料長出四維篩選標籤（只顯示真的有文章用到的，附篇數）
     3. 多選「交集（AND）」過濾：選越多剩越少，即時顯示剩餘篇數
     4. 關鍵字搜尋：標題、摘要、解決、適合、標籤全文比對，跟篩選並用
   ============================================================ */
(function () {
  "use strict";

  var DIMS = [
    { key: "pain",         label: "我遇到的問題" },
    { key: "topic",        label: "主題", collapse: true },
    { key: "level",        label: "難度" },
    { key: "content_type", label: "類型" }
  ];

  var TYPE_BADGE = {
    "教學文章": "paid",
    "觀點文章": "planning",
    "趨勢文章": "external",
    "案例文章": "free"
  };

  // 依日期新到舊（最新在前）
  var articles = (window.ARTICLES || []).slice().sort(function (a, b) {
    return ((b.updated || b.date) || "").localeCompare((a.updated || a.date) || "");
  });

  var selected = new Set();   // "dim::tag"
  var GUIDE = window.ARTICLE_GUIDE || { who: [], goal: [] };
  var guide = { who: null, goal: null };   // 咪卡引導區選到的選項（物件）
  var query = "";             // 搜尋關鍵字（小寫）

  var elGrid, elCount, elFilter, elSelected, elClear, elEmpty, elSearch, elSearchWrap, elSearchClear;

  function tagKey(dim, tag) { return dim + "::" + tag; }

  // 「我遇到的問題」不是文章自帶的標籤，而是由主題標籤分組算出來（任一主題命中就算）
  var PAIN = window.ARTICLE_PAIN || [];
  function articleTags(a, dim) {
    if (dim === "pain") {
      if (a._pain) return a._pain;
      var topics = (a.tags && a.tags.topic) || [];
      var text = [a.title, a.summary, a.problem, a.audience].join(" ").toLowerCase();
      a._pain = PAIN.filter(function (p) {
        if (p.topics.some(function (t) { return topics.indexOf(t) !== -1; })) return true;
        return (p.keywords || []).some(function (k) { return text.indexOf(k.toLowerCase()) !== -1; });
      }).map(function (p) { return p.label; });
      return a._pain;
    }
    return (a.tags && a.tags[dim]) || [];
  }

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }

  // 一篇文章「同時符合」所有已選標籤（交集）
  function matchesTags(a) {
    if (selected.size === 0) return true;
    var ok = true;
    selected.forEach(function (key) {
      if (!ok) return;
      var sep = key.indexOf("::");
      var dim = key.slice(0, sep), tag = key.slice(sep + 2);
      if (articleTags(a, dim).indexOf(tag) === -1) ok = false;
    });
    return ok;
  }

  // 搜尋：標題 + 摘要 + 解決 + 適合 + 全部標籤 + 別名庫（search-aliases.js 的訪客口語別名）
  function haystack(a) {
    var parts = [a.title, a.summary, a.problem, a.audience];
    if (a.tags) Object.keys(a.tags).forEach(function (d) { parts = parts.concat(a.tags[d] || []); });
    if (window.SEARCH_ALIASES && window.SEARCH_ALIASES[a.id]) parts = parts.concat(window.SEARCH_ALIASES[a.id]);
    return parts.join(" ").toLowerCase();
  }
  // 空格分詞 AND 比對：每個詞都命中才算（跟 search.js 同規則）
  function matchesQuery(a) {
    if (!query) return true;
    var hs = haystack(a);
    return query.split(/\s+/).filter(Boolean).every(function (token) {
      return hs.indexOf(token) !== -1;
    });
  }

  // 搜尋 log（見 api/search-log.js）：找出訪客問法跟站上內容對不上的缺口
  var lastLogged = "";
  var logTimer = null;
  function queueQueryLog(n) {
    if (!query || query.length < 2 || query === lastLogged) return;
    clearTimeout(logTimer);
    var q = query;
    logTimer = setTimeout(function () {
      lastLogged = q;
      try {
        var body = JSON.stringify({ q: q, n: n, surface: "articles" });
        if (navigator.sendBeacon) navigator.sendBeacon("/api/search-log", new Blob([body], { type: "application/json" }));
        else fetch("/api/search-log", { method: "POST", headers: { "Content-Type": "application/json" }, body: body, keepalive: true });
      } catch (e) {}
    }, 1200);
  }

  function guideHit(a, opt) {
    if (!opt) return false;
    if (a._gh === undefined) a._gh = {};
    if (a._gh[opt.label] !== undefined) return a._gh[opt.label];
    var pains = articleTags(a, "pain"), h = haystack(a), t = String(a.title || "").toLowerCase(), ok = 0;
    if ((opt.kw || []).some(function (k) { return t.indexOf(k.toLowerCase()) !== -1; })) ok = 2;            // 標題命中最強
    else if ((opt.pain || []).some(function (p) { return pains.indexOf(p) !== -1; })) ok = 1;
    else if ((opt.kw || []).some(function (k) { return h.indexOf(k.toLowerCase()) !== -1; })) ok = 1;
    return (a._gh[opt.label] = ok);
  }
  function guideScore(a) {
    var s = 0;
    if (guide.goal) s += guideHit(a, guide.goal) * 3;
    if (guide.who) s += guideHit(a, guide.who);
    return s;
  }
  function matchesGuide(a) {
    if (guide.goal) return guideHit(a, guide.goal);
    if (guide.who) return guideHit(a, guide.who);
    return true;
  }
  function visible(a) { return matchesTags(a) && matchesQuery(a) && matchesGuide(a); }
  var LEVEL_ORDER = { "零基礎入門": 0, "基礎": 1, "進階": 2, "專業": 3 };
  function guideRank(a, b) {
    var d = guideScore(b) - guideScore(a); if (d) return d;
    var la = LEVEL_ORDER[((a.tags && a.tags.level) || [])[0]], lb = LEVEL_ORDER[((b.tags && b.tags.level) || [])[0]];
    if (la === undefined) la = 2; if (lb === undefined) lb = 2;
    if (la !== lb) return la - lb;
    return ((b.updated || b.date) || "").localeCompare((a.updated || a.date) || "");
  }

  // 某標籤在「目前其他條件 + 搜尋」下還會帶出幾篇
  function countWith(dim, tag) {
    return articles.filter(function (a) {
      if (articleTags(a, dim).indexOf(tag) === -1) return false;
      if (!matchesQuery(a)) return false;
      var ok = true;
      selected.forEach(function (key) {
        if (!ok || key === tagKey(dim, tag)) return;
        var sep = key.indexOf("::");
        var d = key.slice(0, sep), t = key.slice(sep + 2);
        if (articleTags(a, d).indexOf(t) === -1) ok = false;
      });
      return ok;
    }).length;
  }

  function usedTags(dim) {
    var order = dim === "pain" ? PAIN.map(function (p) { return p.label; }) : ((window.ARTICLE_TAGS && window.ARTICLE_TAGS[dim]) || []);
    var present = {};
    articles.forEach(function (a) {
      articleTags(a, dim).forEach(function (t) { present[t] = true; });
    });
    var list = order.filter(function (t) { return present[t]; });
    Object.keys(present).forEach(function (t) { if (list.indexOf(t) === -1) list.push(t); });
    return list;
  }

  function renderFilter() {
    elFilter.innerHTML = "";
    DIMS.forEach(function (dim) {
      var tags = usedTags(dim.key);
      if (!tags.length) return;
      var row = document.createElement(dim.collapse ? "details" : "div");
      row.className = "filter-dim" + (dim.collapse ? " filter-dim-collapse" : "");
      if (dim.collapse) {
        var hasSel = tags.some(function (t) { return selected.has(tagKey(dim.key, t)); });
        row.open = hasSel;
      }
      var lab = document.createElement(dim.collapse ? "summary" : "div");
      lab.className = "filter-dim-label";
      lab.textContent = dim.collapse ? dim.label + "（" + tags.length + " 個技術標籤，點開）" : dim.label;
      row.appendChild(lab);
      var chips = document.createElement("div");
      chips.className = "filter-dim-chips";
      tags.forEach(function (tag) {
        var key = tagKey(dim.key, tag);
        var n = countWith(dim.key, tag);
        var chip = document.createElement("button");
        chip.type = "button";
        chip.className = "achip" + (selected.has(key) ? " on" : "") + (n === 0 && !selected.has(key) ? " dim" : "");
        chip.innerHTML = esc(tag) + ' <span class="c">' + n + "</span>";
        if (dim.key === "pain") { var pd = PAIN.filter(function (p) { return p.label === tag; })[0]; if (pd) chip.title = pd.desc; }
        chip.addEventListener("click", function () { toggle(key); });
        chips.appendChild(chip);
      });
      row.appendChild(chips);
      elFilter.appendChild(row);
    });
  }

  function renderSelected() {
    if (selected.size === 0) {
      elSelected.innerHTML = '<span class="sel-hint">還沒選條件，下面是全部文章。點上面的標籤開始交集篩選。</span>';
      elClear.style.display = "none";
      return;
    }
    elClear.style.display = "";
    var html = '<span class="sel-hint">已選（要同時符合）：</span>';
    selected.forEach(function (key) {
      var tag = key.slice(key.indexOf("::") + 2);
      html += '<button type="button" class="sel-tag" data-key="' + esc(key) + '">' + esc(tag) + ' ×</button>';
    });
    elSelected.innerHTML = html;
    elSelected.querySelectorAll(".sel-tag").forEach(function (b) {
      b.addEventListener("click", function () { toggle(b.getAttribute("data-key")); });
    });
  }

  function renderCards() {
    var n = 0, active = !!(guide.who || guide.goal);
    var order = null;
    if (active) { order = {}; articles.map(function (a, i) { return i; }).sort(function (i, j) { return guideRank(articles[i], articles[j]); }).forEach(function (idx, pos) { order[idx] = pos; }); }
    elGrid.querySelectorAll(".article-card").forEach(function (card) {
      var idx = +card.getAttribute("data-idx");
      var show = visible(articles[idx]);
      card.classList.toggle("hide", !show);
      card.style.order = active ? order[idx] : "";
      if (show) n++;
    });
    renderGuidePicks(n);
    elCount.innerHTML = "符合 <b>" + n + "</b> 篇" +
      ((selected.size || query) ? "（共 " + articles.length + " 篇）" : "");
    elEmpty.classList.toggle("show", n === 0);
    queueQueryLog(n);
  }

  function refresh() { renderFilter(); renderSelected(); renderCards(); }

  // 咪卡引導區：我是誰 × 想解決什麼 → 縮小列表、先推三篇
  function renderGuidePicks(n) {
    var say = document.getElementById("mkGuideSay"), picks = document.getElementById("mkGuidePicks");
    if (!say || !picks) return;
    if (!guide.who && !guide.goal) { say.textContent = "不知道從哪篇看起？勾一下你是誰、想解決什麼，我幫你挑。"; picks.hidden = true; picks.innerHTML = ""; return; }
    var top = articles.filter(visible).sort(guideRank).slice(0, 3);
    var whoTxt = guide.who ? guide.who.label : "", goalTxt = guide.goal ? "想" + guide.goal.label : "";
    if (!n) { say.textContent = "這個組合我還沒寫過文章，直接問我吧，我帶你看相近的。"; picks.hidden = true; picks.innerHTML = ""; return; }
    say.textContent = "好，" + whoTxt + (whoTxt && goalTxt ? "，" : "") + goalTxt + "。我找到 " + n + " 篇，先看這幾篇：";
    picks.innerHTML = top.map(function (a) {
      var lv = ((a.tags && a.tags.level) || [])[0] || "";
      return '<li><a href="' + esc(a.url || ("articles/" + a.id + "/")) + '">' + esc(a.title.split("｜")[0]) + "</a><small>" + esc(lv) + "</small></li>";
    }).join("");
    picks.hidden = false;
  }
  function askMika(text) {
    var input = document.querySelector(".mkw-input"), btn = document.querySelector(".mkw-send"), launcher = document.querySelector(".mkw-launcher"), root = document.getElementById("mkw-root");
    if (!input || !btn) { window.location.href = "https://line.me/R/ti/p/@713kczfc"; return; }
    if (root && !root.classList.contains("mkw-open") && launcher) launcher.click();
    input.value = text; setTimeout(function () { btn.click(); }, 150);
  }
  function renderGuide() {
    var rows = [["who", "mkGuideWho", "我是"], ["goal", "mkGuideGoal", "想解決"]];
    rows.forEach(function (r) {
      var el = document.getElementById(r[1]); if (!el) return;
      el.innerHTML = "";
      (GUIDE[r[0]] || []).forEach(function (opt) {
        var b = document.createElement("button"); b.type = "button";
        b.className = "achip" + (guide[r[0]] === opt ? " on" : "");
        b.textContent = opt.label;
        b.addEventListener("click", function () { guide[r[0]] = (guide[r[0]] === opt) ? null : opt; renderGuide(); refresh(); });
        el.appendChild(b);
      });
      var o = document.createElement("button"); o.type = "button"; o.className = "achip other"; o.textContent = "其他，問咪卡";
      o.addEventListener("click", function () {
        var w = guide.who ? "我是" + guide.who.label + "，" : "", g = guide.goal ? "想" + guide.goal.label + "，" : "";
        var extra = window.prompt("跟咪卡說一句：你是誰、想解決什麼？", w + g) ;
        if (extra) askMika(extra + " 請推薦我該先看哪幾篇文章");
      });
      el.appendChild(o);
    });
  }

  function toggle(key) {
    if (selected.has(key)) selected.delete(key); else selected.add(key);
    refresh();
  }

  function clearAll() {
    selected.clear();
    guide.who = null; guide.goal = null; renderGuide();
    query = "";
    if (elSearch) elSearch.value = "";
    if (elSearchWrap) elSearchWrap.classList.remove("has-text");
    refresh();
  }

  // 卡片上那一行文字要放「解決」還是「適合誰」（2026-09-18 江江：文字太多，只留標題加一句）
  // 改這個常數就換，兩種都留著是因為還在比哪一種對讀者有用。
  var CARD_LINE = "audience"; // "problem" = 解決什麼｜"audience" = 適合誰

  // 封面：橫式（wide）用 16:9，直式（tall，多半是輪播卡）維持 4:5，不裁切。
  function coverHTML(a) {
    var c = a.cover;
    if (!c) return "";
    var src = c.wide || c.tall;
    if (!src) return "";
    var shape = c.wide ? "wide" : "tall";
    return '<a class="card-cover ' + shape + '" href="' + esc(a.url) + '" tabindex="-1" aria-hidden="true">' +
      '<img src="' + esc(src) + '" alt="" loading="lazy">' +
      "</a>";
  }

  function cardHTML(a, idx) {
    var type = (a.tags && a.tags.content_type && a.tags.content_type[0]) || "";
    var badge = TYPE_BADGE[type] || "planning";
    var topics = ((a.tags && a.tags.topic) || []).map(function (t) {
      return '<span class="atag">' + esc(t) + "</span>";
    }).join("");
    var line = CARD_LINE === "problem"
      ? '<p class="card-problem"><b>解決：</b>' + esc(a.problem) + "</p>"
      : '<p class="card-audience"><b>適合：</b>' + esc(a.audience) + "</p>";
    return '' +
      '<article class="list-card article-card' + (a.cover ? " has-cover" : "") + '" data-idx="' + idx + '">' +
        coverHTML(a) +
        '<div class="card-meta">' +
          '<span class="card-date">' + (a.updated && a.updated !== a.date ? '更新 ' + esc(a.updated) : esc(a.date)) + '</span>' +
          '<span class="badge ' + badge + '">' + esc(type) + '</span>' +
        '</div>' +
        '<h3><a href="' + esc(a.url) + '">' + esc(a.title) + '</a></h3>' +
        line +
        (topics ? '<div class="atag-row">' + topics + '</div>' : '') +
        '<div class="card-links">' +
          '<a href="' + esc(a.url) + '">閱讀全文 →</a>' +
        '</div>' +
      '</article>';
  }

  document.addEventListener("DOMContentLoaded", function () {
    elGrid        = document.getElementById("articles-grid");
    elCount       = document.getElementById("filter-count");
    elFilter      = document.getElementById("filter-dims");
    elSelected    = document.getElementById("filter-selected");
    elClear       = document.getElementById("filter-clear");
    elEmpty       = document.getElementById("articles-empty");
    elSearch      = document.getElementById("search-input");
    elSearchWrap  = document.getElementById("article-search");
    elSearchClear = document.getElementById("search-clear");
    if (!elGrid) return;

    elGrid.innerHTML = articles.map(cardHTML).join("");
    elClear.addEventListener("click", clearAll);
    renderGuide();

    if (elSearch) {
      elSearch.addEventListener("input", function () {
        query = elSearch.value.trim().toLowerCase();
        elSearchWrap.classList.toggle("has-text", query.length > 0);
        refresh();
      });
    }
    if (elSearchClear) {
      elSearchClear.addEventListener("click", function () {
        query = "";
        elSearch.value = "";
        elSearchWrap.classList.remove("has-text");
        elSearch.focus();
        refresh();
      });
    }

    refresh();
  });
})();
