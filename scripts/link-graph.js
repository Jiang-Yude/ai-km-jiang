#!/usr/bin/env node
/* ============================================================
   link-graph.js  ·  文章雙向連結機制（Obsidian 式互聯）
   ------------------------------------------------------------
   官網文章互聯的維護工具。規則與設計理念見技能包
   knowledge-site-manager/references/05-bidirectional-links.md（單一真相）。

   用法（在 repo 根目錄跑）：
     node scripts/link-graph.js            # = check
     node scripts/link-graph.js check      # 雙向對稱：單向沒回連、斷連
     node scripts/link-graph.js pending    # 預告追蹤：之後會寫但還沒寫
     node scripts/link-graph.js suggest <id>   # 連回建議
     node scripts/link-graph.js all        # check + pending

   exit code：斷連（related 連到不存在文章）或資料異常（空/重複 id）→ exit 1/2，
   可擋部署；單向沒回連只是 WARN，不擋。零依賴，純 Node。
   ============================================================ */
"use strict";

var fs = require("fs");
var path = require("path");
var vm = require("vm");

var ROOT = path.resolve(__dirname, "..");
var DATA = path.join(ROOT, "articles-data.js");
var ARTICLE_DIRS = ["articles", "ai-trends"];

// 手寫精選頁：不是 articles-data.js 的物件，刻意不參與自動雙向。
var HAND_CURATED = { "own-ai-team-at-work": 1 };

// 疑似「之後會寫」的字句（啟發式，低信心，只提醒；真要追蹤就標 data-pending-link）
var PROMISE_HINTS = [
  "之後會寫", "之後再寫", "之後補上", "之後單獨", "另外寫", "單獨寫一篇",
  "完整的一篇", "完整文章之後", "下一篇會", "未完待續", "敬請期待", "待補文章"
];

function read(file) {
  try { return fs.readFileSync(file, "utf8"); } catch (e) { return null; }
}

// 用 vm 把 articles-data.js（瀏覽器檔，設 window.ARTICLES）載進 Node
function loadData() {
  var code = read(DATA);
  if (code == null) { console.error("讀不到 " + DATA); process.exit(2); }
  var sandbox = { window: {} };
  try {
    vm.runInNewContext(code, sandbox, { filename: "articles-data.js" });
  } catch (e) {
    console.error("解析 articles-data.js 失敗：" + e.message);
    process.exit(2);
  }
  var arts = sandbox.window.ARTICLES;
  // P1：載到空或非陣列就中止，別讓「文章數 0 → 無斷連 → PASS」騙過部署 gate
  if (!Array.isArray(arts) || arts.length === 0) {
    console.error("articles-data.js 沒有有效的 window.ARTICLES（讀到空或非陣列），中止以免誤判 PASS。");
    process.exit(2);
  }
  // P4：重複 id 會靜默覆蓋、雙向檢查漏報，先擋下
  var byId = {}, dupes = [];
  arts.forEach(function (a) {
    if (byId[a.id]) dupes.push(a.id);
    byId[a.id] = a;
  });
  if (dupes.length) {
    console.error("articles-data.js 有重複 id：" + dupes.join("、") + "（雙向檢查會漏報，請先修）");
    process.exit(2);
  }
  return { arts: arts, byId: byId };
}

function topics(a) { return (a.tags && a.tags.topic) || []; }

function overlap(a, b) {
  var ta = topics(a), tb = topics(b), shared = [];
  ta.forEach(function (t) { if (tb.indexOf(t) !== -1) shared.push(t); });
  return shared;
}

// P2：精確比對某 slug 是不是已存在的文章（不要用 substring）
function articleExists(data, slug) {
  if (data.byId[slug]) return true;
  return data.arts.some(function (a) {
    return a.url === "articles/" + slug + "/" || a.url === "ai-trends/" + slug + "/";
  });
}

// 掃所有文章頁
function listPages() {
  var pages = [];
  ARTICLE_DIRS.forEach(function (base) {
    var baseDir = path.join(ROOT, base);
    if (!fs.existsSync(baseDir)) return;
    fs.readdirSync(baseDir).forEach(function (slug) {
      var dir = path.join(baseDir, slug);
      if (!fs.statSync(dir).isDirectory()) return;
      var idx = path.join(dir, "index.html");
      if (!fs.existsSync(idx)) return;
      pages.push({ slug: slug, url: base + "/" + slug + "/", html: read(idx) || "" });
    });
  });
  return pages;
}

/* ───────────── 1. 雙向對稱檢查 ───────────── */
function checkReciprocal(data) {
  var byId = data.byId;
  var broken = [], oneway = [], hand = [];

  data.arts.forEach(function (a) {
    (a.related || []).forEach(function (rid) {
      if (rid === a.id) {
        broken.push("[ERROR] " + a.id + " 的 related 連到自己");
        return;
      }
      if (HAND_CURATED[rid]) { hand.push(a.id + " → " + rid); return; }
      var b = byId[rid];
      if (!b) {
        broken.push("[ERROR] " + a.id + " 的 related 連到不存在的 id：" + rid);
        return;
      }
      if ((b.related || []).indexOf(a.id) === -1) {
        oneway.push("[WARN] 單向：" + a.id + " → " + rid +
          "（" + rid + " 沒回連）  修法：在 " + rid + " 的 related 加 \"" + a.id + "\"");
      }
    });
  });

  console.log("───────── ① 雙向對稱檢查 ─────────");
  console.log("文章數：" + data.arts.length);
  if (!broken.length && !oneway.length) console.log("✅ related 全部雙向對稱，無斷連。");
  broken.forEach(function (x) { console.log(x); });
  oneway.forEach(function (x) { console.log(x); });
  if (hand.length) console.log("[NOTE] 指到手寫精選頁（不參與自動雙向）：" + hand.join("、"));
  console.log("斷連 ERROR：" + broken.length + "　單向 WARN：" + oneway.length);
  console.log("");
  return { brokenCount: broken.length, onewayCount: oneway.length };
}

/* ───────────── 2. 預告追蹤 ───────────── */
function checkPending(data) {
  var pages = listPages();
  var tagged = [], hints = [];
  var reAttr = /data-pending-link\s*=\s*["']([^"']+)["']/gi;

  pages.forEach(function (p) {
    var m, found = false;
    reAttr.lastIndex = 0;
    while ((m = reAttr.exec(p.html)) !== null) {
      found = true;
      var target = m[1];
      // P3：抓「包住這個屬性的那個開標籤」，再從標籤內找 id；避免抓到 data-id 或別的元素
      var tagStart = p.html.lastIndexOf("<", m.index);
      var tagEnd = p.html.indexOf(">", m.index);
      var tag = (tagStart !== -1 && tagEnd !== -1) ? p.html.slice(tagStart, tagEnd + 1) : "";
      var idm = tag.match(/\sid\s*=\s*["']([^"']+)["']/i);
      tagged.push({ from: p.slug, anchor: idm ? idm[1] : "", target: target, ready: articleExists(data, target) });
    }
    if (!found) {
      PROMISE_HINTS.forEach(function (h) {
        if (p.html.indexOf(h) !== -1) {
          hints.push("[HINT] " + p.slug + " 出現「" + h + "」字句，疑似前向預告但沒標 data-pending-link");
        }
      });
    }
  });

  console.log("───────── ② 預告追蹤（我說之後會寫的） ─────────");
  if (!tagged.length) console.log("（沒有任何 data-pending-link 標記）");
  tagged.forEach(function (t) {
    var loc = t.from + (t.anchor ? " #" + t.anchor : "");
    if (t.ready) {
      console.log("✅ READY  " + loc + " → 「" + t.target + "」已存在 → 把預告改成正式連結，並在 " +
        t.target + " 加回連 " + t.from);
    } else {
      console.log("🔮 PENDING " + loc + " → 「" + t.target + "」還沒寫（寫出來後本工具會轉 READY）");
    }
  });
  if (hints.length) { console.log(""); hints.forEach(function (h) { console.log(h); }); }
  var readyCount = tagged.filter(function (t) { return t.ready; }).length;
  console.log("");
  console.log("預告總數：" + tagged.length + "　可串接 READY：" + readyCount +
    "　待寫 PENDING：" + (tagged.length - readyCount) + "　疑似未標：" + hints.length);
  console.log("");
}

/* ───────────── 3. 連回建議 ───────────── */
function suggest(data, id) {
  var byId = data.byId, cur = byId[id];
  console.log("───────── ③ 連回建議：" + id + " ─────────");
  if (!cur) {
    console.log("找不到 id「" + id + "」。先把它加進 articles-data.js（含 tags）再跑。");
    console.log("現有 id：" + data.arts.map(function (a) { return a.id; }).join("、"));
    process.exit(2);
  }
  var already = {};
  (cur.related || []).forEach(function (r) { already[r] = true; });

  var cand = data.arts
    .filter(function (a) { return a.id !== id; })
    .map(function (a) {
      var shared = overlap(cur, a);
      return { a: a, shared: shared, score: shared.length,
        linked: !!already[a.id], back: (a.related || []).indexOf(id) !== -1 };
    })
    .filter(function (x) { return x.score > 0; })
    .sort(function (x, y) {
      if (y.score !== x.score) return y.score - x.score;
      return (y.a.date || "").localeCompare(x.a.date || "");
    });

  if (!cand.length) { console.log("沒有主題標籤重疊的文章，先確認 tags.topic 填對。"); return; }
  console.log("依主題標籤重疊排序（你的標籤：" + topics(cur).join("、") + "）：\n");
  cand.forEach(function (x) {
    console.log("  [" + x.score + "] " + x.a.id +
      "（" + (x.linked ? "已連" : "未連") + "／" + (x.back ? "對方已回連" : "對方未回連") + "）");
    console.log("        共同主題：" + x.shared.join("、"));
    console.log("        " + (x.a.title || ""));
  });
  console.log("");
  var todo = cand.filter(function (x) { return !x.linked && x.score >= 2; });
  if (todo.length) {
    console.log("建議補進 " + id + " 的 related（重疊≥2、目前未連）：");
    console.log("  " + todo.map(function (x) { return '"' + x.a.id + '"'; }).join(", "));
    console.log("（補了之後跑 check，把對方的回連也補上 → 雙向對稱）");
  } else {
    console.log("重疊≥2 的都已連，連結狀況良好。");
  }
  console.log("");
}

/* ───────────── 進入點 ───────────── */
function main() {
  var cmd = process.argv[2] || "check";
  var data = loadData();

  if (cmd === "suggest") {
    var id = process.argv[3];
    if (!id) { console.log("用法：node scripts/link-graph.js suggest <id>"); process.exit(2); }
    suggest(data, id);
    return;
  }
  if (cmd === "pending") { checkPending(data); return; }

  var r = checkReciprocal(data);
  if (cmd === "all") checkPending(data);

  if (r.brokenCount > 0) {
    console.log("結果：FAIL（有 related 斷連／自連，請修正）");
    process.exit(1);
  }
  console.log("結果：PASS（斷連 0；單向沒回連只是提醒，不擋部署）");
}

main();
