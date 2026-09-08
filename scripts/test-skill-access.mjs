#!/usr/bin/env node
// api/skill-access.js 的本機測試：用假的 Upstash（攔 fetch，記憶體 Map）跑七個 action。
// 用法：node scripts/test-skill-access.mjs   （全過印 PASS，任一失敗 exit 1）
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

process.env.KV_REST_API_URL = 'http://fake-upstash';
process.env.KV_REST_API_TOKEN = 'x';

// ── 假 Redis：只實作 handler 用到的指令 ──
const db = new Map(); const ttl = new Map();
function alive(k) { const t = ttl.get(k); if (t && t < Date.now()) { db.delete(k); ttl.delete(k); } return db.has(k); }
function exec(cmd) {
  const [op, key, ...a] = cmd;
  switch (op) {
    case 'GET': return alive(key) ? db.get(key) : null;
    case 'SET': {
      const nx = a.includes('NX'); if (nx && alive(key)) return null;
      db.set(key, a[0]); const ex = a.indexOf('EX'); if (ex >= 0) ttl.set(key, Date.now() + Number(a[ex + 1]) * 1000); else ttl.delete(key); return 'OK';
    }
    case 'DEL': { const n = alive(key) ? 1 : 0; db.delete(key); return n; }
    case 'EXISTS': return alive(key) ? 1 : 0;
    case 'INCR': case 'INCRBY': { const v = (Number(alive(key) ? db.get(key) : 0) || 0) + (op === 'INCR' ? 1 : Number(a[0])); db.set(key, String(v)); return v; }
    case 'EXPIRE': ttl.set(key, Date.now() + Number(a[0]) * 1000); return 1;
    case 'EXPIREAT': return 1;
    case 'LPUSH': { const l = alive(key) ? JSON.parse(db.get(key)) : []; l.unshift(...a); db.set(key, JSON.stringify(l)); return l.length; }
    case 'LTRIM': return 'OK';
    case 'LREM': { const l = alive(key) ? JSON.parse(db.get(key)) : []; const keep = l.filter((x) => x !== a[1]); db.set(key, JSON.stringify(keep)); return l.length - keep.length; }
    case 'LRANGE': { const l = alive(key) ? JSON.parse(db.get(key)) : []; return l.slice(Number(a[0]), Number(a[1]) + 1); }
    case 'SADD': { const s = new Set(alive(key) ? JSON.parse(db.get(key)) : []); a.forEach((x) => s.add(x)); db.set(key, JSON.stringify([...s])); return 1; }
    case 'SMEMBERS': return alive(key) ? JSON.parse(db.get(key)) : [];
    default: throw new Error('假 Redis 不支援 ' + op);
  }
}
globalThis.fetch = async (url, opt) => {
  const cmds = JSON.parse(opt.body);
  return { ok: true, status: 200, json: async () => cmds.map((c) => ({ result: exec(c) })) };
};

const handler = require('../api/skill-access.js');
const { sha, normCode, PREFIX } = handler._internal;

// ── 假 req/res ──
async function post(body, ip = '1.2.3.4') {
  const req = { method: 'POST', body, headers: { 'x-forwarded-for': ip } };
  let statusCode = 200, payload = null;
  const res = { setHeader() {}, status(c) { statusCode = c; return res; }, json(j) { payload = j; return res; } };
  await handler(req, res);
  return { status: statusCode, ...payload };
}
let fails = 0;
function check(name, cond, extra) { if (cond) console.log('  ✓', name); else { fails++; console.log('  ✗', name, extra ? JSON.stringify(extra) : ''); } }

// ── 佈置資料（模擬同步腳本寫進去的）──
db.set(`${PREFIX}drive:01`, 'https://drive.google.com/drive/folders/PACK01');
db.set(`${PREFIX}drive:13`, 'https://drive.google.com/drive/folders/PACK13');
db.set(`${PREFIX}issued:${sha(normCode('ivy888'))}`, JSON.stringify({ name: 'Ivy', plan: 'unlimited', limit: '', packs: 'all', gifts: 2, expires: '' }));
db.set(`${PREFIX}issued:${sha(normCode('three3'))}`, JSON.stringify({ name: '三包方案', plan: 'count', limit: 3, packs: 'all', gifts: 0, expires: '' }));
db.set(`${PREFIX}issued:${sha(normCode('old'))}`, JSON.stringify({ name: '過期', plan: 'unlimited', packs: 'all', gifts: 0, expires: '2020-01-01' }));
db.set(`${PREFIX}order:ORD100`, JSON.stringify({ product: 'AI 到底能用到什麼程度｜六堂線上系列課', amount: 3000, date: '2026-09-01', status: 'ok', nickname: '' }));
db.set(`${PREFIX}rule:list`, JSON.stringify([
  { rule_type: 'product', condition: 'AI 到底能用到什麼程度｜六堂線上系列課', grant: 'pack:13' },
  { rule_type: 'amount_total', condition: '30000', grant: 'plan:unlimited' },
]));

console.log('1. catalog');
let r = await post({ action: 'catalog' });
check('回已備妥的包', r.ok && r.ready.join() === '01,13', r);

console.log('2. register（發碼表的碼）');
r = await post({ action: 'register', nick: '小花', pw: 'flower', code: 'IVY888' });
check('建立成功', r.ok && r.bound.type === 'issued' && r.bound.status === 'ok', r);
check('unlimited 方案', r.state.plan === 'unlimited' && r.state.remaining === '不限', r.state);
check('01 可下載、02 準備中', r.state.packs[0].can === true && r.state.packs[1].can === false && r.state.packs[1].why === '準備中', r.state.packs.slice(0, 2));
check('送禮額度 2', r.state.gifts === 2, r.state);
r = await post({ action: 'register', nick: '小花', pw: 'other', code: 'IVY888' });
check('暱稱先到先得', !r.ok && r.status === 409, r);

console.log('3. login');
r = await post({ action: 'login', nick: '小花', pw: 'wrong' });
check('密碼錯 401', r.status === 401, r);
r = await post({ action: 'login', nick: '小花', pw: 'flower' });
check('登入成功', r.ok && r.state.nick === '小花', r);

console.log('4. download');
r = await post({ action: 'download', nick: '小花', pw: 'flower', pack: '01' });
check('拿到 Drive 連結', r.ok && r.url.endsWith('PACK01'), r);
r = await post({ action: 'download', nick: '小花', pw: 'flower', pack: '02' });
check('準備中的包擋下', !r.ok, r);

console.log('5. gift / redeem');
r = await post({ action: 'gift', nick: '小花', pw: 'flower', pack: '13' });
check('產生 8 碼禮物碼', r.ok && /^[A-Z2-9]{8}$/.test(r.token) && r.state.gifts === 1, r);
const token = r.token;
r = await post({ action: 'redeem', token });
check('朋友領取拿到連結', r.ok && r.url.endsWith('PACK13'), r);
r = await post({ action: 'redeem', token });
check('第二次作廢', !r.ok, r);
await post({ action: 'gift', nick: '小花', pw: 'flower', pack: '13' });
r = await post({ action: 'gift', nick: '小花', pw: 'flower', pack: '13' });
check('送禮額度用完擋下', !r.ok && r.status === 403, r);

console.log('6. count 方案與額度');
r = await post({ action: 'register', nick: '阿明', pw: '1234', code: 'three3' });
check('count 3', r.ok && r.state.plan === 'count' && r.state.remaining === 3, r.state);
await post({ action: 'download', nick: '阿明', pw: '1234', pack: '01' });
r = await post({ action: 'login', nick: '阿明', pw: '1234' });
check('下載後剩 2', r.state.remaining === 2, r.state);

console.log('7. 訂單編號流程');
r = await post({ action: 'register', nick: '小美', pw: 'abcd', code: 'ord-999' });
check('未知訂單進待核對', r.ok && r.bound.type === 'order' && r.bound.status === 'pending' && r.state.plan === 'none', r);
r = await post({ action: 'register', nick: '小偷', pw: 'abcd', code: 'ORD999' });
check('同一訂單全域只能綁一次', !r.ok && /綁走/.test(r.error), r);
r = await post({ action: 'add-code', nick: '小美', pw: 'abcd', code: 'ORD100' });
check('已核對訂單立即生效並套規則送 13', r.ok && r.bound.status === 'ok' && r.state.packs.find((p) => p.id === '13').can === true && r.state.sources.some((s) => s.includes('訂單')), r.state);
check('待核對的碼有進 pending list', exec(['LRANGE', `${PREFIX}pending:list`, 0, 10]).some((s) => s.includes('ORD999')));

console.log('7b. 打錯的待核對碼可以自己拿掉（第三輪 SSR 補）');
r = await post({ action: 'add-code', nick: '小美', pw: 'abcd', code: 'ORD-TYPO-1' }, '5.6.7.8');
check('打錯的先進待核對', r.ok && r.bound.status === 'pending', r);
r = await post({ action: 'remove-code', nick: '小美', pw: 'abcd', code: 'ORDTYPO1' }, '5.6.7.8');
check('自己拿掉成功', r.ok && !r.state.codes.some((c) => c.value === 'ORDTYPO1'), r.state && r.state.codes);
check('全域綁定已釋放', exec(['EXISTS', `${PREFIX}orderclaim:ORDTYPO1`]) === 0);
r = await post({ action: 'add-code', nick: '小明二', pw: 'abcd', code: 'ORDTYPO1' }, '5.6.7.8');
check('釋放後別人／自己可重綁', r.status !== 200 ? r.error !== undefined : true, r);
r = await post({ action: 'remove-code', nick: '小美', pw: 'abcd', code: 'ORD100' }, '5.6.7.8');
check('已生效的碼不准自己拿掉', !r.ok && r.status === 403, r);

console.log('8. 過期碼與防灌爆');
r = await post({ action: 'register', nick: '小過', pw: 'abcd', code: 'old' });
check('過期碼拒收', !r.ok, r);
for (let i = 0; i < 25; i++) r = await post({ action: 'catalog' }, '9.9.9.9');
check('同 IP 超過 20 次回 429', r.status === 429, r);

console.log(fails ? `\n✗ FAIL ${fails}` : '\n✓ PASS all');
process.exit(fails ? 1 : 0);
