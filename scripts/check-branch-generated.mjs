#!/usr/bin/env node
/* ============================================================
   check-branch-generated.mjs · 分支有沒有夾帶生成檔，夾帶的是「過期重建」還是「手改」
   （2026-10-09 立，事故驅動）
   ------------------------------------------------------------
   立因：規則說「分支禁 commit 生成檔」，但沒有機械擋。2026-10-09 晚上有分支把
   articles-data.js 一起 commit，squash merge 撞衝突，merge-publish 收分支版後交給
   生成器，生成器看到那一版「與來源不一致、也與基準版不同」就停下要 --force。
   其實那只是分支在桌上重建過、後來又改了 article.json 沒再重建的「過期生成檔」，
   不是手改；但生成器分不出來，因為它只看檔案內容。

   這支看的是 git 歷史，分得出來：
     對分支相對分叉點的每個生成檔變更：
       - articles-data.js：逐筆比對分叉點版與分支版，找出「分支改了這筆」的 id；
         若分支尖端**沒有**該 id 的 article.json → 這筆是手寫生成檔（舊式分支）→ exit 1，要人到分支跑 --adopt
         若 article.json 存在 → 生成檔那筆只是產物（過期重建或手改都一樣），可安全丟掉由 main 重建，印一行提醒
       - 其他生成檔（site-index.json、article-keywords.js、en/articles-data.js、sitemap.xml 文章段）
         本來就整檔重建，分支版一律可丟 → 只列出，不擋
   輸出（stdout，一行一個檔名）：分支改過的生成檔清單，給 merge-publish 決定要還原哪些。
   exit 0＝可以安全還原成 main 版再重建；exit 1＝有手改，要先 --adopt；exit 2＝參數或 git 錯。

   用法：node scripts/check-branch-generated.mjs <fork-point-sha> <branch-ref>
   ============================================================ */

import { execFileSync } from "node:child_process";
import vm from "node:vm";

const [FORK, BRANCH] = process.argv.slice(2);
if (!FORK || !BRANCH) {
  console.error("用法：node scripts/check-branch-generated.mjs <fork-point-sha> <branch-ref>");
  process.exit(2);
}
const GENERATED = ["articles-data.js", "site-index.json", "article-keywords.js", "en/articles-data.js", "sitemap.xml"];

const git = (...args) => execFileSync("git", ["-c", "core.quotePath=false", ...args], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "ignore"] });
const show = (ref, file) => {
  try { return git("show", `${ref}:${file}`); } catch { return null; }
};

let changed;
try {
  changed = git("diff", "--name-only", `${FORK}..${BRANCH}`).split("\n").map((s) => s.trim()).filter(Boolean);
} catch (e) {
  console.error(`讀不到 ${FORK}..${BRANCH} 的差異：${e.message}`);
  process.exit(2);
}
const changedSet = new Set(changed);
const touchedGen = GENERATED.filter((g) => changedSet.has(g));

for (const g of touchedGen) console.log(g);
if (!touchedGen.includes("articles-data.js")) process.exit(0);

/* articles-data.js 逐筆判手改 */
const load = (text) => {
  if (text == null) return null;
  const win = {};
  try { vm.runInNewContext(text, { window: win }, { timeout: 2000 }); } catch { return null; }
  if (!Array.isArray(win.ARTICLES)) return null;                       // 沒有 window.ARTICLES＝不是我們認得的生成檔，當解析失敗
  const map = new Map();
  for (const e of win.ARTICLES) {
    if (!e || typeof e.id !== "string" || !e.id.trim()) return null;   // 任一筆沒 id＝檔案壞了，不猜
    map.set(e.id, JSON.stringify(e));
  }
  return map;
};
const base = load(show(FORK, "articles-data.js"));
const mine = load(show(BRANCH, "articles-data.js"));
if (!base || !mine) {
  console.error("  articles-data.js 其中一版解析不出 window.ARTICLES，無法判定手改；保守起見視為手改，請到分支人工確認");
  process.exit(1);
}
const hasSrc = (id) => {
  for (const root of ["articles", "ai-trends"]) if (show(BRANCH, `${root}/${id}/article.json`) != null) return true;
  return false;
};
// 判準（2026-10-09 定）：來源（article.json）在分支尖端存在，生成檔那筆不管怎麼改都「只是產物」，可以丟掉由 main 重建；
// 來源不存在卻在生成檔裡改了這筆＝舊式分支直接手寫生成檔，丟掉會讓那篇無聲掉出索引 → 停下要 --adopt。
// 不用「分支有沒有同時改 article.json」判，因為分叉點的 main 自己也可能生成檔過期（例：來源改了還沒重建）。
const handEdited = [];
const discard = [];
for (const [id, body] of mine) {
  if (base.get(id) === body) continue;        // 跟分叉點一樣＝分支沒動這筆
  if (hasSrc(id)) discard.push(id);           // 有來源＝產物，可丟
  else handEdited.push(id);                   // 沒來源＝手寫生成檔
}
for (const [id] of base) {
  if (!mine.has(id) && !hasSrc(id)) handEdited.push(`${id}（分支從生成檔刪掉，但沒有它的 article.json 可供重建判斷）`);
}
if (discard.length) console.error(`  ▸ articles-data.js：${discard.length} 筆分支改過但來源 article.json 在，當產物丟掉、由 main 重建（若那是手改請改到 article.json）：${discard.slice(0, 8).join("、")}${discard.length > 8 ? "…" : ""}`);
if (handEdited.length) {
  console.error(`  ⛔ articles-data.js 有 ${handEdited.length} 筆是直接手寫生成檔、分支上沒有對應的 article.json：`);
  for (const id of handEdited.slice(0, 20)) console.error(`     - ${id}`);
  console.error("     修法：到該分支跑 node scripts/build-articles-data.mjs --adopt（把手寫那筆回寫成 article.json）再 commit、重跑 merge-publish。");
  process.exit(1);
}
process.exit(0);
