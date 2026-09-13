import {spawn,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdtemp,readFile,access} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const run=promisify(execFile);
const server=process.env.REDIS_SERVER,cli=process.env.REDIS_CLI;
if(!server||!cli)throw Error('Set REDIS_SERVER and REDIS_CLI to local binaries. No cloud database is used.');
const dir=await mkdtemp(path.join(tmpdir(),'2026-09-13-redis-quota-'));
const socket=path.join(dir,'redis.sock');
const proc=spawn(server,['--port','0','--unixsocket',socket,'--unixsocketperm','700','--save','','--appendonly','no','--dir',dir],{stdio:'ignore'});
proc.on('error',error=>{console.error(error);});
try {
 let ready=false;
 for(let i=0;i<100;i++){try{await access(socket);ready=true;break;}catch{await new Promise(r=>setTimeout(r,20));}}
 assert.ok(ready,'local redis socket ready');
 async function redis(args){const {stdout}=await run(cli,['-s',socket,'--json',...args.map(String)]);return JSON.parse(stdout);}
 const source=await readFile(new URL('../api/mika-chat.js',import.meta.url),'utf8');
 async function command(ip,env){
  let command;
  const sandbox={require,module:{exports:{}},process:{env:{UPSTASH_REDIS_REST_URL:'https://quota.invalid',UPSTASH_REDIS_REST_TOKEN:'fake',...env}},AbortSignal,URL,console,fetch:async(url,options)=>{command=JSON.parse(options.body)[0];return Response.json([{result:0}]);}};
  vm.runInNewContext(source+'\n;globalThis.limit=ratelimit;',sandbox);
  assert.equal(await sandbox.limit(ip,1,false),'ok');
  return Array.from(command);
 }
 const cmd=await command('192.0.2.1',{MIKA_RATE_PER_MIN:'3',MIKA_DAILY_LIMIT:'100'});
 const results=await Promise.all(Array.from({length:50},()=>redis(cmd)));
 assert.equal(results.filter(x=>x===0).length,3);
 assert.equal(results.filter(x=>x===1).length,47);
 assert.equal(await redis(['GET',cmd[5]]),'3');
 assert.equal(await redis(['GET',cmd[6]]),'3');
 for(let i=0;i<100;i++)assert.equal(await redis(cmd),1);
 assert.equal(await redis(['GET',cmd[5]]),'3');
 const other=await command('192.0.2.2',{MIKA_RATE_PER_MIN:'3',MIKA_DAILY_LIMIT:'100'});
 assert.equal(await redis(other),0);
 assert.equal(await redis(['GET',cmd[5]]),'4');
 const capped=await command('192.0.2.3',{MIKA_DAILY_LIMIT:'4'});
 assert.equal(await redis(capped),3);
 assert.equal(await redis(['GET',cmd[5]]),'4');
 console.log('PASS: actual Redis Lua 50 concurrent attempts: 3 allowed/47 minute limited; 100 rejected attempts leave global budget unchanged; another IP remains usable; site cap enforced.');
} finally {
 proc.kill('SIGTERM');
 await new Promise(resolve=>proc.exitCode!==null?resolve():proc.once('exit',resolve));
}
