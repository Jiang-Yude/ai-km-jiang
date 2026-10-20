#!/usr/bin/env node
/* ============================================================
   check-article-verified.mjs · 時效文查證日期過期清單（2026-10-20 立）
   ------------------------------------------------------------
   立因：江江 2026-10-20 拍板「官網同時當公開編年史」。價格、模型名、工具步驟這類會過期的內容，
   不改寫內文，改在 article.json 標 "verified": "YYYY-MM-DD"，文章頁顯示查證日期。
   過期由巡檢自動列出，交人決定要不要複查，不擋上線。

   規則：掃 git 追蹤的 articles/<id>/article.json，列出 verified 距今超過 N 天的文章（預設 90）。
     沒有 verified 欄位的文章不列（不是時效文）。
     只印清單，一律 exit 0，不擋任何流程。daily-health-check.sh 把輸出當黃燈提醒。
   用法：node scripts/check-article-verified.mjs [--days N]
   ============================================================ */

import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const argDays = (() => {
  const i = process.argv.indexOf("--days");
  if (i === -1) return 90;
  const n = Number(process.argv[i + 1]);
  if (!Number.isInteger(n) || n < 0) {
    console.log(`  ⚠️ --days 要接非負整數，收到「${process.argv[i + 1]}」，改用預設 90`);
    return 90;
  }
  return n;
})();

// 以台北日期算「今天」，與巡檢標題時間一致
const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Taipei" });
const dayDiff = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);

let files = [];
try {
  files = execSync("git ls-files -- 'articles/*/article.json'", { cwd: ROOT, encoding: "utf8" })
    .split("\n").filter(Boolean);
} catch (e) {
  console.log(`  ⚠️ 讀不到 git 追蹤清單（${e.message.split("\n")[0]}），這次沒檢查`);
  process.exit(0);
}

const stale = [];
const broken = [];
let tracked = 0;
for (const f of files) {
  let o;
  try { o = JSON.parse(fs.readFileSync(path.join(ROOT, f), "utf8")); } catch (e) {
    broken.push(`${f}：JSON 解析失敗`);
    continue;
  }
  if (!("verified" in o)) continue;
  tracked++;
  if (typeof o.verified !== "string" || !DATE_RE.test(o.verified)) {
    broken.push(`${f}：verified「${o.verified}」不是 YYYY-MM-DD`);
    continue;
  }
  const age = dayDiff(o.verified, today);
  if (age > argDays) stale.push({ id: o.id || path.basename(path.dirname(f)), verified: o.verified, age, title: o.title || "" });
}

stale.sort((a, b) => b.age - a.age || a.id.localeCompare(b.id));
console.log(`  查證日期盤點：有 verified 的文章 ${tracked} 篇，門檻 ${argDays} 天（今天 ${today}）`);
for (const s of stale) console.log(`  🟡 ${s.id}  查證 ${s.verified}（${s.age} 天）  ${s.title}`);
for (const b of broken) console.log(`  ⚠️ ${b}`);
if (!stale.length && !broken.length) console.log("  ✅ 沒有超過門檻的查證日期");
else if (stale.length) console.log(`  共 ${stale.length} 篇超過 ${argDays} 天，交人決定是否複查（不擋上線）`);
process.exit(0);
