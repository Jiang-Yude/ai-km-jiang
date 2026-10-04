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
  assert.equal(response.status,503,name+' should await user configuration');
  assert.equal(data.error,'configuration required',name+' runtime or dependency failure');
  assert.match(response.headers.get('cache-control')||'',/no-store/,name);
  assert.match(response.headers.get('x-robots-tag')||'',/noindex/,name);
  evidence.push({path:'/api/'+name,status:response.status,result:'RUNTIME_READY_CONFIGURATION_PENDING',missing:data.missing});
}
const robots=await fetch(base+'/robots.txt');assert.equal(robots.status,200);assert.match(await robots.text(),/Disallow: \//);
const buildRoot=process.env.CF_BUILD_ROOT||path.join(os.tmpdir(),'ai-km-jiang-cf-build');
fs.writeFileSync(path.join(buildRoot,'candidate-runtime.json'),JSON.stringify({date:new Date().toISOString(),url:base,directory,evidence,liveSuccessPaths:false},null,2));
console.log('CANDIDATE_RUNTIME_READY='+base+'; six APIs await user secrets, no live dependency success claimed');
