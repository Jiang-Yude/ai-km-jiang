// 瀏覽計數：每次有人開頁面就呼叫這支，對應數字 +1，回傳目前累計。
// 資料存在 Upstash Redis（免費雲端記事本），不碰 Google。
// 需要兩個環境變數（在 Vercel 專案設定填）：
//   UPSTASH_REDIS_REST_URL、UPSTASH_REDIS_REST_TOKEN
// 前端 views.js 會用「同瀏覽器同頁一小時只計一次」控制 increment，避免重刷灌水。
//
// 2026-10-19 安全修補（審查 M1、M2）：
//   一、路徑白名單：只有站上真實存在的頁面才會新增計數。白名單＝site-index.json 的站內網址
//       （Vercel 執行期讀檔；Cloudflare 由 functions/api/view.js 在打包時帶進來）。
//       site-index 沒收錄、但確實存在的頁面（例如 /articles.html、/offers.html、/search.html，盤點時有 32 頁）
//       走退路：路徑長度 200 字內、只准網址安全字元，而且「這個頁面的計數已經存在」才累加；
//       要建立新的 page 鍵，每網段每天最多 3 個、全站每天最多 30 個，超過就只讀不寫。
//       白名單讀不到時所有路徑都走這條退路。分區（section）只對白名單裡出現過的分區累加。
//   二、限流以網段計（IPv4 整個位址、IPv6 取 /64，lib/2026-09-13-0910-client-network.js），
//       並改成原子 Lua。限流服務壞掉時不寫入、回 503（原本是壞掉就放行）。

// 相容 Vercel Storage 一鍵建的 Redis（KV_REST_API_*）與 Upstash 整合（UPSTASH_REDIS_REST_*）
const {clientNetwork}=require('../lib/2026-09-13-0910-client-network.js');
const { networkOf, rateCommand, rateAllowed, pipelineResults, applyCors } = clientNetwork;
// Cloudflare 打包時這行會被拿掉，fs 變成未宣告，下面用 typeof 判斷
const fs = require('fs');

const URL = () => process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const TOKEN = () => process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;

// 一次送多個 Redis 指令（pipeline），回傳每個指令的結果陣列
async function pipe(commands) {
  const r = await fetch(`${URL()}/pipeline`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${TOKEN()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(commands),
    signal: AbortSignal.timeout(3000),
  });
  if (!r.ok) throw new Error(`upstash ${r.status}`);
  return pipelineResults(await r.json(), commands.length); // 每個指令的 result
}

// 台灣時區的日期字串
function taipeiDay(d = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(d); // YYYY-MM-DD
}

function normalizePath(p) {
  p = String(p || '/').split('?')[0].split('#')[0];
  if (!p.startsWith('/')) p = '/' + p;
  if (p.length > 1 && p.endsWith('/index.html')) p = p.slice(0, -10);
  if (p.length > 1 && !p.endsWith('/') && !p.includes('.')) p = p + '/';
  return p;
}

/* ── 路徑白名單 ── */
const PER_MIN = 30;            // 每網段每分鐘最多累加次數（沿用原值）
const NEW_KEYS_PER_NET = 3;    // 白名單外路徑：每網段每天最多建立幾個新的 page 鍵
const NEW_KEYS_SITE = 30;      // 白名單外路徑：全站每天最多建立幾個新的 page 鍵
const SAFE_PATH_RE = /^\/[A-Za-z0-9\-._~\/%]*$/;

/* site-index 的網址轉成與 normalizePath 一致的站內路徑；站外網址丟掉 */
function siteUrlToPath(u) {
  let s = String(u || '').trim();
  const m = s.match(/^https?:\/\/(?:www\.)?jiangyude\.com(\/.*)?$/i);
  if (m) s = m[1] || '/';
  else if (/^[a-z][a-z0-9+.-]*:/i.test(s) || s.startsWith('//')) return null;
  return normalizePath(s);
}

let KNOWN;
/* 回傳 {paths:Set, sections:Set}；讀不到回 null */
function knownPaths() {
  if (KNOWN !== undefined) return KNOWN;
  let urls = null;
  const injected = process.env.VIEW_KNOWN_URLS; // Cloudflare：functions/api/view.js 帶入的陣列
  if (Array.isArray(injected)) urls = injected;
  else if (typeof fs !== 'undefined') {
    try {
      const idx = JSON.parse(fs.readFileSync(process.cwd() + '/site-index.json', 'utf8'));
      urls = (idx.items || []).map((i) => i && i.url);
    } catch (e) { urls = null; }
  }
  if (!urls || !urls.length) { KNOWN = null; return KNOWN; }
  const paths = new Set(['/']);
  const sections = new Set();
  for (const u of urls) {
    const p = siteUrlToPath(u);
    if (!p || p.length > 200 || !SAFE_PATH_RE.test(p)) continue;
    paths.add(p);
    const seg = p.split('/').filter(Boolean);
    if (seg.length >= 2) sections.add(seg[0]);
  }
  KNOWN = { paths, sections };
  return KNOWN;
}

/* 白名單外的路徑要先過這關：長度、字元、不得有 .. 或 // */
function plausiblePath(p) {
  return p.length <= 200 && SAFE_PATH_RE.test(p) && !p.includes('..') && !p.includes('//');
}

/* 白名單外路徑的新鍵配額（原子）：page 鍵已存在就放行；不存在時才扣每網段與全站的每日新鍵額度。
   回 0＝放行，1＝額度用完。 */
const NEW_KEY_SCRIPT = "if redis.call('EXISTS', KEYS[1]) == 1 then return 0 end\nlocal a = tonumber(redis.call('GET', KEYS[2]) or '0')\nlocal b = tonumber(redis.call('GET', KEYS[3]) or '0')\nif a >= tonumber(ARGV[1]) or b >= tonumber(ARGV[2]) then return 1 end\nredis.call('INCR', KEYS[2]); redis.call('EXPIRE', KEYS[2], 172800)\nredis.call('INCR', KEYS[3]); redis.call('EXPIRE', KEYS[3], 172800)\nreturn 0";

module.exports = async (req, res) => {
  applyCors(req, res, 'POST, OPTIONS');
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'POST only' }); return; }
  if (!URL() || !TOKEN()) { res.status(200).json({ page: 0, section: null, global: 0, note: 'storage not configured' }); return; }

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
  body = body || {};

  const path = normalizePath(body.path);
  /* 來源網站：只留主機名，過濾掉自家網域（站內互點不是外部來源） */
  /* 來源網站：只留主機名，過濾掉自家網域（站內互點不是外部來源）。
     ⚠️ 刻意不用 new URL()：第一版用了，線上實測 ref 永遠是空的、
     而同一段程式碼裡的 PFADD 卻正常寫入，判斷是建構子在這個 runtime 拋錯後
     被 catch 吞掉。改成正則取主機名，不依賴任何 runtime API。 */
  let ref = '';
  const rawRef = String((body && body.ref) || '').trim();
  if (rawRef) {
    const m = rawRef.match(/^https?:\/\/([^/:?#]+)/i);
    if (m && m[1]) {
      const h = m[1].toLowerCase().replace(/^www\./, '');
      if (h && !h.endsWith('jiangyude.com') && !h.endsWith('ai-km-jiang.vercel.app')) ref = h.slice(0, 60);
    }
  }
  const ua = String(req.headers['user-agent'] || '');
  const isBot = /bot|crawl|spider|slurp|headless|preview|facebookexternalhit|monitor|lighthouse/i.test(ua);
  const increment = body.increment !== false && !isBot;

  const day = taipeiDay();
  const month = day.slice(0, 7);
  const seg = path.split('/').filter(Boolean);
  const section = seg.length >= 2 ? seg[0] : null; // 例如 /articles/foo/ → section = "articles"；/articles/ 列表頁不計 section

  /* 限流（2026-09-01 Codex 跨家審抓到；2026-10-19 改網段、原子、故障不寫）：
     同一網段每分鐘最多 30 次寫入，超過就只讀不寫（不回錯誤，避免變成偵測工具）。 */
  let allowWrite = increment;
  const known = knownPaths();
  const inWhitelist = !!(known && known.paths.has(path));
  if (increment && !inWhitelist && !plausiblePath(path)) allowWrite = false;
  const countSection = !!(section && known && known.sections.has(section));
  if (allowWrite) {
    const network = networkOf(req);
    if (!network) { res.status(503).json({ page: 0, section: null, global: 0, error: 'temporarily unavailable' }); return; }
    try {
      const [n] = await pipe([rateCommand([{ key: `viewrate:${network}:${Math.floor(Date.now() / 60000)}`, limit: PER_MIN, ttl: 90 }])]);
      if (!rateAllowed(n, 1)) allowWrite = false;
      if (allowWrite && !inWhitelist) {
        const [m] = await pipe([['EVAL', NEW_KEY_SCRIPT, '3', `page:${path}`, `viewnew:${network}:${day}`, `viewnew:site:${day}`, String(NEW_KEYS_PER_NET), String(NEW_KEYS_SITE)]]);
        if (m !== 0 && m !== 1) throw new Error('invalid new-key counter');
        if (m === 1) allowWrite = false;
      }
    } catch (e) {
      console.error('view_limiter_unavailable', String((e && e.message) || e));
      res.status(503).json({ page: 0, section: null, global: 0, error: 'temporarily unavailable' }); return;
    }
  }

  const cmds = [];
  if (allowWrite) {
    cmds.push(['INCR', `page:${path}`]);
    cmds.push(['INCR', 'global']);
    cmds.push(['INCR', `global:day:${day}`]);
    cmds.push(['INCR', `global:month:${month}`]);
    if (countSection) cmds.push(['INCR', `section:${section}`]);
    /* 每頁每日（2026-09-01 加）：一天一個 hash，欄位是路徑。
       為的是回答「這篇這週紅不紅」：page:<path> 只有累計總數，看不出時間趨勢。
       一天一個 key（不是一頁一天一個 key），所以 key 數量不會爆。
       三個保護（Codex 跨家審查提的）：
       1. path 超過 120 字元就不記，避免有人用長亂碼灌爆這個 hash
       2. EXPIREAT 只在當天第一筆設定（HINCRBY 回 1 代表這個 hash 剛建），
          不是每次都 EXPIRE，省一個 Redis 指令
       3. 保留 90 天 */
    if (path.length <= 120) cmds.push(['HINCRBY', `pageday:${day}`, path, 1]);
    // 索引（score 用日期本身，保證時間順序）
    /* 獨立訪客（2026-09-01 加）：用 HyperLogLog 存瀏覽器識別碼，一天一個 key、一個月一個 key。
       HLL 上限 12KB、誤差 0.81%，而且**存不下原始值**，
       所以「想反查某個人看過哪些頁」在資料結構上就辦不到，這是刻意選它的原因。 */
    if (body.vid) {
      cmds.push(['PFADD', `uv:day:${day}`, String(body.vid).slice(0, 24)]);
      cmds.push(['PFADD', `uv:month:${month}`, String(body.vid).slice(0, 24)]);
    }
    /* 來源網站（2026-09-01 加）：只記主機名不記完整網址，
       完整網址常夾帶查詢字串與個資。自家連自家不算來源。 */
    if (ref) cmds.push(['ZINCRBY', `ref:${month}`, 1, ref]);
    cmds.push(['ZADD', 'idx:days', Number(day.replace(/-/g, '')), day]);
    cmds.push(['ZADD', 'idx:months', Number(month.replace('-', '')), month]);
  }
  // 不論有沒有 +1，都回傳目前數字給頁面顯示（順序：page, global, [section]）
  cmds.push(['GET', `page:${path}`]);
  cmds.push(['GET', 'global']);
  if (section) cmds.push(['GET', `section:${section}`]);

  try {
    const out = await pipe(cmds);
    const results = out.map((v) => (v != null ? v : 0));
    /* 當天這個 hash 的第一筆（HINCRBY 回 1）才設過期時間，之後不再重設。
       這裡一定要 await：serverless function 在回應送出後會被凍結，
       沒 await 的 promise 不保證送得出去（2026-09-01 上線第一版就是這樣，
       TTL 沒設成，pageday key 變成永不過期）。首筆一天只有一次，多一趟往返可以接受。 */
    if (allowWrite && path.length <= 120) {
      const hIdx = cmds.findIndex((c) => c[0] === 'HINCRBY');
      if (hIdx >= 0 && Number(results[hIdx]) === 1) {
        try { await pipe([['EXPIRE', `pageday:${day}`, 7776000]]); } catch { /* 設不成不擋計數 */ }
      }
    }
    let sectionVal = null;
    if (section) sectionVal = Number(results.pop()) || 0;
    const globalVal = Number(results.pop()) || 0;
    const pageVal = Number(results.pop()) || 0;
    res.status(200).json({ page: pageVal, section: sectionVal, global: globalVal });
  } catch (e) {
    console.error('view_storage_failed', String((e && e.message) || e));
    res.status(503).json({ page: 0, section: null, global: 0, error: 'storage unavailable' });
  }
};
