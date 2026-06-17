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
    { key: "topic",        label: "主題" },
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
    return (b.date || "").localeCompare(a.date || "");
  });

  var selected = new Set();   // "dim::tag"
  var query = "";             // 搜尋關鍵字（小寫）

  var elGrid, elCount, elFilter, elSelected, elClear, elEmpty, elSearch, elSearchWrap, elSearchClear;

  function tagKey(dim, tag) { return dim + "::" + tag; }

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
      if (((a.tags && a.tags[dim]) || []).indexOf(tag) === -1) ok = false;
    });
    return ok;
  }

  // 搜尋：標題 + 摘要 + 解決 + 適合 + 全部標籤
  function haystack(a) {
    var parts = [a.title, a.summary, a.problem, a.audience];
    if (a.tags) Object.keys(a.tags).forEach(function (d) { parts = parts.concat(a.tags[d] || []); });
    return parts.join(" ").toLowerCase();
  }
  function matchesQuery(a) {
    if (!query) return true;
    return haystack(a).indexOf(query) !== -1;
  }

  function visible(a) { return matchesTags(a) && matchesQuery(a); }

  // 某標籤在「目前其他條件 + 搜尋」下還會帶出幾篇
  function countWith(dim, tag) {
    return articles.filter(function (a) {
      if (((a.tags && a.tags[dim]) || []).indexOf(tag) === -1) return false;
      if (!matchesQuery(a)) return false;
      var ok = true;
      selected.forEach(function (key) {
        if (!ok || key === tagKey(dim, tag)) return;
        var sep = key.indexOf("::");
        var d = key.slice(0, sep), t = key.slice(sep + 2);
        if (((a.tags && a.tags[d]) || []).indexOf(t) === -1) ok = false;
      });
      return ok;
    }).length;
  }

  function usedTags(dim) {
    var order = (window.ARTICLE_TAGS && window.ARTICLE_TAGS[dim]) || [];
    var present = {};
    articles.forEach(function (a) {
      ((a.tags && a.tags[dim]) || []).forEach(function (t) { present[t] = true; });
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
      var row = document.createElement("div");
      row.className = "filter-dim";
      var lab = document.createElement("div");
      lab.className = "filter-dim-label";
      lab.textContent = dim.label;
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
    var n = 0;
    elGrid.querySelectorAll(".article-card").forEach(function (card) {
      var show = visible(articles[+card.getAttribute("data-idx")]);
      card.classList.toggle("hide", !show);
      if (show) n++;
    });
    elCount.innerHTML = "符合 <b>" + n + "</b> 篇" +
      ((selected.size || query) ? "（共 " + articles.length + " 篇）" : "");
    elEmpty.classList.toggle("show", n === 0);
  }

  function refresh() { renderFilter(); renderSelected(); renderCards(); }

  function toggle(key) {
    if (selected.has(key)) selected.delete(key); else selected.add(key);
    refresh();
  }

  function clearAll() {
    selected.clear();
    query = "";
    if (elSearch) elSearch.value = "";
    if (elSearchWrap) elSearchWrap.classList.remove("has-text");
    refresh();
  }

  function cardHTML(a, idx) {
    var type = (a.tags && a.tags.content_type && a.tags.content_type[0]) || "";
    var badge = TYPE_BADGE[type] || "planning";
    var topics = ((a.tags && a.tags.topic) || []).map(function (t) {
      return '<span class="atag">' + esc(t) + "</span>";
    }).join("");
    return '' +
      '<article class="list-card article-card" data-idx="' + idx + '">' +
        '<div class="card-meta">' +
          '<span class="card-date">' + esc(a.date) + '</span>' +
          '<span class="badge ' + badge + '">' + esc(type) + '</span>' +
        '</div>' +
        '<h3><a href="' + esc(a.url) + '">' + esc(a.title) + '</a></h3>' +
        '<p class="card-problem"><b>解決：</b>' + esc(a.problem) + '</p>' +
        '<p class="card-audience"><b>適合：</b>' + esc(a.audience) + '</p>' +
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
