#!/usr/bin/env node
// ─── 咪卡 AI widget 全站覆蓋檢查 ───
// 用法：node scripts/check-mika-widget.mjs        全綠 exit 0；有缺 exit 1
//
// 2026-08-30 立，事故驅動：2026-08-10 咪卡客服上線那批是一次性回填（148 個中文頁），
// 之後沒有任何機制保證新頁面會掛，_templates/article-template.html 也漏了掛載行，
// 於是 8/10 之後的新文章全數漏掛（累到 13 篇），課程頁零星漏、整個 en/ 沒有
// （en 當時是刻意排除，但這個決定只寫在 commit 訊息裡，後人分不出「刻意」還是「漏」）。
// 2026-08-30 江江拍板「所有頁面都要有」，全站 131 頁補齊、模板補行，這一關是保底：
// 凡 git 追蹤的 HTML 頁缺掛載行就擋下。刻意不掛的頁寫進下方 EXEMPT 並附一句原因，
// 讓「刻意排除」留在程式碼裡看得見，不再只活在 commit 訊息。

import {readFileSync} from 'node:fs';
import {execSync} from 'node:child_process';

// 精確標籤且每頁恰好一個（2026-08-30 跨家審 Codex 抓到：includes 會被註解或錯誤路徑
// 誤放行，也不擋重複掛載；全站 290 頁實測只有這一種寫法，直接鎖死）。
const TAG_RE = /<script src="\/mika-chat-widget\.js" defer><\/script>/g;

// 刻意不掛的頁（路徑前綴或完整路徑｜原因）。要加豁免請附原因，不准無註解加行。
const EXEMPT = [
  // class-countdown 是投影用全螢幕互動工具，掛聊天 widget 會干擾倒數畫面與拖拉/全螢幕操作。
  'class-countdown.html',
];

// 非「對外頁面」的 HTML：不是給訪客看的，不在本關範圍。
const SKIP = [
  /^_trash\//,          // 回收區
  /^_tuner/,            // 本機調參工具頁
  /^google[0-9a-f]+\.html$/, // Search Console 驗證檔（內容固定，動了驗證會失效）
];

const files = execSync('git ls-files "*.html"', {encoding: 'utf8'})
  .split('\n').filter(Boolean).sort();

let fail = 0, checked = 0;
for (const f of files) {
  if (SKIP.some(re => re.test(f))) continue;
  if (EXEMPT.some(e => typeof e === 'string' ? f.startsWith(e) : e.test(f))) continue;
  checked++;
  const raw = readFileSync(f, 'utf8');
  const n = (raw.match(TAG_RE) || []).length;
  if (n === 0) {
    console.error(`✗ ${f} 缺咪卡 widget 掛載行（<script src="/mika-chat-widget.js" defer></script>）`);
    fail++;
  } else if (n > 1) {
    console.error(`✗ ${f} 咪卡 widget 掛載重複（${n} 次，應恰好 1 次）`);
    fail++;
  }
}

if (fail) {
  console.error(`共 ${fail} 頁缺掛載（檢查 ${checked} 頁）。新頁請照模板；刻意不掛請進本檔 EXEMPT 附原因。`);
  process.exit(1);
}
console.log(`咪卡 widget 覆蓋：${checked} 頁全數掛載`);
