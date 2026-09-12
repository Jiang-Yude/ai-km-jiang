/* 標題公式閘門：擋「副標被寫成功能描述，不是可搜尋的概念名」。

   立因（2026-09-12）：江江看 loop-four-entries 的標題說「這麼長都沒講到重點」。
   追查後長出兩條硬規則（spring-editor/references/11-mode-title-rewrite.md）：
   ① 副標＝第二搜尋入口（主標服務「第一次找到」，副標服務「之後精準找回」）
   ② 改已上線標題＝入口遷移（舊詞要補別名庫或寫進 ignore）

   ② 已經有引擎＝check-index-coverage.mjs。① 立規當下沒有引擎，只能靠自律。這支補的是 ①。

   ⚠️ 這支不判斷副標「是不是概念名」——那是語意判斷，機器做不到。
   初版試過用「副標的詞有沒有出現在內文小標或別名庫」當代理指標，實測失敗：
   功能描述型副標「一段可以直接貼上去就能用的指令」在全文出現 3 次，
   純概念名副標「角色三視圖」也是 3 次，區分度不足；而且別名庫本來就收口語問法
   （含功能描述），拿它當基底等於閘門自我失效。假裝能機械化只會製造假安全感。

   改成驗「流程」而不是驗「品質」，三項全部 100% 機械可判：
   ① 主副標有沒有重複同一個 5 字以上實詞（回答同一件事）
   ② 標題改了，search-aliases.js 該篇條目有沒有同輪跟著改（副標＝第二搜尋入口，
      改了入口就要補新的搜尋說法。這條與 check-index-coverage 互補：
      那支管「舊詞掉了要補回」，這支管「新詞有沒有加進去」）
   ③ 副標長度、有沒有「｜」→ 只提醒不擋

   副標到底是不是可搜尋的概念名，靠 AUT 第五題（好搜尋）與跨家審，本支驗不了。

   用法：
     node scripts/check-title-formula.mjs          預設只驗本次變更的文章，違規 exit 1
     node scripts/check-title-formula.mjs --all    全站盤查，只列清單不擋（exit 0）
   ignore 檔：title-formula-ignore.json，格式 { "slug": "為什麼這篇不套公式" } */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const ROOT = path.resolve(import.meta.dirname, '..');
const IGNORE_FILE = path.join(ROOT, 'title-formula-ignore.json');
const SEP = '｜';
const SUB_MIN = 12;
const SUB_MAX = 40;
const ALL = process.argv.includes('--all');

const readIf = (p) => (fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '');
const ignore = (() => {
  try { return JSON.parse(readIf(IGNORE_FILE) || '{}'); } catch { return {}; }
})();

const FUNCTION_WORDS = ['讓', '用', '把', '被', '從', '要', '會', '能', '不', '是', '有', '怎', '為', '的', '在', '就', '也', '都', '還', '一'];

// 取中文連續片段的 4-6 字子串，以及長度 >= 3 的英數詞，當作候選概念詞。
// min 從 3 提到 4、並排除以功能字開頭的碎片（2026-09-12 負向測試後收緊）：
// 原本 3 字門檻讓「的指令」「可以直」這種語法碎片也能命中別名庫，等於閘門形同虛設。
function terms(s, min = 4) {
  return [...new Set(
    (s.match(/[一-鿿 A-Za-z0-9]+/g) || [])
      .flatMap((raw) => {
        const chunk = raw.trim();
        if (!chunk) return [];
        if (!/[一-鿿]/.test(chunk)) return chunk.length >= min ? [chunk] : [];
        const out = [];
        for (let n = min; n <= Math.min(chunk.length, 6); n++)
          for (let i = 0; i + n <= chunk.length; i++) {
            const seg = chunk.slice(i, i + n);
            if (FUNCTION_WORDS.includes(seg[0])) continue;
            out.push(seg);
          }
        return out;
      })
  )];
}

// 重複詞串只抓「概念重複」，不抓語法重複。
// 實測誤報兩例（2026-09-12 首跑）：「讓 AI 」（要讓 AI 自己工作 vs 讓 AI 根據不同任務）
// 與「odex」（Codex vs codex-plugin-cc，同一個專有名詞本來就該出現兩次）。
// 因此：長度提到 5、排除含空格的片段（跨詞語法結構）、排除以常見功能詞開頭的片段。
function longestCommonRun(a, b, min = 5) {
  for (let n = Math.min(a.length, b.length); n >= min; n--)
    for (let i = 0; i + n <= a.length; i++) {
      const seg = a.slice(i, i + n);
      if (/\s/.test(seg)) continue;
      if (FUNCTION_WORDS.includes(seg[0])) continue;
      if (b.includes(seg)) return seg;
    }
  return '';
}

function articleSlugs() {
  const dir = path.join(ROOT, 'articles');
  return fs.readdirSync(dir)
    .filter((d) => fs.existsSync(path.join(dir, d, 'article.json')))
    .sort();
}

function changedSlugs() {
  const out = [];
  for (const cmd of ['git diff HEAD --name-only', 'git diff --cached --name-only', 'git diff --name-only']) {
    try { out.push(...execSync(cmd, { cwd: ROOT }).toString().split('\n')); } catch { /* ignore */ }
  }
  return [...new Set(out
    .map((f) => f.match(/^articles\/([^/]+)\/article\.json$/)?.[1])
    .filter(Boolean))];
}

// 本次變更中，哪些文章的 title 被動過；search-aliases.js 這次有沒有被動過
function diffAll() {
  const out = [];
  for (const cmd of ['git diff HEAD', 'git diff --cached', 'git diff']) {
    try { out.push(execSync(cmd, { cwd: ROOT, maxBuffer: 64 * 1024 * 1024 }).toString()); } catch { /* ignore */ }
  }
  return out.join('\n');
}
const DIFF = ALL ? '' : diffAll();
const aliasesChanged = /^\+\+\+ b\/search-aliases\.js$/m.test(DIFF);
const titleChanged = new Set();
if (!ALL) {
  let cur = '';
  for (const line of DIFF.split('\n')) {
    const f = line.match(/^\+\+\+ b\/articles\/([^/]+)\/article\.json$/);
    if (f) { cur = f[1]; continue; }
    if (line.startsWith('+++') || line.startsWith('--- ')) { if (!f) cur = ''; continue; }
    if (cur && /^[+-]\s*"title":/.test(line)) titleChanged.add(cur);
  }
}

const aliasesSrc = readIf(path.join(ROOT, 'search-aliases.js'));
function aliasesOf(slug) {
  const m = aliasesSrc.match(new RegExp(`"${slug}":\\s*\\[([^\\]]*)\\]`));
  return m ? m[1] : '';
}

function headingsOf(slug) {
  const html = readIf(path.join(ROOT, 'articles', slug, 'index.html'));
  return (html.match(/<h[23][^>]*>([\s\S]*?)<\/h[23]>/g) || [])
    .map((h) => h.replace(/<[^>]+>/g, ' ')).join(' ');
}

const report = [];

for (const slug of ALL ? articleSlugs() : changedSlugs()) {
  if (ignore[slug]) continue;
  let title = '';
  try {
    title = JSON.parse(readIf(path.join(ROOT, 'articles', slug, 'article.json'))).title || '';
  } catch { continue; }
  if (!title) continue;

  const issues = [];   // 擋
  const soft = [];     // 只提醒

  // 沒有「｜」只警告不擋。理由：11-mode-title-rewrite.md 2026-08-24 改訂銜接符號時明訂
  // 「既有已上線文章沿用冒號的不回頭批改，除非江江另外指示」。全站 139 篇有 119 篇是舊標題，
  // 直接擋會讓任何無關改動都卡住，規則會被繞過。這一項的處置交給標題盤查（--all），不進發布閘門。
  if (!title.includes(SEP)) {
    report.push({
      slug, title, ok: true, warn: true,
      issues: [`沒有全形直線「${SEP}」分隔主副標（舊標題，不擋；要不要改交標題盤查決定）`],
    });
    continue;
  }

  const [main, ...rest] = title.split(SEP);
  const sub = rest.join(SEP);

  // 長度只提醒不擋：18–32 是 Codex 給的建議值不是硬線，實測兩篇純概念名副標
  // （角色三視圖、知識作業系統母架構）本身就是好副標，只是沒帶用途說明。
  if (sub.length < SUB_MIN || sub.length > SUB_MAX)
    soft.push(`副標 ${sub.length} 字，建議 ${SUB_MIN}–${SUB_MAX} 字（太短可補一句用途，太長考慮切掉修飾語）`);

  const dup = longestCommonRun(main, sub);
  if (dup)
    issues.push(`主副標重複詞串「${dup}」：兩段應分別服務「第一次找到」與「之後精準找回」，不要回答同一件事`);

  // 核心：標題改了，別名庫要同輪跟著改（--all 模式沒有 diff 可看，跳過這項）
  if (!ALL && titleChanged.has(slug) && !aliasesChanged)
    issues.push('標題改了但 search-aliases.js 沒動。副標是第二搜尋入口，換了入口就要補新的搜尋說法：'
      + `把讀者（與你自己）會拿來搜這個新副標的說法加進 search-aliases.js 的 "${slug}" 條目。`);

  report.push({ slug, title, issues, soft, ok: issues.length === 0, warn: false });
}

if (ALL) {
  const noSep = report.filter((r) => r.warn);
  const bad = report.filter((r) => !r.ok);
  console.log(`標題公式盤查：共 ${report.length} 篇。`);
  console.log(`  舊標題沒有「${SEP}」：${noSep.length} 篇（不擋，要不要改由人決定）`);
  console.log(`  有「${SEP}」但公式有問題：${bad.length} 篇\n`);
  console.log('（--all 只列清單不擋。機器判不了主標是不是讀者真的會打的話，那一層要人看。）\n');
  if (bad.length) {
    console.log('── 有分隔線但公式有問題（這些會擋發布）──');
    for (const r of bad) {
      console.log(`  ${r.slug}`);
      console.log(`    ${r.title}`);
      for (const i of r.issues) console.log(`      · ${i}`);
    }
    console.log('');
  }
  const softOnly = report.filter((r) => r.ok && !r.warn && r.soft?.length);
  if (softOnly.length) {
    console.log(`── 只是提醒，不擋（${softOnly.length} 篇）──`);
    for (const r of softOnly) {
      console.log(`  ${r.slug}　${r.title}`);
      for (const i of r.soft) console.log(`      · ${i}`);
    }
    console.log('');
  }
  console.log(`── 舊標題沒有分隔線（${noSep.length} 篇）──`);
  for (const r of noSep) console.log(`  ${r.slug}　${r.title}`);
  process.exit(0);
}

for (const w of report.filter((r) => r.warn))
  console.log(`  ⚠️  ${w.slug} 是舊標題（沒有「${SEP}」），不擋；要改走標題盤查`);
for (const r of report.filter((x) => x.soft?.length))
  for (const i of r.soft) console.log(`  ⚠️  ${r.slug}：${i}`);

const problems = report.filter((r) => !r.ok);
if (!problems.length) process.exit(0);

console.log('標題公式檢查未過：\n');
for (const p of problems) {
  console.log(`  【${p.slug}】${p.title}`);
  for (const i of p.issues) console.log(`    · ${i}`);
  console.log('');
}
console.log(`共 ${problems.length} 篇。規則正本＝spring-editor/references/11-mode-title-rewrite.md`);
console.log('這篇確實不該套公式（趨勢時事、標題本身已是讀者問句）就寫進 title-formula-ignore.json 附理由。');
process.exit(1);
