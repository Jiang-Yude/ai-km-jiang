// 咪卡聊天記錄：訪客跟咪卡聊了什麼，江江後台可查。
// 進 repo 時改名放 api/mika-chat-log.js（與 search-log.js 同層）。
// 資料存 Upstash Redis，跟 search-log.js／view.js 同一套環境變數；每月一個 list，各留最近 20000 筆。
//
// POST {vid, sid, role, text, page, name}
//   vid=瀏覽器識別  sid=單次瀏覽識別  role=user|bot  text=訊息  page=所在頁面路徑
//   name=訪客自報稱呼（咪卡開場問「怎麼稱呼」收來的，純標籤：不驗證、不是帳號）。
//   不做會員、不追個人軌跡（江江 2026-08-07 拍板，去中心化原則），只做「大家都問什麼」統計。
//   防灌爆：同一 IP 每分鐘最多 60 筆，超過丟棄。
// GET  ?month=YYYY-MM&limit=1000 讀當月紀錄（新到舊）。
//   ⚠️ 聊天內容比搜尋字敏感：GET 必須帶 header `X-Read-Token`（環境變數 MIKA_CHAT_READ_TOKEN），
//   token 不走網址參數（避免留在 access log），沒設定環境變數就整個關閉讀取。

const URL = () => process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const TOKEN = () => process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
const READ_TOKEN = () => process.env.MIKA_CHAT_READ_TOKEN || '';

async function pipe(commands) {
  const r = await fetch(`${URL()}/pipeline`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(commands),
  });
  if (!r.ok) throw new Error(`upstash ${r.status}`);
  return r.json();
}

function taipeiStamp(d = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(d); // "YYYY-MM-DD, HH:MM"
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (!URL() || !TOKEN()) { res.status(200).json({ ok: false, note: 'storage not configured' }); return; }

  if (req.method === 'GET') {
    const given = String(req.headers['x-read-token'] || '');
    if (!READ_TOKEN() || given !== READ_TOKEN()) {
      res.status(403).json({ error: 'token required' });
      return;
    }
    const month = String((req.query && req.query.month) || '').match(/^\d{4}-\d{2}$/)
      ? req.query.month
      : taipeiStamp().slice(0, 7);
    const limit = Math.min(Number((req.query && req.query.limit) || 1000) || 1000, 5000);
    try {
      const out = await pipe([['LRANGE', `mika:chat:${month}`, 0, limit - 1]]);
      const rows = (out[0] && out[0].result ? out[0].result : []).map((s) => {
        try { return JSON.parse(s); } catch { return null; }
      }).filter(Boolean);
      res.status(200).json({ month, count: rows.length, rows });
    } catch (e) {
      res.status(200).json({ month, count: 0, rows: [], error: String(e.message || e) });
    }
    return;
  }

  if (req.method !== 'POST') { res.status(405).json({ error: 'GET or POST only' }); return; }

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
  body = body || {};

  const text = String(body.text || '').trim().slice(0, 500);
  if (!text) { res.status(200).json({ ok: false, note: 'empty' }); return; }
  const ua = String(req.headers['user-agent'] || '');
  if (/bot|crawl|spider|slurp|headless|preview|facebookexternalhit|monitor|lighthouse/i.test(ua)) {
    res.status(200).json({ ok: false, note: 'bot skipped' }); return;
  }

  // 防灌爆：同一 IP 每分鐘 60 筆上限（Redis INCR＋60 秒過期）
  const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'na';
  try {
    const rateKey = `mika:rate:${ip}:${Math.floor(Date.now() / 60000)}`;
    const rate = await pipe([['INCR', rateKey], ['EXPIRE', rateKey, 90]]);
    if (Number(rate[0] && rate[0].result) > 60) {
      res.status(429).json({ ok: false, note: 'rate limited' }); return;
    }
  } catch (e) { /* 限流壞了不擋記錄 */ }

  const stamp = taipeiStamp();
  const month = stamp.slice(0, 7);
  const entry = JSON.stringify({
    t: stamp.replace(', ', ' '),
    vid: String(body.vid || 'na').slice(0, 24),
    sid: String(body.sid || 'na').slice(0, 24),
    name: body.name ? String(body.name).slice(0, 20) : undefined,
    role: body.role === 'bot' ? 'bot' : 'user',
    text,
    page: String(body.page || '').slice(0, 120),
  });

  try {
    await pipe([
      ['LPUSH', `mika:chat:${month}`, entry],
      ['LTRIM', `mika:chat:${month}`, 0, 19999],
    ]);
    res.status(200).json({ ok: true });
  } catch (e) {
    res.status(200).json({ ok: false, error: String(e.message || e) });
  }
};
