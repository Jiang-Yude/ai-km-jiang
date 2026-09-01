// 瀏覽計數：每次有人開頁面就呼叫這支，對應數字 +1，回傳目前累計。
// 資料存在 Upstash Redis（免費雲端記事本），不碰 Google。
// 需要兩個環境變數（在 Vercel 專案設定填）：
//   UPSTASH_REDIS_REST_URL、UPSTASH_REDIS_REST_TOKEN
// 前端 views.js 會用「同瀏覽器同頁一小時只計一次」控制 increment，避免重刷灌水。

// 相容 Vercel Storage 一鍵建的 Redis（KV_REST_API_*）與 Upstash 整合（UPSTASH_REDIS_REST_*）
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
  });
  if (!r.ok) throw new Error(`upstash ${r.status}`);
  return r.json(); // [{result:...}, ...]
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

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'POST only' }); return; }
  if (!URL() || !TOKEN()) { res.status(200).json({ page: 0, section: null, global: 0, note: 'storage not configured' }); return; }

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
  body = body || {};

  const path = normalizePath(body.path);
  const ua = String(req.headers['user-agent'] || '');
  const isBot = /bot|crawl|spider|slurp|headless|preview|facebookexternalhit|monitor|lighthouse/i.test(ua);
  const increment = body.increment !== false && !isBot;

  const day = taipeiDay();
  const month = day.slice(0, 7);
  const seg = path.split('/').filter(Boolean);
  const section = seg.length >= 2 ? seg[0] : null; // 例如 /articles/foo/ → section = "articles"；/articles/ 列表頁不計 section

  const cmds = [];
  if (increment) {
    cmds.push(['INCR', `page:${path}`]);
    cmds.push(['INCR', 'global']);
    cmds.push(['INCR', `global:day:${day}`]);
    cmds.push(['INCR', `global:month:${month}`]);
    if (section) cmds.push(['INCR', `section:${section}`]);
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
    cmds.push(['ZADD', 'idx:days', Number(day.replace(/-/g, '')), day]);
    cmds.push(['ZADD', 'idx:months', Number(month.replace('-', '')), month]);
  }
  // 不論有沒有 +1，都回傳目前數字給頁面顯示（順序：page, global, [section]）
  cmds.push(['GET', `page:${path}`]);
  cmds.push(['GET', 'global']);
  if (section) cmds.push(['GET', `section:${section}`]);

  try {
    const out = await pipe(cmds);
    const results = out.map((o) => (o && o.result != null ? o.result : 0));
    /* 當天這個 hash 的第一筆（HINCRBY 回 1）才設過期時間，之後不再重設 */
    if (increment && path.length <= 120) {
      const hIdx = cmds.findIndex((c) => c[0] === 'HINCRBY');
      if (hIdx >= 0 && Number(results[hIdx]) === 1) {
        pipe([['EXPIRE', `pageday:${day}`, 7776000]]).catch(() => {});
      }
    }
    let sectionVal = null;
    if (section) sectionVal = Number(results.pop()) || 0;
    const globalVal = Number(results.pop()) || 0;
    const pageVal = Number(results.pop()) || 0;
    res.status(200).json({ page: pageVal, section: sectionVal, global: globalVal });
  } catch (e) {
    res.status(200).json({ page: 0, section: null, global: 0, error: String(e.message || e) });
  }
};
