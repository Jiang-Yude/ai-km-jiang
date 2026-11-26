// 線上擼貓：網友上傳自家貓照片 → OpenAI 生成「正上方看下去的背影貓」（透明背景 webp）→ 存 Upstash → 貓牆
// 2026-11-26 立。江江：前 100 名免費、一人一張（同網路＋同裝置）、上傳時取暱稱、瘦／正常／胖。
//
// 路由（/api/* 已在 _routes.json）：
//   GET  /api/petcat/cats              → {open, count, max, cats:[{no, nickname, size, img}]}
//   POST /api/petcat/cats              → multipart：photo、nickname、size、device；成功 {ok:true, cat}，失敗 {ok:false, code}
//   GET  /api/petcat/img/<token>       → 生成好的貓（image/webp，永久快取）
//
// 開關：PETCAT_ENABLED=1、PETCAT_OPENAI_API_KEY、Upstash 兩個變數都在才開放生成；否則 GET 照常（open:false），POST 回 closed。
// 資料：Upstash Redis。正式站 key 前綴 petcat:；預覽站加 cf-preview-20261004: 隔離（與會員、統計同規則），所以預覽測試不吃正式名額。
// 一人一張：同一個網路（IP，IPv6 取前 64 位元）或同一台裝置（瀏覽器存的隨機 id）只能成功一次。只存雜湊，不存 IP 明文。
//   誠實邊界：換網路、換裝置、清瀏覽器資料就能再傳一張；同公司同 Wi-Fi 只有一人能傳。擋的是隨手重複，不是存心繞過。
// 花費上限：總數 100 張是硬上限（含生成中的名額）；同時最多 MAX_INFLIGHT 張在生成。生成失敗會退回名額與鎖。
// 寫入防護：Origin 必須同站、必須帶 X-JY-Petcat: 1 標頭（別的網站無法直接叫我們的生成 API 花錢）。

const MAX = 100;
const PREVIEW_MAX = 5;           // 預覽站（*.pages.dev）只給 5 張測試名額，免得多一個能花錢的入口
const PREVIEW_SPEND_CAP = 8;
const PENDING_TTL = 300;          // 生成中的保留名額最多 5 分鐘，逾時自動退回
const MAX_INFLIGHT = 4;
const MAX_BODY = 6 * 1024 * 1024; // 前端會先縮到長邊 1536px JPEG，正常 1MB 內
const MAX_PHOTO = 5 * 1024 * 1024;
const MAX_OUT = 600 * 1024;       // 實測約 176KB；轉 base64 後仍遠低於 Upstash 單筆上限
const SPEND_CAP = 120;            // 花費硬上限：OpenAI 成功回圖就算一次（含之後存檔失敗），超過就不再生成
const FAIL_LIMIT = 3;             // 同一網路一小時最多失敗 3 次，失敗不清這個計數
const LIST_CACHE_SEC = 15;
const MODEL = 'gpt-image-2.6-flare';
const SIZES = ['slim', 'normal', 'fat'];
const REF_PATH = '/petcat/ref-pose.webp';
const OPENAI_EDITS = 'https://api.openai.com/v1/images/edits';

const PROMPT = `Image 1 is a photo of someone's real cat. Image 2 is a style and pose reference.
Create a new photorealistic image of the cat from Image 1, copying its exact coat colors, pattern placement and fur length, in the exact pose, size, framing and camera angle of the cat in Image 2: seen straight from directly above, lying curled and relaxed, showing only its back and the back of its head. The face must NOT be visible (no eyes, no nose, no mouth). Head toward the left, tail curled at the right. Soft natural indoor light from the top.
Only the cat. Transparent background, no cushion, no floor, no shadow, no text.
If Image 1 does not clearly show a cat, still draw a generic cat with the main colors of Image 1.
FUR LENGTH IS CRITICAL: if the cat in Image 1 is long-haired or fluffy (Persian, British Longhair, Ragdoll, Maine Coon, Norwegian Forest, Siberian and similar), keep it just as long-haired and fluffy in the new image: thick voluminous fur that stands out from the body, a soft fur halo around the whole silhouette, a fluffy neck ruff and a big bushy plume tail. Image 2 is only for pose and camera angle; do NOT copy its short, sleek coat or its thin tail. If the cat in Image 1 is short-haired, keep it short-haired.`;

// 公開暱稱的基本過濾：擋網址與少數明顯不雅字（江江之後可加）
const BLOCKED = ['http', 'www.', '.com', '.tw', 'line.me', '幹', '屌', '靠北', '雞巴', '機掰', '王八', '去死', 'fuck', 'shit', 'sex'];

const enc = new TextEncoder();
const b64url = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const randomId = (n = 18) => b64url(crypto.getRandomValues(new Uint8Array(n)));
const sha = async s => b64url(await crypto.subtle.digest('SHA-256', enc.encode(s)));

function b64ToBytes(b64) {
  const bin = atob(b64); const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function petcatConfig(env, host) {
  const official = ['jiangyude.com', 'www.jiangyude.com'].includes(host);
  const redisUrl = env.UPSTASH_REDIS_REST_URL || env.KV_REST_API_URL;
  const redisToken = env.UPSTASH_REDIS_REST_TOKEN || env.KV_REST_API_TOKEN;
  const productionOk = !official || (env.CF_SITE_MODE === 'production' && env.CF_PROD_KEYS === 'original');
  const storageOk = !!redisUrl && !!redisToken && productionOk;
  const open = storageOk && env.PETCAT_ENABLED === '1' && !!env.PETCAT_OPENAI_API_KEY && !!env.PETCAT_SALT;
  const p = (official ? '' : 'cf-preview-20261004:') + 'petcat:';
  return { official, storageOk, open, max: official ? MAX : PREVIEW_MAX, spendCap: official ? SPEND_CAP : PREVIEW_SPEND_CAP, redisUrl, redisToken, key: env.PETCAT_OPENAI_API_KEY,
    salt: env.PETCAT_SALT || '',
    k: { list: p + 'list', pending: p + 'pending', seq: p + 'seq', spent: p + 'spent', fail: h => p + 'fail:' + h, ip: h => p + 'ip:' + h, dev: h => p + 'dev:' + h, img: t => p + 'img:' + t } };
}

function redisClient(cfg, fetchImpl) {
  return async (...commands) => {
    const r = await fetchImpl(cfg.redisUrl + '/pipeline', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + cfg.redisToken, 'Content-Type': 'application/json' },
      body: JSON.stringify(commands.map(c => c.map(String))),
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) throw new Error('storage ' + r.status);
    const rows = await r.json();
    return rows.map(row => { if (row && row.error) throw new Error('storage command failed'); return row ? row.result : null; });
  };
}

const baseHeaders = () => ({ 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' });
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { ...baseHeaders(), 'Content-Type': 'application/json; charset=utf-8' } });
const fail = (code, status = 400) => json({ ok: false, code }, status);

export function cleanNickname(raw) {
  let s = String(raw ?? '').normalize('NFKC').replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff<>]/g, '').replace(/\s+/g, ' ').trim();
  const len = [...s].length;
  if (len < 1 || len > 10) return null;
  const low = s.toLowerCase();
  if (BLOCKED.some(w => low.includes(w))) return null;
  return s;
}

export function networkOf(ip) {
  const v = String(ip || '').trim();
  if (!v) return '';
  if (!v.includes(':')) return /^\d{1,3}(\.\d{1,3}){3}$/.test(v) ? v : '';
  let x = v.toLowerCase().split('%')[0];
  if (x.includes('.')) { const v4 = x.slice(x.lastIndexOf(':') + 1); return /^\d{1,3}(\.\d{1,3}){3}$/.test(v4) ? v4 : ''; }   // ::ffff:1.2.3.4 當 IPv4
  const parts = x.split('::');
  if (parts.length > 2) return '';
  const [head, tail] = parts;
  const h = head ? head.split(':') : [], t = tail !== undefined && tail ? tail.split(':') : [];
  if (tail !== undefined && h.length + t.length >= 8) return '';
  const groups = tail !== undefined ? [...h, ...Array(Math.max(0, 8 - h.length - t.length)).fill('0'), ...t] : h;
  if (groups.length !== 8 || groups.some(g => !/^[0-9a-f]{1,4}$/.test(g))) return '';
  return groups.slice(0, 4).map(g => g.padStart(4, '0')).join(':') + '::/64';
}

function imageKind(bytes) {
  if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes.length > 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'image/png';
  if (bytes.length > 12 && String.fromCharCode(...bytes.subarray(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.subarray(8, 12)) === 'WEBP') return 'image/webp';
  return '';
}

// 原子保留名額：清掉逾時的保留 → 檢查一人一張 → 檢查總數與同時生成數 → 保留
const RESERVE = `
redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', ARGV[1])
if redis.call('EXISTS', KEYS[3]) == 1 or redis.call('EXISTS', KEYS[4]) == 1 then return 'already' end
if tonumber(redis.call('GET', KEYS[5]) or '0') >= tonumber(ARGV[6]) then return 'busy' end
local pend = redis.call('ZCARD', KEYS[1])
if tonumber(redis.call('GET', KEYS[6]) or '0') + pend >= tonumber(ARGV[7]) then return 'full' end
if pend + redis.call('HLEN', KEYS[2]) >= tonumber(ARGV[3]) then return 'full' end
if pend >= tonumber(ARGV[5]) then return 'busy' end
redis.call('ZADD', KEYS[1], tonumber(ARGV[1]) + tonumber(ARGV[2]), ARGV[4])
redis.call('SET', KEYS[3], 'pending:' .. ARGV[4], 'EX', tonumber(ARGV[2]))
redis.call('SET', KEYS[4], 'pending:' .. ARGV[4], 'EX', tonumber(ARGV[2]))
return 'ok'`;

// 生成成功：編號照完成順序、寫進貓牆、鎖改成永久、退掉保留
const COMMIT = `
if not redis.call('ZSCORE', KEYS[1], ARGV[1]) then return -1 end
if redis.call('HLEN', KEYS[2]) >= tonumber(ARGV[3]) then return -2 end
local no = redis.call('INCR', KEYS[5])
local meta = cjson.decode(ARGV[2])
meta['no'] = no
redis.call('HSET', KEYS[2], tostring(no), cjson.encode(meta))
redis.call('SET', KEYS[3], tostring(no))
redis.call('SET', KEYS[4], tostring(no))
redis.call('ZREM', KEYS[1], ARGV[1])
return no`;

// 生成失敗：退回名額；鎖只在還是 pending 時才刪（避免誤刪別人已成功的）
const RELEASE = `
redis.call('ZREM', KEYS[1], ARGV[1])
if redis.call('GET', KEYS[3]) == 'pending:' .. ARGV[1] then redis.call('DEL', KEYS[3]) end
if redis.call('GET', KEYS[4]) == 'pending:' .. ARGV[1] then redis.call('DEL', KEYS[4]) end
redis.call('INCR', KEYS[5])
redis.call('EXPIRE', KEYS[5], 3600)
return 1`;

async function listCats(redis, cfg) {
  const [h] = await redis(['HGETALL', cfg.k.list]);
  const cats = [];
  for (let i = 0; i + 1 < (h || []).length; i += 2) {
    try {
      const m = JSON.parse(h[i + 1]);
      if (m.hidden) continue;
      cats.push({ no: m.no, nickname: m.nickname, size: m.size, img: '/api/petcat/img/' + m.token });
    } catch {}
  }
  cats.sort((a, b) => a.no - b.no);
  return { count: (h || []).length / 2, cats };   // count 含隱藏的貓（佔名額），cats 只列公開的
}

async function generate(cfg, photo, photoType, refBytes, fetchImpl, onCharged) {
  const fd = new FormData();
  fd.append('model', MODEL);
  fd.append('prompt', PROMPT);
  fd.append('size', '1536x1024');
  fd.append('quality', 'medium');
  fd.append('background', 'transparent');
  fd.append('output_format', 'webp');
  fd.append('output_compression', '80');
  fd.append('image[]', new Blob([photo], { type: photoType }), 'cat.' + photoType.split('/')[1]);
  fd.append('image[]', new Blob([refBytes], { type: 'image/webp' }), 'pose.webp');
  const r = await fetchImpl(OPENAI_EDITS, { method: 'POST', headers: { Authorization: 'Bearer ' + cfg.key }, body: fd, signal: AbortSignal.timeout(85_000) });   // 低於 Cloudflare 100 秒回應上限
  if (!r.ok) throw new Error('openai ' + r.status);
  const d = await r.json();
  const b64 = d?.data?.[0]?.b64_json;
  if (!b64) throw new Error('openai empty');
  onCharged();   // OpenAI 已回圖＝已計費，先記花費再驗內容
  const bytes = b64ToBytes(b64);
  if (imageKind(bytes) !== 'image/webp' || bytes.length > MAX_OUT) throw new Error('openai output');
  return b64;
}

export async function handlePetcat(context, fetchImpl = fetch) {
  const { request, env } = context;
  const url = new URL(request.url);
  const cfg = petcatConfig(env, url.hostname);
  const path = url.pathname.replace(/^\/api\/petcat\/?/, '');

  try {
    if (request.method === 'GET' && path === 'cats') {
      if (!cfg.storageOk) return json({ open: false, count: 0, max: cfg.max, cats: [] });
      const cache = typeof caches !== 'undefined' ? caches.default : null;
      const cacheKey = new Request(url.origin + '/api/petcat/cats');
      if (cache) { const hit = await cache.match(cacheKey); if (hit) return hit; }
      const redis = redisClient(cfg, fetchImpl);
      const { count, cats } = await listCats(redis, cfg);
      const [spent] = await redis(['GET', cfg.k.spent]);
      const res = new Response(JSON.stringify({ open: cfg.open && count < cfg.max && Number(spent || 0) < cfg.spendCap, count, max: cfg.max, cats }),
        { headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=' + LIST_CACHE_SEC, 'X-Content-Type-Options': 'nosniff' } });
      if (cache && context.waitUntil) context.waitUntil(cache.put(cacheKey, res.clone()));
      return res;
    }

    const img = path.match(/^img\/([A-Za-z0-9_-]{20,40})$/);
    if (request.method === 'GET' && img) {
      if (!cfg.storageOk) return new Response('not found', { status: 404, headers: baseHeaders() });
      const cache = typeof caches !== 'undefined' ? caches.default : null;
      const cacheKey = new Request(url.origin + url.pathname);
      if (cache) { const hit = await cache.match(cacheKey); if (hit) return hit; }
      const redis = redisClient(cfg, fetchImpl);
      const [b64] = await redis(['GET', cfg.k.img(img[1])]);
      if (!b64) return new Response('not found', { status: 404, headers: baseHeaders() });
      const res = new Response(b64ToBytes(b64), { headers: { 'Content-Type': 'image/webp', 'Cache-Control': 'public, max-age=31536000, immutable', 'X-Content-Type-Options': 'nosniff' } });
      if (cache && context.waitUntil) context.waitUntil(cache.put(cacheKey, res.clone()));
      return res;
    }

    if (request.method === 'POST' && path === 'cats') {
      if (request.headers.get('Origin') !== url.origin || request.headers.get('X-JY-Petcat') !== '1') return fail('forbidden', 403);
      if (!cfg.open) return fail('closed', 503);
      const len = Number(request.headers.get('Content-Length') || 0);
      if (!Number.isFinite(len) || len <= 0) return fail('bad_photo', 411);
      if (len > MAX_BODY) return fail('too_big', 413);
      let form;
      try { form = await request.formData(); } catch { return fail('bad_photo'); }
      const nickname = cleanNickname(form.get('nickname'));
      if (!nickname) return fail('bad_nick');
      const size = SIZES.includes(form.get('size')) ? form.get('size') : 'normal';
      const device = String(form.get('device') || '');
      if (!/^[A-Za-z0-9_-]{16,64}$/.test(device)) return fail('bad_device');
      const file = form.get('photo');
      if (!file || typeof file.arrayBuffer !== 'function') return fail('bad_photo');
      if (file.size > MAX_PHOTO) return fail('too_big', 413);
      const photo = new Uint8Array(await file.arrayBuffer());
      const photoType = imageKind(photo);
      if (!photoType) return fail('bad_photo');

      const net = networkOf(request.headers.get('CF-Connecting-IP'));
      if (!net) return fail('forbidden', 403);
      const ipHash = await sha(cfg.salt + '|ip|' + net);
      const ipKey = cfg.k.ip(ipHash);
      const devKey = cfg.k.dev(await sha(cfg.salt + '|dev|' + device));
      const failKey = cfg.k.fail(ipHash);
      const token = randomId();
      const redis = redisClient(cfg, fetchImpl);
      const now = Math.floor(Date.now() / 1000);
      const [res] = await redis(['EVAL', RESERVE, 6, cfg.k.pending, cfg.k.list, ipKey, devKey, failKey, cfg.k.spent, now, PENDING_TTL, cfg.max, token, MAX_INFLIGHT, FAIL_LIMIT, cfg.spendCap]);
      if (res !== 'ok') return fail(res === 'already' ? 'already' : res === 'full' ? 'full' : 'busy', res === 'already' ? 409 : res === 'full' ? 410 : 429);

      let committed = false;
      const work = (async () => {
        try {
          const refRes = await env.ASSETS.fetch(new Request(url.origin + REF_PATH));
          if (!refRes.ok) throw new Error('ref missing');
          const refBytes = new Uint8Array(await refRes.arrayBuffer());
          let charged = null;
          const b64 = await generate(cfg, photo, photoType, refBytes, fetchImpl, () => { charged = redis(['INCR', cfg.k.spent]).catch(() => {}); });
          await charged;   // 已經花錢了：不管後面成不成功都算進花費上限
          await redis(['SET', cfg.k.img(token), b64]);
          const meta = JSON.stringify({ nickname, size, token, t: now });
          const [no] = await redis(['EVAL', COMMIT, 5, cfg.k.pending, cfg.k.list, ipKey, devKey, cfg.k.seq, token, meta, cfg.max]);
          if (Number(no) < 1) throw new Error('commit rejected');
          committed = true;
          try { if (typeof caches !== 'undefined' && context.waitUntil) context.waitUntil(caches.default.delete(new Request(url.origin + '/api/petcat/cats')).catch(() => {})); } catch {}
          return { ok: true, cat: { no: Number(no), nickname, size, img: '/api/petcat/img/' + token } };
        } catch (e) {
          try { await redis(['EVAL', RELEASE, 5, cfg.k.pending, cfg.k.list, ipKey, devKey, failKey, token]); } catch {}
          if (!committed) { try { await redis(['DEL', cfg.k.img(token)]); } catch {} }
          return { ok: false, code: 'gen_failed' };
        }
      })();
      if (context.waitUntil) context.waitUntil(work);
      const out = await work;
      return json(out, out.ok ? 200 : 502);
    }

    return json({ ok: false, code: 'not_found' }, 404);
  } catch {
    return fail('error', 503);
  }
}
