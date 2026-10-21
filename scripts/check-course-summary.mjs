// 課程卡簡介字數檢查（2026-10-21 江江：「課程簡介就100字好了」「超過100這不是擋項 超過140才重修」）。
// 為什麼：課程卡上的簡介只讓人看懂「這是什麼、適不適合我」，細節放報名頁；字太多卡片就亂。
// 規則：100 字內是目標；101 到 140 字只提醒；超過 140 字擋下，要重寫。資料源＝courses-data.js 的 summary。
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ctx = {window: {}};
vm.runInNewContext(fs.readFileSync(path.join(root, 'courses-data.js'), 'utf8') + ';window.__C = (typeof COURSES !== "undefined" ? COURSES : window.COURSES);', ctx);
const courses = ctx.window.__C || [];
const len = s => [...String(s || '')].length;
const warn = courses.filter(c => len(c.summary) > 100 && len(c.summary) <= 140);
const bad = courses.filter(c => len(c.summary) > 140);
for (const c of warn) console.log(`  ⚠️  ${c.id} 簡介 ${len(c.summary)} 字（目標 100 字內，不擋）`);
for (const c of bad) console.log(`  ❌ ${c.id} 簡介 ${len(c.summary)} 字，超過 140 字要重寫（只講這是什麼、適合誰，細節放報名頁）`);
if (bad.length) process.exit(1);
console.log(`  ✅ 課程簡介 ${courses.length} 筆，沒有超過 140 字`);
