import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import net from 'node:net';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {serve} from '../cloudflare/runtime.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const buildRoot=process.env.CF_BUILD_ROOT || path.join(os.tmpdir(),'ai-km-jiang-cf-build');
const out=JSON.parse(fs.readFileSync(path.join(buildRoot,'latest.json'))).directory;
const db=new Map(), lists=new Map(), commands=[];let dependencyBroken=false,llmCalls=0;
let redis;
const value=k=>Number(db.get(k)||0);
function command(c) {
  commands.push(c);const [op,key,...args]=c;
  if(op==='EVAL') {
    const n=Number(c[2]),keys=c.slice(3,3+n),argv=c.slice(3+n);
    if(n===1) {
      const old=value(keys[0]);if(old>=5)return 6;if(argv[0]==='1')return 0;db.set(keys[0],old+1);return old+1;
    }
    const units=Number(argv[0]);for(let i=3;i>=0;i--)if(value(keys[i])+units>Number(argv[i+1]))return i+1;
    keys.forEach(k=>db.set(k,value(k)+units));return 0;
  }
  if(op==='GET')return db.get(key)||null;
  if(op==='MGET')return c.slice(1).map(k=>db.get(k)||null);
  if(op==='INCR'||op==='INCRBY'){const n=value(key)+(op==='INCR'?1:Number(args[0]));db.set(key,n);return n;}
  if(op==='KEYS')return [...new Set([...db.keys(),...lists.keys()])].filter(k=>new RegExp('^'+key.replaceAll('*','.*')+'$').test(k));
  if(op==='LPUSH'){lists.set(key,[args[0],...(lists.get(key)||[])]);return lists.get(key).length;}
  if(op==='LRANGE')return (lists.get(key)||[]).slice(Number(args[0]),Number(args[1])+1);
  if(['ZRANGE','HGETALL'].includes(op))return [];
  return 1;
}
const server=http.createServer(async(req,res)=>{
  let raw='';for await(const b of req)raw+=b;
  if(req.url==='/chat/completions') {llmCalls++;res.setHeader('Content-Type','application/json');res.end(JSON.stringify({choices:[{message:{content:'這是本機假模型回覆。'}}]}));return;}
  if(dependencyBroken){res.writeHead(503);res.end('{}');return;}
  try {const c=JSON.parse(raw);const result=req.url==='/pipeline'?c.map(c=>({result:command(c)})):{result:command(c)};res.setHeader('Content-Type','application/json');res.end(JSON.stringify(result));}
  catch{res.writeHead(400);res.end('{}');}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
redis='http://127.0.0.1:'+server.address().port;
const portProbe=net.createServer();await new Promise(r=>portProbe.listen(0,'127.0.0.1',r));const devPort=portProbe.address().port;await new Promise(r=>portProbe.close(r));
const env={KV_REST_API_URL:redis,KV_REST_API_TOKEN:'local-test-placeholder',MIKA_LLM_API_KEY:'local-test-placeholder',MIKA_CHAT_READ_TOKEN:'local-read-placeholder',STATS_PASSWORD_B64:Buffer.from('local-password-placeholder').toString('base64'),MIKA_LLM_BASE_URL:redis};
const args=['pages','dev',out,'--port='+devPort,'--compatibility-date=2026-09-04','--compatibility-flags=nodejs_compat','--persist-to='+path.join(buildRoot,'local-state')];
for(const [k,v] of Object.entries(env))args.push('--binding='+k+'='+v);
const log=fs.openSync(path.join(buildRoot,'workers-dev.log'),'w');const proc=spawn('wrangler',args,{cwd:root,stdio:['ignore',log,log]});
const base='http://127.0.0.1:'+devPort;const evidence=[];
async function request(p,body,headers={}){
  const r=await fetch(base+p,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',...headers},body:body===undefined?undefined:JSON.stringify(body),redirect:'manual'});
  const text=await r.text();let json;try{json=JSON.parse(text);}catch{}
  return {status:r.status,headers:r.headers,json,text};
}
async function check(label,callback){await callback();evidence.push({label,result:'PASS'});console.log('PASS '+label);}
try {
  for(let i=0;i<120;i++){try{if((await fetch(base)).ok)break;}catch{}await new Promise(r=>setTimeout(r,500));if(i===119)throw new Error('Workers dev startup timeout');}
  await check('static homepage, noindex, asset',async()=>{const r=await request('/');assert.equal(r.status,200);assert(r.text.includes('name="robots" content="noindex'));assert.match(r.headers.get('X-Robots-Tag'),/noindex/);});
  await check('legacy English article routes',async()=>{for(const p of ['/en/articles/market-to-ai/','/en/articles/market-to-ai','/en/articles/market-to-ai/index.html']){const r=await request(p);assert.equal(r.status,301);assert.match(r.headers.get('location'),/\/articles\/market-to-ai\/$/);}});
  await check('server source paths unavailable',async()=>{for(const p of ['/api/view.js','/cloudflare/runtime.mjs','/functions/api/view.js','/.cloudflare-generated/mika-chat.mjs','/vercel.json']){const r=await request(p);assert(!r.text.includes('createHandler')&&!r.text.includes('module.exports'));assert.notEqual(r.status,200);}});
  await check('view writes isolated keys, stats reads same counters',async()=>{const r=await request('/api/view',{path:'/articles/market-to-ai/',vid:'fixture'});assert.equal(r.status,200);assert.equal(r.json.global,1);assert.equal(db.get('global'),undefined);const stats=await request('/api/stats');assert.equal(stats.json.total,1);assert.equal(stats.json.history.history,'isolated-preview');});
  await check('search log success, unauthorised rejection, authorised read',async()=>{assert.equal((await request('/api/search-log',{q:'knowledge',n:0,surface:'search'})).json.ok,true);assert.equal((await request('/api/search-log')).status,403);const r=await request('/api/search-log',undefined,{'X-Read-Token':'local-password-placeholder'});assert.equal(r.status,200);assert.equal(r.json.count,1);assert.equal(r.json.rows[0].source,'cloudflare');assert.match(r.headers.get('Cache-Control'),/no-store/);});
  await check('chat log success, unauthorised rejection, authorised read',async()=>{assert.equal((await request('/api/mika-chat-log',{text:'fixture only',role:'user'})).json.ok,true);assert.equal((await request('/api/mika-chat-log')).status,403);const r=await request('/api/mika-chat-log',undefined,{'X-Read-Token':'local-read-placeholder'});assert.equal(r.json.count,1);assert.equal(r.json.rows[0].source,'cloudflare');});
  // Workerd dev does not supply the Cloudflare-controlled header. Positive identity tests use the same adapter with an explicit platform fixture.
  const factories={};for(const name of ['stats','stats-admin','view','search-log','mika-chat','mika-chat-log'])factories[name]=(await import('../.cloudflare-generated/'+name+'.mjs')).default;
  const direct=async(name,body,extraEnv={},ip='203.0.113.7',headers={})=>serve(name,factories[name],{env:{...env,...extraEnv},request:new Request('https://candidate.pages.dev/api/'+name,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json','CF-Connecting-IP':ip,...headers},body:body===undefined?undefined:JSON.stringify(body)})});
  await check('stats admin authenticates, limits wrong attempts and preserves history metadata',async()=>{assert.equal((await direct('stats-admin',{pw:'bad'})).status,403);const r=await direct('stats-admin',{pw:'local-password-placeholder'});assert.equal(r.status,200);assert.equal((await r.json()).ok,true);for(let i=0;i<4;i++)assert.equal((await direct('stats-admin',{pw:'bad'})).status,403);assert.equal((await direct('stats-admin',{pw:'local-password-placeholder'})).status,429);});
  await check('missing trusted identity rejects paid chat and admin',async()=>{const before=llmCalls;assert.equal((await direct('mika-chat',{messages:[{role:'user',text:'知識管理'}]}, {},'',{'X-Ver-Cel-Forwarded-For':'203.0.113.1'})).status,503);assert.equal((await direct('stats-admin',{pw:'local-password-placeholder'},{},'')).status,503);assert.equal(llmCalls,before);});
  await check('chat response and bundled real catalogue with mock LLM',async()=>{const handler=factories['mika-chat'](env,fetch,{isIP:(await import('node:net')).isIP,Buffer});const r=await direct('mika-chat',{messages:[{role:'user',text:'知識管理與 AI 怎麼開始？'}]},{},'203.0.113.8');assert.equal(r.status,200);const data=await r.json();assert.match(data.reply,/本機假模型/);assert(llmCalls>0);assert(commands.some(c=>c[0]==='EVAL'&&Number(c[2])===4));});
  await check('all six compiled Worker APIs run success paths',async()=>{
    for(const [name,body] of [['view',{path:'/'}],['stats',undefined],['stats-admin',{pw:'local-password-placeholder'}],['search-log',{q:'compiled',n:1}],['mika-chat-log',{text:'compiled fixture'}],['mika-chat',{messages:[{role:'user',text:'AI與知識管理'}]}]]) {
      const r=await request('/api/'+name,body,{'CF-Connecting-IP':'203.0.113.55'});assert.equal(r.status,200,name+': '+JSON.stringify(r.json));assert.match(r.headers.get('Cache-Control'),/no-store/);
    }
  });
  await check('IPv6 administrator and chat preserve canonical network buckets',async()=>{
    const ip='2001:db8::1';const headers={'CF-Connecting-IP':ip};
    assert.equal((await request('/api/stats-admin',{pw:'bad'},headers)).status,403);
    assert.equal((await request('/api/stats-admin',{pw:'local-password-placeholder'},headers)).status,200);
    const chat=await request('/api/mika-chat',{messages:[{role:'user',text:'知識管理如何起步'}]},headers);assert.equal(chat.status,200);
    assert(commands.some(c=>c[0]==='EVAL'&&Number(c[2])===1&&c[3].includes('2001:db8:0:0::/64')));
    assert(commands.some(c=>c[0]==='EVAL'&&Number(c[2])===4&&c[3].includes('2001:db8:0:0::/64')));
  });
  await check('concurrent paid quota cannot exceed atomic limit',async()=>{const before=llmCalls;const rs=await Promise.all(Array.from({length:6},()=>direct('mika-chat',{messages:[{role:'user',text:'知識管理如何起步'}]},{MIKA_RATE_PER_MIN:'2'},'203.0.113.99')));assert.equal(rs.filter(r=>r.status===200).length,2);assert.equal(rs.filter(r=>r.status===429).length,4);assert.equal(llmCalls-before,2);});
  await check('storage failure prevents paid calls',async()=>{dependencyBroken=true;const before=llmCalls;assert.equal((await direct('mika-chat',{messages:[{role:'user',text:'知識管理'}]},{},'203.0.113.100')).status,503);assert.equal(llmCalls,before);dependencyBroken=false;});
  await check('production mode retains preexisting counts and raw chat',async()=>{db.set('global',4321);const month=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit'}).format(new Date());lists.set('mika:chat:'+month,[JSON.stringify({text:'historic fixture',t:month+'-01 09:00'})]);const r=await serve('stats',factories.stats,{env:{...env,CF_SITE_MODE:'production',CF_PROD_KEYS:'original'},request:new Request('https://jiangyude.com/api/stats')});assert.equal((await r.json()).total,4321);const log=await serve('mika-chat-log',factories['mika-chat-log'],{env:{...env,CF_SITE_MODE:'production',CF_PROD_KEYS:'original'},request:new Request('https://jiangyude.com/api/mika-chat-log',{headers:{'X-Read-Token':'local-read-placeholder'}})});assert.equal((await log.json()).rows[0].text,'historic fixture');});
  await check('production env on candidate host stays isolated',async()=>{const r=await direct('stats',undefined,{CF_SITE_MODE:'production',CF_PROD_KEYS:'original'});const data=await r.json();assert.notEqual(data.total,4321);assert.equal(data.history.mode,'preview');});
  await check('missing bindings fail closed for all six',async()=>{for(const name of Object.keys(factories)){const r=await serve(name,factories[name],{env:{},request:new Request('https://candidate.pages.dev/api/'+name,{method:name==='stats'?'GET':'POST',body:name==='stats'?undefined:'{}'})});assert.equal(r.status,503);}});
  await check('reserved member route fails closed',async()=>{const r=await request('/api/auth/login');assert.equal(r.status,503);assert.match(r.headers.get('Cache-Control'),/no-store/);});
  await check('full static manifest HTTP and redirect targets',async()=>{
    const m=JSON.parse(fs.readFileSync(path.join(buildRoot,'manifest.json')));const rows=m.files.filter(f=>f.classification==='static');let at=0;
    await Promise.all(Array.from({length:12},async()=>{while(at<rows.length){const row=rows[at++];const r=await fetch(base+'/'+row.path.split('/').map(encodeURIComponent).join('/'),{method:'HEAD',redirect:'follow'});assert.equal(r.status,200,row.path);assert.match(r.headers.get('X-Robots-Tag'),/noindex/,row.path);}}));
    const example='market-to-ai';for(const p of ['/en','/en/','/en/index.html','/en/articles/'+example,'/en/ai-trends/program-vs-ai-skill-library/index.html','/en/skills.html','/en/something-old']){let u=base+p;for(let hops=0;hops<3;hops++){const r=await fetch(u,{redirect:'manual',method:'HEAD'});if(r.status===200)break;assert([301,302,307,308].includes(r.status),p);assert(hops<2,'too many redirects '+p);u=new URL(r.headers.get('Location'),u).href;}}
  });
  fs.writeFileSync(path.join(buildRoot,'test-results.json'),JSON.stringify({date:new Date().toISOString(),runtime:'wrangler/workerd HTTP plus adapter platform-IP fixtures',limits:'Redis Lua and LLM mocked; no real credentials used',evidence},null,2));
} finally {proc.kill('SIGTERM');server.close();fs.closeSync(log);}
