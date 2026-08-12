/* 索引覆蓋率閘門：擋「內容上線了但詞沒進索引」。

   立因（2026-08-12 江江實測）：問咪卡「角色定妝照、三視圖」查不到。
   追查後發現不是檢索技術問題，是那篇文章上線當輪沒補別名庫。
   8/11 加的 preflight 只重跑 article-keywords.js，擋得住「自動抽詞檔沒同步」，
   擋不住「人工別名沒補」與「改標題把詞洗掉」。這支補的就是那兩個洞。

   盤點證據：全站 37 篇改過標題，其中 16 篇有詞掉出索引而內文仍在用。

   兩關：
   ① 新文章沒有人工別名 → 擋。至少兩個，且不能只是照抄標題。
   ② 改標題、problem、summary 時被移除的詞，若該篇內文還在用而索引已無 → 擋。
      三種處理方式都算過關：補進 search-aliases.js、寫進 ignore 檔並附理由、
      在 ignore 檔標記為敏感或過期。不強迫一定要補回（詞可能是錯字、過時名稱或隱私詞）。

   用法：node scripts/check-index-coverage.mjs
   通過 exit 0；有問題列出後 exit 1。
   ignore 檔：index-coverage-ignore.json，格式 { "slug": { "詞": "為什麼不補" } } */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const ROOT = path.resolve(import.meta.dirname, '..');
const IGNORE_FILE = path.join(ROOT, 'index-coverage-ignore.json');
const MIN_ALIASES = 2;

const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

function parseArticles(src) {
  const out = {};
  for (const m of src.matchAll(/id:\s*"([^"]+)"([\s\S]*?)\n  \}/g)) {
    const body = m[2];
    const g = (f) => {
      const x = body.match(new RegExp('\\b' + f + ':\\s*"((?:[^"\\\\]|\\\\.)*)"'));
      return x ? x[1] : '';
    };
    out[m[1]] = { title: g('title'), problem: g('problem'), summary: g('summary') };
  }
  return out;
}

function parseAliases(src) {
  const out = {};
  for (const m of src.matchAll(/"([a-z0-9-]+)":\s*\[([\s\S]*?)\]/g)) {
    out[m[1]] = [...m[2].matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((x) => x[1]);
  }
  return out;
}

/* 上一版（HEAD）的 articles-data.js。第一次 commit 或檔案不存在時回空物件，不擋。 */
function headArticles() {
  try {
    return parseArticles(execSync('git show HEAD:articles-data.js', { cwd: ROOT, encoding: 'utf8' }));
  } catch {
    return {};
  }
}

function bodyText(slug) {
  const f = path.join(ROOT, 'articles', slug, 'index.html');
  if (!fs.existsSync(f)) return '';
  return fs.readFileSync(f, 'utf8')
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ');
}

/* 舊欄位裡有、新索引已經看不到、而內文還在用的中文片段。

   從左到右貪婪取最長，取到就跳過整段。用集合去重會報出「我為什麼把它拆成、為什麼把它拆成兩、
   什麼把它拆成兩個」這種同一句的滑動切片，人看了不知道到底漏了什麼（2026-08-12 反例測試抓到）。 */
function lostTerms(oldText, visible, body) {
  const MAXLEN = 12;
  const hits = (g) => (body.match(new RegExp(g.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
  const kept = [];
  for (const run of oldText.match(/[一-鿿]{3,}/g) || []) {
    let i = 0;
    while (i <= run.length - 3) {
      let found = null;
      for (let size = Math.min(MAXLEN, run.length - i); size >= 3; size--) {
        const g = run.slice(i, i + size);
        if (!visible.includes(g) && hits(g) >= 2) { found = g; break; }
      }
      if (found) { kept.push(found); i += found.length; } else i++;
    }
  }
  return [...new Set(kept)];
}

const cur = parseArticles(read('articles-data.js'));
const prev = headArticles();
const aliases = parseAliases(read('search-aliases.js'));
const ignore = fs.existsSync(IGNORE_FILE) ? JSON.parse(fs.readFileSync(IGNORE_FILE, 'utf8')) : {};

const problems = [];

for (const [slug, a] of Object.entries(cur)) {
  const al = aliases[slug] || [];
  const visible = [a.title, a.problem, a.summary, ...al].join('｜');
  const old = prev[slug];

  // ① 新文章必須有人工別名
  if (!old) {
    if (!al.length) {
      problems.push(`【新文章沒補別名】${slug}\n    在 search-aliases.js 補一條，寫訪客會怎麼問：上課的說法、比喻、金句、同義詞。\n    拼寫變體不用補（模型自己橋得起來），要補的是語意距離遠的詞。`);
    } else if (al.length < MIN_ALIASES) {
      problems.push(`【別名太少】${slug}：只有 ${al.length} 個，至少要 ${MIN_ALIASES} 個`);
    } else if (al.every((x) => a.title.includes(x) || x === a.title)) {
      problems.push(`【別名只是照抄標題】${slug}：${al.join('、')}\n    別名的用處是補標題沒有的說法，照抄標題等於沒補。`);
    }
    continue;
  }

  // ② 改標題與摘要時洗掉的詞
  const oldText = [old.title, old.problem, old.summary].join('｜');
  if (oldText === [a.title, a.problem, a.summary].join('｜')) continue;
  const body = bodyText(slug);
  if (!body) continue;
  const lost = lostTerms(oldText, visible, body).filter((w) => !(ignore[slug] && ignore[slug][w]));
  if (lost.length) {
    problems.push(`【改標題洗掉了詞】${slug}\n    掉出索引但內文還在用：${lost.slice(0, 8).join('、')}\n    三種處理都算過關：補進 search-aliases.js／寫進 index-coverage-ignore.json 並附理由／在該檔標記敏感或過期。`);
  }
}

if (problems.length) {
  console.error('索引覆蓋率檢查未過：\n');
  for (const p of problems) console.error('  ' + p + '\n');
  console.error(`共 ${problems.length} 項。這一關擋的是「內容上線了但訪客搜不到」。`);
  process.exit(1);
}
console.log(`索引覆蓋率檢查通過（${Object.keys(cur).length} 篇，別名 ${Object.keys(aliases).length} 篇有）`);
