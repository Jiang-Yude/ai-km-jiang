#!/usr/bin/env node
/**
 * og-shot.mjs — 文章分享封面自動截圖
 *
 * 把每篇文章的 hero 標題卡（eyebrow＋大標＋副標，暖色拿鐵底）自動截成
 * 1200×630 @2x 的 OG 分享圖，存到 images/og/<slug>.jpg。
 * 解決問題：沒專屬封面的文章分享到 Threads/FB 時，會退回直式人像 fallback
 * 被裁成「只剩脖子」的醜預覽。hero 本身就是現成的橫式封面卡，截它最省事。
 *
 * 用法（在 repo 根目錄）：
 *   node scripts/og-shot.mjs <slug> [slug...]
 * 例：
 *   node scripts/og-shot.mjs four-lens-rapid-review
 *
 * 截完還要手動把該篇 index.html 的 og:image 與 twitter:image 指到
 *   https://jiangyude.com/images/og/<slug>.jpg
 * （新文章用 _templates/article-template.html 的話，預設就填這個路徑即可。）
 *
 * 需求：全域已裝 playwright（npm i -g playwright && playwright install chromium）。
 */
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

// robust import：優先用可解析的 'playwright'，失敗才依序試各機的全域安裝路徑。
// 2026-08-11 補：筆電（apple 帳號）的 node 裝在 ~/.local/node22，全域套件不在
// ESM 預設解析路徑，原本只有桌機那條絕對路徑，這台一律 ERR_MODULE_NOT_FOUND。
let chromium;
const PW_CANDIDATES = [
  'playwright',
  `${process.env.HOME}/.local/node22/lib/node_modules/playwright/index.mjs`,
  `${process.env.HOME}/.npm-global/lib/node_modules/playwright/index.mjs`
];
for (const spec of PW_CANDIDATES) {
  try {
    ({ chromium } = await import(spec));
    break;
  } catch {}
}
if (!chromium) {
  console.error('找不到 playwright。先跑：npm i -g playwright && npx playwright install chromium');
  process.exit(1);
}

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUTDIR = path.join(REPO, 'images', 'og');
fs.mkdirSync(OUTDIR, { recursive: true });

const slugs = process.argv.slice(2);
if (!slugs.length) { console.error('usage: node scripts/og-shot.mjs <slug> [slug...]'); process.exit(1); }

const W = 1200, H = 630;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: W, height: 720 }, deviceScaleFactor: 2 });

for (const slug of slugs) {
  const file = path.join(REPO, 'articles', slug, 'index.html');
  if (!fs.existsSync(file)) { console.error(`SKIP ${slug}: no articles/${slug}/index.html`); continue; }
  await page.goto('file://' + file, { waitUntil: 'networkidle' });
  // 隱藏 sticky nav，把 hero 撐成精準 1200x630 的卡、文字垂直置中
  await page.addStyleTag({ content: `
    nav.top{display:none!important}
    .hero{min-height:${H}px!important;height:${H}px!important;padding-top:0!important;padding-bottom:0!important;box-sizing:border-box!important}
  `});
  // 有 hero 封面圖的文章：保留圖並排到右邊（1200x630 是電影比例，直式圖靠右才不會被擠掉）。
  // 沒有封面圖的文章維持原本的純文字卡。2026-08-11 前這裡一律 display:none，
  // 導致「已經做了封面圖」的文章 og 圖仍然只有文字。
  const hasFigure = await page.$('.hero-figure img');
  await page.addStyleTag({ content: hasFigure ? `
    .hero{flex-wrap:nowrap!important;justify-content:center!important;gap:56px!important}
    .hero>div{width:640px!important;flex:none!important}
    .hero h1{font-size:48px!important;line-height:1.12!important;margin:12px 0 14px!important}
    .hero p{font-size:19px!important;line-height:1.6!important}
    .hero .kicker{font-size:1.3rem!important}
    .hero-figure{display:block!important;width:300px!important;flex:none!important;margin:0!important}
    .hero-figure figcaption{display:none!important}
  ` : `
    .hero-figure{display:none!important}
  `});
  await page.waitForTimeout(150);
  const out = path.join(OUTDIR, `${slug}.jpg`);
  await page.screenshot({ path: out, type: 'jpeg', quality: 88, clip: { x: 0, y: 0, width: W, height: H } });
  const kb = (fs.statSync(out).size / 1024).toFixed(0);
  console.log(`OK ${slug} -> images/og/${slug}.jpg (${kb} KB)`);
}
await browser.close();
