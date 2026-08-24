#!/usr/bin/env node
// ─── 文章版面樣式完整性檢查 ───
// 用法：node scripts/check-article-css.mjs        全綠 exit 0；有缺 exit 1
//
// 2026-08-24 立，事故驅動（同一個雷第二次）：文章 CSS 完全內嵌，_templates/article-template.html
// 過去沒有 .tablewrap／.toc／.readmore 這幾組，凡是新文章用到表格、目錄、延伸閱讀，
// 都得自己從別篇手抄 CSS；抄漏就整塊退回瀏覽器預設樣式（表格沒框沒底沒對齊）。
// 8/23 webnode 那篇踩一次，8/24 what-is-graph-engineering 又踩一次，江江兩次都是自己看到才回報。
// 模板已補齊，這一關是保底：用到版面 class 卻沒有對應 CSS 規則就擋下。
//
// 只查「一定要有 CSS 才會對」的版面 class，不做全 class 掃描（雜訊太多、會有 JS hook 誤報）。
// 註解內的字串一律不算使用（模板說明註解本身就含大量範例標記）。

import {readFileSync} from 'node:fs';
import {globSync} from 'node:fs';

const LAYOUT = {
  'tablewrap':     '.tablewrap',
  'table-scroll':  '.table-scroll',
  'toc':           '.toc',
  'readmore':      '.readmore',
  'near':          '.readmore.near',
  'inline-figure': '.inline-figure',
  'wide':          '.inline-figure.wide',
  'figure-pair':   '.figure-pair',
  'hero-figure':   '.hero-figure',
  'duo':           '.duo',
  'infocard':      '.infocard',
  'skillcard':     '.skillcard',
};

const files = globSync('articles/*/index.html').sort();
let fail = 0, checked = 0;

for (const f of files) {
  const raw = readFileSync(f, 'utf8');
  const styles = [...raw.matchAll(/<style>([\s\S]*?)<\/style>/g)].map(m => m[1]).join('\n');
  // 正文＝拿掉 style、script、HTML 註解之後剩下的
  const body = raw
    .replace(/<style>[\s\S]*?<\/style>/g, '')
    .replace(/<script[\s\S]*?<\/script>/g, '')
    .replace(/<!--[\s\S]*?-->/g, '');

  const used = new Set();
  for (const m of body.matchAll(/class="([^"]+)"/g)) m[1].split(/\s+/).forEach(c => used.add(c));

  const missing = [];
  for (const [cls, sel] of Object.entries(LAYOUT)) {
    if (!used.has(cls)) continue;
    // 有沒有任何一條規則用到這個 class
    if (!new RegExp('\\.' + cls.replace(/-/g, '\\-') + '(?![\\w-])').test(styles)) missing.push(sel);
  }
  // 表格：不綁單一寫法（站上有 .tablewrap、.cmp-wrap+table.cmp、bare table{}、inline style 四種），
  // 只確認每張表真的吃得到樣式，否則桌機版會退回瀏覽器預設（沒框沒底沒對齊）。
  const selectors = [...styles.matchAll(/([^{}]+)\{/g)].map(m => m[1].replace(/\s+/g, ' ').trim());
  // 有沒有任何一條規則會打到裸的 table／th／td（不論是 `table{}` 還是 `.x table{}`）
  const hasElementTableRule = selectors.some(s =>
    /(^|[\s,>+~])(table|th|td|thead|tbody)([\s,.:\[)]|$)/.test(s));
  for (const m of body.matchAll(/<table\b([^>]*)>/g)) {
    const attrs = m[1];
    if (/\sstyle=/.test(attrs)) continue;                       // 自帶 inline style
    if (hasElementTableRule) continue;                          // 有元素層規則
    const cls = (attrs.match(/class="([^"]+)"/) || [, ''])[1].split(/\s+/).filter(Boolean);
    const styledByOwnClass = cls.some(c => selectors.some(s =>
      new RegExp('\\.' + c.replace(/-/g, '\\-') + '(?![\\w-])').test(s)));
    if (!styledByOwnClass) {
      missing.push(`<table${cls.length ? ' class="' + cls.join(' ') + '"' : ''}> 吃不到任何表格樣式`);
    }
  }
  checked++;
  if (missing.length) { fail = 1; console.log(`  ❌ ${f}\n     缺樣式：${missing.join('、')}`); }
}

if (fail) {
  console.log(`\n  修法：從 _templates/article-template.html 的 <style> 抄對應那幾組進文章。`);
  console.log(`  掃 ${checked} 篇，有缺的見上。`);
} else {
  console.log(`  文章版面樣式完整（掃 ${checked} 篇，零缺）`);
}
process.exit(fail);
