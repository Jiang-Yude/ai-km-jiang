#!/usr/bin/env node
/* ============================================================
   build-sitemap.mjs · sitemap.xml 文章段生成器（2026-10-09 立，事故驅動）
   ------------------------------------------------------------
   立因：sitemap.xml 一直是手維護檔。2026-10-09 晚上四篇文章同時排隊上線，
   四個分支都忘了補 sitemap，合併後才被 preflight 第 4 關擋下；而且多篇同時
   排隊時都往檔尾加，分支之間必衝突，只能一篇上完再處理下一篇。
   根因不是人忘了，是「手維護檔沒有生成器」。這支把文章段改成生成的。

   做什麼（刻意保守，不重排、不刪）：
     1. 讀現有 sitemap.xml，保留所有既有 <url> 原文與順序（根目錄頁、課程頁、
        ai-office、cases 等仍是手維護，本支不碰）。
     2. 列出「已上線文章」（判定與 check-sitemap-coverage.mjs 同一套）：
        articles/<id>/、ai-trends/<id>/ 同時有 index.html 與 article.json，
        不在 .vercelignore 整資料夾擋板內、index.html 沒有 noindex、沒有 article.unlisted。
     3. 缺的文章補一筆 <url>（lastmod＝article.json 的 updated 或 date）。
     4. 已有的文章 lastmod 一律等於 article.json 的 updated（沒寫就 date）。
        2026-10-19 改：原本只在 article.json 比較新時才更新，盤查發現 7 篇 lastmod 與 article.json 不同
        （例 free-deploy-three-boundaries 07-29 對 07-28），article.json 是唯一來源，以它為準。
     5. 本機存在但已不在站上的網址（資料夾消失）只印警告，不自動刪。
     6. 掛 noindex 的頁不該在 sitemap（2026-10-19 立，4O 體檢抓到 courses/2026-09-ai-series/lesson-0/）：
        任何 <url> 對到的本機 HTML 若 robots meta 有 noindex，整筆移除。以生成當下讀頁面 robots meta 為準，
        頁面之後改成 index 下次重建就會依第 7 點補回。
     7. 固定補收的非文章頁 EXTRA_PAGES（privacy/、淡海 showcase）：檔案存在且不是 noindex 才補，
        lastmod＝該檔最後一次 commit 的日期（沒有 commit 紀錄就用今天，台灣時間）；已在 sitemap 的不動。
   用法：
     node scripts/build-sitemap.mjs            重建（有變更就寫回，印出補了哪幾篇）
     node scripts/build-sitemap.mjs --check    只比對不寫；會變動就 exit 1（preflight 可用）
   被誰呼叫：merge-publish.sh 的「重建全部生成檔」步（sitemap.xml 自此列入 REGENERATED）。
   分支仍可手改 sitemap.xml 的非文章段，但文章段交給本支，分支不必、也不該為新文章補 sitemap。
   ============================================================ */

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const SITE = "https://jiangyude.com";
const SITEMAP = path.join(ROOT, "sitemap.xml");
const MODE_CHECK = process.argv.includes("--check");

const read = (p) => fs.readFileSync(p, "utf8");

if (!fs.existsSync(SITEMAP)) {
  console.error("  找不到 sitemap.xml，本生成器只補文章段，不從零建站圖");
  process.exit(2);
}
let xml = read(SITEMAP);
const closeIdx = xml.lastIndexOf("</urlset>");
if (closeIdx < 0) {
  console.error("  sitemap.xml 沒有 </urlset>，格式不對，不動它");
  process.exit(2);
}

/* 既有 <url> 區塊：原文保留，只在需要時更新 lastmod */
const blocks = [...xml.matchAll(/<url>[\s\S]*?<\/url>/g)];
const locOf = (b) => (b.match(/<loc>\s*([^<\s]+)\s*<\/loc>/) || [])[1] || "";
const byLoc = new Map();
for (const m of blocks) byLoc.set(locOf(m[0]), m);
if (byLoc.size === 0) {
  console.error("  sitemap.xml 讀不到任何 <url>，不能靜默通過");
  process.exit(2);
}

/* 擋板 */
const blocked = new Set(
  (fs.existsSync(path.join(ROOT, ".vercelignore")) ? read(path.join(ROOT, ".vercelignore")) : "")
    .split("\n").map((l) => l.trim())
    .filter((l) => /^(articles|ai-trends)\/[^*/]+\/$/.test(l))
    .map((l) => l.replace(/\/$/, ""))
);

/* 已上線文章 */
const live = [];
for (const root of ["articles", "ai-trends"]) {
  const dir = path.join(ROOT, root);
  if (!fs.existsSync(dir)) continue;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!ent.isDirectory()) continue;
    const rel = `${root}/${ent.name}`;
    const idx = path.join(ROOT, rel, "index.html");
    const src = path.join(ROOT, rel, "article.json");
    if (!fs.existsSync(idx) || !fs.existsSync(src)) continue;
    if (fs.existsSync(path.join(ROOT, rel, "article.unlisted"))) continue;
    if (blocked.has(rel)) continue;
    if (/<meta\s+name=["']robots["']\s+content=["'][^"']*noindex/i.test(read(idx))) continue;
    let meta;
    try { meta = JSON.parse(read(src)); } catch (e) {
      console.error(`  ${rel}/article.json 不是合法 JSON：${e.message}`);
      process.exit(2);
    }
    const lastmod = String(meta.updated || meta.date || "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(lastmod)) {
      console.error(`  ${rel}/article.json 的 updated／date 不是 YYYY-MM-DD：「${lastmod}」`);
      process.exit(2);
    }
    live.push({ rel, url: `${SITE}/${rel}/`, lastmod });
  }
}
if (live.length === 0) {
  console.error("  找不到任何已上線文章，本生成器不能靜默通過");
  process.exit(2);
}

/* ───── 非文章頁：noindex 移除、固定補收 ───── */
// 4O 體檢（2026-10-19）列出「可索引但不在 sitemap」的頁。是否收錄以生成當下頁面的 robots meta 為準：
// 另一位工程師可能把 showcase 設成 noindex，那時本支自動不收、已收的也會被第 6 點移除。
const EXTRA_PAGES = ["privacy/", "courses/2026-08-danhai-public-art/showcase/"];
const NOINDEX_RE = /<meta\s+[^>]*name=["']robots["'][^>]*content=["'][^"']*noindex|<meta\s+[^>]*content=["'][^"']*noindex[^"']*["'][^>]*name=["']robots["']/i;
function locToFile(loc) {
  if (!loc.startsWith(`${SITE}/`) && loc !== SITE) return null;
  let p = loc.slice(SITE.length).replace(/^\//, "").split(/[?#]/)[0];
  if (p === "" || p.endsWith("/")) p += "index.html";
  return path.join(ROOT, decodeURI(p));
}
const removed = [];
for (const [loc, m] of [...byLoc.entries()]) {
  const f = locToFile(loc);
  if (!f || !fs.existsSync(f) || !f.endsWith(".html")) continue;
  if (NOINDEX_RE.test(read(f).replace(/<!--[\s\S]*?-->/g, ""))) {
    // 連同該筆前面的縮排與後面的換行一起拿掉
    xml = xml.replace(new RegExp(`[ \\t]*${m[0].replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\n?`), "");
    byLoc.delete(loc);
    removed.push(loc);
  }
}
function gitDate(rel) {
  try {
    const d = execFileSync("git", ["log", "-1", "--format=%cs", "--", rel], { cwd: ROOT, encoding: "utf8" }).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
  } catch {}
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Taipei" }).format(new Date());
}
const extraAdded = [];
const extraBlocks = [];
for (const rel of EXTRA_PAGES) {
  const url = `${SITE}/${rel}`;
  if (byLoc.has(url) || byLoc.has(url.slice(0, -1))) continue;
  const f = locToFile(url);
  if (!fs.existsSync(f)) continue;
  if (NOINDEX_RE.test(read(f).replace(/<!--[\s\S]*?-->/g, ""))) continue;
  const file = path.relative(ROOT, f);
  extraBlocks.push(`  <url>\n    <loc>${url}</loc>\n    <lastmod>${gitDate(file)}</lastmod>\n    <changefreq>monthly</changefreq>\n    <priority>0.5</priority>\n  </url>\n`);
  extraAdded.push(rel);
}

const findExisting = (url) => byLoc.get(url) || byLoc.get(url.slice(0, -1)) || byLoc.get(`${url}index.html`);

const added = [];
const bumped = [];
const appendBlocks = [];
for (const a of live) {
  const ex = findExisting(a.url);
  if (!ex) {
    added.push(a.rel);
    appendBlocks.push(
      `  <url>\n    <loc>${a.url}</loc>\n    <lastmod>${a.lastmod}</lastmod>\n    <changefreq>monthly</changefreq>\n    <priority>0.8</priority>\n  </url>\n`
    );
    continue;
  }
  const cur = (ex[0].match(/<lastmod>\s*([^<\s]+)\s*<\/lastmod>/) || [])[1];
  if (cur && a.lastmod !== cur) {
    const replaced = ex[0].replace(/<lastmod>\s*[^<\s]+\s*<\/lastmod>/, `<lastmod>${a.lastmod}</lastmod>`);
    xml = xml.replace(ex[0], replaced);
    bumped.push(`${a.rel}（${cur} → ${a.lastmod}）`);
  }
}

/* 站圖裡有、本機已沒有的文章網址：只警告 */
const liveUrls = new Set(live.map((a) => a.url));
for (const loc of byLoc.keys()) {
  const m = loc.match(new RegExp(`^${SITE}/((?:articles|ai-trends)/[^/]+)/?$`));
  if (!m) continue;
  if (!liveUrls.has(`${SITE}/${m[1]}/`)) console.log(`  ⚠️ sitemap 有、本機已不是已上線文章：${loc}（不自動刪，請人工判斷）`);
}

appendBlocks.push(...extraBlocks);
if (appendBlocks.length) {
  const close = xml.lastIndexOf("</urlset>");
  let head = xml.slice(0, close);
  if (!head.endsWith("\n")) head += "\n";
  xml = head + appendBlocks.join("") + xml.slice(close);
}

const changed = added.length > 0 || bumped.length > 0 || removed.length > 0 || extraAdded.length > 0;
if (!changed) {
  console.log(`  sitemap 文章段已是最新（已上線文章 ${live.length} 篇全部在）`);
  process.exit(0);
}
for (const r of added) console.log(`  ＋ 補進 sitemap：${r}`);
for (const r of bumped) console.log(`  ↻ 更新 lastmod：${r}`);
for (const r of removed) console.log(`  － 移除 noindex 頁：${r}`);
for (const r of extraAdded) console.log(`  ＋ 補收非文章頁：${r}`);
if (MODE_CHECK) {
  console.log("  --check：sitemap.xml 需要重建（上面這些還沒寫進去）");
  process.exit(1);
}
fs.writeFileSync(SITEMAP, xml);
console.log(`  ✅ sitemap.xml 已重建：補 ${added.length} 篇、更新 ${bumped.length} 篇 lastmod、移除 noindex ${removed.length} 頁、補收非文章頁 ${extraAdded.length} 頁`);
