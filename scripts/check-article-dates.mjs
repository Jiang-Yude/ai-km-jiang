#!/usr/bin/env node
/* ============================================================
   check-article-dates.mjs · 文章日期檢查器（2026-10-19 立）
   ------------------------------------------------------------
   立因：2026-06-26 立的規則「每篇文章頁有可見『發佈｜最後更新』日期行＋JSON-LD datePublished／dateModified」
   在模板裡根本不存在、也沒有檢查器，到 2026-10-19 盤查時 81 篇缺 datePublished、98 篇沒有可見日期行，
   最新一篇（ai-manages-ai-focus）也缺，屬於生成流程漏接。現在由 build-article-head.mjs 從 article.json 生成，
   這支是擋板：缺日期、日期格式錯、HTML 與 article.json 對不上，一律擋。

   每篇（articles/<id>、ai-trends/<id>，有 index.html＋article.json；擋板與 noindex 也查，因為它們遲早上線）：
     1. article.json 有 date（YYYY-MM-DD）；有 updated 的話格式正確且不早於 date
     2. Article JSON-LD 有 datePublished＝date、dateModified＝updated（沒寫 updated 就等於 date）
     3. body 有可見日期行：發佈（或發布）日期＝date，且同一頁看得到最後更新＝updated
   用法：node scripts/check-article-dates.mjs        全部通過 exit 0，否則列清單 exit 1
   修法：改 article.json 後跑 node scripts/build-article-head.mjs（--only=<id> 只重寫那篇）
   誠實邊界：只驗日期有沒有、對不對得上，驗不了 updated 是不是真的反映內容最後修改的那天。
   ============================================================ */
import fs from "node:fs";
import { listArticles, articleDates, DATE_RE } from "./lib-articles.mjs";

let all;
try { all = listArticles(); } catch (e) { console.error(`  ${e.message}`); process.exit(2); }
if (all.length === 0) { console.error("  找不到任何文章，本檢查不能靜默通過"); process.exit(1); }

const problems = [];
for (const a of all) {
  const p = [];
  const { date, updated } = articleDates(a.meta);
  if (!DATE_RE.test(date)) p.push(`article.json 的 date 缺少或不是 YYYY-MM-DD（「${a.meta.date ?? ""}」）`);
  if (a.meta.updated !== undefined && !DATE_RE.test(String(a.meta.updated))) p.push(`article.json 的 updated 不是 YYYY-MM-DD（「${a.meta.updated}」）`);
  if (DATE_RE.test(date) && DATE_RE.test(updated) && updated < date) p.push(`updated（${updated}）早於 date（${date}）`);

  const html = fs.readFileSync(a.htmlPath, "utf8");
  let cut = html.indexOf("</head>"); if (cut < 0) cut = html.search(/<body\b/i);
  const head = html.slice(0, cut), body = html.slice(cut);

  let art = null;
  for (const m of head.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    try {
      const o = JSON.parse(m[1]);
      for (const n of o["@graph"] || [o]) if ([].concat(n["@type"]).some((t) => /Article|BlogPosting/.test(t))) art = n;
    } catch { p.push("JSON-LD 解析失敗"); }
  }
  if (!art) p.push("head 沒有 Article JSON-LD");
  else {
    if (art.datePublished !== date) p.push(`JSON-LD datePublished「${art.datePublished ?? "缺"}」≠ article.json date「${date}」`);
    if (art.dateModified !== updated) p.push(`JSON-LD dateModified「${art.dateModified ?? "缺"}」≠ article.json updated「${updated}」`);
  }

  const text = body.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<style[\s\S]*?<\/style>/gi, "").replace(/<[^>]+>/g, " ");
  const pub = [...text.matchAll(/(?:發佈|發布)\s*[：:｜|]?\s*(\d{4}-\d{2}-\d{2})/g)].map((m) => m[1]);
  const upd = [...text.matchAll(/(?:最後更新|更新)\s*[：:｜|]?\s*(\d{4}-\d{2}-\d{2})/g)].map((m) => m[1]);
  if (pub.length === 0) p.push("頁面沒有可見的「發佈 YYYY-MM-DD」日期行");
  else if (!pub.includes(date)) p.push(`可見發佈日 ${pub.join("、")} ≠ article.json date ${date}`);
  if (upd.length === 0) p.push("頁面沒有可見的「最後更新 YYYY-MM-DD」");
  else if (!upd.includes(updated)) p.push(`可見最後更新 ${upd.join("、")} ≠ article.json updated ${updated}`);

  if (p.length) problems.push(`${a.rel}\n      ${p.join("\n      ")}`);
}

if (problems.length) {
  console.log(`  文章日期未過：${problems.length}／${all.length} 篇`);
  for (const x of problems) console.log(`    - ${x}`);
  console.log("  修法：改 article.json 的 date／updated，再跑 node scripts/build-article-head.mjs --only=<id>");
  process.exit(1);
}
console.log(`  文章日期 PASS：${all.length} 篇的 article.json、JSON-LD、可見日期行三處一致`);
