// 站內搜尋 log：訪客搜了什麼、命中幾筆、有沒有點結果。
// 目的：找出「訪客的問法」跟「站上內容」對不上的缺口（第一線修法＝補 search-aliases.js 的別名）。
// 資料存 Upstash Redis，跟 view.js 同一套環境變數；每月一個 list，各留最近 5000 筆。
//
// POST {q, n, surface, click, tool}   q=搜尋字串  n=命中筆數  surface=search|articles|webmcp  click=點擊的結果 id（點擊事件才有）  tool=WebMCP 工具名（surface=webmcp 才有）
//
// 讀取：2026-10-19 移除本端點的 GET（安全審查 H1）。
//   原本 GET 用站長後台同一組密碼，卻沒有錯誤次數限制，等於繞過 stats-admin 的每網段 5 次限流，
//   可以無限次猜密碼。stats-admin 已經回傳同一批 search:log 逐筆與 search:miss 零命中排行，
//   stats-dash.js 也只讀 stats-admin，沒有任何前端呼叫這支的 GET，所以直接拿掉，不再維護第二套驗證。
//   要讀搜尋紀錄請用 /stats.html（stats-admin）。
//
// 寫入限流（2026-10-19，審查 M3）：每網段（IPv4 整個位址、IPv6 取 /64）每分鐘 10 筆、每天 200 筆，
//   超過回 429 不寫入；限流服務壞掉時也不寫入（回 503），避免被灌假的搜尋缺口。

const {clientNetwork}=require('../lib/2026-09-13-0910-client-network.js');
const { networkOf, rateCommand, rateAllowed, pipelineResults, applyCors } = clientNetwork;

const URL = () => process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const TOKEN = () => process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;

async function pipe(commands) {
  const r = await fetch(`${URL()}/pipeline`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(commands),
    signal: AbortSignal.timeout(3000),
  });
  if (!r.ok) throw new Error(`upstash ${r.status}`);
  return pipelineResults(await r.json(), commands.length);
}

const PER_MIN = 10;
const PER_DAY = 200;

function taipeiStamp(d = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(d); // "YYYY-MM-DD, HH:MM"
}

// 保存期限（2026-09-07 立，與 mika-chat-log.js 同規則）：每月的搜尋記錄在該月結束後保留 365 天自動刪除。
const RETENTION_DAYS = 365;
function expireAtFor(month /* 'YYYY-MM' */) {
  const [y, m] = month.split('-').map(Number);
  return Math.floor((Date.UTC(y, m, 1) - 8 * 3600 * 1000) / 1000) + RETENTION_DAYS * 86400;
}

module.exports = async (req, res) => {
  applyCors(req, res, 'POST, OPTIONS');
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'POST only' }); return; }
  if (!URL() || !TOKEN()) { res.status(200).json({ ok: false, note: 'storage not configured' }); return; }

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
  body = body || {};

  const q = String(body.q || '').trim().slice(0, 80);
  if (q.length < 2) { res.status(200).json({ ok: false, note: 'query too short' }); return; }
  const ua = String(req.headers['user-agent'] || '');
  if (/bot|crawl|spider|slurp|headless|preview|facebookexternalhit|monitor|lighthouse/i.test(ua)) {
    res.status(200).json({ ok: false, note: 'bot skipped' }); return;
  }

  const network = networkOf(req);
  if (!network) { res.status(503).json({ ok: false, note: 'temporarily unavailable' }); return; }

  const stamp = taipeiStamp();               // "YYYY-MM-DD, HH:MM"
  const month = stamp.slice(0, 7);
  const day = stamp.slice(0, 10);

  try {
    const [n] = await pipe([rateCommand([
      { key: `search:rate:${network}:${Math.floor(Date.now() / 60000)}`, limit: PER_MIN, ttl: 90 },
      { key: `search:rateday:${network}:${day}`, limit: PER_DAY, ttl: 172800 },
    ])]);
    if (!rateAllowed(n, 2)) { res.status(429).json({ ok: false, note: 'rate limited' }); return; }
  } catch (e) {
    console.error('search_log_limiter_unavailable', String((e && e.message) || e));
    res.status(503).json({ ok: false, note: 'temporarily unavailable' }); return;
  }
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
      ['EXPIREAT', `search:log:${month}`, expireAtFor(month), 'NX'],
    ];
    // 零命中另掛計數，缺口排行一眼看：ZINCRBY 1 分給該查詢字串
    // webmcp 只讓 search_knowledge 進缺口排行（get_knowledge_item 的錯誤 ID、
    // taxonomy 維度名不是搜尋缺口，混進來會污染排行）
    const missEligible = surface !== 'webmcp' || body.tool === 'search_knowledge';
    if (Number(body.n) === 0 && !body.click && missEligible) {
      cmds.push(['ZINCRBY', `search:miss:${month}`, 1, q]);
      cmds.push(['EXPIREAT', `search:miss:${month}`, expireAtFor(month), 'NX']);
    }
    await pipe(cmds);
    res.status(200).json({ ok: true });
  } catch (e) {
    console.error('search_log_write_failed', String((e && e.message) || e));
    res.status(503).json({ ok: false, note: 'storage unavailable' });
  }
};
