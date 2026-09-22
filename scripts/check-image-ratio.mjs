/* 圖片比例閘門：擋「封面做成直式、內文圖做成橫式」這種比例做反。

   立因（2026-09-20）：fixed-test-set-for-ai 那篇，我把封面生成 4:5 直式、
   三張內文圖生成 16:9 橫式，剛好全部相反。江江：「你的標題那張應該要是橫的，
   內文要是直，你這樣剛好相反，我標題的縮圖不能用」「輪播卡也不能用」。

   為什麼會做反：比例這件事在規則裡只出現在 08-article-visuals-from-source.md
   的「技術注意」段，而且那段講的是**例外**（既有 4:5 輪播卡要塞進 hero 時，
   把 hero 改成直式）。我把例外當成預設，又看到 how-to-verify-ai-rule-changes
   的封面剛好是 1080x1350 就照抄，拿一個樣本當規範。規則裡從來沒有一張
   「用途 → 比例」的正表，也沒有任何機械檢查。這支就是那個引擎。

   兩條用途決定比例（正本＝08-article-visuals-from-source.md 第零節之前的比例表）：
   ① hero 封面服務的是**分享縮圖**（OG 1200x630 是橫的、Threads/FB 預覽也是橫的）
      → 預設橫式。只有「復用既有 4:5 輪播卡」時才走直式例外，那時要在 ignore 檔寫明。
   ② 內文圖服務的是**一圖兩用**（放進文章，也能直接當社群輪播卡）
      → 預設直式 4:5，HTML 加 .inline-figure.portrait 限寬，否則撐滿版心。
      真的需要橫式（操作截圖、寬表格、一頁總結）就加 .wide 或 .landscape 明確 opt-in，
      標了就放行。沒標又是橫式＝擋下，因為那多半是忘了、不是決定。

   已上線的舊文不回頭批改（沿用官網 2026-08-24 慣例），所以預設只驗
   本輪改過 index.html 的文章；「直式內文圖沒加 .portrait」只提醒不擋。

   ⚠️ 這支只驗比例與 class 對不對，驗不了「這張圖畫得好不好」「有沒有講清楚」，
   那層靠江江目視與 AUT。也驗不了「該不該有圖」。

   用法：
     node scripts/check-image-ratio.mjs          只驗本次變更的文章，違規 exit 1
     node scripts/check-image-ratio.mjs --all    全站盤查，只列清單不擋（exit 0）
   ignore 檔：image-ratio-ignore.json，格式 { "slug": "為什麼這篇不套比例規則" } */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const ROOT = path.resolve(import.meta.dirname, '..');
const IGNORE_FILE = path.join(ROOT, 'image-ratio-ignore.json');
const ALL = process.argv.includes('--all');

// 判定門檻：留一點寬容，不要求剛好 16:9 或剛好 4:5
const LANDSCAPE_MIN = 1.2;   // 寬/高 ≥ 1.2 算橫式
const PORTRAIT_MAX = 0.9;    // 寬/高 ≤ 0.9 算直式

const readIf = (p) => (fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '');
const ignore = (() => {
  try { return JSON.parse(readIf(IGNORE_FILE) || '{}'); } catch { return {}; }
})();

/* 只讀檔頭拿寬高，不解碼整張圖（152 篇全掃也是毫秒級）。
   支援 JPEG、PNG、WebP、GIF；讀不出來就回 null，當作「無法判定」放行，
   不把「讀不到」當成「違規」（fail open 只用在判讀不出格式這一種情況）。*/
function imageSize(file) {
  let buf;
  try { buf = fs.readFileSync(file); } catch { return null; }
  if (buf.length < 24) return null;

  // PNG
  if (buf[0] === 0x89 && buf.toString('latin1', 1, 4) === 'PNG')
    return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };

  // GIF
  if (buf.toString('latin1', 0, 3) === 'GIF')
    return { w: buf.readUInt16LE(6), h: buf.readUInt16LE(8) };

  // WebP（VP8X / VP8L / VP8）
  if (buf.toString('latin1', 0, 4) === 'RIFF' && buf.toString('latin1', 8, 12) === 'WEBP') {
    const fourcc = buf.toString('latin1', 12, 16);
    if (fourcc === 'VP8X') return { w: (buf.readUIntLE(24, 3) & 0xffffff) + 1, h: (buf.readUIntLE(27, 3) & 0xffffff) + 1 };
    if (fourcc === 'VP8 ') return { w: buf.readUInt16LE(26) & 0x3fff, h: buf.readUInt16LE(28) & 0x3fff };
    if (fourcc === 'VP8L') {
      const b = buf.readUInt32LE(21);
      return { w: (b & 0x3fff) + 1, h: ((b >> 14) & 0x3fff) + 1 };
    }
    return null;
  }

  // JPEG：逐段跳到 SOF
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i < buf.length - 9) {
      if (buf[i] !== 0xff) { i++; continue; }
      const marker = buf[i + 1];
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { i += 2; continue; }
      const len = buf.readUInt16BE(i + 2);
      // SOF0-SOF15，排除 DHT(c4)、JPG(c8)、DAC(cc)
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc)
        return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) };
      i += 2 + len;
    }
  }
  return null;
}

function articleSlugs() {
  const dir = path.join(ROOT, 'articles');
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((s) => fs.existsSync(path.join(dir, s, 'index.html'))).sort();
}

/* 本次變更的文章：先試 git diff（工作區／暫存區／對 HEAD），
   都空的話再退到「這條分支相對 main 改過的檔」，因為文章分支的慣例是
   先 commit 再跑 preflight，那時 git diff HEAD 會是空的。*/
function changedSlugs() {
  const out = [];
  // 2026-09-22 改用 --numstat，只認「有新增行」的 index.html：
  // 撤英文版那輪全站 150 篇 index.html 只刪了 hreflang／EN 切換鈕（純刪除、沒動任何圖），
  // 用 --name-only 會把 150 篇舊文全拖進來、擋下整次發布，違背「舊文不回頭批改」。
  // 純刪除不可能新增或換掉圖片，所以不算「本輪改過」。有任何新增行（含換圖）照舊檢查。
  const cmds = [
    'git diff HEAD --numstat',
    'git diff --cached --numstat',
    'git diff --numstat',
    'git diff --numstat origin/main...HEAD',
    'git diff --numstat main...HEAD',
  ];
  for (const cmd of cmds) {
    try { out.push(...execSync(cmd, { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'] }).toString().split('\n')); } catch { /* ignore */ }
  }
  const slugs = new Set();
  for (const line of out) {
    // numstat 格式：新增行數<TAB>刪除行數<TAB>路徑；新增為 0 的純刪除略過。
    const [added, , file = ''] = line.trim().split('\t');
    if (added === '0') continue;
    // 只認 index.html 有變更。改 article.json 補雙向回連不該把那篇拖進比例檢查。
    const m = file.match(/^articles\/([^/]+)\/index\.html$/);
    if (m) slugs.add(m[1]);
  }
  return [...slugs].sort();
}

/* 從 HTML 抓出要檢查的圖：
   - hero：<figure class="hero-figure"> 裡第一個 img
   - 內文：每個 <figure class="inline-figure ..."> 裡第一個 img，連同它的 class */
function figuresOf(html) {
  const out = [];
  const re = /<figure\s+class="([^"]*?)"[\s\S]*?<img\s+[^>]*?src="([^"]+)"/g;
  let m;
  while ((m = re.exec(html))) {
    const cls = m[1].split(/\s+/);
    if (cls.includes('hero-figure')) out.push({ kind: 'hero', cls, src: m[2] });
    else if (cls.includes('inline-figure')) out.push({ kind: 'inline', cls, src: m[2] });
  }
  return out;
}

const targets = ALL ? articleSlugs() : changedSlugs();
let fail = 0;
let checked = 0;
const notes = [];

for (const slug of targets) {
  if (ignore[slug]) { notes.push(`  ⏭  ${slug}：ignore（${ignore[slug]}）`); continue; }
  const file = path.join(ROOT, 'articles', slug, 'index.html');
  const html = readIf(file);
  if (!html) continue;

  for (const fig of figuresOf(html)) {
    // src 是相對文章頁的路徑（../../images/...），換算回 repo 內的實體檔
    const abs = path.resolve(path.join(ROOT, 'articles', slug), fig.src.split('?')[0]);
    if (!abs.startsWith(ROOT)) continue;          // 外部連結不管
    const size = imageSize(abs);
    if (!size || !size.w || !size.h) continue;    // 讀不出格式就放行
    checked++;
    const r = size.w / size.h;
    const shape = r >= LANDSCAPE_MIN ? '橫式' : r <= PORTRAIT_MAX ? '直式' : '接近正方';
    const dim = `${size.w}x${size.h}`;
    const rel = path.relative(ROOT, abs);

    if (fig.kind === 'hero') {
      if (r < LANDSCAPE_MIN) {
        console.log(`  ❌ ${slug}：封面是${shape}（${dim}），封面要橫式`);
        console.log(`       ${rel}`);
        console.log('       封面服務的是分享縮圖（OG 1200x630 是橫的）。直式封面在縮圖裡只剩一小塊。');
        console.log('       真的要用直式（例如直接沿用既有 4:5 輪播卡），在 image-ratio-ignore.json 寫明理由。');
        fail = 1;
      }
    } else {
      // 內文圖預設要直式（一圖兩用：放進文章，也能直接當社群輪播卡）。
      // 截圖、寬表格、一頁總結這類本來就該橫的，用 .wide 或 .landscape 明確 opt-in。
      const optInLandscape = fig.cls.includes('wide') || fig.cls.includes('landscape');
      if (fig.cls.includes('portrait') && r > PORTRAIT_MAX) {
        console.log(`  ❌ ${slug}：內文圖標了 .portrait 但實際是${shape}（${dim}）`);
        console.log(`       ${rel}`);
        console.log('       class 跟實際比例對不上，版面會留白或被限寬壓扁。改圖或拿掉 .portrait。');
        fail = 1;
      } else if (!optInLandscape && r >= LANDSCAPE_MIN) {
        console.log(`  ❌ ${slug}：內文圖是橫式（${dim}），內文圖預設要直式 4:5`);
        console.log(`       ${rel}`);
        console.log('       直式內文圖可以直接拿去當社群輪播卡，橫式的不能，等於同一張圖要生兩次。');
        console.log('       真的需要橫式（操作截圖、寬表格、一頁總結），把 class 改成');
        console.log('       "inline-figure wide" 或 "inline-figure landscape" 明確標出來。');
        fail = 1;
      } else if (!optInLandscape && r <= PORTRAIT_MAX && !fig.cls.includes('portrait')) {
        // 只提醒不擋：舊文不回頭批改（沿用官網 2026-08-24 的慣例）
        notes.push(`  ⚠️  ${slug}：直式內文圖建議加 .portrait 限寬（${dim}）→ ${rel}`);
      }
    }
  }
}

if (ALL) {
  // 全站盤查模式：只列清單不擋，給人決定要不要回頭補
  console.log(`\n盤查完成：${targets.length} 篇，驗了 ${checked} 張圖${fail ? '，上面是不符比例規則的' : '，全部符合'}`);
  notes.forEach((n) => console.log(n));
  process.exit(0);
}

if (!targets.length) console.log('  （本次沒有變更到文章，略過）');
else if (!fail) console.log(`  ✅ 圖片比例（${targets.length} 篇 / ${checked} 張：封面橫式、內文直式有限寬）`);
notes.forEach((n) => console.log(n));
process.exit(fail);
