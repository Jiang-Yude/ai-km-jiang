#!/usr/bin/env node
/* ============================================================
   check-article-cover.mjs · 文章頁有封面、article.json 卻沒 cover 欄位（2026-10-09 立，事故驅動）
   ------------------------------------------------------------
   立因：2026-10-09 一篇文章上線後，文章頁本身有封面（hero／og:image），但文章列表卡片
   沒封面。原因是 article.json 漏了 cover 欄位；列表卡片吃的是 articles-data.js（由
   article.json 生成），沒有任何檢查擋這件事。

   規則：只驗「本次變更」的文章（判定階梯與 check-image-ratio.mjs 相同），舊文不回頭批改。
     命中條件（同時成立才擋）：
       ① article.json 沒有 cover 欄位
       ② index.html 有範本的 <figure class="hero-figure"><img src="…images/…">（代表這篇文章頁有封面）
          （只有 OG 圖、沒有 hero 封面的舊文不算，OG 圖是分享縮圖不是列表封面）
     修法：article.json 補 "cover": {"wide": "images/articles/<slug>-cover.jpg"}（檔要存在），
           或在 article-cover-ignore.json 寫明這篇為什麼不放列表封面。
   用法：node scripts/check-article-cover.mjs [--all]   （--all 全站列清單，不擋）
   ============================================================ */

import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const ALL = process.argv.includes("--all");
const IGNORE_FILE = path.join(ROOT, "article-cover-ignore.json");
const ignore = (() => {
  if (!fs.existsSync(IGNORE_FILE)) return {};
  try { return JSON.parse(fs.readFileSync(IGNORE_FILE, "utf8")); } catch (e) {
    console.error(`  article-cover-ignore.json 不是合法 JSON：${e.message}`);
    process.exit(2);
  }
})();

const SPEC = "-- 'articles/*/article.json' 'articles/*/index.html' 'ai-trends/*/article.json' 'ai-trends/*/index.html'";
function changedDirs() {
  const cmds = [
    `git -c core.quotepath=false diff --cached --name-only ${SPEC}`,
    `git -c core.quotepath=false diff HEAD --name-only ${SPEC}`,
    `git -c core.quotepath=false diff --name-only ${SPEC}`,
    `git -c core.quotepath=false diff --name-only origin/main...HEAD ${SPEC}`,
    `git -c core.quotepath=false diff --name-only main...HEAD ${SPEC}`,
  ];
  const dirs = new Set();
  for (const cmd of cmds) {
    let out = "";
    try { out = execSync(cmd, { cwd: ROOT, stdio: ["ignore", "pipe", "ignore"] }).toString(); } catch { continue; }
    for (const line of out.split("\n")) {
      const m = line.trim().match(/^((?:articles|ai-trends)\/[^/]+)\//);
      if (m) dirs.add(m[1]);
    }
    if (dirs.size) break;   // 階梯：第一個有結果的就是「本次變更」
  }
  return [...dirs];
}
function allDirs() {
  const out = [];
  for (const root of ["articles", "ai-trends"]) {
    const d = path.join(ROOT, root);
    if (!fs.existsSync(d)) continue;
    for (const e of fs.readdirSync(d, { withFileTypes: true })) if (e.isDirectory()) out.push(`${root}/${e.name}`);
  }
  return out;
}

const targets = ALL ? allDirs() : changedDirs();
const bad = [];
let checked = 0;
for (const rel of targets) {
  const idx = path.join(ROOT, rel, "index.html");
  const src = path.join(ROOT, rel, "article.json");
  if (!fs.existsSync(idx) || !fs.existsSync(src)) continue;
  const slug = rel.split("/")[1];
  if (ignore[slug]) continue;
  let meta;
  try { meta = JSON.parse(fs.readFileSync(src, "utf8")); } catch { continue; }   // 壞 JSON 由生成器那關擋
  checked++;
  if (meta.cover && typeof meta.cover === "object") continue;
  const html = fs.readFileSync(idx, "utf8");
  // 封面＝範本的 <figure class="hero-figure"><img src="../../images/…">。OG 圖（images/og/）不算封面，
  // 舊文大多只有 OG 圖沒有 hero 封面，不該被這關追殺。
  const fig = html.match(/<figure\s+class=["'][^"']*\bhero-figure\b[^"']*["'][^>]*>[\s\S]*?<img[^>]*\bsrc=["']([^"']+)["']/i);
  if (!fig) continue;
  const img = fig[1].replace(/^(\.\.\/)+/, "").replace(/^https?:\/\/[^/]+\//, "").replace(/^\//, "");
  if (!/^images\//.test(img)) continue;
  bad.push({ rel, slug, img });
}

if (bad.length) {
  console.log(`  ${bad.length} 篇文章頁有 hero 封面但 article.json 沒有 cover，文章列表卡片會沒封面：`);
  for (const b of bad) {
    const guess = fs.existsSync(path.join(ROOT, `images/articles/${b.slug}-cover.jpg`)) ? `images/articles/${b.slug}-cover.jpg` : b.img;
    console.log(`    - ${b.rel}/article.json → 補 "cover": {"wide": "${guess}"}`);
  }
  console.log("  不放列表封面是刻意的話，在 article-cover-ignore.json 寫 { \"<slug>\": \"原因\" }");
  process.exit(ALL ? 0 : 1);
}
console.log(ALL ? `  全站 ${checked} 篇有 article.json 的文章，封面欄位都在或無封面圖` : `  封面欄位檢查 PASS（本次變更 ${checked} 篇）`);
