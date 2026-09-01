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
  /* 來源網站：只留主機名，過濾掉自家網域（站內互點不是外部來源） */
  let ref = '';
  try {
    const r = String(body.ref || '').trim();
    if (r) {
      const h = new URL(r).hostname.replace(/^www\./, '');
      if (h && !h.endsWith('jiangyude.com') && !h.endsWith('ai-km-jiang.vercel.app')) ref = h.slice(0, 60);
    }
  } catch { /* 壞掉的 referrer 就當沒有 */ }
  const ua = String(req.headers['user-agent'] || '');
  const isBot = /bot|crawl|spider|slurp|headless|preview|facebookexternalhit|monitor|lighthouse/i.test(ua);
  const increment = body.increment !== false && !isBot;

  const day = taipeiDay();
  const month = day.slice(0, 7);
  const seg = path.split('/').filter(Boolean);
  const section = seg.length >= 2 ? seg[0] : null; // 例如 /articles/foo/ → section = "articles"；/articles/ 列表頁不計 section

  /* 限流（2026-09-01 Codex 跨家審抓到）：這支端點原本誰都能狂打，
     可以無限灌高計數、也會把 Upstash 的免費額度燒光。
     同一 IP 每分鐘最多 30 次寫入，超過就只讀不寫（不回錯誤，避免變成偵測工具）。 */
  const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'na';
  let allowWrite = increment;
  if (increment) {
    try {
      const rk = `viewrate:${ip}:${Math.floor(Date.now() / 60000)}`;
      const [n] = (await pipe([['INCR', rk], ['EXPIRE', rk, 90]])).map((o) => (o && o.result != null ? o.result : 0));
      if (Number(n) > 30) allowWrite = false;
    } catch (e) { /* 限流壞掉不擋計數 */ }
  }

  const cmds = [];
  if (allowWrite) {
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
    const results = out.map((o) => (o && o.result != null ? o.result : 0));
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
    res.status(200).json({ page: 0, section: null, global: 0, error: String(e.message || e) });
  }
};
