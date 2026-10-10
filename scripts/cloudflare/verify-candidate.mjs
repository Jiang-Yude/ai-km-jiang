import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';

const arg = name => process.argv.find(s=>s.startsWith('--'+name+'='))?.slice(name.length+3);
const output = fs.readFileSync(arg('deployment-output'),'utf8');
const urls = output.match(/https:\/\/[a-z0-9-]+\.ai-km-jiang-cf-20261004\.pages\.dev/g);
assert(urls?.length,'deployment candidate URL missing');
const base = urls.at(-1), directory=arg('directory');
const evidence=[];
for(const [name,method] of [['view','POST'],['stats','GET'],['stats-admin','POST'],['search-log','POST'],['mika-chat-log','POST'],['mika-chat','POST']]) {
  const response=await fetch(base+'/api/'+name,{method,headers:{'Content-Type':'application/json'},body:method==='POST'?'{}':undefined});
  assert.match(response.headers.get('content-type')||'',/application\/json/,name+' runtime returned non-JSON');
  const data=await response.json();
  // Secrets are set since 2026-10-09: empty-body probes must reach the handler (2xx/4xx), never 503/5xx.
  assert(response.status<500,name+' runtime or dependency failure: '+response.status+' '+JSON.stringify(data));
  assert.match(response.headers.get('cache-control')||'',/no-store/,name);
  assert.match(response.headers.get('x-robots-tag')||'',/noindex/,name);
  evidence.push({path:'/api/'+name,status:response.status,result:'CONFIGURED_HANDLER_REACHED'});
}
const robots=await fetch(base+'/robots.txt');assert.equal(robots.status,200);assert.match(await robots.text(),/Disallow: \//);
const buildRoot=process.env.CF_BUILD_ROOT||path.join(os.tmpdir(),'ai-km-jiang-cf-build');
fs.writeFileSync(path.join(buildRoot,'candidate-runtime.json'),JSON.stringify({date:new Date().toISOString(),url:base,directory,evidence,liveSuccessPaths:'empty-body probes only'},null,2));
console.log('CANDIDATE_RUNTIME_READY='+base+'; six APIs configured and reachable (empty-body probes; no LLM call)');
