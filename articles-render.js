/* ============================================================
   articles-render.js  ·  深度文章總站渲染 + 交集篩選 + 搜尋
   ------------------------------------------------------------
   讀 window.ARTICLES，做四件事：
     1. 渲染所有文章卡片（依日期新到舊，最新在前）
     2. 入口區（articles-entry.js）：一排「你現在想解決什麼」，點了只列屬於那一題的文章，先推人工指定的幾篇
        進一步篩選（難度、類型、主題）預設收合，只顯示真的有文章用到的標籤，附篇數
     3. 多選「交集（AND）」過濾：選越多剩越少，即時顯示剩餘篇數
     4. 關鍵字搜尋：標題、摘要、解決、適合、標籤全文比對，跟篩選並用
   ============================================================ */
(function () {
  "use strict";

  var DIMS = [
    { key: "level",        label: "難度" },
    { key: "content_type", label: "類型" },
    { key: "topic",        label: "主題", collapse: true }
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
  // 入口（2026-11-13 改版）：一套 8 個入口取代舊的「我是／想解決」兩排與「我遇到的問題」一排。
  // 每篇歸哪個入口、每個入口先推哪幾篇，都寫在 articles-entry.js，不再用關鍵字比對猜。
  var ENTRIES = window.ARTICLE_ENTRIES || [];
  var entry = null;           // 目前選到的入口（物件）
  var byId = {};
  articles.forEach(function (a) { byId[a.id] = a; });
  ENTRIES.forEach(function (e) {
    e._set = {};
    (e.ids || []).forEach(function (id) { e._set[id] = 2; });      // 主入口
    (e.also || []).forEach(function (id) { if (!e._set[id]) e._set[id] = 1; }); // 副入口
    e._picks = (e.picks || []).map(function (id) { return byId[id]; }).filter(Boolean);
  });
  var query = "";             // 搜尋關鍵字（小寫）

  var elGrid, elCount, elFilter, elSelected, elClear, elEmpty, elSearch, elSearchWrap, elSearchClear;

  function tagKey(dim, tag) { return dim + "::" + tag; }

  function articleTags(a, dim) {
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

  function entryHit(a) { return entry ? (entry._set[a.id] || 0) : 0; }
  function matchesEntry(a) { return entry ? !!entry._set[a.id] : true; }
  function visible(a) { return matchesTags(a) && matchesQuery(a) && matchesEntry(a); }
  var LEVEL_ORDER = { "零基礎入門": 0, "基礎": 1, "進階": 2, "專業": 3 };
  // 選了入口後的排序：先推的幾篇在最前（照指定順序），再來主入口、副入口，同級先零基礎再新文
  function entryRank(a, b) {
    var pa = entry._picks.indexOf(a), pb = entry._picks.indexOf(b);
    if (pa === -1) pa = 99; if (pb === -1) pb = 99;
    if (pa !== pb) return pa - pb;
    var d = entryHit(b) - entryHit(a); if (d) return d;
    var la = LEVEL_ORDER[((a.tags && a.tags.level) || [])[0]], lb = LEVEL_ORDER[((b.tags && b.tags.level) || [])[0]];
    if (la === undefined) la = 2; if (lb === undefined) lb = 2;
    if (la !== lb) return la - lb;
    return ((b.updated || b.date) || "").localeCompare((a.updated || a.date) || "");
  }

  // 某標籤在「目前其他條件 + 搜尋」下還會帶出幾篇
  function countWith(dim, tag) {
    return articles.filter(function (a) {
      if (articleTags(a, dim).indexOf(tag) === -1) return false;
      if (!matchesQuery(a) || !matchesEntry(a)) return false;
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
    var order = (window.ARTICLE_TAGS && window.ARTICLE_TAGS[dim]) || [];
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
    // 開合完全交給讀者（要選條件本來就得先打開），這裡只在標題上標出已選幾個
    var advSum = document.getElementById("advFilterSum");
    if (advSum) advSum.textContent = "進一步篩選：難度、類型、主題" + (selected.size ? "（已選 " + selected.size + " 個）" : "");
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
        chip.addEventListener("click", function () { toggle(key); });
        chips.appendChild(chip);
      });
      row.appendChild(chips);
      elFilter.appendChild(row);
    });
  }

  function renderSelected() {
    if (selected.size === 0 && !entry) {
      elSelected.innerHTML = '<span class="sel-hint">' + (query ? "下面是搜尋結果。" : "還沒選，下面是全部文章，最新的在前面。") + "</span>";
      elClear.style.display = query ? "" : "none";
      return;
    }
    elClear.style.display = "";
    var html = '<span class="sel-hint">' + (selected.size + (entry ? 1 : 0) > 1 ? "已選（要同時符合）：" : "已選：") + "</span>";
    if (entry) html += '<button type="button" class="sel-tag" data-entry="1">' + esc(entry.label) + " ×</button>";
    selected.forEach(function (key) {
      var tag = key.slice(key.indexOf("::") + 2);
      html += '<button type="button" class="sel-tag" data-key="' + esc(key) + '">' + esc(tag) + ' ×</button>';
    });
    elSelected.innerHTML = html;
    elSelected.querySelectorAll(".sel-tag").forEach(function (b) {
      b.addEventListener("click", function () {
        if (b.getAttribute("data-entry")) { entry = null; renderEntries(); refresh(); }
        else toggle(b.getAttribute("data-key"));
      });
    });
  }

  function renderCards() {
    var n = 0, active = !!entry;
    var order = null;
    if (active) { order = {}; articles.map(function (a, i) { return i; }).sort(function (i, j) { return entryRank(articles[i], articles[j]); }).forEach(function (idx, pos) { order[idx] = pos; }); }
    elGrid.querySelectorAll(".article-card").forEach(function (card) {
      var idx = +card.getAttribute("data-idx");
      var show = visible(articles[idx]);
      card.classList.toggle("hide", !show);
      card.style.order = active ? order[idx] : "";
      if (show) n++;
    });
    renderPicks(n);
    elCount.innerHTML = "符合 <b>" + n + "</b> 篇" +
      ((selected.size || query || entry) ? "（共 " + articles.length + " 篇）" : "");
    elEmpty.classList.toggle("show", n === 0);
    queueQueryLog(n);
  }

  function refresh() { renderFilter(); renderSelected(); renderCards(); }

  // 入口區：沒選時推「第一次來先看」（ENTRIES 裡 starter: true 那個入口的 picks）；選了就推該入口的 picks
  function pickHTML(a) {
    var lv = ((a.tags && a.tags.level) || [])[0] || "";
    return '<li><a href="' + esc(a.url || ("articles/" + a.id + "/")) + '">' + esc(a.title.split("｜")[0]) + "</a>" +
      (lv ? "<small>" + esc(lv) + "</small>" : "") +
      (a.problem ? '<span class="pick-why">' + esc(a.problem) + "</span>" : "") + "</li>";
  }
  function renderPicks(n) {
    var say = document.getElementById("mkGuideSay"), picks = document.getElementById("mkGuidePicks"), note = document.getElementById("mkGuideNote");
    if (!say || !picks) return;
    var filtered = !!(selected.size || query);   // 另外下了搜尋或篩選：推薦可能不在結果裡，只留符合的
    var src = entry || ENTRIES.filter(function (e) { return e.starter; })[0];
    var list = src ? src._picks.filter(function (a) { return !filtered || visible(a); }) : [];
    if (!entry) {
      say.textContent = "不知道從哪篇看起？點一個你現在想解決的事，我只列那一題的文章給你。";
      if (note) { note.hidden = !list.length || filtered; note.textContent = "第一次來，可以先看這幾篇："; }
      if (filtered) list = [];
    } else {
      say.textContent = entry.label + "：" + entry.desc;
      if (note) {
        note.hidden = false;
        note.textContent = !n ? "這一題加上你選的條件，目前沒有文章。拿掉一個條件，或直接問我。"
          : (list.length && n > list.length) ? "這一題有 " + n + " 篇，先看這幾篇，其餘在下面："
          : list.length ? "符合的有 " + n + " 篇："
          : "符合的有 " + n + " 篇，都在下面。";
      }
    }
    picks.innerHTML = list.map(pickHTML).join("");
    picks.hidden = !list.length;
  }
  function askMika(text) {
    var input = document.querySelector(".mkw-input"), btn = document.querySelector(".mkw-send"), launcher = document.querySelector(".mkw-launcher"), root = document.getElementById("mkw-root");
    if (!input || !btn) { window.location.href = "https://line.me/R/ti/p/@713kczfc"; return; }
    if (root && !root.classList.contains("mkw-open") && launcher) launcher.click();
    input.value = text; setTimeout(function () { btn.click(); }, 150);
  }
  function renderEntries() {
    var el = document.getElementById("mkGuideEntries"); if (!el) return;
    if (el._built) {   // 只更新狀態、不重建按鈕，鍵盤焦點才不會跑掉
      ENTRIES.forEach(function (e) {
        e._btn.className = "achip" + (entry === e ? " on" : "");
        e._btn.setAttribute("aria-pressed", entry === e ? "true" : "false");
      });
      return;
    }
    el._built = true;
    ENTRIES.forEach(function (e) {
      var b = document.createElement("button"); b.type = "button";
      b.className = "achip" + (entry === e ? " on" : "");
      b.setAttribute("aria-pressed", entry === e ? "true" : "false");
      b.textContent = e.label;
      b.title = e.desc || "";
      b.addEventListener("click", function () { entry = (entry === e) ? null : e; renderEntries(); refresh(); });
      e._btn = b;
      el.appendChild(b);
    });
    var o = document.createElement("button"); o.type = "button"; o.className = "achip other"; o.textContent = "都不是，問咪卡";
    o.addEventListener("click", function () {
      var extra = window.prompt("跟咪卡說一句：你想解決什麼？", entry ? "我想" + entry.label + "，" : "");
      if (extra) askMika(extra + " 請推薦我該先看哪幾篇文章");
    });
    el.appendChild(o);
  }

  function toggle(key) {
    if (selected.has(key)) selected.delete(key); else selected.add(key);
    refresh();
  }

  function clearAll() {
    selected.clear();
    entry = null; renderEntries();
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
    renderEntries();

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
