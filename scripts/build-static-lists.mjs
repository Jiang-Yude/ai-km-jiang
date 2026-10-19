#!/usr/bin/env node
/* ============================================================
   build-static-lists.mjs · 文章總站與課程頁的靜態連結清單（2026-10-19 立）
   ------------------------------------------------------------
   立因：articles.html 與 courses.html 的卡片全靠 articles-render.js、courses-render.js 用 JavaScript 渲染，
   靜態 HTML 裡 0 條文章連結；2026-10-19 4O 體檢算出 56 篇文章在全站靜態 HTML 裡沒有任何站內連結，
   不跑 JavaScript 的 AI 爬蟲只能靠 sitemap 摸到它們（SEO＋GEO SOP 階段三第 3 項「核心內容靜態 HTML 化」）。
   做法：在兩頁各放一段 <noscript> 包住的完整連結清單，由本支從資料源生成：
     articles.html  ← 已上線文章（article.json，判定與 sitemap 同一套），依最後更新日新到舊
     courses.html   ← courses-data.js 每筆有 detail_url 的課程，依日期新到舊（日期未定排最後）
   <noscript> 對有開 JavaScript 的讀者完全不顯示，版面不受影響；區塊用 static-list 標記包住，
   本支只重寫標記之間，頁面其他地方一個字都不碰。第一次執行時才依錨點插入標記。
   用法：
     node scripts/build-static-lists.mjs           重建（有變更才寫）
     node scripts/build-static-lists.mjs --check   只比對不寫；會變動就 exit 1
   ============================================================ */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { ROOT, SITE, listArticles, isLive, articleDates, readText } from "./lib-articles.mjs";

const MODE_CHECK = process.argv.includes("--check");
for (const a of process.argv.slice(2)) if (a !== "--check") { console.error(`未知參數：${a}（可用 --check）`); process.exit(2); }

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const START = "<!-- static-list:start";
const END = "<!-- static-list:end -->";
const BLOCK_RE = /[ \t]*<!-- static-list:start[\s\S]*?<!-- static-list:end -->\n?/;

/* ───────── 文章清單 ───────── */
let all;
try { all = listArticles(); } catch (e) { console.error(`  ${e.message}`); process.exit(2); }
const live = all.filter(isLive).map((a) => ({ ...a, ...articleDates(a.meta) }))
  .sort((p, q) => q.updated.localeCompare(p.updated) || q.date.localeCompare(p.date) || p.id.localeCompare(q.id));
if (!live.length) { console.error("  找不到已上線文章，不能靜默通過"); process.exit(2); }
const SECTION = { articles: "文章", "ai-trends": "AI 趨勢" };
const articlesBlock = [
  `    ${START}（scripts/build-static-lists.mjs 從 article.json 生成，勿手改；給不跑 JavaScript 的讀者與 AI 爬蟲的全文章清單）-->`,
  "    <noscript>",
  `    <nav class="static-list" aria-label="全部文章清單">`,
  `      <h2>全部文章（共 ${live.length} 篇）</h2>`,
  "      <ul>",
  ...live.map((a) => `        <li><a href="${a.rel}/">${esc(a.meta.title)}</a>（${SECTION[a.root]}，發佈 ${a.date}${a.updated !== a.date ? `，更新 ${a.updated}` : ""}）</li>`),
  "      </ul>",
  "    </nav>",
  "    </noscript>",
  `    ${END}`,
  "",
].join("\n");

/* ───────── 課程清單 ───────── */
const win = {};
try { vm.runInNewContext(readText(path.join(ROOT, "courses-data.js")), { window: win }, { timeout: 2000 }); } catch (e) {
  console.error(`  courses-data.js 解析失敗：${e.message}`); process.exit(2);
}
const courses = (win.COURSES || []).filter((c) => c && c.title && c.detail_url)
  .sort((p, q) => (q.date || "0000").localeCompare(p.date || "0000") || String(p.id).localeCompare(String(q.id)));
if (!courses.length) { console.error("  courses-data.js 沒有任何帶 detail_url 的課程，不能靜默通過"); process.exit(2); }
const courseHref = (u) => {
  const s = String(u);
  if (s.startsWith(`${SITE}/`)) return s.slice(SITE.length + 1);
  return s;
};
const isExternal = (h) => /^https?:\/\//.test(h);
const coursesBlock = [
  `    ${START}（scripts/build-static-lists.mjs 從 courses-data.js 生成，勿手改；給不跑 JavaScript 的讀者與 AI 爬蟲的課程清單）-->`,
  "    <noscript>",
  `    <nav class="static-list" aria-label="全部課程清單">`,
  `      <h2>課程與講座（共 ${courses.length} 場）</h2>`,
  "      <ul>",
  ...courses.map((c) => {
    const h = courseHref(c.detail_url);
    const when = c.date_label || c.date || "日期待定";
    return `        <li><a href="${esc(h)}"${isExternal(h) ? ' target="_blank" rel="noopener"' : ""}>${esc(c.title)}</a>（${esc(when)}${c.type_label ? `，${esc(c.type_label)}` : ""}）</li>`;
  }),
  "      </ul>",
  "    </nav>",
  "    </noscript>",
  `    ${END}`,
  "",
].join("\n");

/* ───────── 寫入 ───────── */
const TARGETS = [
  { file: "articles.html", block: articlesBlock, anchor: (h) => { const i = h.indexOf('    <div class="cta-box" style="margin-top:48px;">'); return i; } },
  { file: "courses.html", block: coursesBlock, anchor: (h) => { const m = h.match(/[^\n]*id="merged-courses"[^\n]*\n/); return m ? m.index + m[0].length : -1; } },
];
const changed = [];
for (const t of TARGETS) {
  const p = path.join(ROOT, t.file);
  const html = readText(p);
  let next;
  if (BLOCK_RE.test(html)) next = html.replace(BLOCK_RE, t.block);
  else {
    const at = t.anchor(html);
    if (at < 0) { console.error(`  ${t.file} 找不到插入錨點，也沒有 static-list 標記，不知道放哪`); process.exit(2); }
    next = html.slice(0, at) + t.block + html.slice(at);
  }
  if (next !== html) { changed.push(t.file); if (!MODE_CHECK) fs.writeFileSync(p, next); }
}
if (!changed.length) { console.log(`  ✅ 靜態清單已是最新（文章 ${live.length} 篇、課程 ${courses.length} 場）`); process.exit(0); }
if (MODE_CHECK) { console.log(`  --check：${changed.join("、")} 的靜態清單需要重建，跑 node scripts/build-static-lists.mjs`); process.exit(1); }
console.log(`  ✅ 已重建靜態清單：${changed.join("、")}（文章 ${live.length} 篇、課程 ${courses.length} 場）`);
