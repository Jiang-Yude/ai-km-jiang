#!/usr/bin/env node
/* ============================================================
   check-article-tracking.mjs · 文章頁一定要載入瀏覽計數與 Cloudflare 統計（2026-10-20 立，事故驅動）
   ------------------------------------------------------------
   立因：_templates/article-template.html 的註解寫「views.js 已內建在本檔」，</body> 前其實沒有。
   2026-09 起照範本做的 61 篇文章頁都沒載入 /views.js，9 月文章 43 篇有 42 篇瀏覽數是 0、
   10 月 20 篇全是 0，兩個月沒有任何一關發現。另有 9 篇缺 Cloudflare Web Analytics beacon。

   規則：全站掃 articles/<slug>/index.html（便宜、而且舊文漏了一樣是漏），每篇都要有
     ① <script src="/views.js">（本站瀏覽計數）
     ② static.cloudflareinsights.com/beacon（Cloudflare Web Analytics）
   修法：在 </body> 前補範本裡那兩段（<!-- tracking:cloudflare --> 與 <!-- tracking:views-counter -->）。
   刻意不放的頁：在 article-tracking-ignore.json 寫 { "<slug>": "原因" }。
   用法：node scripts/check-article-tracking.mjs
   ============================================================ */

import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const IGNORE_FILE = path.join(ROOT, "article-tracking-ignore.json");
const ignore = fs.existsSync(IGNORE_FILE) ? JSON.parse(fs.readFileSync(IGNORE_FILE, "utf8")) : {};

// 只掃 git 有追蹤的文章頁：主 clone 裡沒進 git、被 .git/info/exclude 與 .vercelignore 擋著的舊制草稿不會上線，不算
// （2026-10-20 首跑就被 nontech-partner-ai-onboarding 這種草稿誤擋）
const tracked = execSync("git -c core.quotepath=false ls-files -- 'articles/*/index.html'", { cwd: ROOT }).toString().split("\n").filter(Boolean);
const bad = [];
let checked = 0;
for (const rel of tracked) {
  const e = { name: rel.split("/")[1] };
  if (ignore[e.name]) continue;
  const f = path.join(ROOT, rel);
  if (!fs.existsSync(f)) continue;
  checked++;
  const html = fs.readFileSync(f, "utf8");
  const miss = [];
  if (!/<script[^>]+src=["'][^"']*\/views\.js["']/i.test(html)) miss.push("views.js");
  if (!/static\.cloudflareinsights\.com\/beacon/i.test(html)) miss.push("Cloudflare beacon");
  if (miss.length) bad.push(`articles/${e.name}/index.html 缺 ${miss.join("、")}`);
}

if (bad.length) {
  console.log(`  ${bad.length} 篇文章頁沒載入統計程式，上線後瀏覽數不會記：`);
  for (const b of bad) console.log(`    - ${b}`);
  console.log("  修法：</body> 前補 _templates/article-template.html 的 tracking 兩段；刻意不放寫 article-tracking-ignore.json");
  process.exit(1);
}
console.log(`  全站 ${checked} 篇文章頁都有載入 views.js 與 Cloudflare beacon`);
