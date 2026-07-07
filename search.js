/* ============================================================
   search.js · 全站搜尋頁邏輯
   ------------------------------------------------------------
   fetch /site-index.json，讀 URL 參數 q（關鍵字）與 type（類型篩選），
   對 title / summary / problem / audience / tags / id 做不分大小寫子字串
   比對，即時輸入即過濾。索引本身由 scripts/build-site-index.mjs 產生，
   本檔只負責讀取與渲染，不做任何資料生成。
   ============================================================ */
(function () {
  "use strict";

  var TYPE_LABELS = {
    article: "深度文章",
    skill: "技能包",
    course: "課程講座",
    resource: "簡報資源",
    case: "合作案例",
    page: "網站頁面",
    tool: "工具",
  };

  var input = document.getElementById("site-search-input");
  var chipsWrap = document.getElementById("search-type-chips");
  var resultsEl = document.getElementById("search-results");
  var statusEl = document.getElementById("search-status");
  var emptyEl = document.getElementById("search-empty");

  var allItems = [];
  var activeType = "all";

  function getParam(name) {
    var params = new URLSearchParams(window.location.search);
    return params.get(name) || "";
  }

  function escapeHtml(str) {
    return String(str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function flattenTags(tags) {
    if (!tags) return [];
    var out = [];
    ["topic", "level", "content_type"].forEach(function (dim) {
      (tags[dim] || []).forEach(function (v) {
        out.push(v);
      });
    });
    return out;
  }

  function matchesQuery(item, query) {
    if (!query) return true;
    var haystack = [
      item.title,
      item.summary,
      item.problem,
      item.audience,
      item.id,
    ]
      .concat(flattenTags(item.tags))
      .join(" ")
      .toLowerCase();
    // 空格分詞 AND 比對：每個詞都命中才算符合（「角色設定 三視圖」= 兩詞都要有）
    var tokens = query.split(/\s+/).filter(Boolean);
    return tokens.every(function (token) {
      return haystack.indexOf(token) !== -1;
    });
  }

  function renderCard(item) {
    var badge = TYPE_LABELS[item.type] || item.type;
    var tags = flattenTags(item.tags).slice(0, 6);
    var tagHtml = tags
      .map(function (t) {
        return '<span class="search-tag">' + escapeHtml(t) + "</span>";
      })
      .join("");
    var url = item.url || "#";
    var isExternal = /^https?:\/\//.test(url);
    var target = isExternal ? ' target="_blank" rel="noopener"' : "";

    return (
      '<a class="search-card" href="' +
      escapeHtml(url) +
      '"' +
      target +
      ">" +
      '<span class="search-card-badge">' +
      escapeHtml(badge) +
      "</span>" +
      "<h3>" +
      escapeHtml(item.title) +
      "</h3>" +
      "<p>" +
      escapeHtml(item.summary) +
      "</p>" +
      (tagHtml ? '<div class="search-tag-row">' + tagHtml + "</div>" : "") +
      "</a>"
    );
  }

  function render() {
    var query = (input.value || "").trim().toLowerCase();
    var matched = allItems.filter(function (item) {
      var typeMatch = activeType === "all" || item.type === activeType;
      return typeMatch && matchesQuery(item, query);
    });

    resultsEl.innerHTML = matched.map(renderCard).join("");
    statusEl.innerHTML = "符合 <b>" + matched.length + "</b> 項";
    emptyEl.classList.toggle("show", matched.length === 0);
  }

  function setActiveType(type) {
    activeType = type;
    var chips = chipsWrap.querySelectorAll(".search-type-chip");
    chips.forEach(function (chip) {
      chip.classList.toggle("on", chip.dataset.type === type);
    });
  }

  function init() {
    var initialQuery = getParam("q");
    var initialType = getParam("type");

    if (initialQuery) input.value = initialQuery;
    if (initialType && TYPE_LABELS[initialType]) {
      setActiveType(initialType);
    }

    chipsWrap.addEventListener("click", function (e) {
      var chip = e.target.closest(".search-type-chip");
      if (!chip) return;
      setActiveType(chip.dataset.type || "all");
      render();
    });

    input.addEventListener("input", render);

    fetch("/site-index.json")
      .then(function (res) {
        if (!res.ok) throw new Error("HTTP " + res.status);
        return res.json();
      })
      .then(function (data) {
        allItems = Array.isArray(data.items) ? data.items : [];
        render();
      })
      .catch(function (err) {
        statusEl.textContent = "索引載入失敗";
        emptyEl.classList.add("show");
        emptyEl.querySelector("p").textContent =
          "site-index.json 讀取失敗（" + err.message + "），稍後再試。";
      });
  }

  document.addEventListener("DOMContentLoaded", init);
})();
