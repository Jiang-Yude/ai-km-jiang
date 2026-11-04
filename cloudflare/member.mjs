// 會員登入（Google）與文章留言板｜Cloudflare Pages Functions
// 2026-11-04 立。設計審查：小 G（Gemini）＋ Claude。
//
// 路由（全部在 /member/ 底下，_routes.json 已預留）：
//   GET  /member/config                 → {enabled}；未啟用時前端元件完全不出現
//   GET  /member/login?return=/articles/x/  → 轉去 Google 登入（授權碼流程＋PKCE＋state＋nonce）
//   GET  /member/callback               → Google 回來，驗 id_token 簽章與欄位，建立 session
//   GET  /member/me                     → 目前登入者（公開欄位）
//   POST /member/profile                → 改暱稱與頭像（Google 照片／首字／12 個圖示，不開放上傳）
//   POST /member/logout                 → 登出
//   GET  /member/comments?page=/articles/x/  → 列出留言（任何人可看）
//   POST /member/comments               → 新增留言（登入）
//   POST /member/comments/delete        → 刪自己的留言；管理員可隱藏任何留言
//
// 開關：MEMBER_ENABLED=1、GOOGLE_CLIENT_ID、GOOGLE_CLIENT_SECRET、Upstash 兩個變數都在才啟用，
//       否則所有端點回 503（config 回 enabled:false），程式可以先上線、不影響現有網站。
// 管理員：MEMBER_ADMIN_EMAILS（逗號分隔的 Google email）。
// 會員資料只存 Google sub、顯示名稱、頭像網址、email 的雜湊、首次與最後登入時間；不存 email 明文。
// 資料：Upstash Redis。正式站 key 前綴 member:／comments:；預覽站加 cf-preview-20261004: 隔離（與現有 API 同規則）。
// 寫入防護：Origin 必須同站、必須帶 X-JY-Member: 1 標頭、session cookie SameSite=Lax。

const SESSION_TTL = 30 * 24 * 3600;
const STATE_TTL = 600;
const COOKIE = '__Host-jy_sess';
const PAGE_RE = /^\/(articles|ai-trends)\/[a-z0-9][a-z0-9-]{0,100}\/$/;
const MAX_BODY = 1000;
const LIMIT_10M = 5;
const LIMIT_DAY = 30;
const LIST_MAX = 200;
const GOOGLE_AUTH = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN = 'https://oauth2.googleapis.com/token';
const GOOGLE_CERTS = 'https://www.googleapis.com/oauth2/v3/certs';
const ISSUERS = ['accounts.google.com', 'https://accounts.google.com'];

const enc = new TextEncoder();
const b64url = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromB64url = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), c => c.charCodeAt(0));
const randomId = (n = 32) => b64url(crypto.getRandomValues(new Uint8Array(n)));
// 資料最小化（2026-11-04，對照台灣 2026 年多起個資外洩）：不存 email 明文，只存雜湊，用來比對管理員
const emailHash = async email => b64url(await crypto.subtle.digest('SHA-256', enc.encode('jy-member:' + String(email || '').trim().toLowerCase())));

let certCache = { at: 0, keys: [] };

export function memberConfig(env, host) {
  const official = ['jiangyude.com', 'www.jiangyude.com'].includes(host);
  const redisUrl = env.UPSTASH_REDIS_REST_URL || env.KV_REST_API_URL;
  const redisToken = env.UPSTASH_REDIS_REST_TOKEN || env.KV_REST_API_TOKEN;
  const productionOk = !official || (env.CF_SITE_MODE === 'production' && env.CF_PROD_KEYS === 'original');
  const enabled = env.MEMBER_ENABLED === '1' && !!env.GOOGLE_CLIENT_ID && !!env.GOOGLE_CLIENT_SECRET && !!redisUrl && !!redisToken && productionOk;
  const admins = String(env.MEMBER_ADMIN_EMAILS || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  return { enabled, official, redisUrl, redisToken, prefix: official ? '' : 'cf-preview-20261004:', admins, adminHashes: null };
}

function redisClient(cfg, fetchImpl) {
  return async (...commands) => {
    const body = commands.map(c => {
      const out = [...c];
      out[1] = cfg.prefix + out[1];
      return out.map(String);
    });
    const r = await fetchImpl(cfg.redisUrl + '/pipeline', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + cfg.redisToken, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(5000),
    });
    if (!r.ok) throw new Error('storage ' + r.status);
    const rows = await r.json();
    return rows.map(row => {
      if (row && row.error) throw new Error('storage command failed');
      return row ? row.result : null;
    });
  };
}

function headersBase() {
  return { 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex, nofollow', 'X-Content-Type-Options': 'nosniff' };
}
const json = (data, status = 200, extra = {}) =>
  new Response(JSON.stringify(data), { status, headers: { ...headersBase(), 'Content-Type': 'application/json; charset=utf-8', ...extra } });
const redirect = (location, extra = {}) => new Response(null, { status: 302, headers: { ...headersBase(), Location: location, ...extra } });

function readCookie(request, name) {
  const raw = request.headers.get('Cookie') || '';
  for (const part of raw.split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return '';
}
const sessionCookie = (sid, maxAge) => `${COOKIE}=${sid}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;

function safeReturn(value) {
  const v = String(value || '/');
  if (!v.startsWith('/') || v.startsWith('//') || v.includes('\\') || /[\u0000-\u001f]/.test(v)) return '/';
  return v.slice(0, 300);
}

function cleanBody(text) {
  let s = String(text || '').replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b-\u001f\u007f​-‏‪-‮⁦-⁩]/g, '');
  s = s.replace(/\n{4,}/g, '\n\n\n').trim();
  return s;
}

async function readJson(request, max = 8192) {
  const text = await request.text();
  if (text.length > max) throw new RangeError('too large');
  return text ? JSON.parse(text) : {};
}

function writeGuard(request, url) {
  const origin = request.headers.get('Origin');
  if (origin !== url.origin) return 'origin';
  if (request.headers.get('X-JY-Member') !== '1') return 'header';
  return '';
}

async function googleKeys(fetchImpl, now) {
  if (certCache.keys.length && now - certCache.at < 3600_000) return certCache.keys;
  const r = await fetchImpl(GOOGLE_CERTS, { signal: AbortSignal.timeout(5000) });
  if (!r.ok) throw new Error('certs ' + r.status);
  const data = await r.json();
  certCache = { at: now, keys: data.keys || [] };
  return certCache.keys;
}

export async function verifyIdToken(idToken, { clientId, nonce, fetchImpl, now }) {
  const parts = String(idToken || '').split('.');
  if (parts.length !== 3) throw new Error('id_token format');
  const header = JSON.parse(new TextDecoder().decode(fromB64url(parts[0])));
  const payload = JSON.parse(new TextDecoder().decode(fromB64url(parts[1])));
  if (header.alg !== 'RS256') throw new Error('id_token alg');
  let keys = await googleKeys(fetchImpl, now);
  let jwk = keys.find(k => k.kid === header.kid);
  if (!jwk) { certCache = { at: 0, keys: [] }; keys = await googleKeys(fetchImpl, now); jwk = keys.find(k => k.kid === header.kid); }
  if (!jwk) throw new Error('id_token kid');
  const key = await crypto.subtle.importKey('jwk', { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: 'RS256', ext: true },
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, fromB64url(parts[2]), enc.encode(parts[0] + '.' + parts[1]));
  if (!ok) throw new Error('id_token signature');
  if (!ISSUERS.includes(payload.iss)) throw new Error('id_token iss');
  const aud = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!aud.includes(clientId)) throw new Error('id_token aud');
  if (!(Number(payload.exp) * 1000 > now - 60_000)) throw new Error('id_token exp');
  if (payload.nonce !== nonce) throw new Error('id_token nonce');
  if (payload.email_verified !== true && payload.email_verified !== 'true') throw new Error('email not verified');
  if (!payload.sub) throw new Error('id_token sub');
  return payload;
}

async function currentUser(request, redis) {
  const sid = readCookie(request, COOKIE);
  if (!/^[A-Za-z0-9_-]{40,64}$/.test(sid)) return null;
  const [sub] = await redis(['GET', 'member:sess:' + sid]);
  if (!sub) return null;
  const [raw] = await redis(['GET', 'member:user:' + sub], ['EXPIRE', 'member:sess:' + sid, SESSION_TTL]);
  if (!raw) return null;
  return { sid, ...JSON.parse(raw) };
}

async function isAdmin(u, cfg) {
  if (!u || !u.eh) return false;
  if (!cfg.adminHashes) cfg.adminHashes = await Promise.all(cfg.admins.map(emailHash));
  return cfg.adminHashes.includes(u.eh);
}
// 暱稱與頭像（2026-11-04 江江：讓大家可以取暱稱、換頭像）。頭像不開放上傳（免審圖、免另開儲存），三選一：Google 照片、名字首字、12 個圖示
export const AVATAR_EMOJIS = ['🐱', '🐶', '🦊', '🐼', '🐻', '🐰', '🦉', '🐢', '🐳', '🌻', '☕', '📚'];
const AVATARS = ['google', 'initial', ...AVATAR_EMOJIS.map(e => 'e:' + e)];
const RESERVED_NICK = /江江|江昱德|昱德|管理員|管理者|官方|站長|客服|咪卡|admin|jiangyude/i;
const NICK_MAX = 20;
const LIMIT_PROFILE_DAY = 10;
function display(u) {
  if (!u) return null;
  let avatar = AVATARS.includes(u.avatar) ? u.avatar : (u.picture ? 'google' : 'initial');
  if (avatar === 'google' && !u.picture) avatar = 'initial';
  return { name: u.nick || u.name, picture: avatar === 'google' ? u.picture : '', emoji: avatar.startsWith('e:') ? avatar.slice(2) : '', avatar };
}
const publicUser = async (u, cfg) => u ? ({ ...display(u), nick: u.nick || '', googleName: u.name, googlePicture: u.picture || '', admin: await isAdmin(u, cfg) }) : null;
function cleanNick(text) {
  return String(text || '').replace(/[\u0000-\u001f\u007f​-‏‪-‮⁦-⁩<>]/g, '').replace(/\s+/g, ' ').trim();
}

export async function handleMember(context, deps = {}) {
  const { request, env } = context;
  const fetchImpl = deps.fetch || fetch;
  const now = deps.now ? deps.now() : Date.now();
  const url = new URL(request.url);
  const cfg = memberConfig(env, url.hostname);
  const path = url.pathname.replace(/\/+$/, '') || '/';

  if (path === '/member/config') return json({ enabled: cfg.enabled }, 200);
  if (!cfg.enabled) return json({ error: '會員功能尚未啟用' }, 503);

  const redis = redisClient(cfg, fetchImpl);
  const method = request.method;
  try {
    if (path === '/member/login' && method === 'GET') {
      const state = randomId(), verifier = randomId(48), nonce = randomId(16);
      const challenge = b64url(await crypto.subtle.digest('SHA-256', enc.encode(verifier)));
      const ret = safeReturn(url.searchParams.get('return'));
      await redis(['SET', 'member:oauth:' + state, JSON.stringify({ verifier, nonce, ret }), 'EX', STATE_TTL]);
      const q = new URLSearchParams({
        client_id: env.GOOGLE_CLIENT_ID, redirect_uri: url.origin + '/member/callback', response_type: 'code',
        scope: 'openid email profile', state, nonce, code_challenge: challenge, code_challenge_method: 'S256', prompt: 'select_account',
      });
      return redirect(GOOGLE_AUTH + '?' + q);
    }

    if (path === '/member/callback' && method === 'GET') {
      const state = url.searchParams.get('state') || '', code = url.searchParams.get('code') || '';
      if (!/^[A-Za-z0-9_-]{20,64}$/.test(state)) return redirect('/?login=failed');
      const [raw] = await redis(['GETDEL', 'member:oauth:' + state]);
      if (!raw) return redirect('/?login=expired');
      const saved = JSON.parse(raw);
      if (url.searchParams.get('error') || !code) return redirect(saved.ret + (saved.ret.includes('?') ? '&' : '?') + 'login=cancelled');
      const tr = await fetchImpl(GOOGLE_TOKEN, {
        method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ code, client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET,
          redirect_uri: url.origin + '/member/callback', grant_type: 'authorization_code', code_verifier: saved.verifier }),
        signal: AbortSignal.timeout(8000),
      });
      if (!tr.ok) return redirect('/?login=failed');
      const tokens = await tr.json();
      const claims = await verifyIdToken(tokens.id_token, { clientId: env.GOOGLE_CLIENT_ID, nonce: saved.nonce, fetchImpl, now });
      const userKey = 'member:user:' + claims.sub;
      const [prev] = await redis(['GET', userKey]);
      const old = prev ? JSON.parse(prev) : {};
      const user = {
        sub: String(claims.sub), name: String(claims.name || claims.given_name || '讀者').slice(0, 40),
        picture: /^https:\/\/[a-z0-9.-]+\.googleusercontent\.com\//.test(claims.picture || '') ? claims.picture : '',
        eh: await emailHash(claims.email), created: old.created || now, last: now,
        nick: old.nick || '', avatar: old.avatar || '',
      };
      const sid = randomId(32);
      await redis(['SET', userKey, JSON.stringify(user)], ['SET', 'member:sess:' + sid, user.sub, 'EX', SESSION_TTL], ['SADD', 'member:index', user.sub]);
      return redirect(saved.ret, { 'Set-Cookie': sessionCookie(sid, SESSION_TTL) });
    }

    if (path === '/member/me' && method === 'GET') {
      const u = await currentUser(request, redis);
      return json({ user: await publicUser(u, cfg) });
    }

    if (path === '/member/profile' && method === 'POST') {
      if (writeGuard(request, url)) return json({ error: 'forbidden' }, 403);
      const u = await currentUser(request, redis);
      if (!u) return json({ error: '請先登入' }, 401);
      let input;
      try { input = await readJson(request); } catch { return json({ error: 'invalid request' }, 400); }
      const nick = cleanNick(input.nick);
      if (Array.from(nick).length > NICK_MAX) return json({ error: `暱稱最多 ${NICK_MAX} 個字` }, 400);
      if (nick && RESERVED_NICK.test(nick) && !(await isAdmin(u, cfg))) return json({ error: '這個暱稱容易跟站方混淆，請換一個' }, 400);
      const avatar = String(input.avatar || '');
      if (!AVATARS.includes(avatar) || (avatar === 'google' && !u.picture)) return json({ error: '請選一個頭像' }, 400);
      const kday = `member:rl:${u.sub}:p${Math.floor(now / 86_400_000)}`;
      const [cnt] = await redis(['INCR', kday], ['EXPIRE', kday, 90_000]);
      if (Number(cnt) > LIMIT_PROFILE_DAY) return json({ error: '今天改太多次了，明天再試' }, 429);
      const { sid, ...stored } = u;
      const next = { ...stored, nick, avatar };
      await redis(['SET', 'member:user:' + u.sub, JSON.stringify(next)]);
      return json({ user: await publicUser(next, cfg) });
    }

    if (path === '/member/logout' && method === 'POST') {
      if (writeGuard(request, url)) return json({ error: 'forbidden' }, 403);
      const sid = readCookie(request, COOKIE);
      if (/^[A-Za-z0-9_-]{40,64}$/.test(sid)) await redis(['DEL', 'member:sess:' + sid]);
      return json({ ok: true }, 200, { 'Set-Cookie': sessionCookie('', 0) });
    }

    if (path === '/member/comments' && method === 'GET') {
      const page = url.searchParams.get('page') || '';
      if (!PAGE_RE.test(page)) return json({ error: 'invalid page' }, 400);
      const u = await currentUser(request, redis);
      const admin = await isAdmin(u, cfg);
      const [ids] = await redis(['ZRANGE', 'comments:z:' + page, -LIST_MAX, -1]);
      let items = [];
      if (ids && ids.length) {
        const [vals] = await redis(['HMGET', 'comments:h:' + page, ...ids]);
        const raw = (vals || []).filter(Boolean).map(v => JSON.parse(v)).filter(c => !c.hidden || admin);
        // 留言顯示「目前的」暱稱與頭像：改暱稱後舊留言一起更新
        const subs = [...new Set(raw.map(c => c.sub))];
        const profiles = new Map();
        if (subs.length) {
          const rows = await redis(...subs.map(sub => ['GET', 'member:user:' + sub]));
          rows.forEach((r, i) => { if (r) profiles.set(subs[i], display(JSON.parse(r))); });
        }
        items = raw.map(c => {
          const d = profiles.get(c.sub) || { name: c.name, picture: c.picture || '', emoji: '' };
          return { id: c.id, name: d.name, picture: d.picture, emoji: d.emoji, body: c.body, ts: c.ts, hidden: !!c.hidden, mine: !!(u && u.sub === c.sub) };
        });
      }
      return json({ page, comments: items, user: await publicUser(u, cfg) });
    }

    if (path === '/member/comments' && method === 'POST') {
      if (writeGuard(request, url)) return json({ error: 'forbidden' }, 403);
      const u = await currentUser(request, redis);
      if (!u) return json({ error: '請先登入' }, 401);
      let input;
      try { input = await readJson(request); } catch { return json({ error: 'invalid request' }, 400); }
      const page = String(input.page || '');
      if (!PAGE_RE.test(page)) return json({ error: 'invalid page' }, 400);
      const body = cleanBody(input.body);
      const len = Array.from(body).length;
      if (len < 1 || len > MAX_BODY) return json({ error: `留言要 1 到 ${MAX_BODY} 字` }, 400);
      if (env.ASSETS && typeof env.ASSETS.fetch === 'function') {
        const exists = await env.ASSETS.fetch(new Request(url.origin + page, { method: 'GET' }));
        if (exists.status !== 200) return json({ error: 'invalid page' }, 400);
      }
      const k10 = `member:rl:${u.sub}:m${Math.floor(now / 600_000)}`, kday = `member:rl:${u.sub}:d${Math.floor(now / 86_400_000)}`;
      const [c10, , cday] = await redis(['INCR', k10], ['EXPIRE', k10, 700], ['INCR', kday], ['EXPIRE', kday, 90_000]);
      if (Number(c10) > LIMIT_10M || Number(cday) > LIMIT_DAY) return json({ error: '留言太頻繁，請稍後再試' }, 429);
      const id = now.toString(36) + '-' + randomId(6);
      const item = { id, sub: u.sub, name: u.name, picture: u.picture, body, ts: now, hidden: false };
      await redis(['HSET', 'comments:h:' + page, id, JSON.stringify(item)], ['ZADD', 'comments:z:' + page, now, id], ['ZADD', 'comments:recent', now, page + '#' + id]);
      const d = display(u);
      return json({ comment: { id, name: d.name, picture: d.picture, emoji: d.emoji, body, ts: now, hidden: false, mine: true } }, 201);
    }

    if (path === '/member/comments/delete' && method === 'POST') {
      if (writeGuard(request, url)) return json({ error: 'forbidden' }, 403);
      const u = await currentUser(request, redis);
      if (!u) return json({ error: '請先登入' }, 401);
      let input;
      try { input = await readJson(request); } catch { return json({ error: 'invalid request' }, 400); }
      const page = String(input.page || ''), id = String(input.id || '');
      if (!PAGE_RE.test(page) || !/^[a-z0-9]{6,12}-[A-Za-z0-9_-]{8}$/.test(id)) return json({ error: 'invalid request' }, 400);
      const [raw] = await redis(['HGET', 'comments:h:' + page, id]);
      if (!raw) return json({ error: 'not found' }, 404);
      const c = JSON.parse(raw);
      const admin = await isAdmin(u, cfg);
      if (c.sub === u.sub) {
        await redis(['HDEL', 'comments:h:' + page, id], ['ZREM', 'comments:z:' + page, id], ['ZREM', 'comments:recent', page + '#' + id]);
        return json({ ok: true, deleted: true });
      }
      if (admin) {
        c.hidden = input.restore === true ? false : true;
        await redis(['HSET', 'comments:h:' + page, id, JSON.stringify(c)]);
        return json({ ok: true, hidden: c.hidden });
      }
      return json({ error: 'forbidden' }, 403);
    }

    return json({ error: 'not found' }, 404);
  } catch (e) {
    return json({ error: 'service temporarily unavailable' }, 503);
  }
}
