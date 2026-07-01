// 每週流量報告 email（兼作 Upstash 備份快照）。
// 由 Vercel Cron 每週觸發（見 vercel.json）。讀近 7 天 + 全站總數，寄到 REPORT_EMAIL。
// 需要環境變數：
//   UPSTASH_REDIS_REST_URL、UPSTASH_REDIS_REST_TOKEN（讀數字）
//   RESEND_API_KEY（寄信，https://resend.com 免費）
//   REPORT_EMAIL（收件人，例：thedav1035@gmail.com）
//   REPORT_FROM（寄件人，預設 onboarding@resend.dev，可改成你驗證過的網域）
//   CRON_SECRET（選用；設了就只有帶對 secret 的請求能觸發，防外部亂打）

const U = () => process.env.UPSTASH_REDIS_REST_URL;
const T = () => process.env.UPSTASH_REDIS_REST_TOKEN;

async function cmd(command) {
  const r = await fetch(`${U()}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${T()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(command),
  });
  if (!r.ok) throw new Error(`upstash ${r.status}`);
  return (await r.json()).result;
}
function taipeiDay(d) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

module.exports = async (req, res) => {
  // 保護：若設了 CRON_SECRET，要求 Authorization: Bearer <secret>
  if (process.env.CRON_SECRET) {
    const auth = req.headers['authorization'] || '';
    if (auth !== `Bearer ${process.env.CRON_SECRET}`) { res.status(401).json({ error: 'unauthorized' }); return; }
  }
  if (!U() || !T() || !process.env.RESEND_API_KEY || !process.env.REPORT_EMAIL) {
    res.status(200).json({ ok: false, note: 'missing env (upstash / resend / report_email)' }); return;
  }
  try {
    // 近 7 天（含今天）
    const now = new Date();
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 86400000);
      days.push(taipeiDay(d));
    }
    const dayVals = await cmd(['MGET', ...days.map((d) => `global:day:${d}`)]);
    const rows = days.map((d, i) => ({ date: d, count: Number((dayVals && dayVals[i]) || 0) }));
    const weekSum = rows.reduce((a, x) => a + x.count, 0);
    const total = Number((await cmd(['GET', 'global'])) || 0);
    const curMonth = taipeiDay(now).slice(0, 7);
    const monthTotal = Number((await cmd(['GET', `global:month:${curMonth}`])) || 0);

    const bars = rows.map((r) => {
      const max = Math.max(...rows.map((x) => x.count), 1);
      const w = Math.round((r.count / max) * 200);
      return `<tr><td style="padding:4px 10px;font:600 13px monospace;color:#6a635a">${r.date}</td>`
        + `<td style="padding:4px 0"><span style="display:inline-block;height:12px;width:${w}px;background:#e8884b;border-radius:3px;vertical-align:middle"></span> <b>${r.count}</b></td></tr>`;
    }).join('');

    const html = `<div style="font-family:-apple-system,'PingFang TC',sans-serif;max-width:560px;color:#1a1612">
      <h2 style="margin:0 0 4px">江江官網 · 本週流量</h2>
      <p style="color:#6a635a;margin:0 0 18px">${days[0]} ~ ${days[6]}（台灣時間）</p>
      <p style="font-size:17px">本週瀏覽 <b style="font-size:22px">${weekSum.toLocaleString()}</b> 次　·　本月累計 <b>${monthTotal.toLocaleString()}</b>　·　全站累計 <b>${total.toLocaleString()}</b></p>
      <table style="border-collapse:collapse;margin-top:10px">${bars}</table>
      <p style="color:#9a9186;font-size:12px;margin-top:20px">此信由 Vercel 定時任務自動寄出，也是 Upstash 資料的每週備份快照。完整趨勢見網站 /stats。</p>
    </div>`;

    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: process.env.REPORT_FROM || 'onboarding@resend.dev',
        to: process.env.REPORT_EMAIL,
        subject: `江江官網 本週流量 ${weekSum.toLocaleString()} 次（${days[6]}）`,
        html,
      }),
    });
    const j = await r.json();
    res.status(200).json({ ok: r.ok, weekSum, total, resend: j });
  } catch (e) {
    res.status(200).json({ ok: false, error: String(e.message || e) });
  }
};
