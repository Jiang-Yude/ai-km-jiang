#!/usr/bin/env node
// 已上線文章 llms.txt 覆蓋檢查（2026-10-10 立，官網近期文章健檢抓到缺口）
// 用法：node scripts/check-llms-coverage.mjs
// 全部都在 exit 0；有缺 exit 1 並列出缺哪幾篇（preflight 第 4 關呼叫）。
//
// 立因：preflight 原本只驗 llms.txt 有沒有「知識架構」，不逐篇比對文章；完成清單寫「視需要同步」。
// 2026-10-10 盤點時有 10 篇已上線文章不在 llms.txt（10-03 之後完全沒人補），AI 代理讀 llms.txt 找不到。
//
// 「已上線文章」的判定跟 check-sitemap-coverage.mjs 同一套：
//   articles/<id>/ 與 ai-trends/<id>/ 底下同時有 index.html 與 article.json，
//   且不被 .vercelignore 整資料夾擋板（^articles/<id>/$）擋著、index.html 沒有 noindex。
// 放 article.unlisted（刻意不進索引）的頁面跳過，與 build-sitemap.mjs 一致。
// 誠實邊界：只驗「本站文章網址有沒有出現在 llms.txt」（絕對、相對、index.html 都算，別的網域不算），不驗摘要寫得對不對；
// .vercelignore 只認 articles/<id>/ 整資料夾擋板（與 check-sitemap-coverage.mjs 同一套），glob 寫法不認；
// llms-full.txt 是精選補充，不要求逐篇收錄，本檢查不管它。
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const SITE = "https://jiangyude.com";
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

const llms = read("llms.txt");
// 收錄的網址：Markdown 連結目的地＋內文裸露的本站網址，一律正規化成本站 pathname。
// 跨家審（2026-10-10 OpenAI）抓到只用子字串比對會把錯網域、多一層路徑當成已收錄，相對路徑 articles/x/ 反而不算。
const listed = new Set();
const hrefs = [
  ...[...llms.matchAll(/\]\(\s*<?([^)\s>]+)>?\s*\)/g)].map((m) => m[1]),
  ...[...llms.matchAll(/https?:\/\/[^\s)<>\]]+/g)].map((m) => m[0]),
];
for (const h of hrefs) {
  let u;
  try { u = new URL(h, SITE + "/"); } catch { continue; }
  if (u.origin !== SITE) continue;
  listed.add(decodeURIComponent(u.pathname).replace(/\/index\.html$/, "/").replace(/\/?$/, "/"));
}
if (![...listed].some((p) => p.startsWith("/articles/"))) {
  console.error("  llms.txt 讀不到任何本站 /articles/ 連結，本檢查不能靜默通過");
  process.exit(1);
}

const blocked = new Set(
  (fs.existsSync(path.join(ROOT, ".vercelignore")) ? read(".vercelignore") : "")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => /^(articles|ai-trends)\/[^*/]+\/$/.test(l))
    .map((l) => l.replace(/\/$/, ""))
);

// robots meta 不限屬性順序（name 在前或 content 在前都認）
function isNoindex(html) {
  for (const m of html.matchAll(/<meta\b[^>]*>/gi)) {
    const tag = m[0];
    if (/\bname\s*=\s*["']robots["']/i.test(tag) && /\bcontent\s*=\s*["'][^"']*noindex/i.test(tag)) return true;
  }
  return false;
}

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
    if (fs.existsSync(path.join(ROOT, rel, "article.unlisted"))) continue; // 與 build-sitemap.mjs 一致
    if (blocked.has(rel)) continue;
    if (isNoindex(fs.readFileSync(idx, "utf8"))) continue;
    checked++;
    if (!listed.has(`/${rel}/`)) missing.push(rel);
  }
}

if (checked === 0) {
  console.error("  找不到任何已上線文章（articles/*/article.json），本檢查不能靜默通過");
  process.exit(1);
}
if (missing.length) {
  console.log(`  已上線文章 ${checked} 篇，其中 ${missing.length} 篇不在 llms.txt：`);
  for (const m of missing) console.log(`    - ${SITE}/${m}/`);
  console.log("  修法：在 llms.txt「## Deep Articles」段最上面照現有格式補一行 - [標題](網址): 摘要（標題與摘要取 article.json）");
  process.exit(1);
}
console.log(`  llms.txt 文章覆蓋 PASS：已上線文章 ${checked} 篇全部在 llms.txt`);
