// 會員登入與留言板的端到端測試：假 Google（自己產 RSA 金鑰簽 id_token）＋假 Upstash（記憶體）
// 用法：node tests/member.test.mjs
import assert from 'node:assert/strict';
import { handleMember, verifyIdToken } from '../cloudflare/member.mjs';

const enc = new TextEncoder();
const b64url = b => Buffer.from(b).toString('base64url');
const ORIGIN = 'https://jiangyude.com';
const CLIENT = 'test-client.apps.googleusercontent.com';

// ── 假 Upstash（只實作會用到的指令）──
function fakeRedis() {
  const kv = new Map(), hashes = new Map(), zsets = new Map(), sets = new Map(), ttl = new Map();
  const h = k => hashes.get(k) || hashes.set(k, new Map()).get(k);
  const z = k => zsets.get(k) || zsets.set(k, new Map()).get(k);
  const run = ([cmd, key, ...a]) => {
    switch (cmd.toUpperCase()) {
      case 'SET': kv.set(key, a[0]); if (a[1] === 'EX') ttl.set(key, Number(a[2])); return 'OK';
      case 'GET': return kv.has(key) ? kv.get(key) : null;
      case 'GETDEL': { const v = kv.has(key) ? kv.get(key) : null; kv.delete(key); return v; }
      case 'DEL': return kv.delete(key) ? 1 : 0;
      case 'EXPIRE': ttl.set(key, Number(a[0])); return 1;
      case 'INCR': { const v = Number(kv.get(key) || 0) + 1; kv.set(key, String(v)); return v; }
      case 'SADD': { const s = sets.get(key) || sets.set(key, new Set()).get(key); s.add(a[0]); return 1; }
      case 'HSET': h(key).set(a[0], a[1]); return 1;
      case 'HGET': return h(key).get(a[0]) ?? null;
      case 'HMGET': return a.map(f => h(key).get(f) ?? null);
      case 'HDEL': return h(key).delete(a[0]) ? 1 : 0;
      case 'ZADD': z(key).set(a[1], Number(a[0])); return 1;
      case 'ZREM': return z(key).delete(a[0]) ? 1 : 0;
      case 'ZRANGE': {
        const arr = [...z(key).entries()].sort((x, y) => x[1] - y[1]).map(x => x[0]);
        let s = Number(a[0]), e = Number(a[1]);
        if (s < 0) s = Math.max(0, arr.length + s); if (e < 0) e = arr.length + e;
        return arr.slice(s, e + 1);
      }
      default: throw new Error('unsupported ' + cmd);
    }
  };
  return { kv, hashes, zsets, run };
}

const { publicKey, privateKey } = await crypto.subtle.generateKey(
  { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
const jwk = { ...(await crypto.subtle.exportKey('jwk', publicKey)), kid: 'k1' };
async function signIdToken(payload) {
  const head = b64url(JSON.stringify({ alg: 'RS256', kid: 'k1', typ: 'JWT' })), body = b64url(JSON.stringify(payload));
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', privateKey, enc.encode(head + '.' + body));
  return head + '.' + body + '.' + b64url(sig);
}

const db = fakeRedis();
let nextClaims = null;
const fetchImpl = async (url, opt = {}) => {
  url = String(url);
  if (url === 'https://redis.test/pipeline') {
    const cmds = JSON.parse(opt.body);
    assert.ok(cmds.every(c => c[1].startsWith('member:') || c[1].startsWith('comments:')), 'production prefix');
    return Response.json(cmds.map(c => ({ result: db.run(c) })));
  }
  if (url === 'https://www.googleapis.com/oauth2/v3/certs') return Response.json({ keys: [jwk] });
  if (url === 'https://oauth2.googleapis.com/token') {
    const p = new URLSearchParams(opt.body);
    assert.equal(p.get('client_id'), CLIENT); assert.equal(p.get('code'), 'good-code'); assert.ok(p.get('code_verifier'));
    return Response.json({ id_token: await signIdToken(nextClaims) });
  }
  throw new Error('unexpected fetch ' + url);
};

const baseEnv = { MEMBER_ENABLED: '1', GOOGLE_CLIENT_ID: CLIENT, GOOGLE_CLIENT_SECRET: 's', UPSTASH_REDIS_REST_URL: 'https://redis.test',
  UPSTASH_REDIS_REST_TOKEN: 't', CF_SITE_MODE: 'production', CF_PROD_KEYS: 'original', MEMBER_ADMIN_EMAILS: 'boss@example.com',
  ASSETS: { fetch: async req => new Response('', { status: new URL(req.url).pathname === '/articles/hello/' ? 200 : 404 }) } };
const call = (path, { method = 'GET', env = baseEnv, cookie = '', body, headers = {} } = {}) => {
  const h = new Headers(headers); if (cookie) h.set('Cookie', cookie);
  return handleMember({ request: new Request(ORIGIN + path, { method, headers: h, body }), env }, { fetch: fetchImpl });
};
const write = (path, cookie, data, extra = {}) => call(path, { method: 'POST', cookie, body: JSON.stringify(data),
  headers: { Origin: ORIGIN, 'X-JY-Member': '1', 'Content-Type': 'application/json', ...extra } });

let pass = 0; const t = async (name, fn) => { await fn(); pass++; console.log('  ✅', name); };

async function login(claims) {
  const r = await call('/member/login?return=/articles/hello/');
  assert.equal(r.status, 302);
  const loc = new URL(r.headers.get('Location'));
  assert.equal(loc.origin + loc.pathname, 'https://accounts.google.com/o/oauth2/v2/auth');
  assert.equal(loc.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(loc.searchParams.get('redirect_uri'), ORIGIN + '/member/callback');
  nextClaims = { iss: 'https://accounts.google.com', aud: CLIENT, exp: Math.floor(Date.now() / 1000) + 600, nonce: loc.searchParams.get('nonce'), email_verified: true, ...claims };
  const cb = await call(`/member/callback?state=${loc.searchParams.get('state')}&code=good-code`);
  assert.equal(cb.status, 302); assert.equal(cb.headers.get('Location'), '/articles/hello/');
  const sc = cb.headers.get('Set-Cookie');
  assert.match(sc, /^__Host-jy_sess=[A-Za-z0-9_-]{43}; Path=\/; HttpOnly; Secure; SameSite=Lax/);
  return { cookie: sc.split(';')[0], state: loc.searchParams.get('state') };
}

console.log('會員與留言測試');
await t('未啟用：config 回 enabled:false、其他端點 503', async () => {
  const env = { ...baseEnv, MEMBER_ENABLED: '0' };
  assert.deepEqual(await (await call('/member/config', { env })).json(), { enabled: false });
  assert.equal((await call('/member/login', { env })).status, 503);
  assert.equal((await call('/member/comments?page=/articles/hello/', { env })).status, 503);
});
await t('正式網域沒確認正式模式時不啟用', async () => {
  const env = { ...baseEnv, CF_SITE_MODE: 'preview' };
  assert.deepEqual(await (await call('/member/config', { env })).json(), { enabled: false });
});
await t('啟用：config 回 enabled:true', async () => assert.deepEqual(await (await call('/member/config')).json(), { enabled: true }));

const alice = await login({ sub: 'alice', name: '愛麗絲', email: 'Alice@example.com', picture: 'https://lh3.googleusercontent.com/a/x' });
await t('Google 登入成功、state 只能用一次', async () => {
  const again = await call(`/member/callback?state=${alice.state}&code=good-code`);
  assert.equal(again.headers.get('Location'), '/?login=expired');
});
await t('/member/me 回公開欄位、不含 email', async () => {
  const me = await (await call('/member/me', { cookie: alice.cookie })).json();
  assert.equal(me.user.name, '愛麗絲'); assert.equal(me.user.avatar, 'google'); assert.equal(me.user.admin, false);
  assert.ok(!JSON.stringify(me).includes('example.com'));
});
await t('id_token 驗證：aud、nonce、簽章錯都擋', async () => {
  const good = { iss: 'accounts.google.com', aud: CLIENT, exp: Math.floor(Date.now() / 1000) + 60, nonce: 'n', email_verified: true, sub: 'x' };
  const opts = { clientId: CLIENT, nonce: 'n', fetchImpl, now: Date.now() };
  await verifyIdToken(await signIdToken(good), opts);
  await assert.rejects(verifyIdToken(await signIdToken({ ...good, aud: 'other' }), opts), /aud/);
  await assert.rejects(verifyIdToken(await signIdToken({ ...good, nonce: 'm' }), opts), /nonce/);
  await assert.rejects(verifyIdToken(await signIdToken({ ...good, email_verified: false }), opts), /verified/);
  const tok = await signIdToken(good); const forged = tok.slice(0, tok.lastIndexOf('.') + 1) + b64url(new Uint8Array(256));
  await assert.rejects(verifyIdToken(forged, opts), /signature/);
});
await t('return 參數不能跳去別的網站（對照 CVE-2026-63094 開放轉址偷 token）', async () => {
  for (const bad of ['//evil.com/x', 'https://evil.com', '/\\evil.com', '\\\\evil.com', 'javascript:alert(1)', '/%0d%0aSet-Cookie:x']) {
    const r = await call('/member/login?return=' + encodeURIComponent(bad));
    const state = new URL(r.headers.get('Location')).searchParams.get('state');
    const ret = JSON.parse(db.kv.get('member:oauth:' + state)).ret;
    assert.ok(ret === '/' || (ret.startsWith('/') && !ret.startsWith('//') && !/[\r\n\\]/.test(ret)), bad + ' -> ' + ret);
  }
});
await t('資料庫裡不存 email 明文', async () => {
  const raw = db.kv.get('member:user:alice');
  assert.ok(!/example\.com/i.test(raw) && JSON.parse(raw).eh);
});
await t('別的 OAuth 用戶端的 id_token 不能拿來登入（對照 CVE-2026-111639）', async () => {
  const r = await call('/member/login?return=/articles/hello/');
  const loc = new URL(r.headers.get('Location'));
  nextClaims = { iss: 'https://accounts.google.com', aud: 'attacker-client', exp: Math.floor(Date.now() / 1000) + 600, nonce: loc.searchParams.get('nonce'), email_verified: true, sub: 'victim' };
  const cb = await call(`/member/callback?state=${loc.searchParams.get('state')}&code=good-code`);
  assert.equal(cb.status, 503); assert.equal(cb.headers.get('Set-Cookie'), null);
});

let firstId;
await t('未登入不能留言、缺標頭或錯 Origin 被擋', async () => {
  assert.equal((await write('/member/comments', '', { page: '/articles/hello/', body: 'hi' })).status, 401);
  assert.equal((await write('/member/comments', alice.cookie, { page: '/articles/hello/', body: 'hi' }, { 'X-JY-Member': '0' })).status, 403);
  assert.equal((await write('/member/comments', alice.cookie, { page: '/articles/hello/', body: 'hi' }, { Origin: 'https://evil.com' })).status, 403);
});
await t('留言成功；空白、超長、不存在的頁面被擋', async () => {
  const r = await write('/member/comments', alice.cookie, { page: '/articles/hello/', body: '  謝謝分享 <script>alert(1)</script>\u202e  ' });
  assert.equal(r.status, 201);
  const c = (await r.json()).comment; firstId = c.id;
  assert.equal(c.body, '謝謝分享 <script>alert(1)</script>');
  assert.equal((await write('/member/comments', alice.cookie, { page: '/articles/hello/', body: '   ' })).status, 400);
  assert.equal((await write('/member/comments', alice.cookie, { page: '/articles/hello/', body: '字'.repeat(1001) })).status, 400);
  assert.equal((await write('/member/comments', alice.cookie, { page: '/articles/nope/', body: 'x' })).status, 400);
  assert.equal((await write('/member/comments', alice.cookie, { page: '/stats.html', body: 'x' })).status, 400);
});
await t('任何人都看得到留言，列表不洩漏 email 與 sub', async () => {
  const d = await (await call('/member/comments?page=/articles/hello/')).json();
  assert.equal(d.comments.length, 1);
  assert.equal(d.comments[0].mine, false);
  assert.ok(!JSON.stringify(d).includes('example.com') && !JSON.stringify(d).includes('alice'));
});
await t('頻率限制：10 分鐘第 6 則被擋', async () => {
  for (let i = 0; i < 4; i++) assert.equal((await write('/member/comments', alice.cookie, { page: '/articles/hello/', body: '第' + i })).status, 201);
  assert.equal((await write('/member/comments', alice.cookie, { page: '/articles/hello/', body: 'spam' })).status, 429);
});

await t('改暱稱與頭像：舊留言跟著更新；擋冒名、超長、亂填頭像', async () => {
  const set = d => write('/member/profile', alice.cookie, d);
  assert.equal((await set({ nick: '江江本人', avatar: 'initial' })).status, 400);
  assert.equal((await set({ nick: '管理員小幫手', avatar: 'initial' })).status, 400);
  assert.equal((await set({ nick: '字'.repeat(21), avatar: 'initial' })).status, 400);
  assert.equal((await set({ nick: '小愛', avatar: 'e:💣' })).status, 400);
  assert.equal((await set({ nick: '小愛', avatar: 'https://evil.com/x.png' })).status, 400);
  const ok = await (await set({ nick: '  小愛 <b>  ', avatar: 'e:🦊' })).json();
  assert.equal(ok.user.name, '小愛 b'); assert.equal(ok.user.emoji, '🦊'); assert.equal(ok.user.picture, '');
  const list = await (await call('/member/comments?page=/articles/hello/')).json();
  assert.ok(list.comments.length && list.comments.every(c => c.name === '小愛 b' && c.emoji === '🦊'));
  const back = await (await set({ nick: '', avatar: 'google' })).json();
  assert.equal(back.user.name, '愛麗絲'); assert.equal(back.user.picture, 'https://lh3.googleusercontent.com/a/x');
});
await t('沒有 Google 照片的人不能選 google 頭像；重新登入保留暱稱', async () => {
  const carol = await login({ sub: 'carol', name: 'Carol', email: 'c@example.com' });
  assert.equal((await write('/member/profile', carol.cookie, { nick: '', avatar: 'google' })).status, 400);
  assert.equal((await write('/member/profile', carol.cookie, { nick: '卡蘿', avatar: 'e:🐼' })).status, 200);
  const again = await login({ sub: 'carol', name: 'Carol', email: 'c@example.com' });
  const me = await (await call('/member/me', { cookie: again.cookie })).json();
  assert.equal(me.user.name, '卡蘿'); assert.equal(me.user.emoji, '🐼');
});
await t('管理員可以用含「江江」的暱稱', async () => {
  const b2 = await login({ sub: 'boss', name: '江昱德', email: 'boss@example.com' });
  assert.equal((await write('/member/profile', b2.cookie, { nick: '江江教練', avatar: 'initial' })).status, 200);
});

const bob = await login({ sub: 'bob', name: 'Bob', email: 'bob@example.com' });
const boss = await login({ sub: 'boss', name: '江江', email: 'boss@example.com' });
await t('別人不能刪我的留言', async () => {
  assert.equal((await write('/member/comments/delete', bob.cookie, { page: '/articles/hello/', id: firstId })).status, 403);
});
await t('管理員可以隱藏，隱藏後一般人看不到、管理員看得到', async () => {
  const r = await (await write('/member/comments/delete', boss.cookie, { page: '/articles/hello/', id: firstId })).json();
  assert.equal(r.hidden, true);
  const pub = await (await call('/member/comments?page=/articles/hello/')).json();
  assert.ok(!pub.comments.some(c => c.id === firstId));
  const adm = await (await call('/member/comments?page=/articles/hello/', { cookie: boss.cookie })).json();
  assert.ok(adm.comments.find(c => c.id === firstId).hidden); assert.equal(adm.user.admin, true);
});
await t('本人可以刪掉自己的留言', async () => {
  const r = await write('/member/comments/delete', alice.cookie, { page: '/articles/hello/', id: firstId });
  assert.equal((await r.json()).deleted, true);
  assert.equal(db.hashes.get('comments:h:/articles/hello/').has(firstId), false);
});
await t('登出後 session 失效', async () => {
  const r = await write('/member/logout', alice.cookie, {});
  assert.match(r.headers.get('Set-Cookie'), /Max-Age=0/);
  assert.equal((await (await call('/member/me', { cookie: alice.cookie })).json()).user, null);
});
await t('預覽網域使用隔離前綴', async () => {
  const seen = [];
  const env = { ...baseEnv };
  const r = await handleMember({ request: new Request('https://abc.ai-km-jiang.pages.dev/member/me', { headers: { Cookie: '__Host-jy_sess=' + 'a'.repeat(43) } }), env },
    { fetch: async (u, o) => { seen.push(...JSON.parse(o.body).map(c => c[1])); return Response.json([{ result: null }]); } });
  assert.equal(r.status, 200); assert.ok(seen.every(k => k.startsWith('cf-preview-20261004:member:')));
});
console.log(`\n🟢 MEMBER TEST PASS：${pass} 項`);
