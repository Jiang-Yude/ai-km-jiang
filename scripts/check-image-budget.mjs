/* 圖片體積閘門：擋「新增或換掉的圖超過 400KB、或寬度超過 1400px」。

   立因（2026-10-19 效能盤查）：設計規範（knowledge-site-manager 02-design-system.md）
   早就寫「縮寬 1400、壓 <400K」，但一直沒有機械檢查，全站累積 42 張超過 400KB
   （合計約 33MB）、195 張寬於 1400。這一輪已把超標的壓回規範，這支擋之後新進來的。

   規則：
   ① 檔案大小 ≤ 400KB（所有點陣圖都適用，含 og 圖）
   ② 寬度 ≤ 1400px；例外＝社群分享圖：放在 images/og/ 底下、尺寸剛好 1200x630，
      或被任何頁面的 og:image／twitter:image 指到的圖（分享圖尺寸由平台決定，不在這裡縮）。

   只驗「本次新增或改過」的圖，舊圖不回頭擋（沿用官網 2026-08-24 舊文不回頭批改的慣例）；
   本次變更的判定方式同 check-image-ratio.mjs：工作區、暫存區、未追蹤檔，
   都沒有就退到這條分支相對 main 改過的檔。
   誠實邊界：只驗大小與寬度，驗不了畫質好不好、該不該用這張圖。

   用法：
     node scripts/check-image-budget.mjs          只驗本次變更的圖，違規 exit 1
     node scripts/check-image-budget.mjs --all    全站盤查，只列清單不擋（exit 0） */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const ROOT = path.resolve(import.meta.dirname, '..');
const ALL = process.argv.includes('--all');
const MAX_BYTES = 400 * 1024;
const MAX_WIDTH = 1400;
const IMG_EXT = /\.(jpe?g|png|webp|gif|avif)$/i;
const SKIP_DIR = /^(\.git|node_modules|_trash|\.cloudflare-generated)(\/|$)/;

/* 只讀檔頭拿寬高（JPEG、PNG、WebP、GIF），讀不出來回 null，只驗大小 */
function imageSize(file) {
  let buf;
  try { buf = fs.readFileSync(file); } catch { return null; }
  if (buf.length < 30) return null;
  if (buf[0] === 0x89 && buf.toString('latin1', 1, 4) === 'PNG') return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
  if (buf.toString('latin1', 0, 3) === 'GIF') return { w: buf.readUInt16LE(6), h: buf.readUInt16LE(8) };
  if (buf.toString('latin1', 0, 4) === 'RIFF' && buf.toString('latin1', 8, 12) === 'WEBP') {
    const fourcc = buf.toString('latin1', 12, 16);
    if (fourcc === 'VP8X') return { w: (buf.readUIntLE(24, 3) & 0xffffff) + 1, h: (buf.readUIntLE(27, 3) & 0xffffff) + 1 };
    if (fourcc === 'VP8 ') return { w: buf.readUInt16LE(26) & 0x3fff, h: buf.readUInt16LE(28) & 0x3fff };
    if (fourcc === 'VP8L') { const b = buf.readUInt32LE(21); return { w: (b & 0x3fff) + 1, h: ((b >> 14) & 0x3fff) + 1 }; }
    return null;
  }
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i < buf.length - 9) {
      if (buf[i] !== 0xff) { i++; continue; }
      const marker = buf[i + 1];
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { i += 2; continue; }
      const len = buf.readUInt16BE(i + 2);
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc)
        return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) };
      i += 2 + len;
    }
  }
  return null;
}

function git(cmd) {
  try {
    return execSync(`git -c core.quotepath=false ${cmd}`, { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 * 1024 * 1024 }).toString();
  } catch (e) {
    if (e && (e.code === 'ENOBUFS' || /maxBuffer/i.test(String(e.message)))) {
      console.error('❌ 圖片體積檢查：git 輸出超過緩衝區，無法判定本次變更。請縮小範圍或改跑 --all 盤查。');
      process.exit(1);
    }
    return null; // 例如沒有 origin/main 這個參照：略過該指令
  }
}

/* 本次新增或改過的圖（只認 A／M，刪除與純改名不算） */
function changedImages() {
  const lists = [
    git('diff --name-only --diff-filter=AM HEAD'),
    git('diff --name-only --diff-filter=AM --cached'),
    git('ls-files --others --exclude-standard'),
  ];
  let files = lists.filter(Boolean).join('\n').split('\n').filter((f) => IMG_EXT.test(f));
  if (files.length === 0) {
    for (const ref of ['origin/main', 'main']) {
      const t = git(`diff --name-only --diff-filter=AM ${ref}...HEAD`);
      if (t !== null) { files = t.split('\n').filter((f) => IMG_EXT.test(f)); break; }
    }
  }
  return [...new Set(files)].filter((f) => fs.existsSync(path.join(ROOT, f)));
}

function allImages() {
  const out = [];
  (function walk(rel) {
    for (const d of fs.readdirSync(path.join(ROOT, rel), { withFileTypes: true })) {
      const r = rel ? `${rel}/${d.name}` : d.name;
      if (SKIP_DIR.test(r)) continue;
      if (d.isDirectory()) walk(r);
      else if (IMG_EXT.test(d.name)) out.push(r);
    }
  })('');
  return out;
}

/* 被 og:image／twitter:image 指到的圖（取網址路徑，去掉網域） */
function socialImages() {
  const set = new Set();
  const re = /<meta[^>]+(?:property|name)="(?:og:image|twitter:image)"[^>]+content="([^"]+)"/gi;
  (function walk(rel) {
    for (const d of fs.readdirSync(path.join(ROOT, rel), { withFileTypes: true })) {
      const r = rel ? `${rel}/${d.name}` : d.name;
      if (SKIP_DIR.test(r)) continue;
      if (d.isDirectory()) walk(r);
      else if (d.name.endsWith('.html')) {
        const html = fs.readFileSync(path.join(ROOT, r), 'utf8');
        for (const m of html.matchAll(re)) {
          const p = decodeURIComponent(m[1].replace(/^https?:\/\/[^/]+/, '').replace(/^\//, '').split('?')[0]);
          set.add(p);
        }
      }
    }
  })('');
  return set;
}

const targets = ALL ? allImages() : changedImages();
if (targets.length === 0) {
  console.log('✅ 圖片體積：本次沒有新增或改過的圖');
  process.exit(0);
}
const social = socialImages();
const problems = [];
for (const f of targets.sort()) {
  const bytes = fs.statSync(path.join(ROOT, f)).size;
  const size = imageSize(path.join(ROOT, f));
  const isSocial = social.has(f) || (f.startsWith('images/og/') && size && size.w === 1200 && size.h === 630);
  const why = [];
  if (bytes > MAX_BYTES) why.push(`${Math.round(bytes / 1024)}KB 超過 400KB`);
  if (size && size.w > MAX_WIDTH && !isSocial) why.push(`寬 ${size.w}px 超過 1400px`);
  if (why.length) problems.push(`  ${f}：${why.join('、')}${size ? `（${size.w}x${size.h}）` : ''}`);
}

if (problems.length === 0) {
  console.log(`✅ 圖片體積：${targets.length} 張都在規範內（≤400KB、寬 ≤1400px）`);
  process.exit(0);
}
console.log(`${ALL ? '⚠️ 全站盤查' : '❌ 圖片體積未過'}：${problems.length} 張超標`);
console.log(problems.join('\n'));
if (!ALL) console.log('  修法：寬度縮到 1400、JPG 品質 85 或轉 WebP；無透明的 PNG 轉 JPG（記得改所有引用）。分享圖放 images/og/ 並做成 1200x630。');
process.exit(ALL ? 0 : 1);
