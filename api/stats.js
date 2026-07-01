// 統計資料：給 /stats 頁讀「當月每日」「歷月總計」「全站總數」「熱門頁」。
// 只讀不寫。資料來源同 view.js 的 Upstash Redis。

const URL = () => process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const TOKEN = () => process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;

async function cmd(command) {
  const r = await fetch(`${URL()}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(command),
  });
  if (!r.ok) throw new Error(`upstash ${r.status}`);
  const j = await r.json();
  return j.result;
}

function taipeiDay(d = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(d);
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=60'); // 邊緣快取 60 秒，減少讀取
  if (!URL() || !TOKEN()) { res.status(200).json({ days: [], months: [], total: 0, note: 'storage not configured' }); return; }

  try {
    const today = taipeiDay();
    const curMonth = today.slice(0, 7);
    const todayDay = Number(today.slice(8, 10));

    // 當月每日：從 1 號到今天
    const dayKeys = [];
    const dayLabels = [];
    for (let d = 1; d <= todayDay; d++) {
      const dd = String(d).padStart(2, '0');
      dayLabels.push(`${curMonth}-${dd}`);
      dayKeys.push(`global:day:${curMonth}-${dd}`);
    }
    const dayVals = dayKeys.length ? await cmd(['MGET', ...dayKeys]) : [];
    const days = dayLabels.map((date, i) => ({ date, count: Number((dayVals && dayVals[i]) || 0) }));

    // 歷月：ZRANGE 索引拿月份清單（升冪），再 MGET 數字
    const monthList = (await cmd(['ZRANGE', 'idx:months', '0', '-1'])) || [];
    let months = [];
    if (monthList.length) {
      const monthVals = await cmd(['MGET', ...monthList.map((m) => `global:month:${m}`)]);
      months = monthList.map((m, i) => ({ month: m, count: Number((monthVals && monthVals[i]) || 0) }));
    }

    // 全站總數
    const total = Number((await cmd(['GET', 'global'])) || 0);

    res.status(200).json({ today, days, months, total });
  } catch (e) {
    res.status(200).json({ days: [], months: [], total: 0, error: String(e.message || e) });
  }
};
