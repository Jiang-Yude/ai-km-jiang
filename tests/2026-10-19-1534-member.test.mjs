// 會員系統測試：用假的 env、假的 fetch（Upstash 與 Google 公鑰）直接呼叫 Pages Functions。
// 跑法：node tests/2026-10-19-1534-member.test.mjs
import assert from 'node:assert/strict';
import {onRequest as member} from '../functions/member/[[path]].js';
import {onRequest as memberContent} from '../functions/member-content/[[path]].js';
import {onRequest as admin} from '../functions/admin/members/[[path]].js';
import {RATE_SCRIPT, ADMIN_AUTH_SCRIPT, MODERATE_SCRIPT, USER_UPSERT_SCRIPT, USER_NICK_SCRIPT, bytesToB64url, _resetMemberCaches} from '../cloudflare/member-lib.mjs';

const ORIGIN = 'https://member-test.pages.dev';
const CLIENT_ID = 'test-client.apps.googleusercontent.com';
const PREFIX = 'cf-preview-20261004:member:';

/* ── 假 Redis ── */
const kv = new Map(), sets = new Map(), lists = new Map();
const num = k => Number(kv.get(k) || 0);
function redis(c) {
  const [op, key, ...a] = c;
  switch (op) {
    case 'GET': return kv.has(key) ? kv.get(key) : null;
    case 'SET': kv.set(key, a[0]); return 'OK';
    case 'DEL': return [kv.delete(key), sets.delete(key), lists.delete(key)].some(Boolean) ? 1 : 0;
    case 'EXPIRE': return 1;
    case 'INCR': kv.set(key, String(num(key) + 1)); return num(key);
    case 'SADD': { const s = sets.get(key) || new Set(); sets.set(key, s); const n = s.size; a.forEach(x => s.add(x)); return s.size - n; }
    case 'SREM': { const s = sets.get(key); if (!s) return 0; let n = 0; a.forEach(x => { if (s.delete(x)) n++; }); return n; }
    case 'SMEMBERS': return [...(sets.get(key) || [])];
    case 'RPUSH': { const l = lists.get(key) || []; lists.set(key, l); l.push(...a); return l.length; }
    case 'LPUSH': { const l = lists.get(key) || []; lists.set(key, l); l.unshift(...a); return l.length; }
    case 'LTRIM': { const l = lists.get(key) || []; const len = l.length; let s = Number(a[0]), e = Number(a[1]);
      if (s < 0) s = Math.max(0, len + s); if (e < 0) e = len + e; lists.set(key, l.slice(s, e + 1)); return 'OK'; }
    case 'LRANGE': { const l = lists.get(key) || []; const e = Number(a[1]) < 0 ? l.length : Number(a[1]) + 1; return l.slice(Number(a[0]), e); }
    case 'EVAL': {
      const script = key, n = Number(a[0]), keys = a.slice(1, 1 + n), argv = a.slice(1 + n);
      if (script === RATE_SCRIPT) {
        for (let i = 0; i < keys.length; i++) if (num(keys[i]) >= Number(argv[2 * i])) return i + 1;
        keys.forEach(k => kv.set(k, String(num(k) + 1))); return 0;
      }
      if (script === ADMIN_AUTH_SCRIPT) {
        const cur = num(keys[0]); if (cur >= 5) return 6; if (argv[0] === '1') return 0;
        kv.set(keys[0], String(cur + 1)); return cur + 1;
      }
      if (script === MODERATE_SCRIPT) {
        const l = lists.get(keys[0]) || [];
        const i = l.findIndex(r => JSON.parse(r).id === argv[0]); if (i < 0) return 0;
        if (argv[1] === 'delete') l.splice(i, 1); else l[i] = JSON.stringify({...JSON.parse(l[i]), status: argv[1]});
        return 1;
      }
      if (script === USER_UPSERT_SCRIPT) {
        const u = JSON.parse(argv[0]); let old = null; try { old = kv.has(keys[0]) ? JSON.parse(kv.get(keys[0])) : null; } catch {}
        if (old && typeof old.nick === 'string' && old.nick) u.nick = old.nick;
        if (old && old.createdAt) u.createdAt = old.createdAt;
        kv.set(keys[0], JSON.stringify(u)); return JSON.stringify(u);
      }
      if (script === USER_NICK_SCRIPT) {
        if (!kv.has(keys[0])) return 0;
        const u = JSON.parse(kv.get(keys[0])); u.nick = argv[0]; kv.set(keys[0], JSON.stringify(u)); return 1;
      }
      throw new Error('unknown script');
    }
    default: throw new Error('unsupported ' + op);
  }
}

/* ── 假 Google 公鑰 ── */
const alg = {name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256'};
const good = await crypto.subtle.generateKey(alg, true, ['sign', 'verify']);
const evil = await crypto.subtle.generateKey(alg, true, ['sign', 'verify']);
const pubJwk = {...await crypto.subtle.exportKey('jwk', good.publicKey), kid: 'kid-1', alg: 'RS256', use: 'sig'};

const realFetch = globalThis.fetch;
globalThis.fetch = async (url, opt = {}) => {
  url = String(url);
  if (url === 'https://www.googleapis.com/oauth2/v3/certs')
    return new Response(JSON.stringify({keys: [pubJwk]}), {headers: {'Cache-Control': 'public, max-age=3600'}});
  if (url === 'https://redis.test/pipeline') {
    assert.equal(opt.headers.Authorization, 'Bearer test-token');
    return Response.json(JSON.parse(opt.body).map(c => ({result: redis(c)})));
  }
  throw new Error('unexpected fetch ' + url);
};

const siteIndex = {items: [{type: 'article', url: '/articles/demo-post/'}, {type: 'course', url: '/courses/x/'}]};
const env = {
  UPSTASH_REDIS_REST_URL: 'https://redis.test', UPSTASH_REDIS_REST_TOKEN: 'test-token',
  GOOGLE_CLIENT_ID: CLIENT_ID, MEMBER_SESSION_SECRET: 'x'.repeat(64), STATS_PASSWORD: 'correct horse',
  ASSETS: {fetch: async (req) => {
    const p = new URL(req.url).pathname;
    if (p === '/site-index.json') return Response.json(siteIndex);
    if (p.startsWith('/member-content/course-3000/')) return new Response('<p>這是 3000 元課程學員才看得到的頁面</p>', {headers: {'Content-Type': 'text/html'}});
    return new Response('static', {status: 200});
  }},
};

async function idToken(key, claims, kid = 'kid-1') {
  const enc = o => bytesToB64url(new TextEncoder().encode(JSON.stringify(o)));
  const head = enc({alg: 'RS256', kid, typ: 'JWT'}), body = enc(claims);
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(head + '.' + body));
  return head + '.' + body + '.' + bytesToB64url(sig);
}
const now = () => Math.floor(Date.now() / 1000);
const claims = (o = {}) => ({iss: 'https://accounts.google.com', aud: CLIENT_ID, sub: '1234567890', email: 'Student@Example.com',
  email_verified: true, name: '小明', picture: 'https://lh3.googleusercontent.com/a/x', iat: now(), exp: now() + 3600, ...o});

function req(path, {method = 'GET', body, cookie, ip = '203.0.113.7', headers = {}} = {}) {
  const h = {'CF-Connecting-IP': ip, Origin: ORIGIN, ...headers};
  if (body !== undefined) h['Content-Type'] = 'application/json';
  if (cookie) h.Cookie = cookie;
  return new Request(ORIGIN + path, {method, headers: h, body: body === undefined ? undefined : JSON.stringify(body)});
}
const call = (fn, r) => fn({request: r, env});
let passed = 0;
async function test(name, f) { _resetMemberCaches(); await f(); passed++; console.log('ok', name); }

await test('假 ID token 驗簽失敗回 401', async () => {
  const r = await call(member, req('/member/login', {method: 'POST', body: {credential: await idToken(evil.privateKey, claims())}}));
  assert.equal(r.status, 401);
  assert.equal(r.headers.get('Set-Cookie'), null);
});
await test('aud 不符回 401', async () => {
  const r = await call(member, req('/member/login', {method: 'POST', body: {credential: await idToken(good.privateKey, claims({aud: 'other'}))}}));
  assert.equal(r.status, 401);
});
await test('email 未驗證回 401', async () => {
  const r = await call(member, req('/member/login', {method: 'POST', body: {credential: await idToken(good.privateKey, claims({email_verified: false}))}}));
  assert.equal(r.status, 401);
});
await test('過期 token 回 401', async () => {
  const r = await call(member, req('/member/login', {method: 'POST', body: {credential: await idToken(good.privateKey, claims({exp: now() - 600}))}}));
  assert.equal(r.status, 401);
});
await test('跨站 Origin 登入回 403', async () => {
  const r = await call(member, req('/member/login', {method: 'POST', headers: {Origin: 'https://evil.example'}, body: {credential: 'x'}}));
  assert.equal(r.status, 403);
});

let cookie = '';
await test('正確 ID token 登入發 HttpOnly cookie', async () => {
  const r = await call(member, req('/member/login', {method: 'POST', body: {credential: await idToken(good.privateKey, claims())}}));
  assert.equal(r.status, 200);
  const sc = r.headers.get('Set-Cookie');
  assert.match(sc, /^__Host-member=[^;]+; HttpOnly; Secure; SameSite=Lax; Path=\/; Max-Age=2592000$/);
  cookie = sc.split(';')[0];
  assert.equal(r.headers.get('Cache-Control'), 'private, no-store');
  assert.ok(kv.has(PREFIX + 'u:1234567890'), '會員記錄要寫在預覽前綴下');
  const u = JSON.parse(kv.get(PREFIX + 'u:1234567890'));
  assert.equal(u.email, 'student@example.com'); assert.equal(u.nick, '小明'); assert.deepEqual(u.tier, ['free']);
});

await test('session 簽章偽造回 401', async () => {
  const [name, val] = cookie.split('=');
  const [sub, exp] = val.split('.');
  const forged = `${name}=${sub}.${exp}.${bytesToB64url(new Uint8Array(32))}`;
  const r = await call(member, req('/member/nick', {method: 'POST', cookie: forged, body: {nick: '駭客'}}));
  assert.equal(r.status, 401);
  const other = `${name}=999.${exp}.${val.split('.')[2]}`; // 換 sub 沿用原簽章
  assert.equal((await call(member, req('/member/nick', {method: 'POST', cookie: other, body: {nick: '駭客'}}))).status, 401);
  const me = await (await call(member, req('/member/me', {cookie: forged}))).json();
  assert.equal(me.loggedIn, false);
});

await test('未登入留言回 401', async () => {
  const r = await call(member, req('/member/comments', {method: 'POST', body: {page: 'articles/demo-post/', text: '請問這個怎麼做？'}}));
  assert.equal(r.status, 401);
});
await test('留言超長回 400', async () => {
  const r = await call(member, req('/member/comments', {method: 'POST', cookie, body: {page: 'articles/demo-post/', text: '字'.repeat(1001)}}));
  assert.equal(r.status, 400);
});
await test('page 不在 site-index 回 400', async () => {
  const r = await call(member, req('/member/comments', {method: 'POST', cookie, body: {page: 'articles/not-exist/', text: '請問這個怎麼做？'}}));
  assert.equal(r.status, 400);
  const g = await call(member, req('/member/comments?page=courses/x/'));
  assert.equal(g.status, 400);
});
await test('登入留言直接發布、輸出跳脫', async () => {
  const r = await call(member, req('/member/comments', {method: 'POST', cookie, body: {page: '/articles/demo-post/', text: '<script>alert(1)</script> 好文'}}));
  assert.equal(r.status, 200);
  const j = await (await call(member, req('/member/comments?page=articles/demo-post/', {cookie}))).json();
  assert.equal(j.comments.length, 1);
  assert.ok(!j.comments[0].text.includes('<script>'));
  assert.ok(j.comments[0].text.includes('&lt;script&gt;'));
  assert.equal(j.comments[0].mine, true);
  assert.equal('sub' in j.comments[0], false);
});
await test('每分鐘第 4 則留言回 429', async () => {
  for (let i = 0; i < 2; i++)
    assert.equal((await call(member, req('/member/comments', {method: 'POST', cookie, body: {page: 'articles/demo-post/', text: '第' + i + '則留言'}}))).status, 200);
  const r = await call(member, req('/member/comments', {method: 'POST', cookie, body: {page: 'articles/demo-post/', text: '第四則留言'}}));
  assert.equal(r.status, 429);
});

await test('無 tier 取 member-content 回 403', async () => {
  const anon = await call(memberContent, req('/member-content/course-3000/'));
  assert.equal(anon.status, 403);
  const r = await call(memberContent, req('/member-content/course-3000/', {cookie}));
  assert.equal(r.status, 403);
  assert.match(await r.text(), /\/member\//);
});

await test('admin 補登記後有 tier 回 200', async () => {
  const g = await call(admin, req('/admin/members/api', {method: 'POST', ip: '198.51.100.9', body: {pw: 'correct horse', action: 'grant', email: 'student@example.com', tier: 'course-8000'}}));
  assert.equal(g.status, 200);
  assert.equal(g.headers.get('Cache-Control'), 'private, no-store');
  // example.com 不是 Gmail 也沒有 hd：預登記先不承接，站長確認信箱後才生效
  assert.equal((await call(memberContent, req('/member-content/course-3000/', {cookie}))).status, 403, '未確認信箱不能承接預登記');
  const lj = await (await call(admin, req('/admin/members/api', {method: 'POST', ip: '198.51.100.9', body: {pw: 'correct horse', action: 'list'}}))).json();
  const row = lj.members.find(m => m.email === 'student@example.com');
  assert.equal(row.emailStatus, 'unconfirmed'); assert.deepEqual(row.pendingTiers, ['8000 元課程學員']);
  assert.equal((await call(admin, req('/admin/members/api', {method: 'POST', ip: '198.51.100.9', body: {pw: 'correct horse', action: 'confirm-email', sub: '1234567890'}}))).status, 200);
  const r = await call(memberContent, req('/member-content/course-3000/', {cookie}));
  assert.equal(r.status, 200, '8000 元包含 3000 元');
  assert.equal(r.headers.get('Cache-Control'), 'private, no-store');
  assert.match(await r.text(), /3000 元課程學員才看得到/);
  const e = await (await call(member, req('/member/entitlements', {cookie}))).json();
  assert.ok(e.tiers.some(t => t.id === 'course-3000'));
  assert.equal(e.content.length, 1);
  assert.equal((await call(memberContent, req('/member-content/course-30000/', {cookie}))).status, 403);
  assert.equal((await call(memberContent, req('/member-content/unknown/', {cookie}))).status, 404);
});

await test('admin 錯密碼第 6 次回 429', async () => {
  const ip = '192.0.2.44';
  for (let i = 1; i <= 5; i++) {
    const r = await call(admin, req('/admin/members/api', {method: 'POST', ip, body: {pw: 'wrong', action: 'list'}}));
    assert.equal(r.status, 403, '第 ' + i + ' 次');
  }
  const r6 = await call(admin, req('/admin/members/api', {method: 'POST', ip, body: {pw: 'wrong', action: 'list'}}));
  assert.equal(r6.status, 429);
  const r7 = await call(admin, req('/admin/members/api', {method: 'POST', ip, body: {pw: 'correct horse', action: 'list'}}));
  assert.equal(r7.status, 429, '鎖住期間正確密碼也擋');
});

await test('webhook 簽章不符回 401、未知格式回 202 且不寫授權', async () => {
  const henv = {...env, PORTALY_WEBHOOK_SECRET: 'w'.repeat(32)};
  const raw = JSON.stringify({buyer: {mail: 'x@example.com'}, item: 'abc'});
  const bad = new Request(ORIGIN + '/member/webhook/portaly', {method: 'POST', headers: {'CF-Connecting-IP': '203.0.113.50', 'X-Portaly-Signature': 'deadbeef'}, body: raw});
  assert.equal((await member({request: bad, env: henv})).status, 401);
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode('w'.repeat(32)), {name: 'HMAC', hash: 'SHA-256'}, false, ['sign']);
  const sig = [...new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(raw)))].map(b => b.toString(16).padStart(2, '0')).join('');
  const ok = new Request(ORIGIN + '/member/webhook/portaly', {method: 'POST', headers: {'CF-Connecting-IP': '203.0.113.50', 'X-Portaly-Signature': 'sha256=' + sig}, body: raw});
  assert.equal((await member({request: ok, env: henv})).status, 202);
  assert.equal(sets.has(PREFIX + 'grant:x@example.com'), false);
  assert.equal(lists.get(PREFIX + 'webhook:log').length, 2);
});

await test('撤銷等級時剛好有併發登入，舊等級不會被寫回', async () => {
  // 讓登入在「讀完會員記錄與授權」之後、「寫回會員記錄」之前停住，撤銷插在中間跑完
  let release, paused;
  const gate = new Promise(r => { release = r; });
  const reached = new Promise(r => { paused = r; });
  const inner = globalThis.fetch;
  globalThis.fetch = async (url, opt = {}) => {
    if (String(url) === 'https://redis.test/pipeline' && JSON.parse(opt.body).some(c => (c[0] === 'SET' && c[1] === PREFIX + 'u:1234567890') || (c[0] === 'EVAL' && c[1] === USER_UPSERT_SCRIPT))) {
      paused(); await gate;
    }
    return inner(url, opt);
  };
  const loginP = call(member, req('/member/login', {method: 'POST', ip: '203.0.113.88', body: {credential: await idToken(good.privateKey, claims())}}));
  await reached;
  globalThis.fetch = inner;
  const rv = await call(admin, req('/admin/members/api', {method: 'POST', ip: '198.51.100.9', body: {pw: 'correct horse', action: 'revoke', email: 'student@example.com', tier: 'course-8000'}}));
  assert.equal(rv.status, 200);
  release();
  const lr = await loginP;
  assert.equal(lr.status, 200);
  const raced = lr.headers.get('Set-Cookie').split(';')[0];
  for (const ck of [cookie, raced]) {
    assert.equal((await call(memberContent, req('/member-content/course-3000/', {cookie: ck}))).status, 403, '撤銷後不能再看');
    const e = await (await call(member, req('/member/entitlements', {cookie: ck}))).json();
    assert.ok(!e.tiers.some(t => t.id === 'course-3000'), 'entitlements 不能再列已撤銷的等級');
  }
});

await test('補登記與撤銷只認授權表，會員記錄裡殘留的等級不算數', async () => {
  const k = PREFIX + 'u:1234567890';
  const u = JSON.parse(kv.get(k)); u.tier = ['free', 'course-30000']; kv.set(k, JSON.stringify(u));
  assert.equal((await call(memberContent, req('/member-content/course-3000/', {cookie}))).status, 403);
  const e = await (await call(member, req('/member/entitlements', {cookie}))).json();
  assert.deepEqual(e.tiers.map(t => t.id), ['free']);
});

await test('同一個 email 換過 Google 帳號，強制登出要登出所有帳號', async () => {
  const r2 = await call(member, req('/member/login', {method: 'POST', ip: '203.0.113.89', body: {credential: await idToken(good.privateKey, claims({sub: '555000111'}))}}));
  assert.equal(r2.status, 200);
  const c2 = r2.headers.get('Set-Cookie').split(';')[0];
  const rs = await call(admin, req('/admin/members/api', {method: 'POST', ip: '198.51.100.9', body: {pw: 'correct horse', action: 'revoke-sessions', email: 'student@example.com'}}));
  assert.equal(rs.status, 200);
  for (const ck of [cookie, c2]) assert.equal((await (await call(member, req('/member/me', {cookie: ck}))).json()).loggedIn, false);
  // 後面的登出測試要用一個有效 session
  cookie = (await call(member, req('/member/login', {method: 'POST', ip: '203.0.113.90', body: {credential: await idToken(good.privateKey, claims())}}))).headers.get('Set-Cookie').split(';')[0];
});

await test('Gmail 與 Workspace（hd 等於網域）自動承接，第三方信箱與 hd 不符不承接', async () => {
  const cases = [['g@gmail.com', undefined, 200, '7000001'], ['w@school.edu.tw', 'school.edu.tw', 200, '7000002'],
    ['x@other.org', undefined, 403, '7000003'], ['y@school.edu.tw', 'evil.edu.tw', 403, '7000004']];
  for (const [email, hd, want, sub] of cases) {
    await call(admin, req('/admin/members/api', {method: 'POST', ip: '198.51.100.9', body: {pw: 'correct horse', action: 'grant', email, tier: 'course-3000'}}));
    const lr = await call(member, req('/member/login', {method: 'POST', ip: '203.0.113.' + (100 + Number(sub.slice(-1))), body: {credential: await idToken(good.privateKey, claims({sub, email, ...(hd ? {hd} : {})}))}}));
    assert.equal(lr.status, 200);
    const ck = lr.headers.get('Set-Cookie').split(';')[0];
    assert.equal((await call(memberContent, req('/member-content/course-3000/', {cookie: ck}))).status, want, email + ' ' + hd);
  }
});

await test('azp 不是本站回 401', async () => {
  const r = await call(member, req('/member/login', {method: 'POST', ip: '203.0.113.120', body: {credential: await idToken(good.privateKey, claims({azp: 'someone-else.apps.googleusercontent.com'}))}}));
  assert.equal(r.status, 401);
});

await test('改暱稱與登入同時發生，暱稱不會被登入蓋掉', async () => {
  let release, paused;
  const gate = new Promise(r => { release = r; }), reached = new Promise(r => { paused = r; });
  const inner = globalThis.fetch;
  globalThis.fetch = async (url, opt = {}) => {
    if (String(url) === 'https://redis.test/pipeline' && JSON.parse(opt.body).some(c => c[0] === 'EVAL' && c[1] === USER_UPSERT_SCRIPT)) { paused(); await gate; }
    return inner(url, opt);
  };
  const loginP = call(member, req('/member/login', {method: 'POST', ip: '203.0.113.121', body: {credential: await idToken(good.privateKey, claims())}}));
  await reached; globalThis.fetch = inner;
  assert.equal((await call(member, req('/member/nick', {method: 'POST', ip: '203.0.113.122', cookie, body: {nick: '新暱稱'}}))).status, 200);
  release(); assert.equal((await loginP).status, 200);
  assert.equal(JSON.parse(kv.get(PREFIX + 'u:1234567890')).nick, '新暱稱');
});

await test('強制登出時剛好有登入在寫 session，那個 session 也要失效', async () => {
  let release, paused;
  const gate = new Promise(r => { release = r; }), reached = new Promise(r => { paused = r; });
  const inner = globalThis.fetch;
  globalThis.fetch = async (url, opt = {}) => {
    if (String(url) === 'https://redis.test/pipeline' && JSON.parse(opt.body).some(c => c[0] === 'EVAL' && c[1] === USER_UPSERT_SCRIPT)) { paused(); await gate; }
    return inner(url, opt);
  };
  const loginP = call(member, req('/member/login', {method: 'POST', ip: '203.0.113.123', body: {credential: await idToken(good.privateKey, claims())}}));
  await reached; globalThis.fetch = inner;
  assert.equal((await call(admin, req('/admin/members/api', {method: 'POST', ip: '198.51.100.9', body: {pw: 'correct horse', action: 'revoke-sessions', email: 'student@example.com'}}))).status, 200);
  release();
  const lr = await loginP; assert.equal(lr.status, 200);
  const raced = lr.headers.get('Set-Cookie').split(';')[0];
  assert.equal((await (await call(member, req('/member/me', {cookie: raced}))).json()).loggedIn, false, '撤銷期間建立的 session 不能用');
  assert.equal((await (await call(member, req('/member/me', {cookie}))).json()).loggedIn, false);
  cookie = (await call(member, req('/member/login', {method: 'POST', ip: '203.0.113.124', body: {credential: await idToken(good.privateKey, claims())}}))).headers.get('Set-Cookie').split(';')[0];
  assert.equal((await (await call(member, req('/member/me', {cookie}))).json()).loggedIn, true, '撤銷後重新登入可以用');
});

await test('登出後 session 失效', async () => {
  const r = await call(member, req('/member/logout', {method: 'POST', cookie, body: {}}));
  assert.equal(r.status, 200);
  const me = await (await call(member, req('/member/me', {cookie}))).json();
  assert.equal(me.loggedIn, false);
});

await test('正式網域未確認正式模式回 503', async () => {
  const r = await member({request: new Request('https://jiangyude.com/member/me'), env});
  assert.equal(r.status, 503);
});

globalThis.fetch = realFetch;
console.log(`全部通過：${passed} 項`);
