const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../api/mika-chat.js'),'utf8');
function setup(fetcher, extra={}){
  const env={MIKA_LLM_API_KEY:'fake-test-only',UPSTASH_REDIS_REST_URL:'https://quota.invalid',UPSTASH_REDIS_REST_TOKEN:'fake-test-only',...extra};
  const sandbox={require,module:{exports:{}},process:{env,cwd:()=>path.join(__dirname,'..')},fetch:fetcher,AbortSignal,AbortController,setTimeout,clearTimeout,URL,console:{error:()=>{},log:()=>{},warn:()=>{}}};
  vm.runInNewContext(source+'\n;globalThis.check={ratelimit,handler:module.exports};',sandbox);
  return sandbox.check;
}
const pipeline=(n=0)=>[{result:n}];
function response(){return {statusCode:200,data:null,setHeader(){},status(n){this.statusCode=n;return this;},json(d){this.data=d;return this;},end(){}};}
function req(page='/courses/test',ip='192.0.2.1',text='x'.repeat(500)){
  return {method:'POST',headers:{'x-vercel-forwarded-for':ip},body:{page,messages:[{role:'user',text}]}};
}
test('all storage error shapes fail closed and handler emits 503',async()=>{
  const bad=[()=>new Response('',{status:401}),()=>Response.json({error:'bad'}),()=>Response.json([]),()=>new Response('not JSON'),()=>Response.json([{error:'failed'}]),()=>Response.json([{result:null}]),()=>Response.json([{result:5}]),()=>Response.json([{result:'0'}]),()=>{throw Error('network');}];
  for(const get of bad){const api=setup(async()=>get());assert.equal(await api.ratelimit('192.0.2.1',1),'unavailable');const res=response();await api.handler(req(),res);assert.equal(res.statusCode,503);}
  let calls=0;const api=setup(async()=>{calls++;throw Error('forbidden');},{UPSTASH_REDIS_REST_URL:''});const res=response();await api.handler(req(),res);assert.equal(res.statusCode,503);assert.equal(calls,0);
});
test('hung quota service is aborted at three seconds',async()=>{
  const api=setup((url,options)=>new Promise((resolve,reject)=>{options.signal.addEventListener('abort',()=>reject(options.signal.reason),{once:true});}));
  const keepAlive=setTimeout(()=>{},5000);const start=Date.now();
  try {assert.equal(await api.ratelimit('192.0.2.1',1),'unavailable');assert.ok(Date.now()-start>=2800);assert.ok(Date.now()-start<4500);}finally{clearTimeout(keepAlive);}
});
test('course pages meter one unit per message but never get wider per-IP limits',async()=>{
  async function run(page,ip,forwarded){
    let cmd;const api=setup(async(url,options)=>{assert.equal(url,'https://quota.invalid/pipeline');cmd=JSON.parse(options.body)[0];return Response.json(pipeline(4));},{MIKA_RATE_PER_MIN_COURSE:'300',MIKA_RATE_PER_DAY_COURSE:'3000'});
    const request=req(page,ip);if(forwarded)request.headers['x-forwarded-for']=forwarded;
    const res=response();await api.handler(request,res);assert.equal(res.statusCode,429);return {units:cmd[7],perMin:cmd[8],perDay:cmd[9]};
  }
  for(const [page,units] of [['/courses/test',1],['/en/courses/test',1],['/articles/test',5]]){
    const got=await run(page,'192.0.2.1');
    assert.equal(got.units,units);assert.equal(got.perMin,20);assert.equal(got.perDay,100);
  }
  assert.equal((await run('/courses/test','192.0.2.1','192.0.2.7')).perDay,100);
});
test('all four atomic quota refusal codes map to the correct client reason',async()=>{
 for(const [code,want] of [[0,'ok'],[1,'minute'],[2,'ip-day'],[3,'site-day'],[4,'site-month']]){
   const api=setup(async(url,options)=>{const cmd=JSON.parse(options.body)[0];assert.equal(cmd[0],'EVAL');assert.equal(cmd[2],'4');assert.equal(cmd.length,16);return Response.json(pipeline(code));});
   assert.equal(await api.ratelimit('192.0.2.1',1),want);
 }
});
test('zero limits are preserved and invalid limits fail closed before storage',async()=>{
 let calls=0;
 const api=setup(async(url,options)=>{calls++;const cmd=JSON.parse(options.body)[0];assert.equal(cmd[10],0);return Response.json(pipeline(3));},{MIKA_DAILY_LIMIT:'0'});
 assert.equal(await api.ratelimit('192.0.2.1',1),'site-day');
 const bad=setup(async()=>{throw Error('must not fetch');},{MIKA_DAILY_LIMIT:'invalid'});
 assert.equal(await bad.ratelimit('192.0.2.1',1),'unavailable');assert.equal(calls,1);
});

test('unresolved platform IP fails closed without storage or paid requests',async()=>{
  let calls=0;const api=setup(async()=>{calls++;throw Error('unexpected');});
  for(const ip of ['', 'invalid', '[::1]:80']){const res=response();await api.handler(req('/courses/test',ip),res);assert.equal(res.statusCode,503);assert.ok(res.data.reply);}
  assert.equal(calls,0);
});

test('admin authentication never bypasses broken storage or an exhausted atomic budget',async()=>{
  const adminSource=fs.readFileSync(path.join(__dirname,'../api/stats-admin.js'),'utf8');
  async function run(fetcher,ip='192.0.2.1',pw='wrong',configured='test-password-long-enough'){
    const sandbox={require,Buffer,module:{exports:{}},process:{env:{UPSTASH_REDIS_REST_URL:'https://quota.invalid',UPSTASH_REDIS_REST_TOKEN:'test',STATS_PASSWORD:configured}},fetch:fetcher,AbortSignal,console:{error(){}}};
    vm.runInNewContext(adminSource,sandbox);const res=response();
    await sandbox.module.exports({method:'POST',headers:{'x-vercel-forwarded-for':ip},body:{pw}},res);return res;
  }
  for(const fetcher of [async()=>{throw Error('offline');},async()=>Response.json([{error:'denied'}]),async()=>Response.json([{result:null}]),async()=>Response.json([{result:'0'}]),async()=>Response.json([{result:0}])])assert.equal((await run(fetcher)).statusCode,503);
  assert.equal((await run(async()=>{throw Error('must not fetch');},'192.0.2.1','short','short')).statusCode,503);
  const wrong=await run(async(url,options)=>{const cmds=JSON.parse(options.body);assert.equal(cmds.length,1);assert.equal(cmds[0][0],'EVAL');assert.equal(cmds[0][4],'0');assert.ok(options.signal);return Response.json([{result:1}]);});assert.equal(wrong.statusCode,403);
  assert.equal((await run(async()=>Response.json([{result:6}]))).statusCode,429);
  assert.equal((await run(async()=>{throw Error('must not fetch');},'')).statusCode,503);
  let calls=0;const allowed=await run(async()=>{calls++;return Response.json([{result:calls===1?0:[]}]);},'192.0.2.1','test-password-long-enough');
  assert.notEqual(allowed.statusCode,403);assert.notEqual(allowed.statusCode,429);assert.ok(calls>1);
});

test('admin base64 config preserves text and rejects invalid UTF8',()=>{
 const adminSource=fs.readFileSync(path.join(__dirname,'../api/stats-admin.js'),'utf8');
 function decode(bytes){
  const sandbox={require,Buffer,module:{exports:{}},process:{env:{STATS_PASSWORD_B64:bytes.toString('base64')}},console};
  vm.runInNewContext(adminSource+'\n;globalThis.decode=expectedPassword;',sandbox);
  return sandbox.decode();
 }
 assert.equal(decode(Buffer.from('printable-random-example-text','utf8')),'printable-random-example-text');
 assert.equal(decode(Buffer.alloc(32,255)),'');
});

test('IPv6 address rotation shares network bucket, including equivalent and mapped addresses',async()=>{
 const {clientNetwork}=require('../lib/2026-09-13-0910-client-network.js');
 assert.equal(clientNetwork('2001:db8:1:2::1'),clientNetwork('2001:0db8:0001:0002::ffff'));
 assert.notEqual(clientNetwork('2001:db8:1:2::1'),clientNetwork('2001:db8:1:3::1'));
 assert.equal(clientNetwork('::ffff:192.0.2.1'),'192.0.2.1');
 assert.equal(clientNetwork('bad'),null);
 const keys=[];const api=setup(async(url,options)=>{keys.push(JSON.parse(options.body)[0][3]);return Response.json(pipeline());});
 await api.ratelimit('2001:db8:1:2::1',1);await api.ratelimit('2001:db8:1:2::ff',1);assert.equal(keys[0],keys[1]);
});
