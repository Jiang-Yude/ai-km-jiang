#!/usr/bin/env node
/* ============================================================
   build-article-head.mjs · 文章頁 head 與日期行生成器（2026-10-19 立）
   ------------------------------------------------------------
   立因：文章標題、日期在 article.json、HTML head（title、og、twitter、JSON-LD）、
   頁面可見日期行三處手寫，已實際漂移：81 篇 JSON-LD 缺 datePublished、
   98 篇頁面沒有「發佈｜最後更新」日期行、15 篇 JSON-LD 日期與 article.json 不同、
   14 篇 <title> 與 article.json 不同（2026-10-19 架構盤查與 4O 體檢）。
   做法：article.json 是唯一來源，本支把 head 裡會漂移的欄位冪等地重寫回來。

   只動這些（其餘一個字都不碰，內文與 body 腳本不動）：
     head：<title>、canonical、og:type／title／description／url／image／locale／site_name、
           twitter:card／title／description／image、meta description（只補缺，不覆寫）、
           Article JSON-LD（headline、日期、author、url、image、mainEntityOfPage）、
           BreadcrumbList JSON-LD（沒有就新增在 Article 後面）。
     body：可見日期行（只改日期數字；整頁找不到日期行才在第一個 </h1> 後面插一行）。

   欄位來源：
     標題、網址、日期      → article.json 的 title、url、date、updated（沒寫 updated 就等於 date）
     og／twitter 標題       → 「title｜江江教練」
     description 系列       → article.json 沒有 description 欄位，所以保留各欄位現有的手寫文案
                               （meta、og、twitter、JSON-LD 原本就刻意寫不同長度）；
                               缺的才補：先用 meta description，再不行用 summary 截到 160 字內。
                               若日後 article.json 加了 description 欄位，以它為準覆寫四處。
     og:image               → 現有值若檔案存在就保留；不存在或是相對路徑就依序退到
                               images/og/<id>.jpg、images/articles/<id>-cover.jpg、
                               article.json cover.wide、images/og/home.jpg（只改指向，不產新圖）。
     作者                   → 江昱德／江江教練，職稱統一「隱性知識提煉師、AI 應用規劃師」，url 指首頁。

   冪等：同一份 article.json 跑第二次不會有任何 diff。
   用法：
     node scripts/build-article-head.mjs                 全部文章重寫（有變更才寫檔）
     node scripts/build-article-head.mjs --only=a,b      只處理指定 id（或 articles/<id> 相對路徑）
     node scripts/build-article-head.mjs --check         只比對不寫；有任何一篇會變動就 exit 1
     node scripts/build-article-head.mjs --verbose       印出每篇改了哪些欄位
   ============================================================ */
import fs from "node:fs";
import path from "node:path";
import { ROOT, SITE, listArticles, articleDates, DATE_RE } from "./lib-articles.mjs";

const JOB_TITLE = "隱性知識提煉師、AI 應用規劃師";
const SITE_NAME = "江江教練 · AI 知識管理";
const BRAND = "江江教練";
const FALLBACK_OG = `${SITE}/images/og/home.jpg`;
const SECTION_NAME = { articles: ["文章", "articles.html"], "ai-trends": ["AI 趨勢", "ai-trends.html"] };
const DATE_STYLE = "margin:0 0 18px;font-size:14px;line-height:1.6;color:#6a635a;";

const argv = process.argv.slice(2);
const MODE_CHECK = argv.includes("--check");
const VERBOSE = argv.includes("--verbose");
const onlyArg = argv.find((a) => a.startsWith("--only="));
const ONLY = onlyArg ? new Set(onlyArg.slice(7).split(",").map((s) => s.trim().replace(/\/$/, "")).filter(Boolean)) : null;
for (const a of argv) {
  if (!["--check", "--verbose"].includes(a) && !a.startsWith("--only=")) {
    console.error(`未知參數：${a}（可用 --check / --only=<id,...> / --verbose）`);
    process.exit(2);
  }
}

/* ───────── 小工具 ───────── */
const escAttr = (s) => String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const escText = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const decode = (s) => String(s)
  .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function trimSummary(s, max = 160) {
  const t = String(s || "").trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const i = Math.max(cut.lastIndexOf("。"), cut.lastIndexOf("！"), cut.lastIndexOf("？"));
  return i >= 40 ? cut.slice(0, i + 1) : cut;
}

/* 站內圖片網址 → 本機檔案是否存在；外站網址一律視為存在（不驗） */
function imageExists(url, articleDir) {
  if (!url) return false;
  const clean = url.split(/[?#]/)[0];
  if (clean.startsWith(`${SITE}/`)) return fs.existsSync(path.join(ROOT, decodeURI(clean.slice(SITE.length + 1))));
  if (/^https?:\/\//.test(clean)) return true;
  return false;
}
function absolutize(url, articleDir) {
  if (!url) return null;
  if (/^https?:\/\//.test(url)) return url;
  const abs = path.resolve(articleDir, url.split(/[?#]/)[0]);
  if (!abs.startsWith(ROOT) || !fs.existsSync(abs)) return null;
  return `${SITE}/${path.relative(ROOT, abs).split(path.sep).join("/")}`;
}

/* ───────── meta 標籤：就地取代第一個、移除重複、缺的回傳給呼叫端補 ───────── */
function metaRe(attr, key) {
  return new RegExp(`<meta\\b[^>]*\\b${attr}=["']${escRe(key)}["'][^>]*>`, "gi");
}
const contentOf = (tag) => { const m = tag.match(/\bcontent=(["'])([\s\S]*?)\1/i); return m ? m[2] : null; };

function upsertTag(head, re, newTag, missing) {
  const found = [...head.matchAll(re)];
  if (found.length === 0) { missing.push(newTag); return head; }
  let out = head.slice(0, found[0].index) + newTag + head.slice(found[0].index + found[0][0].length);
  // 重複的同名標籤（例：一頁兩個 canonical，其中一個是相對路徑）移除，連同該行換行
  for (let k = found.length - 1; k >= 1; k--) {
    const shift = newTag.length - found[0][0].length;
    const start = found[k].index + shift;
    let end = start + found[k][0].length;
    let s = start;
    while (s > 0 && /[ \t]/.test(out[s - 1])) s--;
    if (out[end] === "\n") end++;
    out = out.slice(0, s) + out.slice(end);
  }
  return out;
}

/* ───────── JSON-LD ───────── */
const LD_RE = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g;
const typesOf = (o) => [].concat(o && o["@type"] || []);
const isArticleNode = (o) => typesOf(o).some((t) => /^(Article|BlogPosting|NewsArticle|TechArticle)$/.test(t));

function buildArticleNode(old, f) {
  const author = old.author && !Array.isArray(old.author) && (old.author.name === "江昱德" || !old.author.name)
    ? { ...old.author, "@type": "Person", name: "江昱德", alternateName: "江江教練", jobTitle: JOB_TITLE, url: `${SITE}/` }
    : old.author || { "@type": "Person", name: "江昱德", alternateName: "江江教練", jobTitle: JOB_TITLE, url: `${SITE}/` };
  // author 欄位固定順序，避免舊頁 key 順序不同造成不必要 diff 以外的漂移
  const authorOrdered = author && author.name === "江昱德"
    ? { "@type": "Person", name: "江昱德", alternateName: "江江教練", jobTitle: JOB_TITLE, url: `${SITE}/`,
        ...Object.fromEntries(Object.entries(author).filter(([k]) => !["@type", "name", "alternateName", "jobTitle", "url"].includes(k))) }
    : author;
  let image = old.image;
  const imgOk = typeof image === "string" ? imageExists(image) : Array.isArray(image) ? image.length > 0 : !!image;
  if (!imgOk) image = f.ogImage;
  const fixed = {
    "@context": old["@context"] || "https://schema.org",
    "@type": old["@type"] || "Article",
    headline: f.title,
    description: old.description ? old.description : f.descText,
    image,
    author: authorOrdered,
    datePublished: f.date,
    dateModified: f.updated,
    isPartOf: old.isPartOf || { "@type": "WebSite", name: SITE_NAME, url: `${SITE}/` },
    inLanguage: old.inLanguage || "zh-Hant",
    url: f.url,
    mainEntityOfPage: { "@type": "WebPage", "@id": f.url },
  };
  const rest = Object.fromEntries(Object.entries(old).filter(([k]) => !(k in fixed)));
  return { ...fixed, ...rest };
}

function buildBreadcrumb(f) {
  const [secName, secPage] = SECTION_NAME[f.root];
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "首頁", item: `${SITE}/` },
      { "@type": "ListItem", position: 2, name: secName, item: `${SITE}/${secPage}` },
      { "@type": "ListItem", position: 3, name: f.title, item: f.url },
    ],
  };
}

function rewriteJsonLd(head, f, notes) {
  const scripts = [...head.matchAll(LD_RE)];
  let articleEnd = -1;
  let out = head;
  let delta = 0;
  let hasBreadcrumb = false;
  for (const m of scripts) {
    let obj;
    try { obj = JSON.parse(m[1]); } catch (e) { throw new Error(`${f.rel} JSON-LD 解析失敗：${e.message}`); }
    let changed = null;
    if (obj["@graph"]) {
      const g = obj["@graph"].map((n) => (isArticleNode(n) ? buildArticleNode(n, f) : n));
      if (obj["@graph"].some(isArticleNode)) { changed = { ...obj, "@graph": g }; }
      if (obj["@graph"].some((n) => typesOf(n).includes("BreadcrumbList"))) hasBreadcrumb = true;
    } else if (isArticleNode(obj)) {
      changed = buildArticleNode(obj, f);
    } else if (typesOf(obj).includes("BreadcrumbList")) {
      changed = buildBreadcrumb(f);
      hasBreadcrumb = true;
    }
    const start = m.index + delta;
    const end = start + m[0].length;
    if (changed) {
      const tag = `<script type="application/ld+json">${JSON.stringify(changed)}</script>`;
      out = out.slice(0, start) + tag + out.slice(end);
      delta += tag.length - m[0].length;
      if (isArticleNode(changed) || (changed["@graph"] && changed["@graph"].some(isArticleNode))) articleEnd = start + tag.length;
    }
  }
  if (articleEnd < 0) {
    // 沒有 Article JSON-LD：新增一份，放在 head 結尾前
    const tag = `<script type="application/ld+json">${JSON.stringify(buildArticleNode({}, f))}</script>\n`;
    const at = f.headInsertAt(out);
    out = out.slice(0, at) + tag + out.slice(at);
    articleEnd = at + tag.length - 1;
    notes.push("新增 Article JSON-LD");
  }
  if (!hasBreadcrumb) {
    const tag = `\n<script type="application/ld+json">${JSON.stringify(buildBreadcrumb(f))}</script>`;
    out = out.slice(0, articleEnd) + tag + out.slice(articleEnd);
  }
  return out;
}

/* ───────── 可見日期行 ───────── */
const D = "\\d{4}-\\d{2}-\\d{2}";
const PUB_LABEL = "(?:發佈|發布)";
const UPD_LABEL = "(?:最後更新|更新)";
const SEP = "\\s*[：:｜|]?\\s*";
const ELEM_RE = /<(p|div|span|time)\b[^>]*>([\s\S]{0,200}?)<\/\1>/g;
const stripTags = (s) => s.replace(/<[^>]+>/g, "");

function rewriteDateLines(body, f) {
  let sawPub = false, sawUpd = false;
  let firstPubElem = null;
  const pubStart = new RegExp(`^\\s*${PUB_LABEL}${SEP}${D}`);
  const updOnly = new RegExp(`^\\s*${UPD_LABEL}${SEP}${D}\\s*$`);
  let out = body.replace(ELEM_RE, (whole, tagName, inner) => {
    if (/<(p|div|section)\b/i.test(inner)) return whole; // 只吃最內層的短元素
    const text = stripTags(inner);
    if (pubStart.test(text)) {
      sawPub = true;
      let s = inner.replace(new RegExp(`(${PUB_LABEL}${SEP})${D}`), `$1${f.date}`);
      if (new RegExp(`${UPD_LABEL}${SEP}${D}`).test(s)) {
        sawUpd = true;
        s = s.replace(new RegExp(`(${UPD_LABEL}${SEP})${D}`), `$1${f.updated}`);
      }
      const rebuilt = whole.replace(inner, s);
      if (!firstPubElem) firstPubElem = rebuilt;
      return rebuilt;
    }
    if (updOnly.test(text)) {
      sawUpd = true;
      return whole.replace(inner, inner.replace(new RegExp(`(${UPD_LABEL}${SEP})${D}`), `$1${f.updated}`));
    }
    return whole;
  });
  if (sawPub && !sawUpd && firstPubElem) {
    // 只有發佈日的那幾篇：在同一個元素裡補「｜ 最後更新」
    const withUpd = firstPubElem.replace(new RegExp(`(${PUB_LABEL}${SEP}${D})`), `$1 ｜ 最後更新 ${f.updated}`);
    out = out.replace(firstPubElem, withUpd);
  }
  if (!sawPub) {
    const i = out.indexOf("</h1>");
    if (i < 0) throw new Error(`${f.rel} 找不到日期行也找不到 </h1>，無法自動插入，請人工補`);
    const line = `\n    <p class="article-date" style="${DATE_STYLE}">發佈 ${f.date} ｜ 最後更新 ${f.updated}</p>`;
    out = out.slice(0, i + 5) + line + out.slice(i + 5);
  }
  return out;
}

/* ───────── 單篇處理 ───────── */
function processArticle(a) {
  const html = fs.readFileSync(a.htmlPath, "utf8");
  const { date, updated } = articleDates(a.meta);
  if (!DATE_RE.test(date) || !DATE_RE.test(updated)) throw new Error(`${a.rel}/article.json 的 date／updated 不是 YYYY-MM-DD`);
  const title = String(a.meta.title || "").trim();
  if (!title) throw new Error(`${a.rel}/article.json 沒有 title`);
  const url = `${SITE}/${String(a.meta.url || `${a.rel}/`).replace(/^\/+/, "")}`;

  let cut = html.indexOf("</head>");
  if (cut < 0) cut = html.search(/<body\b/i);
  if (cut < 0) throw new Error(`${a.rel} 找不到 </head> 也找不到 <body>`);
  let head = html.slice(0, cut);
  let body = html.slice(cut);
  const notes = [];
  const articleDir = path.dirname(a.htmlPath);

  // description：article.json 有 description 欄位就以它為準；否則沿用現有 meta，缺才用 summary
  const metaDescTag = (head.match(metaRe("name", "description")) || [])[0];
  const jsonDesc = typeof a.meta.description === "string" && a.meta.description.trim() ? a.meta.description.trim() : null;
  const descText = jsonDesc || (metaDescTag && contentOf(metaDescTag) ? decode(contentOf(metaDescTag)) : trimSummary(a.meta.summary));

  // og:image：保留現有可用的，否則依序退
  const ogTag = (head.match(metaRe("property", "og:image")) || [])[0];
  let ogImage = ogTag ? contentOf(ogTag) : null;
  if (ogImage && !/^https?:\/\//.test(ogImage)) ogImage = absolutize(ogImage, articleDir);
  if (!ogImage || !imageExists(ogImage)) {
    const cands = [
      `${SITE}/images/og/${a.id}.jpg`,
      `${SITE}/images/articles/${a.id}-cover.jpg`,
      a.meta.cover && a.meta.cover.wide ? `${SITE}/${a.meta.cover.wide}` : null,
      FALLBACK_OG,
    ].filter(Boolean);
    const pick = cands.find((c) => imageExists(c)) || FALLBACK_OG;
    if (ogTag) notes.push(`og:image 改指 ${pick}（原值 ${contentOf(ogTag)} 不存在或非絕對網址）`);
    ogImage = pick;
  }

  const f = {
    rel: a.rel, root: a.root, id: a.id, title, url, date, updated, descText, ogImage,
    headInsertAt: (h) => { const i = h.search(/<script type="application\/ld\+json">/); return i >= 0 ? i : h.length; },
  };

  const missing = [];
  const descAttr = (tag) => (jsonDesc ? escAttr(jsonDesc) : tag && contentOf(tag) !== null && contentOf(tag).trim() ? contentOf(tag) : escAttr(descText));

  // title
  if (/<title>[\s\S]*?<\/title>/.test(head)) head = head.replace(/<title>[\s\S]*?<\/title>/, `<title>${escText(title)}</title>`);
  else { head = head.replace(/(<meta name="viewport"[^>]*>)/, `$1\n<title>${escText(title)}</title>`); notes.push("補 <title>"); }

  // description（只補缺；article.json 有 description 才覆寫）
  head = upsertTag(head, metaRe("name", "description"), `<meta name="description" content="${descAttr(metaDescTag)}">`, missing);
  head = upsertTag(head, /<link\b[^>]*\brel=["']canonical["'][^>]*>/gi, `<link rel="canonical" href="${url}">`, missing);

  const og = [
    ["og:type", "article"],
    ["og:title", escAttr(`${title}｜${BRAND}`)],
    ["og:description", null],
    ["og:url", url],
    ["og:image", escAttr(ogImage)],
    ["og:locale", "zh_TW"],
    ["og:site_name", escAttr(SITE_NAME)],
  ];
  for (const [k, v] of og) {
    const re = metaRe("property", k);
    const val = v === null ? descAttr((head.match(re) || [])[0]) : v;
    head = upsertTag(head, re, `<meta property="${k}" content="${val}">`, missing);
  }
  const tw = [
    ["twitter:card", "summary_large_image"],
    ["twitter:title", escAttr(`${title}｜${BRAND}`)],
    ["twitter:description", null],
    ["twitter:image", escAttr(ogImage)],
  ];
  for (const [k, v] of tw) {
    const re = metaRe("name", k);
    const val = v === null ? descAttr((head.match(re) || [])[0]) : v;
    head = upsertTag(head, re, `<meta name="${k}" content="${val}">`, missing);
  }
  if (missing.length) {
    const at = f.headInsertAt(head);
    head = head.slice(0, at) + missing.join("\n") + "\n" + head.slice(at);
    notes.push(`補 ${missing.length} 個缺的 meta`);
  }

  head = rewriteJsonLd(head, f, notes);
  body = rewriteDateLines(body, f);

  const next = head + body;
  return { changed: next !== html, next, notes };
}

/* ───────── 主流程 ───────── */
let all;
try { all = listArticles(); } catch (e) { console.error(`  ${e.message}`); process.exit(2); }
const targets = ONLY ? all.filter((a) => ONLY.has(a.id) || ONLY.has(a.rel)) : all;
if (ONLY && targets.length !== ONLY.size) {
  const got = new Set(targets.flatMap((a) => [a.id, a.rel]));
  console.error(`  --only 指定的文章找不到：${[...ONLY].filter((x) => !got.has(x)).join("、")}`);
  process.exit(2);
}
if (targets.length === 0) { console.error("  找不到任何文章，不能靜默通過"); process.exit(2); }

const changedList = [];
let errors = 0;
for (const a of targets) {
  let r;
  try { r = processArticle(a); } catch (e) { console.error(`  ❌ ${e.message}`); errors++; continue; }
  if (!r.changed) continue;
  changedList.push(a.rel);
  if (VERBOSE || MODE_CHECK) console.log(`  ${MODE_CHECK ? "需重建" : "已重寫"}：${a.rel}${r.notes.length ? `（${r.notes.join("；")}）` : ""}`);
  if (!MODE_CHECK) fs.writeFileSync(a.htmlPath, r.next);
}
if (errors) { console.error(`  ❌ ${errors} 篇無法處理（見上方），其餘照常`); }
if (changedList.length === 0) {
  console.log(`  ✅ 文章 head 與日期行已與 article.json 一致（${targets.length} 篇）`);
  process.exit(errors ? 1 : 0);
}
if (MODE_CHECK) {
  console.log(`  --check：${changedList.length} 篇的 head 或日期行與 article.json 不一致，跑 node scripts/build-article-head.mjs 重建`);
  process.exit(1);
}
console.log(`  ✅ 已重寫 ${changedList.length}／${targets.length} 篇文章的 head 與日期行`);
process.exit(errors ? 1 : 0);
