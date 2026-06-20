/* ============================================================
   related-skills-render.js  ·  技能包自動互聯（配套技能包）
   ------------------------------------------------------------
   讓 skills.html 每張技能卡自動長出「配套技能包」導流連結，
   不用逐張手寫，且維持單一真相（single source）。

   用法：skills.html </body> 前、既有 script 之後引入：
     <script src="related-skills-render.js"></script>

   連動怎麼決定（curated 優先 + 可自動補）：
     1. 先採用卡片 data-related 屬性（空白分隔的 id 清單）。
        curated 永遠優先，順序照寫的順序。
     2. 若該卡沒有 data-related，且 AUTO_FILL_BY_CATEGORY 為 true，
        才自動補：用 data-tags 第一個「非旗標」token（分類），
        找同分類的其他卡，最多補 2 張（同分類太多取前 2）。

   每張卡的 id 取自卡內 .skill-id 文字；目標卡的 GitHub 連結
   取自目標卡 .skill-btn-primary 的 href；目標標題取自 h3。

   避免重複注入：先清掉卡內既有的 .skill-pair，再由本檔統一產生，
   確保 skills.html 不用手寫、由 JS 當單一來源。

   把 AUTO_FILL_BY_CATEGORY 設 false 即可關掉自動補，只留 curated。
   ============================================================ */
(function () {
  "use strict";

  var AUTO_FILL_BY_CATEGORY = false; // false = 只用 curated（data-related）；true = 全頁同分類自動補
  var AUTO_FILL_LIMIT = 2;          // 自動補同分類最多幾張

  // data-tags 裡屬於「旗標」的 token，不算分類
  var FLAGS = { mit: 1, bilingual: 1, bundle: 1, external: 1, zh: 1, en: 1 };

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }

  function textOf(el) {
    return el ? (el.textContent || "").trim() : "";
  }

  // 取卡片分類：data-tags 第一個非旗標 token
  function categoryOf(card) {
    var tags = (card.getAttribute("data-tags") || "").trim().split(/\s+/);
    for (var i = 0; i < tags.length; i++) {
      if (tags[i] && !FLAGS[tags[i]]) return tags[i];
    }
    return "";
  }

  function githubOf(card) {
    var a = card.querySelector(".skill-btn-primary");
    return a ? a.getAttribute("href") : null;
  }

  function titleOf(card) {
    return textOf(card.querySelector("h3"));
  }

  function build() {
    var cards = Array.prototype.slice.call(
      document.querySelectorAll(".skill-card")
    );
    if (!cards.length) return;

    // 先清掉所有手寫／舊注入的 .skill-pair，確保單一來源
    cards.forEach(function (card) {
      var olds = card.querySelectorAll(".skill-pair");
      Array.prototype.forEach.call(olds, function (p) {
        p.parentNode.removeChild(p);
      });
    });

    // 建索引：id → card
    var byId = {};
    cards.forEach(function (card) {
      var id = textOf(card.querySelector(".skill-id"));
      if (id) {
        card._skillId = id;
        byId[id] = card;
      }
    });

    cards.forEach(function (card) {
      var targets = [];
      var taken = {};
      if (card._skillId) taken[card._skillId] = true;

      // 1. curated：data-related 優先
      var related = (card.getAttribute("data-related") || "").trim();
      if (related) {
        related.split(/\s+/).forEach(function (id) {
          var t = byId[id];
          if (t && !taken[id]) {
            targets.push(t);
            taken[id] = true;
          }
        });
      } else if (AUTO_FILL_BY_CATEGORY) {
        // 2. 自動補：同分類其他卡，最多 AUTO_FILL_LIMIT 張
        var cat = categoryOf(card);
        if (cat) {
          for (var i = 0; i < cards.length && targets.length < AUTO_FILL_LIMIT; i++) {
            var other = cards[i];
            if (other === card) continue;
            if (!other._skillId || taken[other._skillId]) continue;
            if (categoryOf(other) !== cat) continue;
            targets.push(other);
            taken[other._skillId] = true;
          }
        }
      }

      if (!targets.length) return;

      var links = targets
        .map(function (t) {
          var href = githubOf(t);
          var title = titleOf(t) || t._skillId;
          if (!href) return null;
          return (
            '<a href="' +
            esc(href) +
            '" target="_blank" rel="noopener">' +
            esc(title) +
            " →</a>"
          );
        })
        .filter(Boolean);

      if (!links.length) return;

      var p = document.createElement("p");
      p.className = "skill-pair";
      p.innerHTML = "配套技能包：" + links.join("、");

      var actions = card.querySelector(".skill-actions");
      if (actions && actions.parentNode) {
        // 注入在 .skill-actions 之後
        if (actions.nextSibling) {
          actions.parentNode.insertBefore(p, actions.nextSibling);
        } else {
          actions.parentNode.appendChild(p);
        }
      } else {
        card.appendChild(p);
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", build);
  } else {
    build();
  }
})();
