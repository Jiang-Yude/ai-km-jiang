// 站內搜尋 log：訪客搜了什麼、命中幾筆、有沒有點結果。
// 目的：找出「訪客的問法」跟「站上內容」對不上的缺口（第一線修法＝補 search-aliases.js 的別名）。
// 資料存 Upstash Redis，跟 view.js 同一套環境變數；每月一個 list，各留最近 5000 筆。
//
// POST {q, n, surface, click, tool}   q=搜尋字串  n=命中筆數  surface=search|articles|webmcp  click=點擊的結果 id（點擊事件才有）  tool=WebMCP 工具名（surface=webmcp 才有）
// GET  ?month=YYYY-MM&limit=500 讀當月紀錄（新到舊），給江江或 AI 整理缺口清單用。

const URL = () => process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const TOKEN = () => process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;

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
    /* 2026-09-01 補驗證（Codex 跨家審查抓到本端點原本任何人都讀得到）。
       搜尋字串會夾帶訪客在想什麼，跟聊天紀錄同級，不該公開。
       密碼＝站長儀表板那一支，存環境變數 STATS_PASSWORD_B64（base64，尾端空白才存得住）。 */
    const want = (() => {
      const b64 = process.env.STATS_PASSWORD_B64;
      if (b64) { try { return Buffer.from(b64, 'base64').toString('utf8'); } catch { /* 壞掉當沒設 */ } }
      return process.env.STATS_PASSWORD || process.env.MIKA_CHAT_READ_TOKEN || '';
    })();
    const given = String(req.headers['x-read-token'] || '');
    if (!want || given !== want) { res.status(403).json({ error: 'token required' }); return; }
    const month = String((req.query && req.query.month) || '').match(/^\d{4}-\d{2}$/)
      ? req.query.month
      : taipeiStamp().slice(0, 7);
    const limit = Math.min(Number((req.query && req.query.limit) || 500) || 500, 2000);
    try {
      const out = await pipe([['LRANGE', `search:log:${month}`, 0, limit - 1]]);
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

  const q = String(body.q || '').trim().slice(0, 80);
  if (q.length < 2) { res.status(200).json({ ok: false, note: 'query too short' }); return; }
  const ua = String(req.headers['user-agent'] || '');
  if (/bot|crawl|spider|slurp|headless|preview|facebookexternalhit|monitor|lighthouse/i.test(ua)) {
    res.status(200).json({ ok: false, note: 'bot skipped' }); return;
  }

  const stamp = taipeiStamp();               // "YYYY-MM-DD, HH:MM"
  const month = stamp.slice(0, 7);
  const surface = ['search', 'articles', 'webmcp'].includes(body.surface) ? body.surface : 'other';
  const entry = JSON.stringify({
    t: stamp.replace(', ', ' '),
    q,
    n: Number.isFinite(Number(body.n)) ? Number(body.n) : null,
    surface,
    click: body.click ? String(body.click).slice(0, 120) : undefined,
    tool: body.tool ? String(body.tool).slice(0, 40) : undefined,
  });

  try {
    const cmds = [
      ['LPUSH', `search:log:${month}`, entry],
      ['LTRIM', `search:log:${month}`, 0, 4999],
    ];
    // 零命中另掛計數，缺口排行一眼看：ZINCRBY 1 分給該查詢字串
    // webmcp 只讓 search_knowledge 進缺口排行（get_knowledge_item 的錯誤 ID、
    // taxonomy 維度名不是搜尋缺口，混進來會污染排行）
    const missEligible = surface !== 'webmcp' || body.tool === 'search_knowledge';
    if (Number(body.n) === 0 && !body.click && missEligible) cmds.push(['ZINCRBY', `search:miss:${month}`, 1, q]);
    await pipe(cmds);
    res.status(200).json({ ok: true });
  } catch (e) {
    res.status(200).json({ ok: false, error: String(e.message || e) });
  }
};
