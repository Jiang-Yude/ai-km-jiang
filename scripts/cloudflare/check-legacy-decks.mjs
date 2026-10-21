// 凍結舊簡報雜湊檢查（2026-10-21 立，事故驅動）。
// 為什麼：cloudflare/legacy-decks.json 登記的舊課程簡報只准原樣上線，改了要重新審查。
// 這條原本只在 build.mjs 打包時才檢查，而 build.mjs 跑在 push 之後：10:04 官網改版動到 9 份凍結簡報，
// 改動先進了 main，build 才失敗，main 從此帶著壞改動，10:04 到 12:24 每一次部署都被擋。
// 現在 preflight（commit、push 之前）就用同一份登記表、同一種比法（工作區檔案 sha256）先擋。
// 只比 git index 裡有的檔（與 build.mjs 用 git ls-files 取檔一致）；登記了但不在 index 的只提醒。
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const decks = JSON.parse(fs.readFileSync(path.join(root, 'cloudflare/legacy-decks.json'), 'utf8'));
const indexed = new Set(execFileSync('git', ['-C', root, 'ls-files', '-z'], {maxBuffer: 10 * 1024 * 1024}).toString().split('\0').filter(Boolean));
const changed = [];
for (const [p, want] of Object.entries(decks)) {
  if (!indexed.has(p)) { changed.push(`${p}（被移出版控；凍結簡報不准刪，真的要下架先走審查並更新 legacy-decks.json）`); continue; }
  const file = path.join(root, p);
  if (!fs.existsSync(file)) { changed.push(`${p}（index 有、工作區不見了）`); continue; }
  const got = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  if (got !== want) changed.push(p);
}
if (changed.length) {
  console.log(`  ❌ 凍結舊簡報被改動 ${changed.length} 份（cloudflare/legacy-decks.json 登記的只准原樣上線）：`);
  for (const p of changed) console.log(`     - ${p}`);
  console.log('     修法：在施工桌 git checkout origin/main -- <上列路徑> 還原；真的要改，先走課後頁審查再更新 legacy-decks.json 的雜湊。');
  process.exit(1);
}
console.log(`  ✅ 凍結舊簡報 ${Object.keys(decks).length} 份與登記雜湊一致`);
