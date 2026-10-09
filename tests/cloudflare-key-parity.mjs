import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {serve} from '../cloudflare/runtime.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const require=createRequire(import.meta.url);
const env={UPSTASH_REDIS_REST_URL:'https://fixture.invalid',UPSTASH_REDIS_REST_TOKEN:'fixture-placeholder',MIKA_LLM_API_KEY:'fixture-placeholder',MIKA_CHAT_READ_TOKEN:'read-placeholder',STATS_PASSWORD_B64:Buffer.from('password-placeholder').toString('base64'),CF_SITE_MODE:'production',CF_PROD_KEYS:'original'};
let sent=[];
const transport=async(url,opts)=>{
  if(String(url).includes('/chat/completions'))return Response.json({choices:[{message:{content:'fixture'}}]});
  const raw=JSON.parse(opts.body),pipeline=Array.isArray(raw[0]),cs=pipeline?raw:[raw];sent.push(...cs);
  const results=cs.map(c=>{
    if(c[0]==='EVAL')return {result:0};
    if(c[0]==='MGET')return {result:c.slice(1).map(()=>0)};
    if(['ZRANGE','LRANGE','HGETALL','KEYS'].includes(c[0]))return {result:[]};
    return {result:1};
  });return Response.json(pipeline?results:results[0]);
};
const oldFetch=globalThis.fetch,oldEnv=process.env,oldCwd=process.cwd();
try {
  process.env={...env};process.chdir(root);globalThis.fetch=transport;
  for(const [name,body] of [['view',{path:'/articles/market-to-ai/',vid:'fixture'}],['stats',undefined],['stats-admin',{pw:'password-placeholder'}],['search-log',{q:'fixture',n:0}],['mika-chat-log',{text:'fixture'}],['mika-chat',{messages:[{role:'user',text:'知識管理'}]}]]) {
    const query={},headers={'x-vercel-forwarded-for':'203.0.113.4','x-forwarded-for':'203.0.113.4','user-agent':'fixture'};
    const res={setHeader(){},status(){return this;},json(){},end(){}};
    sent=[];await require('../api/'+name+'.js')({method:body===undefined?'GET':'POST',headers,body,query},res);const original=structuredClone(sent);
    sent=[];const factory=(await import('../.cloudflare-generated/'+name+'.mjs')).default;
    const request=new Request('https://jiangyude.com/api/'+name,{method:body===undefined?'GET':'POST',headers:{'CF-Connecting-IP':'203.0.113.4','User-Agent':'fixture'},body:body===undefined?undefined:JSON.stringify(body)});
    const result=await serve(name,factory,{env,request},transport);
    // Provenance is the only intentional difference in newly stored log payloads; keys, TTL, Lua and other arguments must match.
    const normalised=structuredClone(sent);
    for(const c of normalised)if(c[0]==='LPUSH'){
      const row=JSON.parse(c[2]);assert.equal(row.source,'cloudflare');assert.equal(row.countingVersion,'legacy-v1');delete row.source;delete row.countingVersion;c[2]=JSON.stringify(row);
    }
    assert.equal(result.status,200,name);assert.deepEqual(normalised,original,name+' original Redis commands differ');
    console.log('PASS '+name+' production Redis commands match Vercel exactly ('+sent.length+' commands)');
  }
} finally {globalThis.fetch=oldFetch;process.env=oldEnv;process.chdir(oldCwd);}
