/* ============================================================
   related-render.js  ·  文章自動互聯（相關文章）
   ------------------------------------------------------------
   讓每一篇文章頁自動長出「相關文章」區塊，不用逐頁手寫。

   用法：文章頁 </body> 前引入兩支（順序不可顛倒）：
     <script src="../../articles-data.js"></script>
     <script src="../../related-render.js"></script>

   連動怎麼決定（自動 + 可手動覆寫）：
     1. 手動指定優先：articles-data.js 該篇的 related: ["id", ...] 先採用。
     2. 自動補滿：不足 LIMIT 篇時，用「主題標籤重疊數」當分數，
        分數高的優先，同分看日期新的優先，自動補到 LIMIT 篇。
     => 以後發新文章，就算沒手動填 related，也會自動算出相關文章。

   前提：所有文章頁都在站根目錄下兩層（articles/<slug>/ 或
   ai-trends/<slug>/），所以連到其他文章的相對路徑固定是 ../../ + url。
   ============================================================ */
(function () {
  "use strict";

  var LIMIT = 3;

  var TYPE_LABEL = {
    "教學文章": "教學文章",
    "觀點文章": "觀點文章",
    "趨勢文章": "趨勢文章",
    "案例文章": "案例文章"
  };

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }

  function clip(s, n) {
    s = String(s == null ? "" : s);
    return s.length > n ? s.slice(0, n - 1) + "…" : s;
  }

  function topics(a) { return (a.tags && a.tags.topic) || []; }

  // 兩篇共用幾個主題標籤
  function overlap(a, b) {
    var ta = topics(a), tb = topics(b), n = 0;
    ta.forEach(function (t) { if (tb.indexOf(t) !== -1) n++; });
    return n;
  }

  function findCurrent(arts) {
    var path = location.pathname.replace(/index\.html$/, "");
    if (path.charAt(path.length - 1) !== "/") path += "/";
    var cur = null, best = -1;
    arts.forEach(function (a) {
      if (a.url && path.indexOf(a.url) !== -1 && a.url.length > best) {
        cur = a; best = a.url.length;
      }
    });
    return cur;
  }

  function pickRelated(cur, arts) {
    var byId = {};
    arts.forEach(function (a) { byId[a.id] = a; });

    var chosen = [];
    var taken = {};
    taken[cur.id] = true;

    // 1. 手動指定優先
    (cur.related || []).forEach(function (id) {
      var a = byId[id];
      if (a && !taken[id]) { chosen.push(a); taken[id] = true; }
    });

    // 2. 自動補滿：依主題標籤重疊數 → 日期新 排序
    if (chosen.length < LIMIT) {
      var cand = arts.filter(function (a) { return !taken[a.id]; })
        .map(function (a) { return { a: a, score: overlap(cur, a) }; })
        .filter(function (x) { return x.score > 0; })
        .sort(function (x, y) {
          if (y.score !== x.score) return y.score - x.score;
          return (y.a.date || "").localeCompare(x.a.date || "");
        });
      for (var i = 0; i < cand.length && chosen.length < LIMIT; i++) {
        chosen.push(cand[i].a); taken[cand[i].a.id] = true;
      }
    }
    return chosen.slice(0, LIMIT);
  }

  function injectStyle() {
    if (document.getElementById("relx-style")) return;
    var css =
      ".relx-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px;margin-top:24px}" +
      ".relx-card{display:block;background:#fff;border:1px solid var(--line,#d8cdb8);border-radius:10px;padding:20px;text-decoration:none;box-shadow:0 8px 22px rgba(107,74,42,.08);transition:transform .15s,box-shadow .15s}" +
      ".relx-card:hover{transform:translateY(-3px);box-shadow:0 14px 30px rgba(107,74,42,.16)}" +
      ".relx-card small{display:block;color:var(--blue,#5689b8);font:900 12px/1.2 ui-monospace,SFMono-Regular,Menlo,monospace;margin-bottom:9px}" +
      ".relx-card b{display:block;font-size:17px;line-height:1.35;margin-bottom:8px;color:var(--ink,#1a1612)}" +
      ".relx-card p{margin:0;color:#3a342d;line-height:1.55;font-size:15px}" +
      "@media(max-width:820px){.relx-grid{grid-template-columns:1fr}}";
    var st = document.createElement("style");
    st.id = "relx-style";
    st.textContent = css;
    document.head.appendChild(st);
  }

  function cardHTML(a) {
    var type = (a.tags && a.tags.content_type && a.tags.content_type[0]) || "延伸閱讀";
    return '<a class="relx-card" href="../../' + esc(a.url) + '">' +
      '<small>' + esc(TYPE_LABEL[type] || type) + "</small>" +
      "<b>" + esc(a.title) + "</b>" +
      "<p>" + esc(clip(a.summary || a.problem, 52)) + "</p>" +
      "</a>";
  }

  function render() {
    var arts = window.ARTICLES;
    if (!arts || !arts.length) return;
    var cur = findCurrent(arts);
    if (!cur) return;
    var rel = pickRelated(cur, arts);
    if (!rel.length) return;

    injectStyle();

    var sec = document.createElement("section");
    sec.className = "section";
    sec.id = "related-articles";
    sec.innerHTML =
      '<div class="inner"><h2>相關文章</h2>' +
      '<div class="relx-grid">' + rel.map(cardHTML).join("") + "</div></div>";

    var footer = document.querySelector("footer.footer") || document.querySelector("footer");
    if (footer && footer.parentNode) {
      footer.parentNode.insertBefore(sec, footer);
    } else {
      document.body.appendChild(sec);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", render);
  } else {
    render();
  }
})();
