#!/usr/bin/env node
/* ============================================================
   build-related-static.mjs · 文章頁「相關文章」預渲染（2026-10-19 立）
   ------------------------------------------------------------
   立因：效能審查第 1 條。文章頁原本為了長出最下面三張相關文章卡片，
   每頁都要下載整份 articles-data.js（約 190KB，191 篇全部資料）再跑 related-render.js，
   讀者只看三張卡片卻付了整份索引的流量；不跑 JavaScript 的 AI 爬蟲也看不到這三條站內連結。
   做法：在生成階段把卡片直接寫進文章頁 HTML，文章頁不再載入 articles-data.js 與 related-render.js。

   挑選邏輯（與 related-render.js 完全相同，那支保留給其他頁用）：
     1. article.json 的 related 依序先採用（指向不存在或未上線的 id 略過）。
     2. 不足 3 篇時，依「主題標籤（tags.topic）重疊數」高到低補，同分看 date 新的；重疊 0 的不收。
     候選池＝所有有 article.json、不在 .vercelignore 擋板內的文章（就是 articles-data.js 收的那一批），
     池的順序與 articles-data.js 相同（updated 或 date 新到舊 → date 新到舊 → id），同分時的先後才會一致。
   輸出 DOM 與 class 沿用 related-render.js（section#related-articles.section > .inner > h2 + .relx-grid > a.relx-card），
   另加封面：有登記在 articles-render.js THUMBS 段的封面用 images/thumbs 的 640px WebP，
   沒登記的退回原圖（與文章列表同一套退路），一律 loading="lazy"。

   寫在哪：related-static 標記之間，位置在第一個 <footer 之前（related-render.js 原本也是插在 footer 前）。
   第一次執行依 footer 錨點插入標記並移除兩支 script 那兩行；之後只重寫標記之間。
   處理對象：有標記、或還在載入 related-render.js 的文章頁。手寫精選頁（HAND_CURATED）不動。
   冪等：同一份來源跑第二次不會有任何 diff。

   用法：
     node scripts/build-related-static.mjs                 全部重建（有變更才寫）
     node scripts/build-related-static.mjs --only=a,b      只處理指定 id
     node scripts/build-related-static.mjs --check         只比對不寫；有任何一篇會變動就 exit 1
   ============================================================ */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { ROOT, listArticles, readText } from "./lib-articles.mjs";

const LIMIT = 3;
// 手寫精選頁：頁面有自己手寫的相關文章區，不套自動互聯（與 verify-interlink.js 的 HAND_CURATED 同一份名單）
const HAND_CURATED = new Set(["articles/own-ai-team-at-work"]);
const START = "<!-- related-static:start";
const END = "<!-- related-static:end -->";
const BLOCK_RE = /<!-- related-static:start[\s\S]*?<!-- related-static:end -->\n?/;
const SCRIPT_LINE_RE = /^[ \t]*<script src="\.\.\/\.\.\/(?:articles-data|related-render)\.js"><\/script>[ \t]*\n/gm;
const COMMENT_LINE_RE = /^[ \t]*<!-- 文章自動互聯（相關文章）[^\n]*-->[ \t]*\n/gm;

const argv = process.argv.slice(2);
const MODE_CHECK = argv.includes("--check");
const onlyArg = argv.find((a) => a.startsWith("--only="));
const ONLY = onlyArg ? new Set(onlyArg.slice(7).split(",").map((s) => s.trim().replace(/\/$/, "").replace(/^(articles|ai-trends)\//, "")).filter(Boolean)) : null;
for (const a of argv) {
  if (a !== "--check" && !a.startsWith("--only=")) { console.error(`未知參數：${a}（可用 --check / --only=<id,...>）`); process.exit(2); }
}

const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
// 與 related-render.js 的 clip 相同（以 JavaScript 字串長度計）
const clip = (s, n) => { s = String(s == null ? "" : s); return s.length > n ? s.slice(0, n - 1) + "…" : s; };

/* ───────── 縮圖登記表：讀 articles-render.js 的 THUMBS 段 ───────── */
function loadThumbs() {
  const src = readText(path.join(ROOT, "articles-render.js"));
  const m = src.match(/\/\/ THUMBS:BEGIN([\s\S]*?)\/\/ THUMBS:END/);
  if (!m) throw new Error("articles-render.js 找不到 THUMBS:BEGIN／THUMBS:END 段");
  const box = {};
  vm.runInNewContext(m[1] + "\n;box.THUMBS = THUMBS;", { box }, { timeout: 2000 });
  if (!box.THUMBS || typeof box.THUMBS !== "object") throw new Error("THUMBS 段解析不出物件");
  return box.THUMBS;
}
const thumbPath = (src) => "images/thumbs/" + src.replace(/^images\//, "").replace(/\.[^.\/]+$/, "") + ".webp";

/* ───────── 候選池（＝articles-data.js 收的那一批，同順序） ───────── */
let all;
try { all = listArticles(); } catch (e) { console.error(`  ${e.message}`); process.exit(2); }
const sortKey = (m) => m.updated || m.date || "";
const pool = all.filter((a) => !a.blocked).map((a) => a.meta)
  .sort((p, q) => sortKey(q).localeCompare(sortKey(p)) || (q.date || "").localeCompare(p.date || "") || String(p.id).localeCompare(String(q.id)));
if (!pool.length) { console.error("  找不到任何 article.json，不能靜默通過"); process.exit(2); }
const byId = new Map(pool.map((a) => [a.id, a]));

let THUMBS;
try { THUMBS = loadThumbs(); } catch (e) { console.error(`  ${e.message}`); process.exit(2); }

const topics = (a) => (a.tags && a.tags.topic) || [];
const overlap = (a, b) => { const tb = topics(b); return topics(a).filter((t) => tb.includes(t)).length; };

function pickRelated(cur) {
  const chosen = [];
  const taken = new Set([cur.id]);
  for (const id of cur.related || []) {
    const a = byId.get(id);
    if (a && !taken.has(id)) { chosen.push(a); taken.add(id); }
  }
  if (chosen.length < LIMIT) {
    const cand = pool.filter((a) => !taken.has(a.id))
      .map((a) => ({ a, score: overlap(cur, a) }))
      .filter((x) => x.score > 0)
      .sort((x, y) => (y.score - x.score) || (y.a.date || "").localeCompare(x.a.date || ""));
    for (const x of cand) { if (chosen.length >= LIMIT) break; chosen.push(x.a); taken.add(x.a.id); }
  }
  return chosen.slice(0, LIMIT);
}

function coverHTML(a) {
  const c = a.cover;
  const src = c && (c.wide || c.tall);
  if (!src) return "";
  const t = THUMBS[src];
  const img = t
    ? `<img src="../../${esc(thumbPath(src))}" width="${t[0]}" height="${t[1]}" alt="" loading="lazy" decoding="async">`
    : `<img src="../../${esc(src)}" alt="" loading="lazy" decoding="async">`;
  return `<span class="relx-cover">${img}</span>`;
}

function cardHTML(a) {
  const type = (a.tags && a.tags.content_type && a.tags.content_type[0]) || "延伸閱讀";
  return `<a class="relx-card" href="../../${esc(a.url)}">` + coverHTML(a) +
    `<small>${esc(type)}</small><b>${esc(a.title)}</b><p>${esc(clip(a.summary || a.problem, 52))}</p></a>`;
}

// 樣式與 related-render.js 的 injectStyle 相同，另加封面兩條
const CSS =
  ".relx-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px;margin-top:24px}" +
  ".relx-card{display:block;background:#fff;border:1px solid var(--line,#d8cdb8);border-radius:10px;padding:20px;text-decoration:none;box-shadow:0 8px 22px rgba(107,74,42,.08);transition:transform .15s,box-shadow .15s;overflow:hidden}" +
  ".relx-card:hover{transform:translateY(-3px);box-shadow:0 14px 30px rgba(107,74,42,.16)}" +
  ".relx-cover{display:block;margin:-20px -20px 14px;aspect-ratio:16/9;overflow:hidden;background:#f3ece0}" +
  ".relx-cover img{display:block;width:100%;height:100%;object-fit:cover;object-position:center top}" +
  ".relx-card small{display:block;color:var(--blue,#5689b8);font:900 12px/1.2 ui-monospace,SFMono-Regular,Menlo,monospace;margin-bottom:9px}" +
  ".relx-card b{display:block;font-size:17px;line-height:1.35;margin-bottom:8px;color:var(--ink,#1a1612)}" +
  ".relx-card p{margin:0;color:#3a342d;line-height:1.55;font-size:15px}" +
  "@media(max-width:820px){.relx-grid{grid-template-columns:1fr}}";

function blockFor(cur) {
  const rel = pickRelated(cur);
  const head = `${START}（scripts/build-related-static.mjs 從 article.json 生成，勿手改；改 related 改 article.json）-->`;
  if (!rel.length) return `${head}\n${END}\n`;
  return [
    head,
    `<style id="relx-style">${CSS}</style>`,
    `<section class="section" id="related-articles"><div class="inner"><h2>相關文章</h2><div class="relx-grid">`,
    ...rel.map(cardHTML),
    `</div></div></section>`,
    END,
    "",
  ].join("\n");
}

let changed = 0, same = 0;
const problems = [];
const skipped = [];
for (const a of all) {
  if (ONLY && !ONLY.has(a.id)) continue;
  if (HAND_CURATED.has(a.rel)) { skipped.push(`${a.rel}（手寫精選頁）`); continue; }
  const html = readText(a.htmlPath);
  const hasBlock = BLOCK_RE.test(html);
  const hasScript = /<script src="\.\.\/\.\.\/related-render\.js"><\/script>/.test(html);
  if (!hasBlock && !hasScript) { skipped.push(`${a.rel}（沒有標記也沒有 related-render.js，不動）`); continue; }
  const block = blockFor(a.meta);
  let out = html;
  if (hasBlock) {
    out = out.replace(BLOCK_RE, block);
  } else {
    const body = out.search(/<body[\s>]/i);
    const re = /<footer[\s>]/gi;
    re.lastIndex = body < 0 ? 0 : body;
    const f = re.exec(out);
    if (!f) { problems.push(`${a.rel}：找不到 <footer，無法決定插入位置`); continue; }
    let at = f.index;
    while (at > 0 && /[ \t]/.test(out[at - 1])) at--;
    out = out.slice(0, at) + block + out.slice(at);
  }
  out = out.replace(COMMENT_LINE_RE, "").replace(SCRIPT_LINE_RE, "");
  if (/<script[^>]*src=["'][^"']*(?:articles-data|related-render)\.js["']/i.test(out)) {
    problems.push(`${a.rel}：還有非標準寫法的 articles-data.js／related-render.js 載入，請人工確認`);
  }
  if (out === html) { same++; continue; }
  changed++;
  if (MODE_CHECK) console.log(`  需要重建：${a.rel}`);
  else fs.writeFileSync(a.htmlPath, out);
}

problems.forEach((p) => console.error(`  ❌ ${p}`));
if (process.env.VERBOSE) skipped.forEach((s) => console.log(`  略過：${s}`));
if (MODE_CHECK) {
  if (changed || problems.length) { console.log(`  ❌ 相關文章預渲染：${changed} 篇需要重建（node scripts/build-related-static.mjs）`); process.exit(1); }
  console.log(`  ✅ 相關文章預渲染已是最新（${same} 篇，略過 ${skipped.length} 篇）`);
} else {
  console.log(`  ✅ 相關文章預渲染：更新 ${changed} 篇、不變 ${same} 篇、略過 ${skipped.length} 篇`);
  if (problems.length) process.exit(1);
}
