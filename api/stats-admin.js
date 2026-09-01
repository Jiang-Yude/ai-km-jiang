// 站長儀表板資料源：/stats.html 密碼門後面那一整頁的資料，一次回傳。
// 只讀不寫（除了驗證失敗的限流計數）。資料來源同 view.js 的 Upstash Redis。
//
// POST { pw, from, to }
//   pw   密碼（明文比對，見下）
//   from 起日 YYYY-MM-DD、to 迄日 YYYY-MM-DD，兩個都省略＝最近 30 天。
//   範圍是日期不是月份：月初打開頁面時「當月」只有一兩天，
//   畫出來是一個孤點、對話也只剩兩三則，看起來像資料不見了（江江 2026-09-01 反應）。
//
// 密碼存環境變數，**不寫進 repo**（ai-km-jiang 是 public repo）：
//   STATS_PASSWORD_B64＝密碼的 base64（優先讀這個）
//   用 base64 存的原因：後台輸入框對某些字元會做正規化，base64 過一手就不會被動到，
//   後端 decode 回來再比對，存進去什麼就是什麼。
//   產生方式：printf '你的密碼' | base64   （repo 是公開的，這裡不寫任何實際值與線索）
//   （STATS_PASSWORD 明文變數仍可用，當作備援，但不保證原樣存得住，優先用 B64。）
//
// 回傳的 chat 逐筆內容含訪客的原始提問，屬敏感資料：
//   本端點一律 Cache-Control: no-store，且不設 CORS 白名單以外的來源。

const URL = () => process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const TOKEN = () => process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;

function expectedPassword() {
  const b64 = process.env.STATS_PASSWORD_B64;
  if (b64) { try { return Buffer.from(b64, 'base64').toString('utf8'); } catch { /* 壞掉就當沒設 */ } }
  return process.env.STATS_PASSWORD || '';
}

/* 長度不同也要跑完整趟比對，避免用回應時間猜長度 */
function safeEqual(a, b) {
  const A = Buffer.from(String(a), 'utf8');
  const B = Buffer.from(String(b), 'utf8');
  let diff = A.length ^ B.length;
  const n = Math.max(A.length, B.length);
  for (let i = 0; i < n; i++) diff |= (A[i] || 0) ^ (B[i] || 0);
  return diff === 0;
}

async function pipe(commands) {
  const r = await fetch(`${URL()}/pipeline`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(commands),
  });
  if (!r.ok) throw new Error(`upstash ${r.status}`);
  const j = await r.json();
  return j.map((o) => (o && o.result != null ? o.result : null));
}

function taipeiDay(d = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(d);
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/* 從 YYYY-MM-DD 往前推 n 天，純字串算不碰時區 */
function shiftDay(day, n) {
  const d = new Date(day + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/* 範圍涵蓋哪幾個 YYYY-MM，用來決定要撈哪幾份月份清單 */
function monthsBetween(from, to) {
  const out = [];
  let y = Number(from.slice(0, 4)), m = Number(from.slice(5, 7));
  const ey = Number(to.slice(0, 4)), em = Number(to.slice(5, 7));
  while (y < ey || (y === ey && m <= em)) {
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    m += 1; if (m > 12) { m = 1; y += 1; }
    if (out.length > 120) break; // 防呆：最多十年
  }
  return out;
}

function parseRows(list) {
  return (list || []).map((s) => { try { return JSON.parse(s); } catch { return null; } }).filter(Boolean);
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'POST only' }); return; }
  if (!URL() || !TOKEN()) { res.status(200).json({ error: 'storage not configured' }); return; }

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
  body = body || {};

  const want = expectedPassword();
  if (!want) { res.status(503).json({ error: 'password not configured' }); return; }

  /* 限流：同一 IP 每 15 分鐘最多錯 5 次（Codex 跨家審查建議的強度）。
     只算「錯的次數」，密碼對了不佔額度，所以自己重新整理不會被鎖在外面。
     密碼只有四個字元，這道限流是它唯一的暴力破解防線，不要放寬。 */
  const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'na';
  const failKey = `stats:auth:${ip}:${Math.floor(Date.now() / 900000)}`;
  try {
    const [n] = await pipe([['GET', failKey]]);
    if (Number(n || 0) >= 5) { res.status(429).json({ error: 'too many attempts' }); return; }
  } catch { /* 限流壞掉不擋正常使用 */ }

  if (!safeEqual(body.pw, want)) {
    try { await pipe([['INCR', failKey], ['EXPIRE', failKey, 1800]]); } catch { /* 忽略 */ }
    res.status(403).json({ error: 'wrong password' });
    return;
  }

  const today = taipeiDay();

  try {
    const dayList = (await pipe([['ZRANGE', 'idx:days', '0', '-1']]))[0] || [];
    const monthList = (await pipe([['ZRANGE', 'idx:months', '0', '-1']]))[0] || [];
    const earliest = dayList.length ? dayList[0] : today;

    let to = DATE_RE.test(String(body.to || '')) ? body.to : today;
    let from = DATE_RE.test(String(body.from || '')) ? body.from : shiftDay(to, -29);
    if (from > to) { const t = from; from = to; to = t; }
    if (from < earliest) from = earliest;

    // ── 範圍內每日全站瀏覽
    const rangeDays = dayList.filter((d) => d >= from && d <= to);
    const dayVals = rangeDays.length ? (await pipe([['MGET', ...rangeDays.map((d) => `global:day:${d}`)]]))[0] : [];
    const days = rangeDays.map((d, i) => ({ date: d, count: Number((dayVals || [])[i] || 0) }));

    // ── 前一段等長區間，用來算「比上一段多多少」
    const spanDays = Math.max(1, Math.round((new Date(to) - new Date(from)) / 86400000) + 1);
    const prevTo = shiftDay(from, -1), prevFrom = shiftDay(prevTo, -(spanDays - 1));
    const prevDays = dayList.filter((d) => d >= prevFrom && d <= prevTo);
    const prevVals = prevDays.length ? (await pipe([['MGET', ...prevDays.map((d) => `global:day:${d}`)]]))[0] : [];
    const prevTotal = (prevVals || []).reduce((a, v) => a + Number(v || 0), 0);

    // ── 歷月（趨勢用）與全站總數
    const monthVals = monthList.length ? (await pipe([['MGET', ...monthList.map((m) => `global:month:${m}`)]]))[0] : [];
    const months = monthList.map((m, i) => ({ month: m, count: Number((monthVals || [])[i] || 0) }));
    const total = Number((await pipe([['GET', 'global']]))[0] || 0);

    // ── 每頁累計（跟範圍無關，是開站到現在）
    const pageKeys = (await pipe([['KEYS', 'page:*']]))[0] || [];
    const pageVals = pageKeys.length ? (await pipe([['MGET', ...pageKeys]]))[0] : [];
    const pages = pageKeys
      .map((k, i) => ({ path: String(k).slice(5), views: Number((pageVals || [])[i] || 0) }))
      .sort((a, b) => b.views - a.views);

    const secKeys = (await pipe([['KEYS', 'section:*']]))[0] || [];
    const secVals = secKeys.length ? (await pipe([['MGET', ...secKeys]]))[0] : [];
    const sections = secKeys.map((k, i) => ({ name: String(k).slice(8), views: Number((secVals || [])[i] || 0) }))
      .sort((a, b) => b.views - a.views);

    // ── 範圍內每頁每日（2026-09-01 起才開始記）
    const pagedayDays = ((await pipe([['KEYS', 'pageday:*']]))[0] || [])
      .map((k) => String(k).slice(8)).filter((d) => d >= from && d <= to).sort();
    let pageDaily = [];
    if (pagedayDays.length) {
      const hashes = await pipe(pagedayDays.map((d) => ['HGETALL', `pageday:${d}`]));
      pageDaily = pagedayDays.map((d, i) => {
        const flat = hashes[i] || [];
        const obj = {};
        for (let j = 0; j < flat.length; j += 2) obj[flat[j]] = Number(flat[j + 1] || 0);
        return { date: d, pages: obj };
      });
    }

    // ── 咪卡對話與站內搜尋：逐月撈回來再依日期過濾（list 是每月一份）
    const spanMonths = monthsBetween(from, to);
    const chatMonths = ((await pipe([['KEYS', 'mika:chat:*']]))[0] || [])
      .map((k) => String(k).slice(10)).sort();

    const chatRaw = await pipe(spanMonths.map((m) => ['LRANGE', `mika:chat:${m}`, 0, 19999]));
    const chat = spanMonths.flatMap((m, i) => parseRows(chatRaw[i]))
      .filter((r) => r.t && r.t.slice(0, 10) >= from && r.t.slice(0, 10) <= to);

    const searchRaw = await pipe(spanMonths.map((m) => ['LRANGE', `search:log:${m}`, 0, 4999]));
    const search = spanMonths.flatMap((m, i) => parseRows(searchRaw[i]))
      .filter((r) => r.t && r.t.slice(0, 10) >= from && r.t.slice(0, 10) <= to);

    /* 零命中詞是每月一個 ZSET，只能整月合併，沒辦法切到日。
       範圍跨月時把各月分數相加，前端會標明這一項是以月為單位。 */
    const missRaw = await pipe(spanMonths.map((m) => ['ZRANGE', `search:miss:${m}`, 0, 99, 'REV', 'WITHSCORES']));
    const missMap = {};
    spanMonths.forEach((m, i) => {
      const flat = missRaw[i] || [];
      for (let j = 0; j < flat.length; j += 2) missMap[flat[j]] = (missMap[flat[j]] || 0) + Number(flat[j + 1] || 0);
    });
    const misses = Object.keys(missMap).map((q) => ({ q, n: missMap[q] }))
      .sort((a, b) => b.n - a.n).slice(0, 60);

    /* 獨立訪客（HyperLogLog 近似值，誤差 0.81%）與來源網站。
       兩者都 2026-09-01 才開始記，之前的區間會是 0。 */
    const uvDayKeys = rangeDays.map((d) => `uv:day:${d}`);
    const uvRange = uvDayKeys.length ? Number((await pipe([['PFCOUNT', ...uvDayKeys]]))[0] || 0) : 0;
    const uvByDay = uvDayKeys.length
      ? (await pipe(uvDayKeys.map((k) => ['PFCOUNT', k]))).map((v, i) => ({ date: rangeDays[i], uv: Number(v || 0) }))
      : [];

    const refFlat = await pipe(spanMonths.map((m) => ['ZRANGE', `ref:${m}`, 0, 99, 'REV', 'WITHSCORES']));
    const refMap = {};
    refFlat.forEach((flat) => {
      flat = flat || [];
      for (let i = 0; i < flat.length; i += 2) refMap[flat[i]] = (refMap[flat[i]] || 0) + Number(flat[i + 1] || 0);
    });
    const refs = Object.keys(refMap).map((h) => ({ host: h, n: refMap[h] }))
      .sort((a, b) => b.n - a.n).slice(0, 40);

    res.status(200).json({
      ok: true, today, from, to, spanDays, earliest,
      uvRange, uvByDay, refs,
      prevFrom, prevTo, prevTotal,
      chatMonths, availableMonths: months.map((m) => m.month),
      total, days, months, pages, sections, pageDaily,
      chat, search, misses,
    });
  } catch (e) {
    res.status(200).json({ error: String((e && e.message) || e) });
  }
};
