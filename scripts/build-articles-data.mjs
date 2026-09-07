#!/usr/bin/env node
/* ============================================================
   build-articles-data.mjs · 深度文章資料源生成器（2026-09-06 立）
   ------------------------------------------------------------
   做什麼：把每篇文章自己資料夾裡的 article.json 合併成瀏覽器用的
           articles-data.js（window.ARTICLE_TAGS ＋ window.ARTICLES）。
   為什麼：articles-data.js 單檔 188KB、每篇文章上線都要 append 一筆，
           是多個 session 並行施工時唯一「每次都撞」的共享熱點
           （2026-09-05 圖譜工程 v2 雙軌分析兩邊各自指出）。
           拆成一篇一檔後，各桌只動自己資料夾；articles-data.js 變成生成檔，
           由 merge-publish 統一重建，兩桌同時上線不再有 both-added 衝突。

   來源（唯一真相）：
     articles/<id>/article.json、ai-trends/<id>/article.json   一篇一檔
     articles-tags.json                                        受控標籤清單
   產出（生成檔，不要手改）：
     articles-data.js   格式刻意與舊手寫版相同（key 不加引號、兩空格縮排、
                        每筆以「\n  }」收尾），因為 check-index-coverage.mjs、
                        build-article-keywords.mjs、preflight.sh 是用 regex 讀它。

   用法：
     node scripts/build-articles-data.mjs           重建（來源有漂移就停，不靜默覆蓋）
     node scripts/build-articles-data.mjs --check   只比對不寫；不一致 exit 1（preflight 用）
     node scripts/build-articles-data.mjs --adopt   把 articles-data.js 裡「來源沒有或不一致」的筆
                                                    回寫成 article.json，再重建（遷移與救援用）
     node scripts/build-articles-data.mjs --force   忽略漂移直接重建（會丟掉手改，慎用）

   漂移＝有人照舊習慣直接改 articles-data.js 而沒動 article.json。
   判定是三方比對（Codex 2026-09-06 跨家審條件）：現有生成檔的一筆，若既不等於來源、
   也不等於「基準版」（git merge-base HEAD origin/main 那個 commit 的 articles-data.js；
   沒有 origin/main 就退 HEAD；不在 git 裡就退兩方比對並印出）才算漂移。
   這樣「分支只改了 article.json、生成檔還是舊的」不會被誤判成手改（那只是過期，重建即可），
   而「分支直接改了生成檔」一定會被抓到（它跟基準版不同、跟來源也不同）。
   預設停下並列出是哪幾筆；要保留手改就 --adopt，確定要丟就 --force。

   排序：依 (updated 或 date) 新到舊 → date 新到舊 → id 字母序。
   這跟 articles-render.js 的顯示排序一致，所以生成檔順序＝總覽頁順序。
   .vercelignore 擋著的文章資料夾（^articles/<id>/$）自動略過並印出，
   對應 preflight 第 10 關「擋板與索引不可矛盾」，從結構上消掉那一類事故。
   ============================================================ */

import fs from "fs";
import path from "path";
import vm from "vm";
import { execSync } from "child_process";
import { fileURLToPath } from "url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT_FILE = path.join(ROOT, "articles-data.js");
const TAGS_FILE = path.join(ROOT, "articles-tags.json");
const SOURCE_ROOTS = ["articles", "ai-trends"];
const SOURCE_NAME = "article.json";
const TAG_DIMS = ["topic", "level", "content_type"];
const KEY_ORDER = ["id", "url", "date", "updated", "featured", "title", "problem", "audience", "summary", "tags", "external", "related"];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const WARNINGS = [];

const args = new Set(process.argv.slice(2));
const MODE_CHECK = args.has("--check");
const MODE_ADOPT = args.has("--adopt");
const MODE_FORCE = args.has("--force");
for (const a of args) {
  if (!["--check", "--adopt", "--force"].includes(a)) {
    console.error(`未知參數：${a}（可用 --check / --adopt / --force）`);
    process.exit(2);
  }
}

const rel = (p) => path.relative(ROOT, p);
const readText = (p) => fs.readFileSync(p, "utf8");

/* ───────────── 讀 .vercelignore 擋著的文章資料夾 ───────────── */
function loadBlockedUrls() {
  const f = path.join(ROOT, ".vercelignore");
  if (!fs.existsSync(f)) return new Set();
  const out = new Set();
  for (const line of readText(f).split("\n")) {
    const m = line.trim().match(/^((?:articles|ai-trends)\/[^/\s]+\/)$/);
    if (m) out.add(m[1]);
  }
  return out;
}

/* ───────────── 讀受控標籤 ───────────── */
function loadTags() {
  if (!fs.existsSync(TAGS_FILE)) return null;
  let tags;
  try {
    tags = JSON.parse(readText(TAGS_FILE));
  } catch (e) {
    fail(`${rel(TAGS_FILE)} 不是合法 JSON：${e.message}`);
  }
  for (const d of TAG_DIMS) {
    if (!Array.isArray(tags[d]) || tags[d].some((x) => typeof x !== "string" || !x)) {
      fail(`${rel(TAGS_FILE)} 的 ${d} 必須是非空字串陣列`);
    }
  }
  // Codex R3 條件 1：拼錯的頂層 key（例如 topics）不能被靜默省略
  for (const k of Object.keys(tags)) {
    if (!TAG_DIMS.includes(k)) fail(`${rel(TAGS_FILE)} 有未知維度「${k}」（只允許 ${TAG_DIMS.join("、")}）`);
  }
  return tags;
}

/* ───────────── 讀一篇一檔 ───────────── */
function loadSources(tags) {
  const entries = [];
  const errors = [];
  for (const root of SOURCE_ROOTS) {
    const dir = path.join(ROOT, root);
    if (!fs.existsSync(dir)) continue;
    for (const d of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!d.isDirectory()) continue;
      const file = path.join(dir, d.name, SOURCE_NAME);
      if (!fs.existsSync(file)) continue;
      let obj;
      try {
        obj = JSON.parse(readText(file));
      } catch (e) {
        errors.push(`${rel(file)}：JSON 解析失敗（${e.message}）`);
        continue;
      }
      const errs = validateEntry(obj, root, d.name, tags);
      for (const x of errs) errors.push(`${rel(file)}：${x}`);
      entries.push({ obj, file, root, dir: d.name });
    }
  }
  // 有頁面卻沒資料（Codex R2 條件 2）：刪了 article.json 或忘了建，文章會無聲掉出索引。
  // 只要 <root>/<id>/index.html 存在、不在 .vercelignore 擋板內、又沒有 article.json，就擋下。
  // 刻意不進索引的頁（手寫精選頁之類）在該資料夾放一個空檔 article.unlisted 明示。
  const blocked = loadBlockedUrls();
  for (const root of SOURCE_ROOTS) {
    const dir = path.join(ROOT, root);
    if (!fs.existsSync(dir)) continue;
    for (const d of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!d.isDirectory()) continue;
      const folder = path.join(dir, d.name);
      if (!fs.existsSync(path.join(folder, "index.html"))) continue;
      if (fs.existsSync(path.join(folder, SOURCE_NAME))) continue;
      if (fs.existsSync(path.join(folder, "article.unlisted"))) continue;
      if (blocked.has(`${root}/${d.name}/`)) continue;
      errors.push(`${root}/${d.name}/：有 index.html 但沒有 ${SOURCE_NAME}（會無聲掉出索引）。要進索引就補 ${SOURCE_NAME}；刻意不進索引就放空檔 article.unlisted；還沒定稿就用 .vercelignore 擋整個資料夾`);
    }
  }
  // 跨檔檢查：id 唯一、related 指向存在的 id
  const ids = new Map();
  for (const e of entries) {
    if (ids.has(e.obj.id)) errors.push(`${rel(e.file)}：id「${e.obj.id}」與 ${rel(ids.get(e.obj.id))} 重複`);
    else ids.set(e.obj.id, e.file);
  }
  for (const e of entries) {
    for (const r of e.obj.related || []) {
      if (!ids.has(r)) errors.push(`${rel(e.file)}：related 指向不存在的 id「${r}」`);
    }
  }
  return { entries, errors };
}

function validateEntry(o, root, dirName, tags) {
  const errs = [];
  if (!o || typeof o !== "object" || Array.isArray(o)) return ["頂層必須是物件"];
  const expectUrl = `${root}/${dirName}/`;
  if (o.id !== dirName) errs.push(`id「${o.id}」必須等於資料夾名「${dirName}」`);
  if (o.url !== expectUrl) errs.push(`url「${o.url}」必須是「${expectUrl}」`);
  for (const k of Object.keys(o)) {
    if (!KEY_ORDER.includes(k)) errs.push(`未知欄位「${k}」（允許：${KEY_ORDER.join("、")}）`);
  }
  for (const k of ["title", "summary"]) {
    if (typeof o[k] !== "string" || !o[k].trim()) errs.push(`${k} 必須是非空字串`);
  }
  for (const k of ["problem", "audience"]) {
    if (k in o && typeof o[k] !== "string") errs.push(`${k} 必須是字串`);
  }
  if (typeof o.date !== "string" || !DATE_RE.test(o.date)) errs.push(`date 必須是 YYYY-MM-DD`);
  if ("updated" in o) {
    if (typeof o.updated !== "string" || !DATE_RE.test(o.updated)) errs.push(`updated 必須是 YYYY-MM-DD`);
    else if (typeof o.date === "string" && o.updated < o.date) errs.push(`updated（${o.updated}）早於 date（${o.date}）`);
  }
  if ("featured" in o && typeof o.featured !== "boolean") errs.push(`featured 必須是 true/false`);
  if (!o.tags || typeof o.tags !== "object") errs.push(`tags 必須是物件`);
  else {
    for (const d of TAG_DIMS) {
      if (!Array.isArray(o.tags[d])) { errs.push(`tags.${d} 必須是陣列`); continue; }
      if (tags) {
        for (const t of o.tags[d]) {
          // 只提醒不擋：遷移時（2026-09-06）既有 17 處 topic 不在受控清單（跨家審稿、系統設計…），
          // 那是內容層要不要擴清單的決定，不該由生成器代拍板。收進 warnings 印出，交人決定。
          if (!tags[d].includes(t)) WARNINGS.push(`${root}/${dirName}/${SOURCE_NAME}：tags.${d} 的「${t}」不在 articles-tags.json 受控清單（總覽頁不會有這個篩選鈕）`);
        }
      }
    }
    for (const k of Object.keys(o.tags)) {
      if (!TAG_DIMS.includes(k)) errs.push(`tags 有未知維度「${k}」`);
    }
  }
  if (!("external" in o) || typeof o.external !== "object" || o.external === null || Array.isArray(o.external)) {
    errs.push(`external 必須是物件（例：{"threads": null, "vocus": null}）`);
  } else {
    for (const [k, v] of Object.entries(o.external)) {
      if (v !== null && typeof v !== "string") errs.push(`external.${k} 必須是字串或 null`);
    }
  }
  if (!Array.isArray(o.related) || o.related.some((x) => typeof x !== "string")) errs.push(`related 必須是字串陣列（可為空）`);
  return errs;
}

/* ───────────── 讀現有 articles-data.js（漂移偵測用） ───────────── */
function loadExisting() {
  if (!fs.existsSync(OUT_FILE)) return { articles: [], tags: null, exists: false };
  const sandbox = { window: {} };
  try {
    vm.runInNewContext(readText(OUT_FILE), sandbox, { filename: "articles-data.js" });
  } catch (e) {
    fail(`現有 articles-data.js 解析失敗：${e.message}`);
  }
  return {
    articles: Array.isArray(sandbox.window.ARTICLES) ? sandbox.window.ARTICLES : [],
    tags: sandbox.window.ARTICLE_TAGS || null,
    exists: true,
  };
}

/* 深度比較（忽略 key 順序） */
function canon(v) {
  if (Array.isArray(v)) return v.map(canon);
  if (v && typeof v === "object") {
    const o = {};
    for (const k of Object.keys(v).sort()) o[k] = canon(v[k]);
    return o;
  }
  return v;
}
const same = (a, b) => JSON.stringify(canon(a)) === JSON.stringify(canon(b));

/* 基準版：分支從 main 分出去那一刻的 articles-data.js（merge-base）。
   在 merge-publish（main 上、squash 之後）跑時 merge-base 就是 main HEAD；
   在工作桌跑時是開桌時的 origin/main。拿不到就退 HEAD；完全不在 git 裡就回 null（兩方比對）。 */
/* 基準版可以不只一個：環境變數 ARTICLES_DATA_BASELINES="<ref> <ref>…" 由呼叫端指定。
   merge-publish 在 squash 之前先算好「main 與分支的分叉點」再加上 main HEAD 一起傳進來
   （Codex R2 條件 1：squash 之後 merge-base HEAD origin/main 已經是 main 自己，不是分叉點；
   main 若在分支分出去之後更新過某篇，收分支版的舊筆會被誤判成手改）。
   沒給環境變數（工作桌本機跑）就用 merge-base HEAD origin/main；刻意不把 HEAD 納入，
   否則分支上已 commit 的手改會被自己的 HEAD 洗白。 */
function loadBaselines() {
  const git = (cmd) => execSync(cmd, { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  let refs = (process.env.ARTICLES_DATA_BASELINES || "").split(/\s+/).filter(Boolean);
  if (!refs.length) {
    try { refs = [git("git merge-base HEAD origin/main")]; } catch { /* 沒 origin/main */ }
  }
  if (!refs.length) { try { refs = [git("git rev-parse HEAD")]; } catch { return { maps: null, tags: [], refs: [] }; } }
  const maps = [];
  const tags = [];
  for (const ref of refs) {
    let code;
    try { code = git(`git show ${ref}:articles-data.js`); } catch { continue; }
    const sandbox = { window: {} };
    try { vm.runInNewContext(code, sandbox, { filename: "articles-data.js@" + ref }); } catch { continue; }
    const list = Array.isArray(sandbox.window.ARTICLES) ? sandbox.window.ARTICLES : [];
    maps.push(new Map(list.map((a) => [a.id, a])));
    if (sandbox.window.ARTICLE_TAGS) tags.push(sandbox.window.ARTICLE_TAGS);
  }
  return { maps, tags, refs };
}

function detectDrift(existing, sourceById, tags) {
  const drift = [];
  const baseline = loadBaselines();
  const threeWay = Array.isArray(baseline.maps);
  if (!threeWay) console.log("▸ 注意：不在 git 裡，漂移偵測退成兩方比對（來源被改過會被誤判成手改）。");
  else if (baseline.refs.length) console.log(`▸ 漂移基準版：${baseline.refs.map((r) => r.slice(0, 12)).join("、")}`);
  const inBaseline = (id, e) => threeWay && baseline.maps.some((m) => m.has(id) && same(e, m.get(id)));
  for (const e of existing.articles) {
    const src = sourceById.get(e.id);
    if (src && same(e, src.obj)) continue;                       // 跟來源一樣：沒事
    if (inBaseline(e.id, e)) continue;                           // 跟任一基準版一樣：只是生成檔過期，重建即可
    if (!src) drift.push({ id: e.id, kind: threeWay ? "來源沒有這筆，且不是基準版帶進來的" : "來源沒有這筆", entry: e });
    else drift.push({ id: e.id, kind: threeWay ? "與來源不一致，也與基準版不同（生成檔被直接改過）" : "與來源不一致", entry: e });
  }
  // 標籤清單同樣三方（Codex R2 條件 3）：等於來源或等於任一基準版都不算漂移
  let tagsDrift = null;
  if (existing.tags) {
    const eqSource = tags && same(existing.tags, tags);
    const eqBase = threeWay && baseline.tags.some((t) => same(existing.tags, t));
    if (!eqSource && !eqBase) tagsDrift = existing.tags;
  }
  return { drift, tagsDrift };
}

/* ───────────── 回寫（--adopt） ───────────── */
function orderKeys(o) {
  const out = {};
  for (const k of KEY_ORDER) if (k in o) out[k] = o[k];
  return out;
}
function writeJson(file, obj) {
  fs.writeFileSync(file, JSON.stringify(obj, null, 2) + "\n");
}
function adopt(driftList, tagsDrift) {
  let n = 0;
  for (const d of driftList) {
    const e = d.entry;
    // Codex 2026-09-06 跨家審條件：回寫前完整驗證，url 必須就是 <root>/<id>/，否則會把別篇的 article.json 蓋掉。
    const m = typeof e.url === "string" ? e.url.match(/^(articles|ai-trends)\/([^/]+)\/$/) : null;
    if (!m) fail(`--adopt：「${d.id}」的 url「${e.url}」不是 articles/<id>/ 或 ai-trends/<id>/ 的形式，拒絕回寫`);
    if (m[2] !== e.id) fail(`--adopt：「${d.id}」的 url「${e.url}」資料夾名與 id 不符，拒絕回寫（避免蓋到別篇）`);
    const errs = validateEntry(e, m[1], m[2], null);
    if (errs.length) fail(`--adopt：「${d.id}」內容未過驗證，拒絕回寫：${errs.join("；")}`);
    const dir = path.join(ROOT, e.url);
    if (!fs.existsSync(dir)) fail(`--adopt：「${d.id}」的資料夾 ${e.url} 不存在，先建資料夾再回寫`);
    const target = path.join(dir, SOURCE_NAME);
    if (fs.existsSync(target)) {
      try {
        const cur = JSON.parse(readText(target));
        if (cur && cur.id !== e.id) fail(`--adopt：${rel(target)} 現在是「${cur.id}」的資料，拒絕用「${e.id}」覆寫`);
      } catch (err) { if (!(err instanceof SyntaxError)) throw err; /* 壞 JSON 允許覆寫修復 */ }
    }
    writeJson(target, orderKeys(e));
    console.log(`  ↳ 回寫 ${e.url}${SOURCE_NAME}（${d.kind}）`);
    n++;
  }
  if (tagsDrift) {
    for (const d of TAG_DIMS) {
      if (!Array.isArray(tagsDrift[d]) || !tagsDrift[d].length || tagsDrift[d].some((x) => typeof x !== "string" || !x)) {
        fail(`--adopt：ARTICLE_TAGS 的 ${d} 不是非空字串陣列，拒絕回寫 ${rel(TAGS_FILE)}`);
      }
    }
    for (const k of Object.keys(tagsDrift)) if (!TAG_DIMS.includes(k)) fail(`--adopt：ARTICLE_TAGS 有未知維度「${k}」，拒絕回寫`);
    writeJson(TAGS_FILE, tagsDrift);
    console.log(`  ↳ 回寫 ${rel(TAGS_FILE)}`);
  }
  return n;
}

/* ───────────── 排序與序列化（格式與舊手寫版相同） ───────────── */
const sortKey = (a) => a.updated || a.date || "";
function sortEntries(list) {
  return list.slice().sort((p, q) =>
    sortKey(q).localeCompare(sortKey(p)) ||
    (q.date || "").localeCompare(p.date || "") ||
    p.id.localeCompare(q.id));
}
const js = (v) => JSON.stringify(v);
const arr = (a) => "[" + a.map(js).join(", ") + "]";

function serializeEntry(o) {
  const lines = ["  {"];
  for (const k of KEY_ORDER) {
    if (!(k in o)) continue;
    const v = o[k];
    if (k === "tags") {
      lines.push("    tags: {");
      const dims = TAG_DIMS.filter((d) => d in v);
      dims.forEach((d, i) => lines.push(`      ${d}: ${arr(v[d])}${i < dims.length - 1 ? "," : ""}`));
      lines.push("    },");
    } else if (k === "external") {
      const parts = Object.keys(v).map((kk) => `${kk}: ${js(v[kk])}`);
      lines.push(`    external: { ${parts.join(", ")} },`);
    } else if (k === "related") {
      lines.push(`    related: ${arr(v)},`);
    } else {
      lines.push(`    ${k}: ${js(v)},`);
    }
  }
  lines[lines.length - 1] = lines[lines.length - 1].replace(/,$/, "");
  lines.push("  }");
  return lines.join("\n");
}

function render(tags, entries) {
  const header = `/* ============================================================
   articles-data.js  ·  深度文章總站資料源（生成檔，不要手改）
   ------------------------------------------------------------
   本檔由 scripts/build-articles-data.mjs 從一篇一檔合併而成：
     來源：articles/<id>/article.json、ai-trends/<id>/article.json
     標籤：articles-tags.json（受控清單，對齊知識庫 tag-dictionary.md）
   新增一篇文章 ＝ 在文章資料夾放 article.json（範本：_templates/article.example.json），
   本機預覽相關文章時跑 node scripts/build-articles-data.mjs；
   上線時 merge-publish 會統一重建本檔，分支不必 commit 它。
   直接改本檔會被 preflight 的 --check 擋下；要保留手改請跑 --adopt 回寫到來源。

   三個篩選維度：topic 主題（D2內容）／level 難度（D3難度等級）／content_type 類型。
   「適合誰」不做篩選（身份會重疊），audience 欄位只寫一句話放卡片。
   related 雙向對稱由 scripts/link-graph.js check 把關。
   順序：依 (updated 或 date) 新到舊，與 articles-render.js 顯示排序一致。
   ============================================================ */

`;
  const tagBlock =
    "window.ARTICLE_TAGS = {\n" +
    TAG_DIMS.map((d, i) => `  ${d}: ${arr(tags[d])}${i < TAG_DIMS.length - 1 ? "," : ""}`).join("\n") +
    "\n};\n\n";
  const body = "window.ARTICLES = [\n" + entries.map(serializeEntry).join(",\n\n") + "\n];\n";
  return header + tagBlock + body;
}

function fail(msg) {
  console.error("❌ build-articles-data：" + msg);
  process.exit(2);
}

/* ───────────── 主流程 ───────────── */
function main() {
  const existing = loadExisting();
  let tags = loadTags();
  let { entries, errors } = loadSources(tags);
  const sourceById = new Map(entries.map((e) => [e.obj.id, e]));

  if (!tags && !existing.tags) fail(`找不到 ${rel(TAGS_FILE)}，也無法從現有 articles-data.js 取得 ARTICLE_TAGS`);

  // 來源本身壞掉（JSON 解析失敗、欄位錯、related 指向不存在的 id）要先報，
  // 否則壞掉的那篇會被漂移偵測誤判成「來源沒有這筆」，把人引導去跑 --adopt。
  if (errors.length) {
    console.error(`❌ 來源檢查未過（${errors.length} 項）：`);
    for (const e of errors) console.error("   - " + e);
    process.exit(2);
  }

  const { drift, tagsDrift } = detectDrift(existing, sourceById, tags);
  if (drift.length || tagsDrift) {
    console.log(`▸ 偵測到 articles-data.js 有 ${drift.length} 筆${tagsDrift ? "＋標籤清單" : ""}與來源不一致：`);
    for (const d of drift.slice(0, 20)) console.log(`   - ${d.id}（${d.kind}）`);
    if (drift.length > 20) console.log(`   … 共 ${drift.length} 筆`);
    if (MODE_ADOPT) {
      const n = adopt(drift, tagsDrift);
      console.log(`▸ --adopt 完成：回寫 ${n} 筆${tagsDrift ? "＋標籤清單" : ""}，重新讀取來源…`);
      tags = loadTags();
      WARNINGS.length = 0;
      ({ entries, errors } = loadSources(tags));
    } else if (MODE_FORCE) {
      console.log("▸ --force：忽略上述漂移，以來源為準重建（手改會被丟掉）。");
    } else {
      console.error("❌ 停下不覆蓋。articles-data.js 是生成檔，請改對應的 article.json。");
      console.error("   要把上述手改保留下來：node scripts/build-articles-data.mjs --adopt");
      console.error("   確定手改可以丟：      node scripts/build-articles-data.mjs --force");
      process.exit(MODE_CHECK ? 1 : 2);
    }
  }

  if (errors.length) {
    console.error(`❌ 來源檢查未過（${errors.length} 項）：`);
    for (const e of errors) console.error("   - " + e);
    process.exit(2);
  }
  if (WARNINGS.length) {
    console.log(`▸ 提醒（不擋）${WARNINGS.length} 項：`);
    for (const w of WARNINGS) console.log("   - " + w);
  }
  if (!tags) fail(`找不到 ${rel(TAGS_FILE)}`);
  if (entries.length === 0) fail("沒有任何 article.json，拒絕產出空清單（避免整站相關文章消失）");

  const blocked = loadBlockedUrls();
  const skipped = entries.filter((e) => blocked.has(e.obj.url)).map((e) => e.obj.id);
  const live = entries.filter((e) => !blocked.has(e.obj.url)).map((e) => e.obj);
  const content = render(tags, sortEntries(live));
  const current = existing.exists ? readText(OUT_FILE) : null;

  if (MODE_CHECK) {
    if (current === content) {
      console.log(`✅ articles-data.js 與來源一致（${live.length} 篇${skipped.length ? `，略過 ${skipped.length} 篇被 .vercelignore 擋著：${skipped.join("、")}` : ""}）`);
      process.exit(0);
    }
    console.error("❌ articles-data.js 與來源不一致（順序、格式或內容），請跑 node scripts/build-articles-data.mjs 重建後一起提交。");
    process.exit(1);
  }

  if (current === content) {
    console.log(`✅ articles-data.js 已是最新（${live.length} 篇${skipped.length ? `，略過 ${skipped.length} 篇：${skipped.join("、")}` : ""}）`);
    return;
  }
  fs.writeFileSync(OUT_FILE, content);
  console.log(`✅ 已重建 articles-data.js：${live.length} 篇${skipped.length ? `，略過 ${skipped.length} 篇被 .vercelignore 擋著：${skipped.join("、")}` : ""}`);
}

main();
