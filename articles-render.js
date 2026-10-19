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
    return ((b.updated || b.date) || "").localeCompare((a.updated || a.date) || "");
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
    queueQueryLog(n);
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

  // 卡片上那一行文字要放「解決」還是「適合誰」（2026-09-18 江江：文字太多，只留標題加一句）
  // 改這個常數就換，兩種都留著是因為還在比哪一種對讀者有用。
  var CARD_LINE = "audience"; // "problem" = 解決什麼｜"audience" = 適合誰

  // 封面：橫式（wide）用 16:9，直式（tall，多半是輪播卡）維持 4:5，不裁切。
  // 列表縮圖登記表（THUMBS:BEGIN 到 THUMBS:END 之間可由腳本整段重寫）
  // 鍵＝封面原圖路徑，值＝縮圖寬高；縮圖固定放 images/thumbs/<原路徑去掉 images/>.webp，640px 寬、WebP 品質 80。
  // 沒登記的封面（新文章還沒產縮圖）自動退回用原圖，不會破圖。
  // THUMBS:BEGIN
  var THUMBS = {
    "ai-trends/apple-wwdc26-siri-lobster-ai/assets/slide-01-opening.jpg": [640, 360],
    "ai-trends/demis-hassabis-agi-science-ai/assets/youtube-thumbnail.jpg": [640, 480],
    "ai-trends/spacex-ipo-musk-trillionaire-knowledge-work/assets/youtube-thumbnail.jpg": [640, 360],
    "articles/agent-workflow-builds-automation/assets/00-summary.jpg": [640, 360],
    "articles/diary-driven-agent-3x4/assets/card-01.jpg": [640, 1000],
    "courses/2026-06-27-parenting-storytelling-ai/images/story-cover.jpg": [640, 383],
    "images/ai-office/lyca/lyca-cover-hd.webp": [640, 360],
    "images/articles/agent-three-layer-triage-cover.jpg": [640, 360],
    "images/articles/agi-work-and-discovery-01.jpg": [640, 800],
    "images/articles/ai-adoption-raise-not-install-cover.jpg": [640, 360],
    "images/articles/ai-adoption-start-with-one-workflow-cover.jpg": [640, 360],
    "images/articles/ai-batch-work-without-seeing-data-cover.jpg": [640, 360],
    "images/articles/ai-cp-value-calculus-01.jpg": [640, 800],
    "images/articles/ai-custom-work-compound-cover.jpg": [640, 360],
    "images/articles/ai-customer-service-api-cost-cover.jpg": [640, 360],
    "images/articles/ai-customer-service-model-retest-cover.jpg": [640, 360],
    "images/articles/ai-data-red-lines-cover.jpg": [640, 360],
    "images/articles/ai-employee-four-levels-hero.jpg": [640, 360],
    "images/articles/ai-employees-manage-agents-cover.jpg": [640, 360],
    "images/articles/ai-era-websites-for-agents-cover.jpg": [640, 360],
    "images/articles/ai-image-api-cost-cover.jpg": [640, 960],
    "images/articles/ai-model-token-efficiency-01.jpg": [640, 360],
    "images/articles/ai-rule-file-slimming-cover.jpg": [640, 360],
    "images/articles/ai-schedule-wake-interval-cover.jpg": [640, 360],
    "images/articles/ai-slides-half-auto-google-slides-cover.jpg": [640, 360],
    "images/articles/ai-understands-ei-ha-cover.jpg": [640, 360],
    "images/articles/ai-usage-audit-cover.jpg": [640, 360],
    "images/articles/ai-user-testing-cover.jpg": [640, 800],
    "images/articles/ai-vs-script-four-situations-summary.jpg": [640, 360],
    "images/articles/analytics-7-ga4-gate.jpg": [640, 800],
    "images/articles/audrey-tang-reverse-alignment/cover.jpg": [640, 360],
    "images/articles/auto-compact-mod-cover.jpg": [640, 360],
    "images/articles/cathay-tech-conference-2026/cover.jpg": [640, 360],
    "images/articles/character-costume-sheet-three-views/mika-costume-sheet-four-views.jpg": [640, 799],
    "images/articles/chatgpt-web-codex-console/2026-10-09-2325-cover.jpg": [640, 360],
    "images/articles/chatgpt-work-codex-choice/01.jpg": [640, 800],
    "images/articles/claude-meta-ads-connector-cover.jpg": [640, 360],
    "images/articles/cli-api-mcp-computer-use-cover.jpg": [640, 800],
    "images/articles/cloudflare-service-map-cover.jpg": [640, 360],
    "images/articles/codex-log-health-check-cover-image2.jpg": [640, 800],
    "images/articles/cross-ai-review-both-wrong/01.jpg": [640, 800],
    "images/articles/decision-ladder-01.jpg": [640, 800],
    "images/articles/delete-before-automate-cover.jpg": [640, 800],
    "images/articles/design-for-ai-errors-cover.jpg": [640, 800],
    "images/articles/domain-and-account-ownership-cover.jpg": [640, 360],
    "images/articles/dual-centaur-meeting-cover.jpg": [640, 427],
    "images/articles/dual-track-planning-loop-cover.jpg": [640, 800],
    "images/articles/eight-ai-system-concepts-2026-cover.jpg": [640, 800],
    "images/articles/first-principles-money-soup-card-01.jpg": [640, 800],
    "images/articles/five-loops-content-line-card-01.jpg": [640, 800],
    "images/articles/fixed-test-set-for-ai-cover.jpg": [640, 360],
    "images/articles/give-ai-choices-cover.jpg": [640, 581],
    "images/articles/grok-bot-galaxy-day1-founders/card01.jpg": [640, 800],
    "images/articles/grok-bot-galaxy-day2-workshops/card01.jpg": [640, 800],
    "images/articles/grok-bot-galaxy-day3-shipping/card01.jpg": [640, 800],
    "images/articles/handoff-continue-or-replace-cover.jpg": [640, 360],
    "images/articles/harness-to-loop-01.jpg": [640, 360],
    "images/articles/hosting-platform-decision-tree-cover.jpg": [640, 360],
    "images/articles/how-ai-connects-software-mcp-usb.jpg": [640, 427],
    "images/articles/how-to-verify-ai-rule-changes-cover.jpg": [640, 800],
    "images/articles/inspiration-production-system-cover.jpg": [640, 960],
    "images/articles/knowledge-workers-new-model-guide-01.jpg": [640, 800],
    "images/articles/let-ai-review-itself-cover.jpg": [640, 800],
    "images/articles/line-group-ai-workflow-summary.jpg": [640, 800],
    "images/articles/llm-rag-agent-mcp-cover.jpg": [640, 800],
    "images/articles/long-answer-overview.jpg": [640, 360],
    "images/articles/long-task-completion-rate-compare.jpg": [640, 360],
    "images/articles/loop-four-entries-01.jpg": [640, 800],
    "images/articles/loop-round-limit-cover.jpg": [640, 360],
    "images/articles/mac-for-agent-beginners-01.jpg": [640, 800],
    "images/articles/make-your-ai-secretary-cover.jpg": [640, 800],
    "images/articles/manage-ai-with-management-knowledge-cover.jpg": [640, 427],
    "images/articles/meeting-mic-rescue-on-mac-cover.jpg": [640, 360],
    "images/articles/meeting-record-agent-workflow-01.jpg": [640, 800],
    "images/articles/mika-solo-company-summary.jpg": [640, 360],
    "images/articles/mika-to-laika/laika-portrait.jpg": [640, 799],
    "images/articles/my-three-loops-01.jpg": [640, 800],
    "images/articles/notebooklm-real-photo-slides-01.jpg": [640, 397],
    "images/articles/one-sentence-ai-website-workflow-cover.jpg": [640, 360],
    "images/articles/one-sentence-video-to-deep-article/cover.jpg": [640, 360],
    "images/articles/opus-luna-model-division-cover.jpg": [640, 360],
    "images/articles/parallel-site-editing-cover.jpg": [640, 427],
    "images/articles/pii-shield-cover.jpg": [640, 360],
    "images/articles/reevaluate-models-same-test-cover.jpg": [640, 360],
    "images/articles/same-question-different-answers-cover.jpg": [640, 800],
    "images/articles/session-messaging-01.jpg": [640, 800],
    "images/articles/slides-by-audience-sop-cover.jpg": [640, 360],
    "images/articles/start-from-one-persons-problem-cover.jpg": [640, 360],
    "images/articles/strong-ai-models-knowledge-workflow-road-02.jpg": [640, 360],
    "images/articles/task-queue-mod-cover.jpg": [640, 360],
    "images/articles/tidy-mess-before-consulting-cover.jpg": [640, 1001],
    "images/articles/token-money-worth-doing-cover.jpg": [640, 360],
    "images/articles/use-more-ai-not-enough-cover.jpg": [640, 320],
    "images/articles/webmcp-day-one-cover.jpg": [640, 360],
    "images/articles/webnode-to-cloudflare-pages-cover.jpg": [640, 360],
    "images/articles/website-as-workstation-cover.jpg": [640, 360],
    "images/articles/what-are-subagents-cover.jpg": [640, 360],
    "images/articles/what-is-graph-engineering-cover.jpg": [640, 360],
    "images/articles/what-is-loop-engineering-01.jpg": [640, 800],
    "images/articles/where-is-my-server-01.jpg": [640, 800],
    "images/courses/danhai-sample-vicky-designsheet.jpg": [640, 906],
    "images/og/cloudflare-free-plan-limits.jpg": [640, 336],
    "images/three-vault-split.jpg": [640, 360]
  };
  // THUMBS:END

  function thumbPath(src) {
    return "images/thumbs/" + src.replace(/^images\//, "").replace(/\.[^.\/]+$/, "") + ".webp";
  }

  function coverHTML(a) {
    var c = a.cover;
    if (!c) return "";
    var src = c.wide || c.tall;
    if (!src) return "";
    var shape = c.wide ? "wide" : "tall";
    var t = THUMBS[src];
    // 有縮圖：src 用 640px WebP，原圖留在 data-full 給需要大圖的地方用
    var img = t
      ? '<img src="' + esc(thumbPath(src)) + '" data-full="' + esc(src) + '" width="' + t[0] + '" height="' + t[1] + '" alt="" loading="lazy" decoding="async">'
      : '<img src="' + esc(src) + '" alt="" loading="lazy" decoding="async">';
    return '<a class="card-cover ' + shape + '" href="' + esc(a.url) + '" tabindex="-1" aria-hidden="true">' +
      img +
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
