// 2026-10-19 安全修補：用本機 redis-server 實跑新加的 Lua（限流、view 新鍵配額），不連任何雲端資料庫。
// 執行：REDIS_SERVER=$(command -v redis-server) REDIS_CLI=$(command -v redis-cli) node tests/2026-10-19-1532-security-lua.test.mjs
import {spawn,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdtemp,access,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {clientNetwork}=require('../lib/2026-09-13-0910-client-network.js');
const run=promisify(execFile);
const server=process.env.REDIS_SERVER,cli=process.env.REDIS_CLI;
if(!server||!cli)throw Error('Set REDIS_SERVER and REDIS_CLI to local binaries. No cloud database is used.');
const dir=await mkdtemp(path.join(tmpdir(),'2026-10-19-redis-security-'));
const socket=path.join(dir,'redis.sock');
const proc=spawn(server,['--port','0','--unixsocket',socket,'--unixsocketperm','700','--save','','--appendonly','no','--dir',dir],{stdio:'ignore'});
try {
  let ready=false;for(let i=0;i<100;i++){try{await access(socket);ready=true;break;}catch{await new Promise(r=>setTimeout(r,20));}}
  assert.ok(ready);
  const redis=async(args)=>{const {stdout}=await run(cli,['-s',socket,'--json',...args.map(String)]);return JSON.parse(stdout);};
  // 限流：兩把鑰匙，上限 3 與 5
  const cmd=()=>clientNetwork.rateCommand([{key:'t:min',limit:3,ttl:90},{key:'t:day',limit:5,ttl:172800}]);
  const got=[];for(let i=0;i<6;i++)got.push(await redis(cmd()));
  assert.deepEqual(got,[0,0,0,1,1,1]);
  assert.equal(await redis(['GET','t:min']),'3');assert.equal(await redis(['GET','t:day']),'3');
  const ttl=await redis(['TTL','t:day']);assert.ok(ttl>172000&&ttl<=172800);
  await redis(['SET','t:min','0']); // 模擬下一分鐘（新的鑰匙）
  assert.equal(await redis(cmd()),0);assert.equal(await redis(cmd()),0);assert.equal(await redis(cmd()),2); // 每日 5 次用完
  // 錯誤次數（與 stats-admin 原版同一段）
  const auth=[];for(let i=0;i<5;i++)auth.push(await redis(clientNetwork.authCommand('t:auth',false)));
  assert.deepEqual(auth,[1,2,3,4,5]);assert.equal(await redis(clientNetwork.authCommand('t:auth',true)),6);
  // view 新鍵配額
  const src=await readFile(new URL('../api/view.js',import.meta.url),'utf8');
  const script=JSON.parse('"'+src.match(/const NEW_KEY_SCRIPT = "((?:[^"\\]|\\.)*)"/)[1]+'"');
  const nk=p=>redis(['EVAL',script,'3','page:'+p,'viewnew:n:d','viewnew:site:d','2','10']);
  assert.equal(await nk('/a/'),0);assert.equal(await nk('/b/'),0);assert.equal(await nk('/c/'),1);
  await redis(['SET','page:/exists/','7']);assert.equal(await nk('/exists/'),0);
  console.log('PASS security lua (rate, auth, view new-key)');
} finally {proc.kill('SIGTERM');}
