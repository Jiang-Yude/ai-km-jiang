import {isIP} from 'node:net';
import {Buffer} from 'node:buffer';

export function historyInfo(env, mode) {
  return {storage: 'Upstash Redis', mode, history: mode === 'production' ? 'shared-existing-keys' : 'isolated-preview',
    cutoverAt: env.CF_CUTOVER_AT || null, legacyProvider: 'Vercel', currentProvider: 'Cloudflare',
    counting: '原有 view.js 計數：前端同瀏覽器同頁一小時去重、排除 bot；UV 使用 HyperLogLog，估計誤差 0.81%。',
    differences: 'C 網沿用原計數及保存期限；受信任 IP 改讀 Cloudflare CF-Connecting-IP。原紀錄沒有逐筆平台欄位，舊部署若仍寫入，不能單靠時間認定來源。',
    retention: '聊天與搜尋保留到該月結束後 365 天；每頁每日流量保留 90 天。原有期限不延長。'};
}

function prefixCommand(command, prefix) {
  const c = [...command], name = String(c[0]).toUpperCase();
  if (!prefix) return c;
  const key = i => { c[i] = prefix + c[i]; };
  if (name === 'EVAL') {
    const n = Number(c[2]);
    if (!Number.isSafeInteger(n) || n < 0 || n > 16) throw new Error('unsupported eval keys');
    for (let i = 3; i < 3 + n; i++) key(i);
  } else if (['MGET', 'PFCOUNT'].includes(name)) {
    for (let i = 1; i < c.length; i++) key(i);
  } else if (['GET','INCR','INCRBY','EXPIRE','EXPIREAT','HINCRBY','HGETALL','ZADD','ZINCRBY','ZRANGE','KEYS','LPUSH','LTRIM','LRANGE','PFADD'].includes(name)) key(1);
  else throw new Error('unsupported storage command');
  return c;
}

export function storageFetch(env, prefix, transport = fetch) {
  const redis = env.UPSTASH_REDIS_REST_URL || env.KV_REST_API_URL;
  return async (url, options = {}) => {
    if (!redis || (String(url) !== redis && String(url) !== redis + '/pipeline')) {
      const llm = (env.MIKA_LLM_BASE_URL || 'https://api.openai.com/v1') + '/chat/completions';
      if (String(url) === llm) return transport(url, options);
      if (String(url) === 'https://api.anthropic.com/v1/messages') return transport(url, options);
      throw new Error('unsupported upstream endpoint');
    }
    const pipeline = String(url).endsWith('/pipeline');
    const parsed = JSON.parse(options.body);
    const commands = pipeline ? parsed : [parsed];
    const rewritten = commands.map(c => prefixCommand(c, prefix));
    const response = await transport(url, {...options, signal: options.signal || AbortSignal.timeout(5000), body: JSON.stringify(pipeline ? rewritten : rewritten[0])});
    if (!response.ok || !prefix) return response;
    const raw = await response.json(), rows = pipeline ? raw : [raw];
    rows.forEach((row,i) => {
      if (String(commands[i][0]).toUpperCase() === 'KEYS' && Array.isArray(row?.result))
        row.result = row.result.filter(k => String(k).startsWith(prefix)).map(k => String(k).slice(prefix.length));
    });
    return Response.json(pipeline ? rows : rows[0], {status: response.status});
  };
}

export const runtime = {isIP, Buffer};

async function readBody(request) {
  if (!request.body) return {};
  const reader = request.body.getReader(); let size = 0; const chunks = [];
  while (true) {
    const {done,value} = await reader.read(); if (done) break;
    size += value.byteLength;
    if (size > 256 * 1024) { await reader.cancel(); throw new RangeError('body too large'); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size); let at = 0;
  for (const chunk of chunks) {bytes.set(chunk,at); at += chunk.length;}
  const text = new TextDecoder().decode(bytes);
  return text ? JSON.parse(text) : {};
}

export async function serve(name, factory, context, transport = fetch) {
  const {request,env} = context; const url = new URL(request.url);
  const officialHost = ['jiangyude.com','www.jiangyude.com'].includes(url.hostname);
  if (officialHost && (env.CF_SITE_MODE !== 'production' || env.CF_PROD_KEYS !== 'original'))
    return Response.json({error:'production storage mode not confirmed'},{status:503,headers:{'Cache-Control':'private, no-store'}});
  const mode = officialHost ? 'production' : 'preview';
  const prefix = mode === 'production' ? '' : 'cf-preview-20261004:';
  const headers = new Headers({'Content-Type':'application/json; charset=utf-8', 'Cache-Control':'private, no-store', 'X-Content-Type-Options':'nosniff'});
  if (mode !== 'production') headers.set('X-Robots-Tag','noindex, nofollow');
  const reply = (data,status=200) => new Response(JSON.stringify(data), {status,headers});
  if (name !== 'stats-admin') {
    headers.set('Access-Control-Allow-Origin','*'); headers.set('Access-Control-Allow-Headers','Content-Type');
    headers.set('Access-Control-Allow-Methods', name === 'stats' ? 'GET, OPTIONS' : 'GET, POST, OPTIONS');
  }
  if (request.method === 'OPTIONS') return new Response(null,{status:204,headers});
  const allowed = name === 'stats' ? ['GET'] : ['mika-chat','stats-admin','view'].includes(name) ? ['POST'] : ['GET','POST'];
  if (!allowed.includes(request.method)) return reply({error:'method not allowed'},405);
  const missing = [];
  if (!(env.UPSTASH_REDIS_REST_URL || env.KV_REST_API_URL)) missing.push('KV_REST_API_URL');
  if (!(env.UPSTASH_REDIS_REST_TOKEN || env.KV_REST_API_TOKEN)) missing.push('KV_REST_API_TOKEN');
  if (name === 'mika-chat' && !env.MIKA_LLM_API_KEY) missing.push('MIKA_LLM_API_KEY');
  if (missing.length) return reply({error:'configuration required',missing,history:historyInfo(env,mode)},503);
  let body;
  try {body = await readBody(request);} catch(e) {return reply({error:e instanceof RangeError ? 'body too large' : 'invalid JSON'},e instanceof RangeError ? 413 : 400);}
  const reqHeaders = Object.fromEntries(request.headers);
  // Discard visitor-controlled proxy headers. Cloudflare supplies CF-Connecting-IP.
  const ip = request.headers.get('CF-Connecting-IP') || '';
  reqHeaders['x-vercel-forwarded-for'] = ip; reqHeaders['x-forwarded-for'] = ip;
  const req = {method:request.method, headers:reqHeaders, body, query:Object.fromEntries(url.searchParams)};
  let status=200, result, completed=false;
  const res = {setHeader(k,v){if (!['cache-control','x-robots-tag'].includes(k.toLowerCase())) headers.set(k,String(v));},
    status(n){status=n;return this;},json(value){result=value;completed=true;return this;},end(){completed=true;return this;}};
  try {
    const handler = factory(env, storageFetch(env,prefix,transport), runtime);
    await handler(req,res);
    if (!completed) return reply({error:'handler did not complete'},502);
    if (['stats','stats-admin'].includes(name) && result && typeof result==='object') result.history = historyInfo(env,mode);
    // Legacy handlers swallow upstream errors with 200; surface dependency failure honestly.
    if (status === 200 && result?.error) status = 503;
    return status===204 ? new Response(null,{status,headers}) : reply(result ?? {},status);
  } catch {return reply({error:'service temporarily unavailable'},503);}
}
