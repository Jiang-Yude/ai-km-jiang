// 會員系統共用函式（Cloudflare Pages Functions 原生 ES module 用）。
// 被 functions/member、functions/member-content、functions/admin/members 三處引用，由 wrangler 打包進 Functions。
// 儲存沿用 Upstash Redis REST；鍵名一律加前綴 member:，預覽模式再加 cf-preview-20261004:（同 cloudflare/runtime.mjs）。
import {isIP} from 'node:net';

const enc = new TextEncoder();
export const SESSION_COOKIE = '__Host-member';
export const SESSION_TTL = 30 * 24 * 3600; // 30 天（秒）
const PREVIEW_PREFIX = 'cf-preview-20261004:';

/* ── 輸出跳脫：所有回給瀏覽器的使用者內容都先過這裡 ── */
export function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"'`]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;','`':'&#96;'}[c]));
}

/* ── 回應：一律 no-store、不給 CORS、不回內部細節 ── */
export function baseHeaders(extra = {}) {
  return new Headers({'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff', 'X-Robots-Tag': 'noindex, nofollow', 'Referrer-Policy': 'same-origin', ...extra});
}
export function reply(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), {status, headers: baseHeaders(extra)});
}

/* ── 模式：照 cloudflare/runtime.mjs 判斷正式站與預覽站 ── */
export function storageMode(request, env) {
  const host = new URL(request.url).hostname;
  const official = ['jiangyude.com', 'www.jiangyude.com'].includes(host);
  if (official && (env.CF_SITE_MODE !== 'production' || env.CF_PROD_KEYS !== 'original')) return null;
  return {mode: official ? 'production' : 'preview', prefix: (official ? '' : PREVIEW_PREFIX) + 'member:'};
}

/* ── 來源網段：做法同 lib/2026-09-13-0910-client-network.js（IPv4 整個位址、IPv6 取 /64） ──
   Functions 不吃 CommonJS require，這裡用 ES module 重寫同一套邏輯；改其中一邊要兩邊一起改。 */
export function clientNetwork(ip) {
  const family = isIP(ip);
  if (family === 4) return ip;
  if (family !== 6) return null;
  const normalized = new URL('http://[' + ip + ']/').hostname.slice(1, -1);
  const halves = normalized.split('::');
  const left = halves[0] ? halves[0].split(':') : [];
  const right = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  const words = (halves.length === 2 ? [...left, ...Array(8 - left.length - right.length).fill('0'), ...right] : left).map(x => parseInt(x, 16));
  if (words.length !== 8) return null;
  if (words.slice(0, 5).every(x => x === 0) && words[5] === 65535)
    return [words[6] >> 8, words[6] & 255, words[7] >> 8, words[7] & 255].join('.');
  return words.slice(0, 4).map(x => x.toString(16)).join(':') + '::/64';
}
// 只信 Cloudflare 提供的 CF-Connecting-IP，訪客自帶的 X-Forwarded-For 一律不看。
export function requestNetwork(request) {
  return clientNetwork(String(request.headers.get('CF-Connecting-IP') || '').trim());
}

/* ── 請求本文：限制大小，避免大檔灌爆 ── */
export async function readText(request, limit) {
  if (!request.body) return '';
  const reader = request.body.getReader(); let size = 0; const chunks = [];
  while (true) {
    const {done, value} = await reader.read(); if (done) break;
    size += value.byteLength;
    if (size > limit) { await reader.cancel(); throw new RangeError('body too large'); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size); let at = 0;
  for (const c of chunks) { bytes.set(c, at); at += c.length; }
  return new TextDecoder().decode(bytes);
}
export async function readJson(request, limit = 16 * 1024) {
  const text = await readText(request, limit);
  if (!text) return {};
  const v = JSON.parse(text);
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw new SyntaxError('object required');
  return v;
}

/* ── 跨站防護：會改資料的 POST 只收同源 JSON。
   帶 Content-Type: application/json 的跨站請求一定要先過 CORS 預檢，而本系統不回 CORS 標頭，所以擋得住。
   Origin 有帶就要等於本站。 ── */
export function sameOriginJson(request) {
  const ct = String(request.headers.get('Content-Type') || '').toLowerCase();
  if (!ct.startsWith('application/json')) return false;
  const origin = request.headers.get('Origin');
  if (origin && origin !== new URL(request.url).origin) return false;
  const site = request.headers.get('Sec-Fetch-Site');
  if (site && !['same-origin', 'none'].includes(site)) return false;
  return true;
}

/* ── Upstash Redis REST ── */
export function store(env, prefix) {
  const url = env.UPSTASH_REDIS_REST_URL || env.KV_REST_API_URL;
  const token = env.UPSTASH_REDIS_REST_TOKEN || env.KV_REST_API_TOKEN;
  if (!url || !token) return null;
  const pipe = async (commands) => {
    const r = await fetch(url + '/pipeline', {method: 'POST',
      headers: {Authorization: 'Bearer ' + token, 'Content-Type': 'application/json'},
      body: JSON.stringify(commands.map(c => c.map(String))), signal: AbortSignal.timeout(5000)});
    if (!r.ok) throw new Error('storage status');
    const j = await r.json();
    if (!Array.isArray(j) || j.length !== commands.length || j.some(o => !o || typeof o !== 'object' || Object.hasOwn(o, 'error') || !Object.hasOwn(o, 'result')))
      throw new Error('invalid storage response');
    return j.map(o => o.result);
  };
  return {key: s => prefix + s, pipe, one: async c => (await pipe([c]))[0]};
}

/* ── 原子限流：全部規則先檢查，全過才一起加一。回傳 0＝放行，>0＝第幾條規則超量。 ── */
export const RATE_SCRIPT = "for i=1,#KEYS do local n=tonumber(redis.call('GET',KEYS[i]) or '0'); if n>=tonumber(ARGV[2*i-1]) then return i end end; for i=1,#KEYS do local n=redis.call('INCR',KEYS[i]); if n==1 then redis.call('EXPIRE',KEYS[i],ARGV[2*i]) end end; return 0";
// rules: [{key: 'rl:...', max: 3, ttl: 60}]；鍵名不含前綴，這裡統一加。
export async function rateLimit(st, rules) {
  const keys = rules.map(r => st.key(r.key)), argv = rules.flatMap(r => [r.max, r.ttl]);
  const n = await st.one(['EVAL', RATE_SCRIPT, keys.length, ...keys, ...argv]);
  if (!Number.isSafeInteger(n) || n < 0 || n > rules.length) throw new Error('invalid limiter response');
  return n === 0;
}
export const minuteBucket = () => Math.floor(Date.now() / 60000);
export const dayBucket = () => new Intl.DateTimeFormat('en-CA', {timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit'}).format(new Date());

/* ── base64url 與 HMAC ── */
export function b64urlToBytes(s) {
  if (typeof s !== 'string' || !/^[A-Za-z0-9_-]*$/.test(s)) throw new Error('bad base64url');
  const b = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4));
  return Uint8Array.from(b, c => c.charCodeAt(0));
}
export function bytesToB64url(bytes) {
  let s = ''; for (const b of new Uint8Array(bytes)) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
async function hmacKey(secret) {
  return crypto.subtle.importKey('raw', enc.encode(secret), {name: 'HMAC', hash: 'SHA-256'}, false, ['sign', 'verify']);
}
export async function hmacHex(secret, text) {
  const sig = await crypto.subtle.sign('HMAC', await hmacKey(secret), enc.encode(text));
  return [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, '0')).join('');
}
async function sha256Hex(text) {
  const d = await crypto.subtle.digest('SHA-256', enc.encode(text));
  return [...new Uint8Array(d)].map(b => b.toString(16).padStart(2, '0')).join('');
}
// 長度不同也跑完整趟比對（同 api/stats-admin.js 的 safeEqual）
export function safeEqual(a, b) {
  const A = enc.encode(String(a)), B = enc.encode(String(b));
  let diff = A.length ^ B.length;
  const n = Math.max(A.length, B.length);
  for (let i = 0; i < n; i++) diff |= (A[i] || 0) ^ (B[i] || 0);
  return diff === 0;
}

/* ── Session：cookie 內容 sub.exp.sig，sig＝HMAC-SHA256(MEMBER_SESSION_SECRET, "sub.exp")。
   伺服器另存 member:sess:<id>（id＝cookie 的 SHA-256 前 32 字），刪掉就撤銷。 ── */
export function sessionSecret(env) {
  const s = String(env.MEMBER_SESSION_SECRET || '');
  return s.length >= 32 ? s : null;
}
const SUB_RE = /^[A-Za-z0-9_-]{1,64}$/;
export async function signSession(secret, sub, exp) {
  const body = sub + '.' + exp;
  const sig = await crypto.subtle.sign('HMAC', await hmacKey(secret), enc.encode(body));
  const token = body + '.' + bytesToB64url(sig);
  return {token, id: (await sha256Hex(token)).slice(0, 32)};
}
export function readCookie(request, name) {
  for (const part of String(request.headers.get('Cookie') || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return '';
}
// 回傳 {sub, id} 或 null（偽造、過期、已撤銷都是 null）
export async function verifySession(request, env, st) {
  const secret = sessionSecret(env);
  const token = readCookie(request, SESSION_COOKIE);
  if (!secret || !token || token.length > 300) return null;
  const parts = token.split('.');
  if (parts.length !== 3 || !SUB_RE.test(parts[0]) || !/^\d{10,13}$/.test(parts[1])) return null;
  let sig;
  try { sig = b64urlToBytes(parts[2]); } catch { return null; }
  const ok = await crypto.subtle.verify('HMAC', await hmacKey(secret), sig, enc.encode(parts[0] + '.' + parts[1]));
  if (!ok || Number(parts[1]) * 1000 <= Date.now()) return null;
  const id = (await sha256Hex(token)).slice(0, 32);
  const stored = await st.one(['GET', st.key('sess:' + id)]);
  if (stored !== parts[0]) return null;
  return {sub: parts[0], id};
}
export function sessionCookie(token, maxAge) {
  return `${SESSION_COOKIE}=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${maxAge}`;
}

/* ── Google ID token 驗證：RS256 驗簽，公鑰依 Cache-Control 快取在記憶體 ── */
const GOOGLE_CERTS = 'https://www.googleapis.com/oauth2/v3/certs';
let jwks = {keys: null, until: 0, fetchedAt: 0};
export function _resetMemberCaches() { jwks = {keys: null, until: 0, fetchedAt: 0}; siteArticles = {set: null, until: 0}; }
async function googleKeys(force) {
  const now = Date.now();
  if (jwks.keys && now < jwks.until && !force) return jwks.keys;
  if (force && now - jwks.fetchedAt < 60000 && jwks.keys) return jwks.keys; // 找不到 kid 時最多每分鐘重抓一次
  const r = await fetch(GOOGLE_CERTS, {signal: AbortSignal.timeout(5000)});
  if (!r.ok) throw new Error('certs status');
  const j = await r.json();
  if (!Array.isArray(j?.keys)) throw new Error('certs format');
  const m = /max-age=(\d+)/i.exec(r.headers.get('Cache-Control') || '');
  const ttl = Math.min(Math.max(m ? Number(m[1]) : 3600, 60), 86400) * 1000;
  jwks = {keys: j.keys, until: now + ttl, fetchedAt: now};
  return jwks.keys;
}
const ISSUERS = ['accounts.google.com', 'https://accounts.google.com'];
// 驗過回傳 payload；任何不符都回 null。取公鑰失敗會丟例外（由呼叫端回 503）。
export async function verifyGoogleIdToken(token, clientId) {
  if (typeof token !== 'string' || token.length > 4096 || !clientId) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  let header, payload, sig;
  try {
    header = JSON.parse(new TextDecoder().decode(b64urlToBytes(parts[0])));
    payload = JSON.parse(new TextDecoder().decode(b64urlToBytes(parts[1])));
    sig = b64urlToBytes(parts[2]);
  } catch { return null; }
  if (header?.alg !== 'RS256' || typeof header.kid !== 'string') return null;
  let jwk = (await googleKeys(false)).find(k => k.kid === header.kid);
  if (!jwk) jwk = (await googleKeys(true)).find(k => k.kid === header.kid);
  if (!jwk || jwk.kty !== 'RSA') return null;
  let key;
  try {
    key = await crypto.subtle.importKey('jwk', {kty: 'RSA', n: jwk.n, e: jwk.e, alg: 'RS256', ext: true},
      {name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256'}, false, ['verify']);
  } catch { return null; }
  const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, sig, enc.encode(parts[0] + '.' + parts[1]));
  if (!ok || !payload || typeof payload !== 'object') return null;
  const now = Math.floor(Date.now() / 1000);
  if (!ISSUERS.includes(payload.iss)) return null;
  const aud = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!aud.includes(clientId)) return null;
  if (!Number.isFinite(payload.exp) || payload.exp < now - 30) return null;
  if (Number.isFinite(payload.iat) && payload.iat > now + 300) return null;
  if (!(payload.email_verified === true || payload.email_verified === 'true')) return null;
  if (typeof payload.sub !== 'string' || !SUB_RE.test(payload.sub)) return null;
  if (typeof payload.email !== 'string' || !EMAIL_RE.test(payload.email)) return null;
  return payload;
}

/* ── 欄位清洗 ── */
export const EMAIL_RE = /^[^\s@<>"']{1,64}@[^\s@<>"']{1,190}\.[^\s@<>"']{2,}$/;
export const normEmail = e => String(e || '').trim().toLowerCase();
const CTRL = /[\u0000-\u0008\u000b-\u001f\u007f​-‏‪-‮⁦-⁩﻿]/g;
export function cleanNick(s) {
  const t = String(s ?? '').replace(/[\r\n\t]/g, ' ').replace(CTRL, '').replace(/\s+/g, ' ').trim();
  const n = [...t].length;
  return n >= 1 && n <= 20 ? t : null;
}
export function cleanText(s) {
  return String(s ?? '').replace(/\r\n?/g, '\n').replace(/\t/g, ' ').replace(CTRL, '').replace(/\n{4,}/g, '\n\n\n').trim();
}
export function cleanPicture(u) {
  try {
    const x = new URL(String(u || ''));
    return x.protocol === 'https:' && /(^|\.)googleusercontent\.com$/.test(x.hostname) ? x.href : '';
  } catch { return ''; }
}

/* ── 站上文章清單：讀同站 /site-index.json（env.ASSETS），5 分鐘記憶體快取 ── */
let siteArticles = {set: null, until: 0};
export async function articlePages(env, request) {
  if (siteArticles.set && Date.now() < siteArticles.until) return siteArticles.set;
  const r = await env.ASSETS.fetch(new Request(new URL('/site-index.json', request.url)));
  if (!r.ok) throw new Error('site index status');
  const j = await r.json();
  const set = new Set((j?.items || []).filter(i => i?.type === 'article' && /^\/(articles|ai-trends)\/[a-z0-9-]+\/$/.test(String(i.url)))
    .map(i => String(i.url).slice(1)));
  siteArticles = {set, until: Date.now() + 300000};
  return set;
}
// "articles/foo/"、"/articles/foo"、"/articles/foo/index.html" 都收斂成 "articles/foo/"
export function normPage(p) {
  const s = String(p || '').trim().replace(/\/index\.html$/, '/').replace(/^\/+/, '');
  if (!/^(articles|ai-trends)\/[a-z0-9-]+\/?$/.test(s)) return null;
  return s.endsWith('/') ? s : s + '/';
}

/* ── 會員記錄 ── */
export async function getUser(st, sub) {
  const raw = await st.one(['GET', st.key('u:' + sub)]);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}
export function newId() { return crypto.randomUUID().replace(/-/g, '').slice(0, 16); }

/* ── 留言審核（原子）：在 list 裡找 id，改狀態或刪除。回傳 1＝找到、0＝沒有 ── */
export const MODERATE_SCRIPT = "local items = redis.call('LRANGE', KEYS[1], 0, -1); for i, raw in ipairs(items) do local ok, c = pcall(cjson.decode, raw); if ok and type(c) == 'table' and c.id == ARGV[1] then if ARGV[2] == 'delete' then redis.call('LREM', KEYS[1], 1, raw) else c.status = ARGV[2]; redis.call('LSET', KEYS[1], i - 1, cjson.encode(c)) end; return 1 end end; return 0";

/* ── 管理密碼：與 api/stats-admin.js 相同的環境變數（STATS_PASSWORD_B64 優先，STATS_PASSWORD 備援） ── */
export function adminPassword(env) {
  const b64 = env.STATS_PASSWORD_B64;
  if (b64) {
    try {
      const bytes = Uint8Array.from(atob(String(b64)), c => c.charCodeAt(0));
      const decoded = new TextDecoder('utf-8', {fatal: true}).decode(bytes);
      return decoded;
    } catch { return ''; }
  }
  return String(env.STATS_PASSWORD || '');
}
// 每網段 30 分鐘錯 5 次（第 6 次起回 429）：同 stats-admin 的 Lua，鍵名改 member:admin:auth:*
export const ADMIN_AUTH_SCRIPT = "local n = tonumber(redis.call('GET', KEYS[1]) or '0'); if n >= 5 then return 6 end; if ARGV[1] == '1' then return 0 end; n = redis.call('INCR', KEYS[1]); redis.call('EXPIRE', KEYS[1], 1800); return n";
