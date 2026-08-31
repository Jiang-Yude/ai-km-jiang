#!/usr/bin/env node
// 圖片拖曳護欄檢查（2026-08-31 立，事故驅動：同一個雷炸兩次）
//
// 事故：2026-08-07 commit 90fbb97 加了全站圖片互動（拖曳／四角縮放），
// selector 預設把 hero 與內文圖全吃進去，讀者可以把封面圖隨手拖走、拉大拉小。
// 8/19 江江抓到一次，改法是從 selector 拿掉 .hero-figure img（commit 0a56363），
// 但那個 commit 停在分支上從沒 merge、沒部署；而且刻意留著 img.interactive-image
// 當「手動開關」，8/30 做課程頁時 hero 就加了這個 class，8/31 江江第二次抓到。
//
// 根因有兩層：①修好沒上線、沒人追 ②selector 是 opt-out，留了會被誤踩的開關。
// 現在改成 opt-in（只認 data-interactive-image），這一關是機械保底：
// 只要有人再把 selector 放寬回去、或拿掉全站原生拖曳護欄，preflight 就擋下。
//
// 用法：node scripts/check-image-drag.mjs（exit 0 全綠 / exit 1 有問題）

import { readFileSync } from 'node:fs';

const FILE = 'image-interactions.js';
const EXPECTED_SELECTOR = "img[data-interactive-image]";
const fails = [];

let src;
try {
  src = readFileSync(FILE, 'utf8');
} catch {
  console.error(`  ✗ 找不到 ${FILE}`);
  process.exit(1);
}

// 一、selector 必須就是明確 opt-in，不可放寬
const m = src.match(/selector:\s*(['"])(.*?)\1/);
if (!m) {
  fails.push(`${FILE} 找不到 DEFAULTS.selector`);
} else if (m[2].trim() !== EXPECTED_SELECTOR) {
  fails.push(
    `${FILE} 的 selector 被改寬了\n` +
    `      目前：${m[2]}\n` +
    `      應為：${EXPECTED_SELECTOR}\n` +
    `      要讓某張圖可拖曳，是在那張 <img> 上加 data-interactive-image，不是改這條 selector。`
  );
}

// 二、全站原生拖曳護欄不可被拿掉
if (!src.includes('-webkit-user-drag:none')) {
  fails.push(`${FILE} 少了全站原生拖曳護欄（img{-webkit-user-drag:none}），讀者可以把圖直接拖出頁面`);
}
if (!/function injectDragGuard/.test(src) || !/injectDragGuard\(\);/.test(src)) {
  fails.push(`${FILE} 的 injectDragGuard 沒有定義或沒有在 init() 裡被呼叫`);
}

if (fails.length) {
  console.error('  ✗ 圖片拖曳護欄檢查未通過：');
  for (const f of fails) console.error(`    - ${f}`);
  process.exit(1);
}

console.log('  ✓ 圖片拖曳護欄：selector 為明確 opt-in，全站原生拖曳已關閉');
