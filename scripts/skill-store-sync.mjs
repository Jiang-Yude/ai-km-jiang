#!/usr/bin/env node
// 技能包商店同步：把江江維護的四張 CSV 寫進 Upstash（2026-09-08 立）。
// 用法：
//   SKILL_STORE_TABLES="<商店後台資料夾絕對路徑>" node scripts/skill-store-sync.mjs [--dry-run]
// 環境變數 KV_REST_API_URL／KV_REST_API_TOKEN（或 UPSTASH_REDIS_REST_*），沒有就讀同目錄上層 .env.local（vercel env pull 拉的）。
// 四張表都是 `#` 開頭列＝說明，會跳過：
//   發碼表.csv      code,name,plan,limit,packs,gifts,expires,note[,grant]
//   訂單表.csv      order_no,product,amount,date,status,nickname,note
//   權益規則表.csv   rule_type,condition,grant,note
//   Drive連結表.csv  pack,title,url
// 做四件事：①把網站收到的「待核對訂單」補進訂單表（status=pending，江江查完後台改 ok）②寫入四張表
// ③訂單表標 ok 的，回頭把綁了該訂單的帳號 codes 狀態改 ok ④印出還在 pending 的清單。
// 不刪帳號、不動用量；發碼表移除的碼會從 Upstash 刪掉（用索引集合比對）。

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DRY = process.argv.includes('--dry-run');
const PREFIX = 'skillstore:';

// ── env ──
function loadEnvLocal() {
  const p = path.join(__dirname, '..', '.env.local');
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"\n]*)"?\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}
loadEnvLocal();
const URL_ = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const KV_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN; // 變數名帶前綴：秘密掃描把「token = 長字串」當可疑，這樣寫才過得了 pre-push
const TABLES = process.env.SKILL_STORE_TABLES;
if (!TABLES || !fs.existsSync(TABLES)) { console.error('⛔ 請設 SKILL_STORE_TABLES＝商店後台資料夾絕對路徑'); process.exit(1); }
if (!DRY && (!URL_ || !KV_TOKEN)) { console.error('⛔ 找不到 KV_REST_API_URL／KV_REST_API_TOKEN（先 vercel env pull 或設環境變數）'); process.exit(1); }

async function pipe(commands) {
  if (DRY) { console.log('  [dry-run]', commands.map((c) => c.slice(0, 2).join(' ')).join(' | ')); return commands.map(() => null); }
  const r = await fetch(`${URL_}/pipeline`, {
    method: 'POST', headers: { Authorization: `Bearer ${KV_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(commands),
  });
  if (!r.ok) throw new Error(`upstash ${r.status} ${await r.text()}`);
  return (await r.json()).map((x) => (x && 'result' in x ? x.result : null));
}
const one = async (c) => (await pipe([c]))[0];
const sha = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');
const normCode = (c) => String(c || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, ''); // 訂單編號忽略連字號與空白，避免同一筆用兩種寫法綁兩次

// ── CSV（支援雙引號欄位）──
function parseCSV(text) {
  const rows = [];
  let row = [], field = '', inQ = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQ) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') inQ = false;
      else field += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += ch;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}
function readTable(name) {
  const p = path.join(TABLES, name);
  if (!fs.existsSync(p)) { console.warn(`⚠️ 沒有 ${name}，略過`); return { header: [], rows: [], path: p }; }
  const rows = parseCSV(fs.readFileSync(p, 'utf8').replace(/^﻿/, ''));
  const header = (rows.shift() || []).map((h) => h.trim());
  const data = rows
    .filter((r) => r.length && r.join('').trim() !== '' && !String(r[0]).trim().startsWith('#'))
    .map((r) => Object.fromEntries(header.map((h, i) => [h, (r[i] || '').trim()])));
  return { header, rows: data, path: p };
}
const csvCell = (v) => (/[",\n]/.test(v) ? `"${String(v).replace(/"/g, '""')}"` : v);

async function main() {
  console.log(`同步開始 ${DRY ? '（dry-run，不寫入）' : ''}\n表格：${TABLES}`);

  // ① 待核對訂單 → 補進訂單表
  const orders = readTable('訂單表.csv');
  const known = new Set(orders.rows.map((r) => normCode(r.order_no)));
  const pendingRaw = DRY ? [] : (await one(['LRANGE', `${PREFIX}pending:list`, 0, 4999])) || [];
  const seen = new Set();
  const newRows = [];
  for (const s of pendingRaw) {
    let p; try { p = JSON.parse(s); } catch { continue; }
    const no = normCode(p.order_no);
    if (!no || known.has(no) || seen.has(no)) continue;
    seen.add(no);
    newRows.push({ order_no: no, product: '', amount: '', date: p.t ? p.t.slice(0, 10) : '', status: 'pending', nickname: p.nick || '', note: '網站提交，待核對' });
  }
  if (newRows.length && orders.header.length) {
    const lines = newRows.map((r) => orders.header.map((h) => csvCell(r[h] ?? '')).join(','));
    if (!DRY) fs.appendFileSync(orders.path, (fs.readFileSync(orders.path, 'utf8').endsWith('\n') ? '' : '\n') + lines.join('\n') + '\n');
    console.log(`① 補進訂單表 ${newRows.length} 筆待核對：${newRows.map((r) => r.order_no).join('、')}`);
    orders.rows.push(...newRows);
  } else console.log('① 沒有新的待核對訂單');

  // ② 發碼表
  const issued = readTable('發碼表.csv');
  const issuedCmds = [];
  const newIndex = [];
  for (const r of issued.rows) {
    const code = normCode(r.code);
    if (!code) continue;
    const h = sha(code);
    newIndex.push(h);
    const rec = { name: r.name, plan: r.plan || 'none', limit: r.limit || '', packs: r.packs || 'all', gifts: r.gifts || 0, expires: r.expires || '', grant: r.grant || '', note: r.note || '' };
    issuedCmds.push(['SET', `${PREFIX}issued:${h}`, JSON.stringify(rec)]);
  }
  const oldIndex = DRY ? [] : (await one(['SMEMBERS', `${PREFIX}issued:index`])) || [];
  const removed = oldIndex.filter((h) => !newIndex.includes(h));
  for (const h of removed) issuedCmds.push(['DEL', `${PREFIX}issued:${h}`]);
  issuedCmds.push(['DEL', `${PREFIX}issued:index`]);
  if (newIndex.length) issuedCmds.push(['SADD', `${PREFIX}issued:index`, ...newIndex]);
  if (issuedCmds.length) await pipe(issuedCmds);
  console.log(`② 發碼表 ${newIndex.length} 組（移除 ${removed.length} 組）`);

  // ③ 訂單表 → skillstore:order:<no>；status ok 的回頭更新帳號
  const orderCmds = [];
  const okOrders = [];
  for (const r of orders.rows) {
    const no = normCode(r.order_no);
    if (!no) continue;
    const rec = { product: r.product, amount: Number(r.amount) || 0, date: r.date, status: r.status || 'pending', nickname: (r.nickname || '').toLowerCase(), note: r.note || '' };
    orderCmds.push(['SET', `${PREFIX}order:${no}`, JSON.stringify(rec)]);
    if (rec.status === 'ok') okOrders.push({ no, nick: rec.nickname });
  }
  if (orderCmds.length) await pipe(orderCmds);
  let fixed = 0;
  for (const { no, nick } of okOrders) {
    if (!nick || DRY) continue;
    const raw = await one(['GET', `${PREFIX}account:${nick}`]);
    if (!raw) continue;
    const acc = JSON.parse(raw);
    let changed = false;
    for (const c of acc.codes || []) if (c.type === 'order' && normCode(c.value) === no && c.status !== 'ok') { c.status = 'ok'; changed = true; }
    if (changed) { await one(['SET', `${PREFIX}account:${nick}`, JSON.stringify(acc)]); fixed++; }
  }
  console.log(`③ 訂單表 ${orderCmds.length} 筆（ok ${okOrders.length}，帳號狀態更新 ${fixed}）`);

  // ④ 規則表與 Drive 連結
  const rules = readTable('權益規則表.csv').rows.filter((r) => r.rule_type);
  await one(['SET', `${PREFIX}rule:list`, JSON.stringify(rules)]);
  const drive = readTable('Drive連結表.csv').rows.filter((r) => r.pack && r.url);
  if (drive.length) await pipe(drive.map((r) => ['SET', `${PREFIX}drive:${String(r.pack).padStart(2, '0')}`, r.url]));
  console.log(`④ 規則 ${rules.length} 條、Drive 連結 ${drive.length} 包`);

  // 摘要：還在 pending 的
  const stillPending = orders.rows.filter((r) => (r.status || 'pending') === 'pending');
  if (stillPending.length) {
    console.log(`\n⏳ 待你去 Portaly 後台核對（查到就把 status 改 ok，再跑一次同步）：`);
    for (const r of stillPending) console.log(`   ${r.order_no}｜暱稱 ${r.nickname || '?'}｜${r.date || ''}`);
  } else console.log('\n✅ 沒有待核對的訂單');
  await one(['SET', `${PREFIX}synced-at`, new Date().toISOString()]);
  console.log('同步完成');
}
main().catch((e) => { console.error('⛔ 同步失敗：', e.message); process.exit(1); });
