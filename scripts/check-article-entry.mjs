#!/usr/bin/env node
// 檢查文章頁入口資料（articles-entry.js）跟文章清單（articles-data.js）有沒有對上。
// 用法：node scripts/check-article-entry.mjs   （先跑 node scripts/build-articles-data.mjs 讓 articles-data.js 是最新的）
// 只回報、不擋部署：漏歸類的文章仍會出現在全部文章與搜尋裡，只是不在任何入口。
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ctx = { window: {} };
vm.createContext(ctx);
for (const f of ["articles-data.js", "articles-entry.js"]) vm.runInContext(fs.readFileSync(path.join(root, f), "utf8"), ctx);
const articles = ctx.window.ARTICLES || [], entries = ctx.window.ARTICLE_ENTRIES || [], none = ctx.window.ARTICLE_ENTRY_NONE || [];
const known = new Set(articles.map((a) => a.id));
const primary = new Map();
let bad = 0;
const say = (m) => { bad++; console.log("✗ " + m); };
for (const e of entries) {
  for (const id of e.ids || []) {
    if (!known.has(id)) say(`入口「${e.label}」ids 有不存在的文章：${id}`);
    if (primary.has(id)) say(`${id} 同時是兩個入口的主入口：「${primary.get(id)}」「${e.label}」`);
    primary.set(id, e.label);
  }
  for (const id of e.also || []) if (!known.has(id)) say(`入口「${e.label}」also 有不存在的文章：${id}`);
  const members = new Set([...(e.ids || []), ...(e.also || [])]);
  if ((e.picks || []).length > 3) say(`入口「${e.label}」picks 超過 3 篇`);
  for (const id of e.picks || []) if (!members.has(id)) say(`入口「${e.label}」picks 的 ${id} 不在這個入口的 ids／also 裡`);
}
for (const id of none) {
  if (!known.has(id)) say(`ARTICLE_ENTRY_NONE 有不存在的文章：${id}`);
  if (primary.has(id)) say(`${id} 同時在入口「${primary.get(id)}」和 ARTICLE_ENTRY_NONE`);
}
const noneSet = new Set(none);
const missing = articles.filter((a) => !primary.has(a.id) && !noneSet.has(a.id));
for (const a of missing) say(`還沒歸入口：${a.id}｜${String(a.title).split("｜")[0]}`);
console.log(bad ? `共 ${bad} 個問題。` : `✓ ${articles.length} 篇都有歸屬（${entries.length} 個入口，${none.length} 篇不歸入口）。`);
process.exit(bad ? 1 : 0);
