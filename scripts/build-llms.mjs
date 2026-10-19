#!/usr/bin/env node
/* ============================================================
   build-llms.mjs · llms.txt 與 llms-full.txt 文章段生成器（2026-10-19 立）
   ------------------------------------------------------------
   立因：兩檔全手寫，文章段已漂移（2026-10-19 架構盤查）：llms.txt 有 17 篇標題過時、
   兩種格式並存（89 條「絕對網址＋冒號」、98 條「相對網址＋空白減號」）；
   llms-full.txt 只收 72／191 篇，且摘要版比完整版還大。每篇新文章都要手改，是排隊時的衝突熱區。

   分工（對齊 llms.txt 規範：llms.txt 是目錄、llms-full.txt 是完整版）：
     llms.txt        「## Deep Articles（深度文章）」與「## AI Trends Articles」兩段由本支生成，
                     每篇一行：- [標題](絕對網址): 一句摘要（summary 第一句）
     llms-full.txt   「## AI 趨勢」與「## 深度文章（完整）」兩段由本支生成，每篇含
                     發佈與更新日、problem、audience、summary、tags，
                     加上 scripts/llms-article-notes.json 的人工補充條目（邊界、關鍵重點、安全線等）。
                     舊的「## 深度文章補充」「## 簡報轉深度文章」兩段併進「## 深度文章（完整）」。
   其餘段落（接待協議、服務、課程、引用偏好等）仍是手寫，本支一個字都不改，
   只做一件全檔正規化：網址後面直接接全形括號時補一個半形空白（機器切網址才不會切錯）。

   資料來源：articles/<id>/article.json、ai-trends/<id>/article.json（唯一來源），
             site-index.json 只拿來交叉檢查（已上線文章應該都在索引裡，缺了只警告）。
   收錄範圍：已上線文章（判定見 lib-articles.mjs，與 sitemap、check-llms-coverage 同一套）。
   排序：依 (updated 或 date) 新到舊 → date 新到舊 → id，與 articles-data.js 一致。

   用法：
     node scripts/build-llms.mjs           重建（有變更才寫）
     node scripts/build-llms.mjs --check   只比對不寫；會變動就 exit 1
   ============================================================ */
import fs from "node:fs";
import path from "node:path";
import { ROOT, SITE, listArticles, isLive, articleDates, readText } from "./lib-articles.mjs";

const MODE_CHECK = process.argv.includes("--check");
for (const a of process.argv.slice(2)) {
  if (a !== "--check") { console.error(`未知參數：${a}（可用 --check）`); process.exit(2); }
}

const GEN_NOTE = "（本段由 scripts/build-llms.mjs 從各篇 article.json 生成，請改 article.json，不要手改本段）";
const NOTES_FILE = path.join(ROOT, "scripts", "llms-article-notes.json");
const notes = fs.existsSync(NOTES_FILE) ? JSON.parse(readText(NOTES_FILE)) : {};

/* ───────── 文章清單 ───────── */
let all;
try { all = listArticles(); } catch (e) { console.error(`  ${e.message}`); process.exit(2); }
const live = all.filter(isLive).map((a) => ({ ...a, ...articleDates(a.meta) }));
if (live.length === 0) { console.error("  找不到任何已上線文章，不能靜默通過"); process.exit(2); }
live.sort((p, q) => (q.updated.localeCompare(p.updated)) || (q.date.localeCompare(p.date)) || p.id.localeCompare(q.id));
const deep = live.filter((a) => a.root === "articles");
const trends = live.filter((a) => a.root === "ai-trends");

/* site-index 交叉檢查：只警告 */
try {
  const idx = JSON.parse(readText(path.join(ROOT, "site-index.json")));
  const urls = new Set((idx.items || []).map((i) => i.url));
  const miss = live.filter((a) => !urls.has(`/${a.rel}/`));
  if (miss.length) console.log(`  ⚠️ ${miss.length} 篇已上線文章不在 site-index.json（重跑 build-site-index.mjs）：${miss.map((a) => a.rel).join("、")}`);
} catch { console.log("  ⚠️ 讀不到 site-index.json，略過交叉檢查"); }

/* ───────── 文字工具 ───────── */
const oneLine = (s) => String(s || "").replace(/\s+/g, " ").trim();
function firstSentence(s, max = 90) {
  const t = oneLine(s);
  const m = t.match(/^[\s\S]*?[。！？]/);
  let out = m ? m[0] : t;
  if (out.length > max) out = out.slice(0, max - 1) + "…";
  return out;
}
const tagText = (tags = {}) => {
  const part = (k, label) => (Array.isArray(tags[k]) && tags[k].length ? `${label} ${tags[k].join("、")}` : null);
  return [part("topic", "主題"), part("level", "程度"), part("content_type", "類型")].filter(Boolean).join("｜");
};
const url = (a) => `${SITE}/${a.rel}/`;

/* ───────── 生成段落 ───────── */
const llmsLine = (a) => `- [${oneLine(a.meta.title)}](${url(a)}): ${firstSentence(a.meta.summary)}`;

function fullEntry(a) {
  const n = notes[a.rel] || [];
  const lines = [
    `### [${oneLine(a.meta.title)}](${url(a)})`,
    `- 發佈：${a.date}｜最後更新：${a.updated}`,
  ];
  if (a.meta.problem) lines.push(`- 問題：${oneLine(a.meta.problem)}`);
  if (a.meta.audience) lines.push(`- 適合：${oneLine(a.meta.audience)}`);
  if (a.meta.summary) lines.push(`- 摘要：${oneLine(a.meta.summary)}`);
  const t = tagText(a.meta.tags);
  if (t) lines.push(`- 標籤：${t}`);
  for (const [label, text] of Array.isArray(n) ? n : []) {
    lines.push(label === "補充" ? `- ${oneLine(text)}` : `- ${label}：${oneLine(text)}`);
  }
  return lines.join("\n");
}

const LLMS_SECTIONS = {
  "## Deep Articles（深度文章）": () => [
    "",
    "完整文章總站：https://jiangyude.com/articles.html （可依主題、難度、類型交集篩選，也可搜尋）",
    `每篇的問題、適合誰、完整摘要與標籤見 https://jiangyude.com/llms-full.txt 。${GEN_NOTE}`,
    "",
    ...deep.map(llmsLine),
    "",
  ],
  "## AI Trends Articles": () => ["", GEN_NOTE, "", ...trends.map(llmsLine), ""],
};
const FULL_SECTIONS = {
  "## AI 趨勢": () => [
    "",
    "AI 趨勢區整理江江對 AI 產業消息、工具更新、大廠發布會的判讀，重點放在這些變化會如何影響個人工作流、團隊知識管理與下一步要練的能力。",
    "",
    GEN_NOTE,
    "",
    ...trends.flatMap((a) => [fullEntry(a), ""]),
  ],
  "## 深度文章（完整）": () => [
    "",
    `已上線深度文章共 ${deep.length} 篇，依最後更新日新到舊排列。${GEN_NOTE}`,
    "",
    ...deep.flatMap((a) => [fullEntry(a), ""]),
  ],
};
// 舊段名：第一次生成時併進新段（之後就不會再出現）
const FULL_LEGACY = { "## 深度文章補充": "## 深度文章（完整）", "## 簡報轉深度文章": null };

/* ───────── 依「## 」切段、替換 ───────── */
function splitSections(text) {
  const lines = text.split("\n");
  const out = [{ head: null, body: [] }];
  for (const l of lines) {
    if (/^## /.test(l)) out.push({ head: l, body: [] });
    else out[out.length - 1].body.push(l);
  }
  return out;
}
const joinSections = (secs) => secs.map((s) => (s.head === null ? s.body.join("\n") : [s.head, ...s.body].join("\n"))).join("\n");

function rebuild(file, generators, legacy = {}) {
  const p = path.join(ROOT, file);
  const before = readText(p);
  const secs = splitSections(before);
  const seen = new Set();
  const out = [];
  for (const s of secs) {
    let head = s.head;
    if (head && head.trim() in legacy) {
      const to = legacy[head.trim()];
      if (!to || seen.has(to)) continue; // 併入或丟棄的舊段
      head = to;
    }
    const key = head && Object.keys(generators).find((k) => head.trim() === k);
    if (key) {
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ head: key, body: generators[key]() });
    } else out.push(s);
  }
  const missing = Object.keys(generators).filter((k) => !seen.has(k));
  if (missing.length) {
    console.error(`  ${file} 找不到這些段落標題，不知道該把生成內容放哪：${missing.join("、")}`);
    process.exit(2);
  }
  let after = joinSections(out);
  // 網址後面直接接全形括號：補半形空白
  after = after.replace(/(https?:\/\/[^\s（）<>\]]+)（/g, "$1 （");
  after = after.replace(/\n{3,}/g, "\n\n");
  if (!after.endsWith("\n")) after += "\n";
  return { p, before, after, changed: before !== after };
}

const results = [
  rebuild("llms.txt", LLMS_SECTIONS),
  rebuild("llms-full.txt", FULL_SECTIONS, FULL_LEGACY),
];
const changed = results.filter((r) => r.changed);
if (!changed.length) {
  console.log(`  ✅ llms.txt、llms-full.txt 文章段已是最新（深度文章 ${deep.length} 篇、AI 趨勢 ${trends.length} 篇）`);
  process.exit(0);
}
if (MODE_CHECK) {
  console.log(`  --check：${changed.map((r) => path.basename(r.p)).join("、")} 文章段與 article.json 不一致，跑 node scripts/build-llms.mjs 重建`);
  process.exit(1);
}
for (const r of changed) fs.writeFileSync(r.p, r.after);
console.log(`  ✅ 已重建 ${changed.map((r) => path.basename(r.p)).join("、")}（深度文章 ${deep.length} 篇、AI 趨勢 ${trends.length} 篇）`);
