// 分級內容守門：/member-content/<tier>/... 先驗 session 與等級，通過才從靜態檔（ASSETS）回傳。
// 沒登入或等級不夠回 403，頁面自動導向 /member/。
// 提醒：repo 是公開的，這裡只保護官網上的網址，GitHub 上的原始檔任何人都看得到。
import {isTier, expandTiers, tierLabel} from '../../cloudflare/member-tiers.mjs';
import {esc, reply, storageMode, store, verifySession, getUser, memberTiers} from '../../cloudflare/member-lib.mjs';

function denied(status, message) {
  const html = `<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex, nofollow"><meta http-equiv="refresh" content="3;url=/member/"><title>需要會員權限</title></head>
<body style="font-family:-apple-system,'PingFang TC','Noto Sans TC',sans-serif;background:#fefcf8;color:#1a1612;padding:48px 16px;text-align:center">
<h1 style="font-size:1.4rem">${esc(message)}</h1><p>三秒後前往 <a href="/member/" style="color:#5689b8">會員頁</a>。</p></body></html>`;
  return new Response(html, {status, headers: {'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'private, no-store',
    'X-Robots-Tag': 'noindex, nofollow', 'X-Content-Type-Options': 'nosniff'}});
}

export async function onRequest({request, env}) {
  if (!['GET', 'HEAD'].includes(request.method)) return reply({error: 'method not allowed'}, 405);
  const url = new URL(request.url);
  let decoded;
  try { decoded = decodeURIComponent(url.pathname); } catch { return denied(400, '網址格式不正確'); }
  const m = /^\/member-content\/([^/]+)(?:\/|$)/.exec(decoded);
  if (!m || decoded.includes('..') || decoded.includes('\\')) return denied(404, '找不到這個頁面');
  const need = m[1];
  if (!isTier(need)) return denied(404, '找不到這個頁面');

  const mode = storageMode(request, env);
  const st = mode && store(env, mode.prefix);
  if (!st) return denied(503, '會員功能暫時無法使用');
  let user = null;
  try {
    const s = await verifySession(request, env, st);
    if (s) {
      user = await getUser(st, s.sub);
      if (user) user.tier = await memberTiers(st, s.sub, user);
    }
  } catch { return denied(503, '會員功能暫時無法使用'); }
  if (!user) return denied(403, '請先登入會員');
  if (!expandTiers(user.tier).has(need)) return denied(403, `這頁限「${tierLabel(need)}」以上觀看`);

  const r = await env.ASSETS.fetch(request);
  const res = new Response(r.body, r);
  res.headers.set('Cache-Control', 'private, no-store');
  res.headers.set('X-Robots-Tag', 'noindex, nofollow');
  return res;
}
