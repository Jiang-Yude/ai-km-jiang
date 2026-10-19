#!/usr/bin/env node
// 把會員留言區兩行冪等地插進文章頁（在 related-render.js 那行之後）：
//   <section id="member-comments" class="member-comments" data-page="articles/<slug>/"></section>
//   <script src="/member.js" defer></script>
// 用法：
//   node scripts/add-member-comments.mjs --dry-run                 只列出會改哪些檔，不寫入
//   node scripts/add-member-comments.mjs articles/a/index.html ... 只改指定檔
//   node scripts/add-member-comments.mjs --all                     改全部 articles/*/index.html
// 冪等：已經有 id="member-comments" 或 /member.js 的檔案一律跳過，重跑不會重複插。
// 找不到 related-render.js 那行的檔案不改，列出來給人工處理。
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const dry = args.includes('--dry-run');
const all = args.includes('--all');
let files = args.filter(a => !a.startsWith('--'));
if (!files.length && !all && !dry) {
  console.error('請指定檔案，或加 --all／--dry-run。');
  process.exit(2);
}
if (!files.length) {
  files = fs.readdirSync(path.join(ROOT, 'articles'), {withFileTypes: true}).filter(d => d.isDirectory())
    .map(d => `articles/${d.name}/index.html`).filter(f => fs.existsSync(path.join(ROOT, f))).sort();
}

const ANCHOR = /^([ \t]*)<script src="\.\.\/\.\.\/related-render\.js"><\/script>[ \t]*$/m;
let changed = 0, skipped = 0, missing = [];
for (const rel of files) {
  const m = /^(articles|ai-trends)\/([a-z0-9-]+)\/index\.html$/.exec(rel.replace(/^\.\//, ''));
  if (!m) { missing.push(rel + '（路徑不是 articles/<slug>/index.html）'); continue; }
  const file = path.join(ROOT, rel);
  const html = fs.readFileSync(file, 'utf8');
  if (html.includes('id="member-comments"') || html.includes('src="/member.js"')) { skipped++; continue; }
  const a = ANCHOR.exec(html);
  if (!a) { missing.push(rel + '（找不到 related-render.js 那行）'); continue; }
  const at = a.index + a[0].length;
  const insert = `\n<section id="member-comments" class="member-comments" data-page="${m[1]}/${m[2]}/"></section>\n<script src="/member.js" defer></script>`;
  if (!dry) fs.writeFileSync(file, html.slice(0, at) + insert + html.slice(at));
  changed++;
  console.log((dry ? '［試算］' : '已插入：') + rel);
}
console.log(`完成：${dry ? '將插入' : '插入'} ${changed} 篇，已有跳過 ${skipped} 篇，無法處理 ${missing.length} 篇。`);
missing.forEach(x => console.log('  - ' + x));
process.exit(missing.length && !dry ? 1 : 0);
