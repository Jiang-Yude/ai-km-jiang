// 會員管理後台
//   GET  /admin/members/      後台頁（靜態 admin/members/index.html，經 ASSETS 回傳、no-store）
//   POST /admin/members/api   {pw, action, ...}，密碼每次都帶（前端只放記憶體）
// 密碼與限流照 api/stats-admin.js：STATS_PASSWORD_B64（優先）／STATS_PASSWORD、safeEqual、
// 每網段 30 分鐘錯 5 次，第 6 次起 429；限流儲存失敗一律 503，不放行。
import {TIERS, isTier, expandTiers, tierLabel} from '../../../cloudflare/member-tiers.mjs';
import {esc, reply, storageMode, store, requestNetwork, readJson, sameOriginJson, safeEqual, adminPassword,
  ADMIN_AUTH_SCRIPT, MODERATE_SCRIPT, rateLimit, minuteBucket, EMAIL_RE, normEmail, normPage} from '../../../cloudflare/member-lib.mjs';

export async function onRequest({request, env}) {
  const url = new URL(request.url);
  const route = url.pathname.replace(/^\/admin\/members\/?/, '').replace(/\/+$/, '');
  if (route === '' || route === 'index.html') {
    if (!['GET', 'HEAD'].includes(request.method)) return reply({error: 'method not allowed'}, 405);
    const r = await env.ASSETS.fetch(request);
    const res = new Response(r.body, r);
    res.headers.set('Cache-Control', 'private, no-store');
    res.headers.set('X-Robots-Tag', 'noindex, nofollow');
    res.headers.set('Referrer-Policy', 'no-referrer');
    return res;
  }
  if (route !== 'api') return reply({error: 'not found'}, 404);
  if (request.method !== 'POST') return reply({error: 'method not allowed'}, 405);
  if (!sameOriginJson(request)) return reply({error: 'forbidden'}, 403);

  const mode = storageMode(request, env);
  if (!mode) return reply({error: 'production storage mode not confirmed'}, 503);
  const st = store(env, mode.prefix);
  if (!st) return reply({error: 'configuration required'}, 503);
  const want = adminPassword(env);
  if (!want) return reply({error: 'password not configured'}, 503);
  const net = requestNetwork(request);
  if (!net) return reply({error: 'authentication temporarily unavailable'}, 503);

  let body;
  try { body = await readJson(request, 16 * 1024); }
  catch (e) { return reply({error: e instanceof RangeError ? 'body too large' : 'invalid JSON'}, e instanceof RangeError ? 413 : 400); }

  const correct = safeEqual(body.pw, want);
  const failKey = st.key(`admin:auth:${net}:${Math.floor(Date.now() / 1800000)}`);
  try {
    const n = await st.one(['EVAL', ADMIN_AUTH_SCRIPT, 1, failKey, correct ? '1' : '0']);
    if (!Number.isSafeInteger(n) || n < 0 || n > 6 || (correct ? (n !== 0 && n !== 6) : n === 0)) throw new Error('invalid auth counter');
    if (n === 6) return reply({error: 'too many attempts'}, 429);
  } catch {
    console.error('member_admin_limiter_unavailable');
    return reply({error: 'authentication temporarily unavailable'}, 503);
  }
  if (!correct) return reply({error: 'wrong password'}, 403);

  try {
    if (!await rateLimit(st, [{key: `rl:admin:${net}:${minuteBucket()}`, max: 120, ttl: 60}])) return reply({error: 'too many requests'}, 429);
    const fn = ACTIONS[body.action];
    if (!fn) return reply({error: 'unknown action'}, 400);
    return await fn(st, body);
  } catch {
    console.error('member_admin_error');
    return reply({error: 'service temporarily unavailable'}, 503);
  }
}

const parse = raw => { try { return raw ? JSON.parse(raw) : null; } catch { return null; } };

const ACTIONS = {
  // 會員清單與補登記清單
  async list(st) {
    const subs = (await st.one(['SMEMBERS', st.key('users')]) || []).slice(0, 1000);
    const raws = subs.length ? await st.pipe(subs.map(s => ['GET', st.key('u:' + s)])) : [];
    const confirmed = subs.length ? await st.pipe(subs.map(s => ['GET', st.key('vemail:' + s)])) : [];
    const emails = (await st.one(['SMEMBERS', st.key('grantees')]) || []).slice(0, 2000);
    const grants = emails.length ? await st.pipe(emails.map(e => ['SMEMBERS', st.key('grant:' + e)])) : [];
    const grantMap = Object.fromEntries(emails.map((e, i) => [e, (grants[i] || []).filter(isTier)]));
    const members = subs.map((sub, i) => {
      const u = parse(raws[i]); if (!u) return null;
      const owns = u.emailTrusted === true || confirmed[i] === u.email;
      const tiers = [...expandTiers(['free', ...(owns ? (grantMap[u.email] || []) : [])])];
      return {sub: esc(sub), email: esc(u.email), nick: esc(u.nick), tiers: tiers.map(t => esc(tierLabel(t))),
        emailStatus: u.emailTrusted === true ? 'google' : confirmed[i] === u.email ? 'confirmed' : 'unconfirmed',
        pendingTiers: owns ? [] : (grantMap[u.email] || []).map(t => esc(tierLabel(t))),
        createdAt: u.createdAt || 0, lastLogin: u.lastLogin || 0};
    }).filter(Boolean).sort((a, b) => b.lastLogin - a.lastLogin);
    const registered = new Set(members.map(m => m.email));
    return reply({ok: true, members,
      tierOptions: Object.keys(TIERS).filter(t => t !== 'free').map(t => ({id: t, name: esc(tierLabel(t))})),
      grants: emails.map(e => ({email: esc(e), tiers: grantMap[e].map(t => ({id: t, name: esc(tierLabel(t))})), loggedIn: registered.has(esc(e))}))
        .filter(g => g.tiers.length)});
  },

  // 依 email 補登記（傳送門已付費的學員，登入前就可以先登記）
  async grant(st, body) {
    const email = normEmail(body.email), tier = String(body.tier || '');
    if (!EMAIL_RE.test(email) || !isTier(tier) || tier === 'free') return reply({error: 'invalid email or tier'}, 400);
    await st.pipe([['SADD', st.key('grant:' + email), tier], ['SADD', st.key('grantees'), email]]);
    return reply({ok: true});
  },

  // 撤銷某 email 的某個等級。等級只存在授權表，移掉就即時生效（會員記錄不存付費等級，沒有東西會被寫回）
  async revoke(st, body) {
    const email = normEmail(body.email), tier = String(body.tier || '');
    if (!EMAIL_RE.test(email) || !isTier(tier) || tier === 'free') return reply({error: 'invalid email or tier'}, 400);
    await st.one(['SREM', st.key('grant:' + email), tier]);
    return reply({ok: true});
  },

  // 確認信箱：非 Gmail、非 Workspace 信箱的會員，站長核對訂單（例如請對方用該信箱回信）後按確認，
  // 才承接該信箱的預登記等級。確認綁在 sub 與當下信箱，信箱之後改了就自動失效。
  async 'confirm-email'(st, body) {
    const sub = String(body.sub || '');
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(sub)) return reply({error: 'invalid member'}, 400);
    const u = parse(await st.one(['GET', st.key('u:' + sub)]));
    if (!u || !EMAIL_RE.test(String(u.email || ''))) return reply({error: 'member not found'}, 404);
    await st.one(['SET', st.key('vemail:' + sub), normEmail(u.email)]);
    return reply({ok: true});
  },
  async 'unconfirm-email'(st, body) {
    const sub = String(body.sub || '');
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(sub)) return reply({error: 'invalid member'}, 400);
    await st.one(['DEL', st.key('vemail:' + sub)]);
    return reply({ok: true});
  },

  // 強制登出用過這個 email 的所有 Google 帳號、所有裝置
  async 'revoke-sessions'(st, body) {
    const email = normEmail(body.email);
    if (!EMAIL_RE.test(email)) return reply({error: 'invalid email'}, 400);
    const [latest, known] = await st.pipe([['GET', st.key('email:' + email)], ['SMEMBERS', st.key('esubs:' + email)]]);
    const subs = [...new Set([...(known || []), ...(latest ? [latest] : [])])];
    if (!subs.length) return reply({ok: true, revoked: 0});
    // 先把撤銷世代加一（之後才建立的、或正在建立的舊世代 session 全部失效），再清掉已知的 session
    await st.pipe(subs.map(s => ['INCR', st.key('ugen:' + s)]));
    const idLists = await st.pipe(subs.map(s => ['SMEMBERS', st.key('usess:' + s)]));
    const ids = idLists.flatMap(l => l || []);
    await st.pipe([...ids.map(id => ['DEL', st.key('sess:' + id)]), ...subs.map(s => ['DEL', st.key('usess:' + s)])]);
    return reply({ok: true, revoked: ids.length});
  },

  // 留言清單：status＝pending（預設）或 all
  async comments(st, body) {
    const pages = (await st.one(['SMEMBERS', st.key('cpages')]) || []).slice(0, 300);
    const lists = pages.length ? await st.pipe(pages.map(p => ['LRANGE', st.key('c:' + p), 0, -1])) : [];
    const want = body.status === 'all' ? null : 'pending';
    const out = [];
    pages.forEach((p, i) => (lists[i] || []).forEach(raw => {
      const c = parse(raw); if (!c || (want && c.status !== want)) return;
      out.push({page: esc(p), id: esc(c.id), nick: esc(c.nick), text: esc(c.text), status: esc(c.status), ts: Number(c.ts) || 0, guest: !!c.guest, parent: c.parent ? esc(c.parent) : null});
    }));
    out.sort((a, b) => b.ts - a.ts);
    return reply({ok: true, comments: out.slice(0, 300)});
  },

  // 留言發布／隱藏／刪除
  async moderate(st, body) {
    const page = normPage(body.page), id = String(body.id || ''), op = String(body.op || '');
    const status = {publish: 'published', hide: 'hidden', delete: 'delete'}[op];
    if (!page || !/^[a-f0-9]{16}$/.test(id) || !status) return reply({error: 'invalid request'}, 400);
    const n = await st.one(['EVAL', MODERATE_SCRIPT, 1, st.key('c:' + page), id, status]);
    return n === 1 ? reply({ok: true}) : reply({error: 'not found'}, 404);
  },

  async 'webhook-log'(st) {
    const rows = await st.one(['LRANGE', st.key('webhook:log'), 0, 99]) || [];
    // 原樣字串跳脫後回傳，前端只當文字顯示
    return reply({ok: true, log: rows.map(r => esc(r))});
  },
};
