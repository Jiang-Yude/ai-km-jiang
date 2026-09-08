// 技能包商店：會員驗證與下載發放（2026-09-08 立，計劃檔＝主庫 2026-09-08-1248 系統設計：技能包商店）。
//
// 身分＝暱稱＋密碼；一個暱稱底下綁多組通關碼。通關碼三種：
//   issued  江江在「發碼表」發的碼（陪跑碼、現場碼），同步後立即生效
//   order   Portaly 訂單編號，先進「待核對」，江江在後台查過、訂單表標 ok、重跑同步後才生效
//   gift    別人送的一次性碼，走 redeem，不綁帳號
// 權益在每次請求即時算，不存快取：issued 的 plan／packs／gifts ＋ 已核對訂單套「權益規則表」。
// 資料存 Upstash Redis（跟 search-log.js／mika-chat-log.js 同一組環境變數），key 一律 skillstore: 前綴，
// 整批清空只要刪這個前綴，不會碰到咪卡與統計。Drive 連結只在 Upstash（skillstore:drive:<包>），不進 repo。
//
// POST JSON，action 七種：
//   register  {nick, pw, code}        建帳號並綁第一組碼
//   login     {nick, pw}              回權益狀態
//   add-code  {nick, pw, code}        再綁一組碼（訂單編號會進待核對）
//   download  {nick, pw, pack}        檢查額度、扣、回 Drive 連結
//   gift      {nick, pw, pack}        扣送禮額度、回一次性碼（30 天有效，提案預設值，江江 2026-09-08 確認）
//   redeem    {token}                 朋友用一次性碼換 Drive 連結，碼作廢
//   catalog   {}                      回有哪些包已有 Drive 連結（給前端判斷「準備中」）
// 沒有 email、沒有個資（江江 2026-09-08 拍板）。密碼存 scrypt 雜湊；通關碼存 sha256 雜湊。
// 防灌爆：同 IP 每分鐘 20 次；密碼或碼錯統一回「暱稱或密碼不對」／「這組碼無效」，不分原因。

const crypto = require('crypto');
const CATALOG = require('../skill-store-data.js');

const URL = () => process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const TOKEN = () => process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
const PREFIX = 'skillstore:';
const GIFT_TTL_SEC = 30 * 86400;      // 送禮碼 30 天
const LOG_RETENTION_DAYS = 365;        // 下載紀錄留 365 天（同咪卡紀錄）
const RATE_LIMIT_PER_MIN = 20;
const PLAN_RANK = { unlimited: 3, monthly_budget: 2, count: 1, none: 0 };

async function pipe(commands) {
  const r = await fetch(`${URL()}/pipeline`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(commands),
  });
  if (!r.ok) throw new Error(`upstash ${r.status}`);
  const out = await r.json();
  return out.map((x) => (x && 'result' in x ? x.result : null));
}
const one = async (cmd) => (await pipe([cmd]))[0];
const getJSON = async (key) => { const v = await one(['GET', key]); return v ? JSON.parse(v) : null; };

function taipeiNow(d = new Date()) {
  const s = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(d); // "YYYY-MM-DD, HH:MM"
  return { stamp: s.replace(', ', ' '), day: s.slice(0, 10), month: s.slice(0, 7) };
}
function expireAtFor(month) {
  const [y, m] = month.split('-').map(Number);
  const next = Date.UTC(y, m, 1) - 8 * 3600 * 1000;
  return Math.floor(next / 1000) + LOG_RETENTION_DAYS * 86400;
}

const sha = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');
const normCode = (c) => String(c || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, ''); // 訂單編號忽略連字號與空白，避免同一筆用兩種寫法綁兩次
const normNick = (n) => String(n || '').trim().toLowerCase();
function hashPw(pw, salt) {
  salt = salt || crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(pw), salt, 32).toString('hex');
  return { salt, hash };
}
function verifyPw(pw, rec) {
  if (!rec || !rec.salt || !rec.hash) return false;
  const h = crypto.scryptSync(String(pw), rec.salt, 32);
  const stored = Buffer.from(rec.hash, 'hex');
  return h.length === stored.length && crypto.timingSafeEqual(h, stored);
}
function randToken(len = 8) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 去掉 0O1I，念給朋友聽不會搞混
  const bytes = crypto.randomBytes(len);
  let s = '';
  for (let i = 0; i < len; i++) s += alphabet[bytes[i] % alphabet.length];
  return s;
}
const packById = (id) => CATALOG.packs.find((p) => p.id === id);
const ALL_PACK_IDS = CATALOG.packs.map((p) => p.id);

function parsePacks(v) {
  if (!v || v === 'all') return 'all';
  return String(v).split(/[,、\s]+/).map((x) => x.trim()).filter(Boolean).map((x) => x.padStart(2, '0'));
}

// ── 權益計算 ─────────────────────────────────────────────────────────────
// 回 {plan, limit, planPacks, granted(Set), gifts, sources[]}
async function entitlement(account) {
  const codes = account.codes || [];
  let plan = 'none', limit = 0, planPacks = 'all', gifts = 0;
  const granted = new Set();
  const sources = [];
  const today = taipeiNow().day;

  function applyPlan(p, l, packs, from) {
    if (!p || p === 'none') return;
    if (PLAN_RANK[p] > PLAN_RANK[plan] || (p === plan && (l || 0) > (limit || 0))) {
      plan = p; limit = Number(l) || 0; planPacks = packs || 'all';
    }
    sources.push(from);
  }

  // issued 碼
  for (const c of codes) {
    if (c.type !== 'issued') continue;
    const rec = await getJSON(`${PREFIX}issued:${sha(normCode(c.value))}`);
    if (!rec) continue;                                   // 江江已從發碼表移除 → 失效
    if (rec.expires && rec.expires < today) continue;     // 過期
    applyPlan(rec.plan, rec.limit, parsePacks(rec.packs), `碼：${rec.name || c.value}`);
    gifts += Number(rec.gifts) || 0;
    if (rec.grant) parsePacks(rec.grant).forEach((p) => granted.add(p));
  }

  // 已核對訂單 → 規則表
  const okOrders = [];
  for (const c of codes) {
    if (c.type !== 'order' || c.status !== 'ok') continue;
    const o = await getJSON(`${PREFIX}order:${normCode(c.value)}`);
    if (o && o.status === 'ok') okOrders.push(o);
  }
  if (okOrders.length) {
    const rules = (await getJSON(`${PREFIX}rule:list`)) || [];
    const total = okOrders.reduce((s, o) => s + (Number(o.amount) || 0), 0);
    for (const r of rules) {
      if (r.rule_type === 'product') {
        const hit = okOrders.some((o) => o.product === r.condition || o.product_id === r.condition);
        if (hit) applyGrant(r.grant, `訂單：${r.condition}`);
      } else if (r.rule_type === 'amount_total') {
        if (total >= (Number(r.condition) || Infinity)) applyGrant(r.grant, `累計 ${total} 元`);
      }
    }
    function applyGrant(grant, from) {
      // grant 語法：pack:13,14 ｜ plan:unlimited ｜ plan:count:3 ｜ plan:monthly_budget:3000 ｜ gifts:2 ｜ 可用「；」串多個
      for (const g of String(grant || '').split(/[;；]/).map((x) => x.trim()).filter(Boolean)) {
        const [kind, a, b] = g.split(':').map((x) => x.trim());
        if (kind === 'pack') parsePacks(a).forEach((p) => { granted.add(p); });
        else if (kind === 'plan') applyPlan(a, b, 'all', from);
        else if (kind === 'gifts') gifts += Number(a) || 0;
      }
      if (!sources.includes(from)) sources.push(from);
    }
  }
  return { plan, limit, planPacks, granted, gifts, sources };
}

function planCovers(ent, packId) {
  if (ent.plan === 'none') return false;
  return ent.planPacks === 'all' || ent.planPacks.includes(packId);
}

async function usageOf(nick, month) {
  const [total, mCount, mBudget, giftsUsed] = await pipe([
    ['GET', `${PREFIX}usage:${nick}:count:total`],
    ['GET', `${PREFIX}usage:${nick}:count:${month}`],
    ['GET', `${PREFIX}usage:${nick}:budget:${month}`],
    ['GET', `${PREFIX}usage:${nick}:gifts`],
  ]);
  return { total: Number(total) || 0, mCount: Number(mCount) || 0, mBudget: Number(mBudget) || 0, giftsUsed: Number(giftsUsed) || 0 };
}

function remaining(ent, usage) {
  if (ent.plan === 'unlimited') return { kind: 'unlimited', left: Infinity };
  if (ent.plan === 'count') return { kind: 'count', left: Math.max(0, ent.limit - usage.total) };
  if (ent.plan === 'monthly_budget') return { kind: 'monthly_budget', left: Math.max(0, ent.limit - usage.mBudget) };
  return { kind: 'none', left: 0 };
}

async function stateFor(account, downloadedSet) {
  const nick = account.nick;
  const { month } = taipeiNow();
  const ent = await entitlement(account);
  const usage = await usageOf(nick, month);
  const rem = remaining(ent, usage);
  const drive = await pipe(ALL_PACK_IDS.map((id) => ['EXISTS', `${PREFIX}drive:${id}`]));
  const packs = ALL_PACK_IDS.map((id, i) => {
    const gr = ent.granted.has(id);
    const covered = planCovers(ent, id);
    const price = (packById(id) || {}).price;
    let can = false, why = '';
    if (!drive[i]) { why = '準備中'; }
    else if (gr) { can = true; why = '已贈送'; }
    else if (covered) {
      if (rem.kind === 'unlimited') { can = true; why = '會員'; }
      else if (rem.kind === 'count') { can = rem.left > 0; why = can ? `剩 ${rem.left} 包` : '額度用完'; }
      else if (rem.kind === 'monthly_budget') {
        const cost = Number(price) || 0;
        can = rem.left >= cost; why = can ? `本月剩 ${rem.left} 元額度` : '本月額度不足';
      }
    } else { why = '不在你的方案內'; }
    return { id, can, why, downloaded: downloadedSet ? downloadedSet.has(id) : false };
  });
  return {
    nick: account.display || account.nick,
    plan: ent.plan, limit: ent.limit,
    remaining: rem.kind === 'unlimited' ? '不限' : rem.left,
    remainingKind: rem.kind,
    gifts: Math.max(0, ent.gifts - usage.giftsUsed),
    sources: ent.sources,
    codes: (account.codes || []).map((c) => ({ type: c.type, value: c.type === 'issued' ? maskCode(c.value) : c.value, status: c.status })),
    packs,
  };
}
const maskCode = (v) => (v.length <= 4 ? '****' : v.slice(0, 2) + '***' + v.slice(-2));

async function log(month, entry) {
  const key = `${PREFIX}log:${month}`;
  await pipe([
    ['LPUSH', key, JSON.stringify(entry)],
    ['LTRIM', key, 0, 19999],
    ['EXPIREAT', key, expireAtFor(month), 'NX'],
  ]);
}

// ── 帳號 ─────────────────────────────────────────────────────────────────
async function loadAccount(nickRaw, pw) {
  const nick = normNick(nickRaw);
  if (!nick) return null;
  const acc = await getJSON(`${PREFIX}account:${nick}`);
  if (!acc || !verifyPw(pw, acc.pw)) return null;
  return acc;
}
async function saveAccount(acc) {
  await one(['SET', `${PREFIX}account:${acc.nick}`, JSON.stringify(acc)]);
}

// 綁碼：回 {type, status} 或 throw 中文錯誤
async function bindCode(acc, codeRaw, ip) {
  const code = normCode(codeRaw);
  if (!code || code.length < 3 || code.length > 40) throw new Error('這組碼無效');
  if ((acc.codes || []).some((c) => normCode(c.value) === code)) throw new Error('這組碼已經綁在你的帳號了');

  // 1) 發碼表的碼
  const issued = await getJSON(`${PREFIX}issued:${sha(code)}`);
  if (issued) {
    if (issued.expires && issued.expires < taipeiNow().day) throw new Error('這組碼無效');
    acc.codes.push({ type: 'issued', value: code, status: 'ok', at: taipeiNow().stamp });
    return { type: 'issued', status: 'ok' };
  }

  // 2) 當成 Portaly 訂單編號：全域只能綁一次（Codex 跨家審條件）
  const claimed = await one(['SET', `${PREFIX}orderclaim:${code}`, acc.nick, 'NX']);
  if (claimed !== 'OK') {
    const owner = await one(['GET', `${PREFIX}orderclaim:${code}`]);
    if (owner !== acc.nick) throw new Error('這組訂單編號已經被別的暱稱綁走了。如果是你的訂單，請聯絡江江');
  }
  const order = await getJSON(`${PREFIX}order:${code}`);
  const status = order && order.status === 'ok' ? 'ok' : 'pending';
  acc.codes.push({ type: 'order', value: code, status, at: taipeiNow().stamp });
  if (status === 'pending') {
    await pipe([
      ['LPUSH', `${PREFIX}pending:list`, JSON.stringify({ nick: acc.nick, order_no: code, t: taipeiNow().stamp })],
      ['LTRIM', `${PREFIX}pending:list`, 0, 4999],
    ]);
  }
  return { type: 'order', status };
}

// ── 主處理 ────────────────────────────────────────────────────────────────
module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'POST only' });
  if (!URL() || !TOKEN()) return res.status(503).json({ ok: false, error: '後端尚未設定' });

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
  body = body || {};
  const action = String(body.action || '');
  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
  const { stamp, month } = taipeiNow();

  try {
    // 防灌爆
    const rlKey = `${PREFIX}rl:${sha(ip).slice(0, 16)}:${Math.floor(Date.now() / 60000)}`;
    const [hits] = await pipe([['INCR', rlKey], ['EXPIRE', rlKey, 90]]);
    if (Number(hits) > RATE_LIMIT_PER_MIN) return res.status(429).json({ ok: false, error: '太頻繁了，一分鐘後再試' });

    if (action === 'catalog') {
      const drive = await pipe(ALL_PACK_IDS.map((id) => ['EXISTS', `${PREFIX}drive:${id}`]));
      return res.status(200).json({ ok: true, ready: ALL_PACK_IDS.filter((_, i) => drive[i]) });
    }

    if (action === 'redeem') {
      const token = normCode(body.token);
      if (!token) return res.status(400).json({ ok: false, error: '請輸入禮物碼' });
      const gift = await getJSON(`${PREFIX}gift:${token}`);
      if (!gift) return res.status(404).json({ ok: false, error: '這組禮物碼無效或已經用過了' });
      const url = await one(['GET', `${PREFIX}drive:${gift.pack}`]);
      if (!url) return res.status(409).json({ ok: false, error: '這一包還在準備中，請晚點再試' });
      await one(['DEL', `${PREFIX}gift:${token}`]);
      await log(month, { t: stamp, act: 'redeem', pack: gift.pack, from: gift.from });
      const p = packById(gift.pack) || {};
      return res.status(200).json({ ok: true, pack: gift.pack, title: p.title, url });
    }

    if (action === 'register') {
      const nick = normNick(body.nick);
      const display = String(body.nick || '').trim();
      const pw = String(body.pw || '');
      if (!/^[^\s/\\<>"'`]{2,20}$/.test(display)) return res.status(400).json({ ok: false, error: '暱稱 2 到 20 字，不能有空白' });
      if (pw.length < 4 || pw.length > 20) return res.status(400).json({ ok: false, error: '密碼 4 到 20 字' });
      if (!normCode(body.code)) return res.status(400).json({ ok: false, error: '第一次建立要帶一組通關碼（訂單編號或江江給的碼）' });
      const acc = { nick, display, pw: hashPw(pw), codes: [], created: stamp };
      const created = await one(['SET', `${PREFIX}account:${nick}`, JSON.stringify(acc), 'NX']);
      if (created !== 'OK') return res.status(409).json({ ok: false, error: '這個暱稱已經有人用了，換一個' }); // 先到先得（江江 2026-09-08 拍板）
      let bound;
      try { bound = await bindCode(acc, body.code, ip); }
      catch (e) { await one(['DEL', `${PREFIX}account:${nick}`]); return res.status(400).json({ ok: false, error: e.message }); }
      await saveAccount(acc);
      await log(month, { t: stamp, act: 'register', nick, code_type: bound.type, status: bound.status });
      const state = await stateFor(acc);
      return res.status(200).json({ ok: true, bound, state, note: bound.status === 'pending' ? '訂單編號已送出待核對，江江確認後權益才會生效' : '' });
    }

    // 以下都要登入
    const acc = await loadAccount(body.nick, body.pw);
    if (!acc) return res.status(401).json({ ok: false, error: '暱稱或密碼不對' });

    if (action === 'login') {
      return res.status(200).json({ ok: true, state: await stateFor(acc) });
    }

    if (action === 'add-code') {
      let bound;
      try { bound = await bindCode(acc, body.code, ip); }
      catch (e) { return res.status(400).json({ ok: false, error: e.message }); }
      await saveAccount(acc);
      await log(month, { t: stamp, act: 'add-code', nick: acc.nick, code_type: bound.type, status: bound.status });
      return res.status(200).json({ ok: true, bound, state: await stateFor(acc), note: bound.status === 'pending' ? '訂單編號已送出待核對，江江確認後權益才會生效' : '' });
    }

    if (action === 'download') {
      const pack = String(body.pack || '').padStart(2, '0');
      if (!packById(pack)) return res.status(400).json({ ok: false, error: '沒有這一包' });
      const state = await stateFor(acc);
      const entry = state.packs.find((p) => p.id === pack);
      if (!entry || !entry.can) return res.status(403).json({ ok: false, error: entry ? entry.why : '沒有權限' });
      const url = await one(['GET', `${PREFIX}drive:${pack}`]);
      if (!url) return res.status(409).json({ ok: false, error: '這一包還在準備中' });
      // 扣額度：已贈送的不扣；unlimited 不扣；count 扣總數；monthly_budget 扣本月金額
      const ent = await entitlement(acc);
      if (!ent.granted.has(pack) && ent.plan !== 'unlimited') {
        const price = Number((packById(pack) || {}).price) || 0;
        if (ent.plan === 'count') await pipe([['INCR', `${PREFIX}usage:${acc.nick}:count:total`], ['INCR', `${PREFIX}usage:${acc.nick}:count:${month}`]]);
        else if (ent.plan === 'monthly_budget') await pipe([['INCRBY', `${PREFIX}usage:${acc.nick}:budget:${month}`, price], ['INCR', `${PREFIX}usage:${acc.nick}:count:${month}`]]);
      }
      await one(['SADD', `${PREFIX}downloaded:${acc.nick}`, pack]);
      await log(month, { t: stamp, act: 'download', nick: acc.nick, pack, plan: ent.plan });
      return res.status(200).json({ ok: true, pack, url, state: await stateFor(acc) });
    }

    if (action === 'gift') {
      const pack = String(body.pack || '').padStart(2, '0');
      if (!packById(pack)) return res.status(400).json({ ok: false, error: '沒有這一包' });
      const state = await stateFor(acc);
      if (state.gifts <= 0) return res.status(403).json({ ok: false, error: '你的送禮額度用完了' });
      const has = await one(['EXISTS', `${PREFIX}drive:${pack}`]);
      if (!has) return res.status(409).json({ ok: false, error: '這一包還在準備中，先不能送' });
      const token = randToken(8);
      const set = await one(['SET', `${PREFIX}gift:${token}`, JSON.stringify({ pack, from: acc.nick, t: stamp }), 'NX', 'EX', GIFT_TTL_SEC]);
      if (set !== 'OK') return res.status(500).json({ ok: false, error: '產碼撞號，再按一次' });
      await one(['INCR', `${PREFIX}usage:${acc.nick}:gifts`]);
      await log(month, { t: stamp, act: 'gift', nick: acc.nick, pack, token });
      const p = packById(pack) || {};
      return res.status(200).json({ ok: true, token, pack, title: p.title, days: 30, state: await stateFor(acc) });
    }

    return res.status(400).json({ ok: false, error: '不認識的 action' });
  } catch (e) {
    console.error('skill-access error', e);
    return res.status(500).json({ ok: false, error: '後端出錯，稍後再試' });
  }
};

// 給測試與同步腳本用
module.exports._internal = { sha, normCode, normNick, hashPw, verifyPw, parsePacks, PREFIX, taipeiNow };
