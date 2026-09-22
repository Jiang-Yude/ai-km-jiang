#!/usr/bin/env node
// 已上線文章 sitemap 覆蓋檢查（2026-09-22 立，4O 健檢抓到缺口）
// 用法：node scripts/check-sitemap-coverage.mjs
// 全部都在 exit 0；有缺 exit 1 並列出缺哪幾篇（preflight 第 4 關呼叫）。
//
// 立因：preflight 原本的 sitemap 檢查只驗根目錄 *.html，深度文章與 AI 趨勢完全沒驗，
// 2026-09-22 盤點時有 20 篇已上線文章不在 sitemap.xml（sitemap 是手維護檔，上線時沒人補）。
//
// 「已上線文章」的判定（跟 build-articles-data.mjs 同一套來源）：
//   articles/<id>/ 與 ai-trends/<id>/ 底下同時有 index.html 與 article.json，
//   且不被 .vercelignore 整資料夾擋板（^articles/<id>/$）擋著、index.html 沒有 noindex。
// 放 article.unlisted（刻意不進索引）的頁面不在本檢查範圍。
// 誠實邊界：只驗「網址有沒有出現在 sitemap」，不驗 lastmod 準不準、課程頁與其他子頁有沒有進。
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const SITE = "https://jiangyude.com";
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

const sitemap = read("sitemap.xml");
const locs = new Set([...sitemap.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) => m[1]));
if (locs.size === 0) {
  console.error("  sitemap.xml 讀不到任何 <loc>，本檢查不能靜默通過");
  process.exit(1);
}

const blocked = new Set(
  (fs.existsSync(path.join(ROOT, ".vercelignore")) ? read(".vercelignore") : "")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => /^(articles|ai-trends)\/[^*/]+\/$/.test(l))
    .map((l) => l.replace(/\/$/, ""))
);

const missing = [];
let checked = 0;
for (const root of ["articles", "ai-trends"]) {
  const dir = path.join(ROOT, root);
  if (!fs.existsSync(dir)) continue;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!ent.isDirectory()) continue;
    const rel = `${root}/${ent.name}`;
    const idx = path.join(ROOT, rel, "index.html");
    if (!fs.existsSync(idx) || !fs.existsSync(path.join(ROOT, rel, "article.json"))) continue;
    if (blocked.has(rel)) continue;
    if (/<meta\s+name=["']robots["']\s+content=["'][^"']*noindex/i.test(fs.readFileSync(idx, "utf8"))) continue;
    checked++;
    const url = `${SITE}/${rel}/`;
    if (!locs.has(url) && !locs.has(url.slice(0, -1)) && !locs.has(`${url}index.html`)) missing.push(rel);
  }
}

if (checked === 0) {
  console.error("  找不到任何已上線文章（articles/*/article.json），本檢查不能靜默通過");
  process.exit(1);
}
if (missing.length) {
  console.log(`  已上線文章 ${checked} 篇，其中 ${missing.length} 篇不在 sitemap.xml：`);
  for (const m of missing) console.log(`    - ${SITE}/${m}/`);
  console.log("  修法：照 sitemap.xml 現有格式補一行 <url><loc>…</loc><lastmod>…</lastmod>…</url>（lastmod 用 article.json 的 updated 或 date）");
  process.exit(1);
}
console.log(`  sitemap 文章覆蓋 PASS：已上線文章 ${checked} 篇全部在 sitemap.xml`);
