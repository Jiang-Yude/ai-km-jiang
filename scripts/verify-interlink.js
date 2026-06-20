#!/usr/bin/env node
/* ============================================================
   verify-interlink.js  ·  文章自動互聯 部署前兜底檢查
   ------------------------------------------------------------
   用途：在部署前，機器掃描所有文章頁，確保每一篇正式文章
        都同時引入了 articles-data.js 與 related-render.js
        這兩支互聯腳本（缺一篇「相關文章」就長不出來）。

   ⚠️ 部署前先跑這支：
        node scripts/verify-interlink.js
      有任何 ERROR 會以 exit code 1 結束，可擋住 CI／部署。

   檢查什麼：
     1. 掃 articles/<slug>/index.html 與 ai-trends/<slug>/index.html。
     2. 每頁是否同時引入 articles-data.js 與 related-render.js。
        - noindex 佔位頁（含 name="robots" 且 content 含 noindex）
          缺 script 只印 WARN，不算錯（還沒寫完的草稿頁）。
        - 其餘會被索引的正式文章，缺任一支印 ERROR。
     3. 每個文章目錄的 url（如 articles/<slug>/）能不能在
        articles-data.js 裡找到對應字串；找不到印 WARN
        （代表這篇還沒登記進資料源，相關文章算不到它）。

   零依賴，純 Node，可直接執行。
   ============================================================ */
"use strict";

var fs = require("fs");
var path = require("path");

var ROOT = path.resolve(__dirname, "..");
var ARTICLE_DIRS = ["articles", "ai-trends"];

var DATA_SCRIPT = "articles-data.js";
var RENDER_SCRIPT = "related-render.js";

function read(file) {
  try {
    return fs.readFileSync(file, "utf8");
  } catch (e) {
    return null;
  }
}

// 是否為 noindex 佔位頁：有 robots meta 且 content 含 noindex
function isNoindex(html) {
  var m = html.match(/<meta[^>]*name=["']robots["'][^>]*>/i);
  if (!m) return false;
  var content = m[0].match(/content=["']([^"']*)["']/i);
  return !!(content && /noindex/i.test(content[1]));
}

function hasScript(html, src) {
  // 比對 <script src="...src"> 結尾片段，容忍相對路徑前綴（../../ 等）
  var re = new RegExp(
    '<script[^>]*src=["\'][^"\']*' +
      src.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") +
      '["\']',
    "i"
  );
  return re.test(html);
}

function listArticleIndexes() {
  var pages = [];
  ARTICLE_DIRS.forEach(function (base) {
    var baseDir = path.join(ROOT, base);
    if (!fs.existsSync(baseDir)) return;
    fs.readdirSync(baseDir).forEach(function (slug) {
      var dir = path.join(baseDir, slug);
      if (!fs.statSync(dir).isDirectory()) return;
      var idx = path.join(dir, "index.html");
      if (fs.existsSync(idx)) {
        pages.push({
          file: idx,
          rel: base + "/" + slug + "/index.html",
          url: base + "/" + slug + "/"
        });
      }
    });
  });
  return pages;
}

function main() {
  var errors = [];
  var warns = [];
  var okCount = 0;

  var pages = listArticleIndexes();
  var dataJs = read(path.join(ROOT, DATA_SCRIPT)) || "";

  pages.forEach(function (p) {
    var html = read(p.file);
    if (html == null) {
      errors.push("[ERROR] 讀不到檔案：" + p.rel);
      return;
    }

    var hasData = hasScript(html, DATA_SCRIPT);
    var hasRender = hasScript(html, RENDER_SCRIPT);
    var placeholder = isNoindex(html);

    if (!hasData || !hasRender) {
      var missing = [];
      if (!hasData) missing.push(DATA_SCRIPT);
      if (!hasRender) missing.push(RENDER_SCRIPT);
      var msg = p.rel + " 缺少互聯腳本：" + missing.join("、");
      if (placeholder) {
        warns.push("[WARN] (noindex 佔位頁) " + msg);
      } else {
        errors.push("[ERROR] " + msg);
      }
    } else {
      okCount++;
    }

    // url 是否登記進 articles-data.js
    if (dataJs.indexOf(p.url) === -1) {
      warns.push("[WARN] " + p.rel + " 的 url（" + p.url + "）在 " + DATA_SCRIPT + " 找不到，相關文章算不到它");
    }
  });

  warns.forEach(function (w) { console.log(w); });
  errors.forEach(function (e) { console.log(e); });

  console.log("");
  console.log("───────── 互聯檢查統計 ─────────");
  console.log("掃描文章頁：" + pages.length + " 篇");
  console.log("兩支腳本齊全：" + okCount + " 篇");
  console.log("WARN：" + warns.length + " 筆");
  console.log("ERROR：" + errors.length + " 筆");

  if (errors.length > 0) {
    console.log("結果：FAIL（有正式文章缺互聯腳本，請補齊再部署）");
    process.exit(1);
  } else {
    console.log("結果：PASS");
    process.exit(0);
  }
}

main();
