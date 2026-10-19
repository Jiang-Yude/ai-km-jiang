#!/usr/bin/env node
/* ============================================================
   build-course-jsonld.mjs · 課程頁 Course JSON-LD 生成器（2026-10-19 立）
   ------------------------------------------------------------
   立因：SEO＋GEO SOP 階段三要求每堂課獨立網址都有 Course schema，2026-10-19 4O 體檢時
   可索引課程頁只有 8 頁有。課程資料早就集中在 courses-data.js（window.COURSES），
   所以這支從那裡生成，不另外手寫。

   做什麼：
     對 courses-data.js 每一筆 detail_url 指向站內 courses/ 頁的課程：
       該頁存在、沒有 noindex、而且頁面上「沒有手寫的 Course JSON-LD」→ 在 </head> 前插入（或重寫）
       <script type="application/ld+json" id="course-jsonld">…</script>
     已經有手寫 Course JSON-LD（頂層或 @graph 裡的 Course 節點）的頁不動（不覆寫人工版本；缺欄位的另外列提醒）。
     只在 isPartOf 之類巢狀欄位裡提到 Course 的不算（例：講座頁是 LearningResource、isPartOf 一個「免費線上講座」
     Course，4O 體檢把它算成「有 Course 但缺 description、provider」），這種頁會補一份頂層 Course。
     同一頁對到多筆課程（例：同一套課開兩場）→ 一份 Course、多個 CourseInstance。
   欄位：name＝title、description＝summary、provider＝江昱德、instructor＝host（江江以外的講師照字串列名）、
         image＝課程封面、hasCourseInstance（courseMode、startDate，有 time 就帶時區 +08:00）、url＝canonical。
   用法：
     node scripts/build-course-jsonld.mjs           重建（有變更才寫）
     node scripts/build-course-jsonld.mjs --check   只比對不寫；會變動就 exit 1
   ============================================================ */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { ROOT, SITE, readText, isNoindex } from "./lib-articles.mjs";

const MODE_CHECK = process.argv.includes("--check");
for (const a of process.argv.slice(2)) if (a !== "--check") { console.error(`未知參數：${a}（可用 --check）`); process.exit(2); }

const win = {};
try { vm.runInNewContext(readText(path.join(ROOT, "courses-data.js")), { window: win }, { timeout: 2000 }); } catch (e) {
  console.error(`  courses-data.js 解析失敗：${e.message}`); process.exit(2);
}
if (!Array.isArray(win.COURSES) || win.COURSES.length === 0) { console.error("  courses-data.js 沒有 window.COURSES，不能靜默通過"); process.exit(2); }

const PROVIDER = { "@type": "Person", name: "江昱德", alternateName: "江江教練", url: `${SITE}/` };
const MODE = { online: "online", physical: "onsite", hybrid: "blended" };
const GEN_RE = /\n?<script type="application\/ld\+json" id="course-jsonld">[\s\S]*?<\/script>/;

// 課後簡報鎖定頁（cloudflare/legacy-decks.json 有雜湊鎖，改動會觸發重審），生成器一律跳過
const LEGACY_DECKS = new Set(Object.keys(JSON.parse(readText(path.join(ROOT, "cloudflare/legacy-decks.json")))));
function localFile(detailUrl) {
  if (!detailUrl) return null;
  let u = String(detailUrl).replace(/^https?:\/\/jiangyude\.com\//, "");
  if (/^[a-z]+:/i.test(u) || !u.startsWith("courses/")) return null;
  u = u.split(/[?#]/)[0];
  const rel = u.endsWith("/") ? `${u}index.html` : u;
  if (LEGACY_DECKS.has(rel)) return null;
  return { rel, url: `${SITE}/${u}` };
}
function instructors(host) {
  const parts = String(host || "").split(/[·×、,，]/).map((s) => s.trim()).filter(Boolean);
  return parts.map((p) => (/江江|江昱德/.test(p) ? { "@type": "Person", name: "江昱德", alternateName: "江江教練", url: `${SITE}/` } : { "@type": "Person", name: p }));
}
function instance(c) {
  const inst = { "@type": "CourseInstance" };
  if (MODE[c.venue_mode]) inst.courseMode = MODE[c.venue_mode];
  if (c.date) inst.startDate = c.time ? `${c.date}T${c.time}:00+08:00` : c.date;
  if (c.date && !c.date_label) inst.endDate = c.date;
  inst.instructor = instructors(c.host);
  return inst;
}
const hasHandCourse = (html) => {
  const stripped = html.replace(GEN_RE, "");
  for (const m of stripped.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)) {
    try { const o = JSON.parse(m[1]); for (const n of o["@graph"] || [o]) if ([].concat(n["@type"]).includes("Course")) return n; } catch {}
  }
  return null;
};

/* 依頁面分組 */
const byPage = new Map();
for (const c of win.COURSES) {
  const f = localFile(c.detail_url);
  if (!f) continue;
  if (!byPage.has(f.rel)) byPage.set(f.rel, { ...f, courses: [] });
  byPage.get(f.rel).courses.push(c);
}

const changed = [], skippedHand = [], skippedNoindex = [], missingFile = [], handGaps = [];
for (const page of byPage.values()) {
  const abs = path.join(ROOT, page.rel);
  if (!fs.existsSync(abs)) { missingFile.push(page.rel); continue; }
  const html = readText(abs);
  if (isNoindex(html)) { skippedNoindex.push(page.rel); continue; }
  const hand = hasHandCourse(html);
  if (hand) {
    skippedHand.push(page.rel);
    const gaps = ["description", "provider"].filter((k) => !hand[k]);
    if (gaps.length) handGaps.push(`${page.rel}（手寫版缺 ${gaps.join("、")}）`);
    continue;
  }
  // 依日期排，最早的那筆當課程主體
  const cs = [...page.courses].sort((a, b) => String(a.date || "").localeCompare(String(b.date || "")));
  const main = cs[0];
  const node = {
    "@context": "https://schema.org",
    "@type": "Course",
    name: main.title,
    description: main.summary || main.title,
    provider: PROVIDER,
    inLanguage: "zh-Hant",
    ...(main.image && fs.existsSync(path.join(ROOT, main.image)) ? { image: `${SITE}/${main.image}` } : {}),
    hasCourseInstance: cs.length === 1 ? instance(main) : cs.map(instance),
    url: page.url,
  };
  const tag = `<script type="application/ld+json" id="course-jsonld">${JSON.stringify(node)}</script>`;
  let next;
  if (GEN_RE.test(html)) next = html.replace(GEN_RE, `\n${tag}`);
  else {
    const at = html.indexOf("</head>");
    if (at < 0) { console.error(`  ${page.rel} 沒有 </head>，不插入`); continue; }
    next = `${html.slice(0, at)}${tag}\n${html.slice(at)}`;
  }
  if (next !== html) {
    changed.push(page.rel);
    if (!MODE_CHECK) fs.writeFileSync(abs, next);
  }
}

if (missingFile.length) console.log(`  ⚠️ courses-data.js 指到的頁不存在：${missingFile.join("、")}`);
if (handGaps.length) console.log(`  ⚠️ 手寫 Course JSON-LD 欄位不齊（本支不覆寫人工版本，請人工補）：${handGaps.join("、")}`);
const summary = `生成 ${byPage.size - skippedHand.length - skippedNoindex.length - missingFile.length} 頁、手寫保留 ${skippedHand.length} 頁、noindex 略過 ${skippedNoindex.length} 頁`;
if (!changed.length) { console.log(`  ✅ 課程頁 Course JSON-LD 已是最新（${summary}）`); process.exit(0); }
if (MODE_CHECK) { console.log(`  --check：${changed.join("、")} 的 Course JSON-LD 需要重建，跑 node scripts/build-course-jsonld.mjs`); process.exit(1); }
console.log(`  ✅ 已寫入 Course JSON-LD：${changed.join("、")}（${summary}）`);
