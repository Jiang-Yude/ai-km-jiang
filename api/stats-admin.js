// 站長儀表板資料源：/stats.html 密碼門後面那一整頁的資料，一次回傳。
// 只讀不寫（除了驗證失敗的限流計數）。資料來源同 view.js 的 Upstash Redis。
//
// POST { pw, month }  pw=密碼（明文比對，見下）  month=YYYY-MM（省略＝當月）
//   驗證通過才回資料。密碼錯誤回 403，同一 IP 每分鐘最多 10 次嘗試，超過回 429。
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
  const curMonth = today.slice(0, 7);
  const month = /^\d{4}-\d{2}$/.test(String(body.month || '')) ? body.month : curMonth;

  try {
    // ── 全站數字與時間序列
    const monthList = (await pipe([['ZRANGE', 'idx:months', '0', '-1']]))[0] || [];
    const dayList = (await pipe([['ZRANGE', 'idx:days', '0', '-1']]))[0] || [];
    const monthDays = dayList.filter((d) => String(d).startsWith(month));

    const [total, monthVals, dayVals] = await pipe([
      ['GET', 'global'],
      monthList.length ? ['MGET', ...monthList.map((m) => `global:month:${m}`)] : ['PING'],
      monthDays.length ? ['MGET', ...monthDays.map((d) => `global:day:${d}`)] : ['PING'],
    ]);

    const months = monthList.map((m, i) => ({ month: m, count: Number((monthVals || [])[i] || 0) }));
    const days = monthDays.map((d, i) => ({ date: d, count: Number((dayVals || [])[i] || 0) }));

    /* 最近 14 天（會跨月，所以不能拿當月那組來算「這週比上週」） */
    const last14 = dayList.slice(-14);
    const last14Vals = last14.length ? (await pipe([['MGET', ...last14.map((d) => `global:day:${d}`)]]))[0] : [];
    const recent = last14.map((d, i) => ({ date: d, count: Number((last14Vals || [])[i] || 0) }));

    // ── 每頁累計
    const pageKeys = (await pipe([['KEYS', 'page:*']]))[0] || [];
    const pageVals = pageKeys.length ? (await pipe([['MGET', ...pageKeys]]))[0] : [];
    const pages = pageKeys
      .map((k, i) => ({ path: String(k).slice(5), views: Number((pageVals || [])[i] || 0) }))
      .sort((a, b) => b.views - a.views);

    // ── 分區
    const secKeys = (await pipe([['KEYS', 'section:*']]))[0] || [];
    const secVals = secKeys.length ? (await pipe([['MGET', ...secKeys]]))[0] : [];
    const sections = secKeys.map((k, i) => ({ name: String(k).slice(8), views: Number((secVals || [])[i] || 0) }))
      .sort((a, b) => b.views - a.views);

    // ── 每頁每日（2026-09-01 起才開始記，之前沒有）
    const pagedayKeys = (await pipe([['KEYS', 'pageday:*']]))[0] || [];
    const pagedayDays = pagedayKeys.map((k) => String(k).slice(8)).filter((d) => d.startsWith(month)).sort();
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

    // ── 咪卡對話
    const chatMonths = ((await pipe([['KEYS', 'mika:chat:*']]))[0] || [])
      .map((k) => String(k).slice(10)).sort();
    const chat = parseRows((await pipe([['LRANGE', `mika:chat:${month}`, 0, 19999]]))[0]);

    // ── 站內搜尋
    const search = parseRows((await pipe([['LRANGE', `search:log:${month}`, 0, 4999]]))[0]);
    const missFlat = (await pipe([['ZRANGE', `search:miss:${month}`, 0, 49, 'REV', 'WITHSCORES']]))[0] || [];
    const misses = [];
    for (let i = 0; i < missFlat.length; i += 2) misses.push({ q: missFlat[i], n: Number(missFlat[i + 1] || 0) });

    res.status(200).json({
      ok: true, today, month,
      availableMonths: months.map((m) => m.month),
      chatMonths,
      total: Number(total || 0),
      days, months, recent, pages, sections, pageDaily,
      chat, search, misses,
    });
  } catch (e) {
    res.status(200).json({ error: String((e && e.message) || e) });
  }
};
