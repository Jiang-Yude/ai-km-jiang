#!/usr/bin/env node
/* ============================================================
   build-site-index.mjs · 產生全站統一索引 site-index.json
   ------------------------------------------------------------
   來源（自動彙整，不手改結果檔）：
     1. articles-data.js       → type: "article"
     2. courses-data.js        → type: "course"
     3. skills.html            → type: "skill"（解析 51 張 skill-card）
     4. site-manual-entries.json → type: page / case / resource / tool（人工維護，原樣併入）
     5. offers.json            → type: "offer"（服務方案 SSOT，人工維護，原樣併入）

   用法（在 repo 根目錄跑）：
     node scripts/build-site-index.mjs

   輸出：覆寫 site-index.json。手改該檔無效，重跑本腳本會覆蓋。
   零依賴，純 Node（用內建 vm 模組載入瀏覽器全域賦值檔）。
   ============================================================ */
"use strict";

import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");

function read(file) {
  return fs.readFileSync(file, "utf8");
}

function todayTaipei() {
  // 環境未必是台灣時區，手算 UTC+8 的日期字串 YYYY-MM-DD
  const now = new Date();
  const utc = now.getTime() + now.getTimezoneOffset() * 60000;
  const tw = new Date(utc + 8 * 3600000);
  const y = tw.getFullYear();
  const m = String(tw.getMonth() + 1).padStart(2, "0");
  const d = String(tw.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function loadBrowserGlobal(file, globalName) {
  const code = read(path.join(ROOT, file));
  const sandbox = { window: {} };
  vm.runInNewContext(code, sandbox, { filename: file });
  return sandbox.window[globalName];
}

/* ───────────── 1. 文章 ───────────── */
function buildArticleItems() {
  const articles = loadBrowserGlobal("articles-data.js", "ARTICLES");
  if (!Array.isArray(articles) || articles.length === 0) {
    console.error("articles-data.js 沒有有效的 window.ARTICLES，中止。");
    process.exit(2);
  }
  return articles.map((a) => {
    const url = a.url ? (a.url.startsWith("/") ? a.url : "/" + a.url) : "";
    return {
      id: "article-" + a.id,
      type: "article",
      title: a.title || "",
      url,
      date: a.date || null,
      updated: a.updated || null,
      summary: a.summary || "",
      problem: a.problem || "",
      audience: a.audience || "",
      tags: a.tags || { topic: [], level: [], content_type: [] },
    };
  });
}

/* ───────────── 2. 課程 ───────────── */
function buildCourseItems() {
  const courses = loadBrowserGlobal("courses-data.js", "COURSES");
  if (!Array.isArray(courses)) {
    console.error("courses-data.js 沒有有效的 window.COURSES，中止。");
    process.exit(2);
  }
  return courses.map((c) => {
    /* 網址優先序（2026-08-12 修）：detail_url → materials 的第一個連結 → 課程總表。
       立因：8/2 與 8/4 兩場的課堂簡報明明存在，網址就寫在 materials 的「上課簡報 ↗」裡，
       courses.html 也照常顯示得出來，但本腳本只讀 detail_url，於是索引把它們記成
       /courses.html（課程總表）。人看得到、索引看不到，咪卡照索引回答就只能給總表連結。 */
    const firstMaterial = Array.isArray(c.materials) && c.materials.length ? c.materials[0].url : "";
    const url = c.detail_url || firstMaterial || "/courses.html";
    const normalizedUrl = url.startsWith("http") || url.startsWith("/") ? url : "/" + url;
    return {
      id: "course-" + c.id,
      type: "course",
      title: c.title || "",
      url: normalizedUrl,
      date: c.date || null,
      updated: null,
      summary: c.summary || "",
      problem: "",
      audience: c.host ? `講師：${c.host}` : "",
      tags: {
        topic: Array.isArray(c.tags) ? c.tags : [],
        level: [],
        content_type: c.type_label ? [c.type_label] : [],
      },
    };
  });
}

/* ───────────── 3. Skills（解析 skills.html） ───────────── */
const SKILL_TAG_TOPIC_MAP = {
  evaluation: "評估篩選",
  distill: "知識提煉",
  content: "內容創作",
  transcript: "逐字稿",
  consulting: "顧問思考",
  business: "商業策略",
  persona: "AI 顧問人格",
  tools: "工具整合",
  experience: "體驗包",
  bundle: "整套內含",
  external: "好物分享",
};
const SKILL_FLAG_TAGS = new Set(["mit", "bilingual", "zh", "en"]);

function buildSkillItems() {
  const html = read(path.join(ROOT, "skills.html"));
  const cardRe = /<article class="skill-card"([^>]*)>([\s\S]*?)<\/article>/g;
  const items = [];
  let m;
  while ((m = cardRe.exec(html)) !== null) {
    const attrs = m[1];
    const body = m[2];

    const dataTagsMatch = attrs.match(/data-tags="([^"]*)"/);
    const rawTags = dataTagsMatch ? dataTagsMatch[1].trim().split(/\s+/).filter(Boolean) : [];

    const topicTags = [];
    const flags = [];
    rawTags.forEach((t) => {
      if (SKILL_FLAG_TAGS.has(t)) {
        flags.push(t);
      } else if (SKILL_TAG_TOPIC_MAP[t]) {
        topicTags.push(SKILL_TAG_TOPIC_MAP[t]);
      }
    });

    const idMatch = body.match(/<div class="skill-id">([^<]*)<\/div>/);
    const skillId = idMatch ? idMatch[1].trim() : null;

    const h3Match = body.match(/<h3>([\s\S]*?)<\/h3>/);
    const title = h3Match ? h3Match[1].replace(/\s+/g, " ").trim() : "";

    const pMatch = body.match(/<p>([\s\S]*?)<\/p>/);
    const summary = pMatch ? pMatch[1].replace(/\s+/g, " ").trim() : "";

    // 優先抓第一個 GitHub 連結；沒有就退而求其次抓第一個 skill-btn-primary 連結
    // （部分卡片主連結是官網或站內文章，例：open-slide.dev、concise-reviewer）；
    // 兩者都沒有（籌備中／規劃中的卡片沒有 skill-actions）就退到站內錨點。
    const githubMatch = body.match(/href="(https:\/\/github\.com[^"]*)"/);
    const primaryMatch = body.match(/class="skill-btn-primary"[^>]*href="([^"]*)"/);
    const url = githubMatch ? githubMatch[1] : primaryMatch ? primaryMatch[1] : `/skills.html#${skillId}`;

    if (!skillId) {
      console.warn("WARN 跳過一張沒有 skill-id 的 skill-card（title：" + title + "）");
      continue;
    }

    items.push({
      id: "skill-" + skillId,
      type: "skill",
      title,
      url,
      date: null,
      updated: null,
      summary,
      problem: "",
      audience: "",
      tags: { topic: topicTags, level: [], content_type: [] },
      flags,
    });
  }
  return items;
}

/* ───────────── 4. 人工維護區（page/case/resource/tool） ───────────── */
function buildManualItems() {
  const raw = JSON.parse(read(path.join(ROOT, "site-manual-entries.json")));
  // 原始 id（如 course-2026-05-05-mvp-validation、skill-html-quick-editor）是舊 site-index.json
  // 的歷史命名，會跟自動生成的 course-*／skill-* id 撞號；索引項 id 前面補 "manual-" 區隔，
  // 不改 site-manual-entries.json 本身保留的原始 id 字串。
  return (raw.items || []).map((i) => ({
    id: "manual-" + i.id,
    type: i.type,
    title: i.title || "",
    url: i.url || "",
    date: i.date || null,
    updated: i.updated || null,
    summary: i.summary || "",
    problem: i.problem || "",
    audience: i.audience || "",
    tags: i.tags || { topic: [], level: [], content_type: [] },
  }));
}

/* ───────────── 5. 服務方案（offers.json SSOT） ───────────── */
function buildOfferItems() {
  const raw = JSON.parse(read(path.join(ROOT, "offers.json")));
  return (raw.offers || []).map((o) => {
    // 價格摘要：優先 price_note；無則從 price / price_range 組
    let priceStr = o.price_note || "";
    if (!priceStr) {
      if (typeof o.price === "number") priceStr = o.price === 0 ? "免費" : `${o.price} ${raw.currency || "TWD"}`;
      else if (Array.isArray(o.price_range)) priceStr = `${o.price_range[0]}–${o.price_range[1]} ${raw.currency || "TWD"}`;
    }
    const summary = priceStr ? `${o.summary}（${priceStr}）` : o.summary || "";
    return {
      id: "offer-" + o.id,
      type: "offer",
      title: o.title || "",
      url: o.source_url || raw.source_page || "/offers.html",
      date: null,
      updated: raw.updated || null,
      summary,
      problem: "",
      audience: o.level || "",
      tags: {
        topic: o.type ? [o.type] : [],
        level: o.level ? [o.level] : [],
        content_type: ["服務方案"],
      },
    };
  });
}

/* ───────────── 5. 檢查與彙整 ───────────── */
function checkUniqueIds(items) {
  const seen = new Map();
  const dupes = [];
  items.forEach((it) => {
    if (seen.has(it.id)) dupes.push(it.id);
    seen.set(it.id, (seen.get(it.id) || 0) + 1);
  });
  if (dupes.length) {
    console.error("id 不唯一：" + [...new Set(dupes)].join("、"));
    process.exit(2);
  }
}

function checkNonEmptyUrl(items) {
  const bad = items.filter((it) => !it.url);
  if (bad.length) {
    console.error("以下項目 url 為空：" + bad.map((b) => b.id).join("、"));
    process.exit(2);
  }
}

function loadVocabNames() {
  const raw = JSON.parse(read(path.join(ROOT, "vocab-public.json")));
  return new Set((raw.vocab || []).map((v) => v.name));
}

/* 網站層級的策展標籤：不屬於知識庫受控詞彙，故不進 vocab-public.json
   （該檔是 tag-dictionary.md 的唯讀衍生檔，不可手改）。
   這類標籤只用於官網文章總站的篩選與排序，新增前先確認它是策展用途、不是知識概念。 */
const CURATION_TAGS = new Set(["江江精選"]);

function checkVocab(items, vocabNames) {
  const warnings = [];
  items.forEach((it) => {
    if (it.type !== "article") return;
    const t = it.tags || {};
    ["topic", "level"].forEach((dim) => {
      (t[dim] || []).forEach((val) => {
        if (CURATION_TAGS.has(val)) return;
        if (!vocabNames.has(val)) {
          warnings.push(`WARN [${it.id}] tags.${dim} 的值「${val}」不在 vocab-public.json`);
        }
      });
    });
  });
  return warnings;
}

function collectTagDimensions(items) {
  const dims = { topic: new Set(), level: new Set(), content_type: new Set() };
  items.forEach((it) => {
    const t = it.tags || {};
    ["topic", "level", "content_type"].forEach((dim) => {
      (t[dim] || []).forEach((v) => dims[dim].add(v));
    });
  });
  return {
    topic: [...dims.topic].sort(),
    level: [...dims.level].sort(),
    content_type: [...dims.content_type].sort(),
  };
}

/* ───────────── 5.5 noindex 旗標（2026-08-12 加） ─────────────
   立因：咪卡客服改吃 site-index.json 之後，索引裡的每一筆都可能被它主動推給訪客。
   但站上有少數頁面是刻意 noindex 的（專場課堂簡報，內含學員與孩子的現場作品），
   狀態是「不進搜尋引擎，知道網址才打得開」。這類頁面進得了索引（站內搜尋要找得到），
   但不該由客服對外主動發連結。
   作法：掃該筆對應的本機 HTML，meta robots 含 noindex 就標 noindex: true。
   誰用：api/mika-chat.js 建目錄時跳過這些筆。search.js 不看這個旗標，站內搜尋照舊找得到。 */
function resolveLocalFile(url) {
  if (!url || /^https?:\/\//i.test(url)) return null;      // 外站連結不掃
  const clean = url.split(/[?#]/)[0].replace(/^\/+/, "");  // 去掉錨點與開頭斜線
  if (!clean) return null;
  const candidates = clean.endsWith("/") || !path.extname(clean)
    ? [path.join(clean, "index.html"), clean + ".html"]
    : [clean];
  for (const c of candidates) {
    const full = path.join(ROOT, c);
    if (fs.existsSync(full) && fs.statSync(full).isFile()) return full;
  }
  return null;
}

function markNoindex(items) {
  const hit = [];
  items.forEach((it) => {
    const file = resolveLocalFile(it.url);
    if (!file) return;
    // 只看檔頭：meta robots 一定在 <head>，全檔掃會誤中內文提到 noindex 的文章
    const head = read(file).slice(0, 6000);
    const meta = head.match(/<meta[^>]+name=["']robots["'][^>]*>/i);
    if (meta && /noindex/i.test(meta[0])) {
      it.noindex = true;
      hit.push(`${it.type}｜${it.title}`);
    }
  });
  return hit;
}

/* ───────────── 進入點 ───────────── */
function main() {
  const oldIndex = JSON.parse(read(path.join(ROOT, "site-index.json")));

  const articleItems = buildArticleItems();
  const courseItems = buildCourseItems();
  const skillItems = buildSkillItems();
  const manualItems = buildManualItems();
  const offerItems = buildOfferItems();

  const items = [...articleItems, ...courseItems, ...skillItems, ...manualItems, ...offerItems];

  checkUniqueIds(items);
  checkNonEmptyUrl(items);

  const noindexHits = markNoindex(items);

  const vocabNames = loadVocabNames();
  const warnings = checkVocab(items, vocabNames);

  // site.base_url 以 profile.json 為準（該檔自稱 SSOT，2026-07-29 前是空頭支票：本腳本從未讀它，
  // site 區塊是 oldIndex 自我延續，導致「改 profile 再重跑」完全沒效果，換網域時踩過）。
  // name 與 summary 目前仍沿用舊檔，因為 profile.json 沒有語意對等的欄位（positioning 是定位句不是站台簡介），
  // 硬綁會讓兩邊互相遷就。要收斂的話得先在 profile.json 新增 site_name／site_summary 欄位，屬另一個決策。
  const profile = JSON.parse(read(path.join(ROOT, "profile.json")));
  if (!profile.site) {
    console.error("❌ profile.json 缺 site 欄位（site-index 的 base_url 來源）");
    process.exit(1);
  }
  const output = {
    version: "2.0",
    updated: todayTaipei(),
    generated_by: "scripts/build-site-index.mjs（items／tag_dimensions 重跑會覆蓋、手改無效；site.base_url 取自 profile.json；site.name 與 site.summary 沿用舊檔，手改才會生效）",
    site: { ...oldIndex.site, base_url: profile.site },
    tag_dimensions: collectTagDimensions(items),
    items,
  };

  fs.writeFileSync(path.join(ROOT, "site-index.json"), JSON.stringify(output, null, 2) + "\n");

  // 統計
  const byType = {};
  items.forEach((it) => (byType[it.type] = (byType[it.type] || 0) + 1));
  console.log("───────── site-index.json 產生完成 ─────────");
  Object.keys(byType)
    .sort()
    .forEach((t) => console.log(`  ${t}: ${byType[t]} 筆`));
  console.log(`  合計: ${items.length} 筆`);
  console.log("");
  if (noindexHits.length) {
    console.log(`───────── noindex（${noindexHits.length} 筆，站內搜尋找得到，咪卡不主動推） ─────────`);
    noindexHits.forEach((h) => console.log("  " + h));
    console.log("");
  }
  if (warnings.length) {
    console.log("───────── WARN 清單（不在 vocab-public.json，不擋） ─────────");
    warnings.forEach((w) => console.log(w));
  } else {
    console.log("✅ 所有文章 topic/level 標籤皆在 vocab-public.json 內。");
  }
}

main();
