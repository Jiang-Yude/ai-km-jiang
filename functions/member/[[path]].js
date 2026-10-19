// 會員系統主要端點（Cloudflare Pages Functions 原生寫法，不經 api/ 轉換層）。
//   GET  /member/                    會員頁（靜態 member/index.html，經 ASSETS 回傳）
//   POST /member/login               Google ID token 換 session cookie
//   POST /member/logout              登出（刪伺服器端 session）
//   GET  /member/me                  目前登入狀態
//   POST /member/nick                改暱稱
//   GET  /member/comments?page=      某篇文章已發布的留言
//   POST /member/comments            發留言
//   GET  /member/entitlements        我的等級與可看內容
//   POST /member/webhook/portaly     傳送門購買通知（骨架，格式待查證）
import {TIERS, CONTENT, PORTALY_PRODUCTS, isTier, expandTiers, tierLabel} from '../../cloudflare/member-tiers.mjs';
import {esc, reply, baseHeaders, storageMode, requestNetwork, readJson, readText, sameOriginJson, store, rateLimit,
  minuteBucket, dayBucket, sessionSecret, signSession, verifySession, sessionCookie, SESSION_TTL, verifyGoogleIdToken,
  EMAIL_RE, normEmail, cleanNick, cleanText, cleanPicture, articlePages, normPage, getUser, newId, hmacHex, safeEqual} from '../../cloudflare/member-lib.mjs';

const MAX_COMMENTS_PER_PAGE = 2000;

export async function onRequest(context) {
  const {request, env} = context;
  const url = new URL(request.url);
  const route = url.pathname.replace(/^\/member\/?/, '').replace(/\/+$/, '');
  const method = request.method;

  // 會員頁本身是靜態檔
  if (route === '' || route === 'index.html') {
    if (!['GET', 'HEAD'].includes(method)) return reply({error: 'method not allowed'}, 405);
    const r = await env.ASSETS.fetch(request);
    const res = new Response(r.body, r);
    res.headers.set('Cache-Control', 'private, no-store');
    res.headers.set('X-Robots-Tag', 'noindex, nofollow');
    return res;
  }

  const mode = storageMode(request, env);
  if (!mode) return reply({error: 'production storage mode not confirmed'}, 503);
  const st = store(env, mode.prefix);
  if (!st) return reply({error: 'configuration required'}, 503);

  const handlers = {
    'login': ['POST', login], 'logout': ['POST', logout], 'me': ['GET', me], 'nick': ['POST', nick],
    'comments': [null, comments], 'entitlements': ['GET', entitlements], 'webhook/portaly': ['POST', portaly],
  };
  const h = handlers[route];
  if (!h) return reply({error: 'not found'}, 404);
  if (h[0] && method !== h[0]) return reply({error: 'method not allowed'}, 405);
  if (!h[0] && !['GET', 'POST'].includes(method)) return reply({error: 'method not allowed'}, 405);
  try {
    return await h[1]({request, env, st, url});
  } catch (e) {
    if (e instanceof RangeError) return reply({error: 'body too large'}, 413);
    if (e instanceof SyntaxError) return reply({error: 'invalid JSON'}, 400);
    console.error('member_error', route);
    return reply({error: 'service temporarily unavailable'}, 503);
  }
}

/* 改資料的請求共同前置：同源 JSON、可辨識的來源網段 */
function guardWrite(request) {
  if (!sameOriginJson(request)) return reply({error: 'forbidden'}, 403);
  const net = requestNetwork(request);
  if (!net) return reply({error: 'service temporarily unavailable'}, 503);
  return net;
}

function publicMember(u) {
  const tiers = [...expandTiers(u.tier || ['free'])];
  return {nick: esc(u.nick), name: esc(u.name), email: esc(u.email), picture: esc(cleanPicture(u.picture)),
    tiers: tiers.map(t => ({id: t, name: esc(tierLabel(t))}))};
}

async function currentMember(request, env, st) {
  const s = await verifySession(request, env, st);
  if (!s) return null;
  const u = await getUser(st, s.sub);
  if (!u) return null;
  // 授權以 grant 為準即時合併，管理後台補登記後不必重新登入
  const grants = await st.one(['SMEMBERS', st.key('grant:' + normEmail(u.email))]) || [];
  u.tier = [...new Set([...(u.tier || ['free']), ...grants.filter(isTier)])];
  return {session: s, user: u};
}

async function login({request, env, st}) {
  const net = guardWrite(request); if (net instanceof Response) return net;
  const secret = sessionSecret(env);
  if (!env.GOOGLE_CLIENT_ID || !secret) return reply({error: 'configuration required'}, 503);
  if (!await rateLimit(st, [{key: `rl:login:${net}:${Math.floor(Date.now() / 600000)}`, max: 20, ttl: 600}]))
    return reply({error: 'too many attempts'}, 429);
  const body = await readJson(request, 8 * 1024);
  let payload;
  try { payload = await verifyGoogleIdToken(body.credential, env.GOOGLE_CLIENT_ID); }
  catch { return reply({error: 'service temporarily unavailable'}, 503); }
  if (!payload) return reply({error: 'invalid credential'}, 401);

  const sub = payload.sub, email = normEmail(payload.email), now = Date.now();
  const [rawUser, grants] = await st.pipe([['GET', st.key('u:' + sub)], ['SMEMBERS', st.key('grant:' + email)]]);
  let u = null; try { u = rawUser ? JSON.parse(rawUser) : null; } catch { u = null; }
  const name = cleanNick(payload.name) || cleanNick(email.split('@')[0]) || '會員';
  u = {
    email, name: String(payload.name || '').slice(0, 80), picture: cleanPicture(payload.picture),
    nick: u?.nick || name, tier: [...new Set(['free', ...(u?.tier || []), ...(grants || []).filter(isTier)])],
    createdAt: u?.createdAt || now, lastLogin: now,
  };
  const exp = Math.floor(now / 1000) + SESSION_TTL;
  const {token, id} = await signSession(secret, sub, exp);
  await st.pipe([
    ['SET', st.key('u:' + sub), JSON.stringify(u)],
    ['SET', st.key('email:' + email), sub],
    ['SADD', st.key('users'), sub],
    ['SET', st.key('sess:' + id), sub, 'EX', SESSION_TTL],
    ['SADD', st.key('usess:' + sub), id],
    ['EXPIRE', st.key('usess:' + sub), SESSION_TTL],
  ]);
  return reply({ok: true, member: publicMember(u)}, 200, {'Set-Cookie': sessionCookie(token, SESSION_TTL)});
}

async function logout({request, env, st}) {
  const net = guardWrite(request); if (net instanceof Response) return net;
  if (!await rateLimit(st, [{key: `rl:logout:${net}:${minuteBucket()}`, max: 30, ttl: 60}])) return reply({error: 'too many attempts'}, 429);
  const s = await verifySession(request, env, st);
  if (s) await st.pipe([['DEL', st.key('sess:' + s.id)], ['SREM', st.key('usess:' + s.sub), s.id]]);
  return reply({ok: true}, 200, {'Set-Cookie': sessionCookie('', 0)});
}

async function me({request, env, st}) {
  const cur = await currentMember(request, env, st);
  const base = {googleClientId: esc(env.GOOGLE_CLIENT_ID || ''), guestComment: env.MEMBER_ALLOW_GUEST_COMMENT === '1'};
  if (!cur) return reply({...base, loggedIn: false});
  return reply({...base, loggedIn: true, member: publicMember(cur.user)});
}

async function nick({request, env, st}) {
  const net = guardWrite(request); if (net instanceof Response) return net;
  const cur = await currentMember(request, env, st);
  if (!cur) return reply({error: 'login required'}, 401);
  if (!await rateLimit(st, [{key: `rl:nick:${cur.session.sub}:${Math.floor(Date.now() / 3600000)}`, max: 5, ttl: 3600},
    {key: `rl:nicknet:${net}:${Math.floor(Date.now() / 3600000)}`, max: 20, ttl: 3600}])) return reply({error: 'too many attempts'}, 429);
  const body = await readJson(request, 2048);
  const n = cleanNick(body.nick);
  if (!n) return reply({error: '暱稱需 1 到 20 字'}, 400);
  // 讀改寫：只改 nick，其他欄位沿用伺服器上的值
  const u = await getUser(st, cur.session.sub);
  if (!u) return reply({error: 'login required'}, 401);
  u.nick = n;
  await st.one(['SET', st.key('u:' + cur.session.sub), JSON.stringify(u)]);
  return reply({ok: true, nick: esc(n)});
}

async function comments({request, env, st, url}) {
  if (request.method === 'GET') {
    const page = normPage(url.searchParams.get('page'));
    if (!page || !(await articlePages(env, request)).has(page)) return reply({error: 'unknown page'}, 400);
    const cur = await currentMember(request, env, st).catch(() => null);
    const list = await st.one(['LRANGE', st.key('c:' + page), 0, -1]) || [];
    const items = [];
    for (const raw of list) {
      let c; try { c = JSON.parse(raw); } catch { continue; }
      if (c?.status !== 'published') continue;
      items.push({id: esc(c.id), nick: esc(c.nick), text: esc(c.text), ts: Number(c.ts) || 0,
        parent: c.parent ? esc(c.parent) : null, mine: !!(cur && c.sub && c.sub === cur.session.sub)});
    }
    return reply({page: esc(page), comments: items});
  }

  const net = guardWrite(request); if (net instanceof Response) return net;
  const body = await readJson(request, 16 * 1024);
  const cur = await currentMember(request, env, st);
  const guestAllowed = env.MEMBER_ALLOW_GUEST_COMMENT === '1';
  if (!cur && !guestAllowed) return reply({error: 'login required'}, 401);

  const page = normPage(body.page);
  if (!page || !(await articlePages(env, request)).has(page)) return reply({error: 'unknown page'}, 400);
  const text = cleanText(body.text), len = [...text].length;
  if (len < 2 || len > 1000) return reply({error: '留言需 2 到 1000 字'}, 400);
  let guestNick = null;
  if (!cur) { guestNick = cleanNick(body.nick); if (!guestNick) return reply({error: '暱稱需 1 到 20 字'}, 400); }

  const minute = minuteBucket(), day = dayBucket(), hour = Math.floor(Date.now() / 3600000);
  const rules = cur
    ? [{key: `rl:cmin:${cur.session.sub}:${minute}`, max: 3, ttl: 60}, {key: `rl:cday:${cur.session.sub}:${day}`, max: 30, ttl: 86400},
       {key: `rl:cnet:${net}:${hour}`, max: 60, ttl: 3600}]
    : [{key: `rl:gmin:${net}:${minute}`, max: 2, ttl: 60}, {key: `rl:gday:${net}:${day}`, max: 10, ttl: 86400},
       {key: `rl:cnet:${net}:${hour}`, max: 60, ttl: 3600}];
  if (!await rateLimit(st, rules)) return reply({error: '留言太頻繁，請稍後再試'}, 429);

  let parent = null;
  if (body.parent != null && body.parent !== '') {
    parent = String(body.parent);
    if (!/^[a-f0-9]{16}$/.test(parent)) return reply({error: 'invalid parent'}, 400);
    const list = await st.one(['LRANGE', st.key('c:' + page), 0, -1]) || [];
    const found = list.some(raw => { try { const c = JSON.parse(raw); return c.id === parent && c.status === 'published'; } catch { return false; } });
    if (!found) return reply({error: 'invalid parent'}, 400);
  }
  const c = {id: newId(), sub: cur ? cur.session.sub : null, nick: cur ? cur.user.nick : guestNick, text, ts: Date.now(),
    status: cur ? 'published' : 'pending', parent, guest: !cur};
  await st.pipe([
    ['RPUSH', st.key('c:' + page), JSON.stringify(c)],
    ['LTRIM', st.key('c:' + page), -MAX_COMMENTS_PER_PAGE, -1],
    ['SADD', st.key('cpages'), page],
  ]);
  return reply({ok: true, status: c.status, comment: {id: c.id, nick: esc(c.nick), text: esc(c.text), ts: c.ts, parent, mine: true}});
}

async function entitlements({request, env, st}) {
  const cur = await currentMember(request, env, st);
  const all = Object.entries(TIERS).map(([id, t]) => ({id, name: esc(t.name)}));
  if (!cur) return reply({loggedIn: false, tiers: [], allTiers: all, content: []});
  const have = expandTiers(cur.user.tier || ['free']);
  return reply({loggedIn: true, tiers: [...have].map(t => ({id: t, name: esc(tierLabel(t))})), allTiers: all,
    content: CONTENT.filter(c => have.has(c.tier)).map(c => ({tier: c.tier, tierName: esc(tierLabel(c.tier)), title: esc(c.title), url: esc(c.url)}))});
}

/* ── 傳送門 webhook 骨架 ──
   Portaly 的 webhook 格式、簽章標頭名稱、簽章算法都還沒查證（見 DEPLOYMENT.md「會員系統」）。
   目前假設：標頭 X-Portaly-Signature＝HMAC-SHA256(PORTALY_WEBHOOK_SECRET, 原始 body) 的十六進位（可帶 sha256= 前綴）。
   只認一種格式：頂層 email（字串）與 product_id（字串）且 product_id 在 PORTALY_PRODUCTS 對應表內。
   其他一律只記 log 回 202，不猜欄位、不寫授權。 */
async function portaly({request, env, st}) {
  const net = requestNetwork(request);
  if (!net) return reply({error: 'service temporarily unavailable'}, 503);
  if (!await rateLimit(st, [{key: `rl:hook:${net}:${minuteBucket()}`, max: 30, ttl: 60}])) return reply({error: 'too many requests'}, 429);
  const secret = String(env.PORTALY_WEBHOOK_SECRET || '');
  if (secret.length < 16) return reply({error: 'configuration required'}, 503);
  const raw = await readText(request, 64 * 1024);
  const given = String(request.headers.get('X-Portaly-Signature') || '').trim().replace(/^sha256=/i, '').toLowerCase();
  const expected = await hmacHex(secret, raw);
  const log = entry => st.pipe([['LPUSH', st.key('webhook:log'), JSON.stringify({ts: Date.now(), ...entry})], ['LTRIM', st.key('webhook:log'), 0, 199]]);
  if (!given || !safeEqual(given, expected)) {
    // 簽章不符只記標頭名稱與大小（不記內容），方便日後查出 Portaly 實際用哪個標頭
    await log({result: 'bad-signature', headerNames: [...request.headers.keys()].slice(0, 40), bytes: raw.length});
    return reply({error: 'invalid signature'}, 401);
  }
  let body = null; try { body = JSON.parse(raw); } catch { body = null; }
  const email = body && typeof body.email === 'string' ? normEmail(body.email) : '';
  const product = body && typeof body.product_id === 'string' ? body.product_id : '';
  const tier = Object.hasOwn(PORTALY_PRODUCTS, product) ? PORTALY_PRODUCTS[product] : null;
  if (!email || !EMAIL_RE.test(email) || !tier || !isTier(tier)) {
    await log({result: 'unknown-format', keys: body && typeof body === 'object' ? Object.keys(body).slice(0, 40) : [], body: raw.slice(0, 4000)});
    return reply({ok: true, accepted: false}, 202);
  }
  await st.pipe([['SADD', st.key('grant:' + email), tier], ['SADD', st.key('grantees'), email]]);
  await log({result: 'granted', email, tier, product});
  return reply({ok: true, accepted: true});
}
