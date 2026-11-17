// 延後公開（2026-11-17 立，江江：「官網文章 可以先部署 但隱藏」「時候到了…就自動 解封」）。
// 清單在 cloudflare/embargo.json：「articles/<slug>」對應公開時間（UTC ISO）。
// 只有清單裡的路徑會經過這支（build.mjs 依清單寫 _routes.json），其他頁面完全不經程式。
// 原則：寧可晚公開，不提早曝光。時間格式錯、網址解析出錯一律回 404。
import EMBARGO from './embargo.json' with {type: 'json'};

const NOT_YET = `<!doctype html>
<html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow"><title>這篇文章還沒公開｜江江教練</title>
<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#fefcf8;color:#1a1612;font-family:-apple-system,"PingFang TC","Noto Sans TC",sans-serif}main{text-align:center;padding:24px}h1{font-size:28px;margin:0 0 12px}p{font-size:18px;color:#6a635a}a{color:#5689b8;font-weight:700}</style>
</head><body><main><h1>這篇文章還沒公開</h1><p>先回 <a href="/articles.html">深度文章總站</a> 看看其他文章。</p></main></body></html>`;

function notYet() {
  return new Response(NOT_YET, {
    status: 404,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Robots-Tag': 'noindex, nofollow',
    },
  });
}

// 回傳這個路徑對應的清單 key（articles/<slug> 或 ai-trends/<slug>），不在清單回 null。
export function embargoKey(pathname) {
  let p = decodeURIComponent(pathname); // 非法編碼會丟錯，交給呼叫端回 404
  p = p.toLowerCase().replace(/^\/+/, '');
  const m = p.match(/^(articles|ai-trends)\/([^/]+)/);
  if (!m) return null;
  const key = `${m[1]}/${m[2]}`;
  return Object.prototype.hasOwnProperty.call(EMBARGO, key) ? key : null;
}

export function isEmbargoed(key, now = Date.now()) {
  const at = Date.parse(EMBARGO[key]);
  return Number.isNaN(at) || now < at;
}

export async function handleEmbargo(context) {
  try {
    const key = embargoKey(new URL(context.request.url).pathname);
    if (key && isEmbargoed(key)) return notYet();
  } catch (e) {
    return notYet();
  }
  return context.next();
}
