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
// 2026-10-19 擴充：兩檔文章段改由 scripts/build-llms.mjs 從 article.json 生成，本檢查同時驗標題：
//   llms.txt 指向該篇的 Markdown 連結，至少一條的連結文字要等於 article.json 的 title；
//   llms-full.txt 也要逐篇收錄（同樣驗網址與標題）。
//   立因：盤查發現 llms.txt 有 17 篇標題過時，原本只驗網址所以沒人看到。
// 誠實邊界：不驗摘要寫得對不對（摘要由生成器從 summary 取，不會漂移，除非有人手改生成段）；
// .vercelignore 只認 articles/<id>/ 整資料夾擋板（與 check-sitemap-coverage.mjs 同一套），glob 寫法不認。
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const SITE = "https://jiangyude.com";
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

// 收錄的網址：Markdown 連結目的地＋內文裸露的本站網址，一律正規化成本站 pathname。
// 跨家審（2026-10-10 OpenAI）抓到只用子字串比對會把錯網域、多一層路徑當成已收錄，相對路徑 articles/x/ 反而不算。
// 回傳 { listed: Set<pathname>, titles: Map<pathname, Set<連結文字>> }
function collect(text) {
  const listed = new Set();
  const titles = new Map();
  const norm = (h) => {
    let u, p;
    try { u = new URL(h, SITE + "/"); p = decodeURIComponent(u.pathname); } catch { return null; } // 壞網址不算收錄
    if (u.origin !== SITE) return null;
    return p.replace(/\/index\.html$/, "/").replace(/\/?$/, "/");
  };
  // Markdown 連結目的地（可帶 "標題"）先取出並從文字移除，剩下的文字才找裸網址，避免連結文字裡的網址被當成目的地。
  const mdLink = /\[([^\]]*)\]\(\s*<?([^)\s>]+)>?(?:\s+["'(][^)]*)?\s*\)/g;
  for (const m of text.matchAll(mdLink)) {
    const p = norm(m[2]);
    if (!p) continue;
    listed.add(p);
    if (!titles.has(p)) titles.set(p, new Set());
    titles.get(p).add(m[1].trim());
  }
  const rest = text.replace(/\[[^\]]*\]\([^)]*\)/g, " ");
  for (const m of rest.matchAll(/https?:\/\/[^\s)<>\]（]+/g)) { const p = norm(m[0]); if (p) listed.add(p); }
  return { listed, titles };
}
const FILES = ["llms.txt", "llms-full.txt"];
const found = {};
for (const f of FILES) {
  if (!fs.existsSync(path.join(ROOT, f))) { console.error(`  找不到 ${f}，本檢查不能靜默通過`); process.exit(1); }
  found[f] = collect(read(f));
  if (![...found[f].listed].some((p) => p.startsWith("/articles/"))) {
    console.error(`  ${f} 讀不到任何本站 /articles/ 連結，本檢查不能靜默通過`);
    process.exit(1);
  }
}

const blocked = new Set(
  (fs.existsSync(path.join(ROOT, ".vercelignore")) ? read(".vercelignore") : "")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => /^(articles|ai-trends)\/[^*/]+\/$/.test(l))
    .map((l) => l.replace(/\/$/, ""))
);

// robots meta 不限屬性順序（name 在前或 content 在前都認）
// HTML 註解裡的 meta 不算；屬性名前面要是空白，data-name、data-content 不算
function isNoindex(html) {
  for (const m of html.replace(/<!--[\s\S]*?-->/g, "").matchAll(/<meta\b[^>]*>/gi)) {
    const tag = m[0];
    if (/\sname\s*=\s*["']robots["']/i.test(tag) && /\scontent\s*=\s*["'][^"']*noindex/i.test(tag)) return true;
  }
  return false;
}

const missing = [];
const wrongTitle = [];
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
    let title = "";
    try { title = String(JSON.parse(fs.readFileSync(path.join(ROOT, rel, "article.json"), "utf8")).title || "").replace(/\s+/g, " ").trim(); } catch {}
    for (const f of FILES) {
      const { listed, titles } = found[f];
      const key = `/${rel}/`;
      if (!listed.has(key)) { missing.push(`${f}：${rel}`); continue; }
      const t = titles.get(key);
      if (title && !(t && t.has(title))) wrongTitle.push(`${f}：${rel}（article.json：「${title}」；檔內：「${t ? [...t].join("／") : "只有裸網址，沒有 [標題](網址)"}」）`);
    }
  }
}

if (checked === 0) {
  console.error("  找不到任何已上線文章（articles/*/article.json），本檢查不能靜默通過");
  process.exit(1);
}
if (missing.length || wrongTitle.length) {
  if (missing.length) {
    console.log(`  已上線文章 ${checked} 篇，有 ${missing.length} 筆不在 llms 檔：`);
    for (const m of missing) console.log(`    - ${m}`);
  }
  if (wrongTitle.length) {
    console.log(`  有 ${wrongTitle.length} 筆標題與 article.json 不同：`);
    for (const m of wrongTitle) console.log(`    - ${m}`);
  }
  console.log("  修法：node scripts/build-llms.mjs（文章段由 article.json 生成，不要手補）");
  process.exit(1);
}
console.log(`  llms 文章覆蓋與標題 PASS：已上線文章 ${checked} 篇都在 llms.txt 與 llms-full.txt，標題與 article.json 一致`);
