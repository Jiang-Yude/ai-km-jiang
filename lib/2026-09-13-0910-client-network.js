const {isIP}=require('node:net');
const {createHash,timingSafeEqual}=require('node:crypto');
function clientNetwork(ip) {
  const family=isIP(ip);
  if(family===4)return ip;
  if(family!==6)return null;
  const normalized=new URL('http://['+ip+']/').hostname.slice(1,-1);
  const halves=normalized.split('::');
  const left=halves[0]?halves[0].split(':'):[];
  const right=halves.length===2 && halves[1]?halves[1].split(':'):[];
  const words=(halves.length===2?[...left,...Array(8-left.length-right.length).fill('0'),...right]:left).map(x=>parseInt(x,16));
  if(words.length!==8)return null;
  if(words.slice(0,5).every(x=>x===0)&&words[5]===65535)
    return [words[6]>>8,words[6]&255,words[7]>>8,words[7]&255].join('.');
  return words.slice(0,4).map(x=>x.toString(16)).join(':')+'::/64';
}

/* ── 以下 2026-10-19 安全修補加入：各端點共用的驗證與限流工具 ──
   為什麼掛在 clientNetwork 身上：scripts/cloudflare/build.mjs 把這支檔案原樣內嵌進每個 Cloudflare 端點，
   只回傳 clientNetwork 這一個名字。工具掛成它的屬性，Vercel 與 Cloudflare 兩邊就讀到同一份，不必改打包腳本。
   這裡只能用 isIP、Buffer、URL（Cloudflare 版由 runtime.mjs 提供），不可再 require 別的東西。 */

/* 平台提供的訪客 IP 轉成限流網段（IPv4 整個位址、IPv6 取 /64）。
   只信 x-vercel-forwarded-for：Vercel 會覆寫它，Cloudflare 版由 runtime.mjs 改填 CF-Connecting-IP。
   拿不到合法 IP 回 null，呼叫端要當「無法確認身分」擋下，不可併成共用桶。 */
function networkOf(req) {
  const ip=String(((req&&req.headers)||{})['x-vercel-forwarded-for']||'').split(',')[0].trim();
  return clientNetwork(ip);
}

/* 密碼比對（2026-10-20 改，Codex 第 3 輪指出手寫迴圈不是密碼學等級的常數時間）：
   兩邊先各算 SHA-256 變成固定 32 bytes，再交給平台的 timingSafeEqual（Node 與 Cloudflare nodejs_compat 都有）。
   長度差異被摘要吃掉，比對本身走平台原語；周邊程式（解析、查 Redis）的時間差不在這裡的保證範圍內。 */
function safeEqual(a,b) {
  const A=createHash('sha256').update(String(a==null?'':a),'utf8').digest();
  const B=createHash('sha256').update(String(b==null?'':b),'utf8').digest();
  return timingSafeEqual(A,B);
}

/* 密碼錯誤次數的原子計數（與 stats-admin 原版同一段 Lua）：
   已錯滿 5 次回 6（一律擋，猜對也擋）；這次答對回 0；答錯就加一並回目前次數，30 分鐘後過期。 */
const AUTH_SCRIPT="local n = tonumber(redis.call('GET', KEYS[1]) or '0'); if n >= 5 then return 6 end; if ARGV[1] == '1' then return 0 end; n = redis.call('INCR', KEYS[1]); redis.call('EXPIRE', KEYS[1], 1800); return n";
function authCommand(failKey,correct){return ['EVAL',AUTH_SCRIPT,'1',failKey,correct?'1':'0'];}
/* 回傳 'ok'｜'limited'｜'wrong'；結果格式不對就丟錯，讓呼叫端走「暫時無法驗證」 */
function authVerdict(n,correct) {
  if(!Number.isSafeInteger(n)||n<0||n>6||(correct?(n!==0&&n!==6):n===0))throw new Error('invalid auth counter');
  if(n===6)return 'limited';
  return correct?'ok':'wrong';
}

/* 多把鑰匙一起算的固定窗限流，全部在一段 Lua 裡完成（原子）：
   任何一把已達上限就回它的序號（1 起算），一筆都不加；全部未達上限才各加一，
   第一次建立時設過期秒數。回 0＝放行。
   rules＝[{key, limit, ttl}]，KEYS 依序是各把鑰匙，ARGV 前半是上限、後半是過期秒數。 */
const RATE_SCRIPT="local n = #KEYS\nfor i=1,n do\n  local c = tonumber(redis.call('GET', KEYS[i]) or '0')\n  if not c then return redis.error_reply('invalid counter') end\n  if c >= tonumber(ARGV[i]) then return i end\nend\nfor i=1,n do\n  redis.call('INCR', KEYS[i])\n  if redis.call('TTL', KEYS[i]) < 0 then redis.call('EXPIRE', KEYS[i], tonumber(ARGV[n+i])) end\nend\nreturn 0";
function rateCommand(rules){return ['EVAL',RATE_SCRIPT,String(rules.length),...rules.map(r=>r.key),...rules.map(r=>String(r.limit)),...rules.map(r=>String(r.ttl))];}
/* 回傳 true＝放行、false＝超量；結果格式不對就丟錯（呼叫端要當限流故障，不寫入） */
function rateAllowed(n,count) {
  if(!Number.isSafeInteger(n)||n<0||n>count)throw new Error('invalid rate counter');
  return n===0;
}

/* Upstash pipeline 回應逐筆檢查：任何一筆帶 error 或缺 result 就整批當失敗 */
function pipelineResults(j,count) {
  if(!Array.isArray(j)||j.length!==count||j.some(o=>!o||typeof o!=='object'||Object.hasOwn(o,'error')||!Object.hasOwn(o,'result')))throw new Error('invalid storage response');
  return j.map(o=>o.result);
}

/* 跨網域呼叫白名單（M5）：只有正式網域與本站 Cloudflare Pages 候選網域會拿到 CORS 標頭，
   其他來源一律不回 CORS 標頭（瀏覽器就讀不到回應）。同網域呼叫本來就不需要 CORS。
   候選網域只認本站專案 ai-km-jiang-cf-20261004 的 pages.dev（含各版本子網域），
   不開放任意 *.pages.dev，因為任何人都能在 pages.dev 開自己的專案。
   ⚠️ cloudflare/runtime.mjs 的 corsOrigin 是同一條規則的副本（ESM 無法 require 本檔），改這裡要一起改。 */
const CORS_ORIGIN_RE=/^https:\/\/(?:(?:www\.)?jiangyude\.com|(?:[a-z0-9-]+\.)?ai-km-jiang-cf-20261004\.pages\.dev)$/;
function allowedOrigin(origin){const o=String(origin||'');return CORS_ORIGIN_RE.test(o)?o:'';}
function applyCors(req,res,methods) {
  const o=allowedOrigin(((req&&req.headers)||{}).origin);
  res.setHeader('Vary','Origin');
  if(!o)return;
  res.setHeader('Access-Control-Allow-Origin',o);
  res.setHeader('Access-Control-Allow-Headers','Content-Type');
  res.setHeader('Access-Control-Allow-Methods',methods||'POST, OPTIONS');
}

/* 瀏覽器來源前置檢查（2026-10-20，Codex 第 3 輪）：CORS 標頭只決定瀏覽器能不能讀回應，擋不住請求本身，
   別站用 text/plain 送 JSON 可以免預檢，伺服器照樣花錢呼叫模型。所以會花額度的端點在處理前先看：
   帶了 Origin（＝瀏覽器發的）就必須是本站自己或白名單網域，而且要是 application/json；不合就 403、不呼叫模型。
   沒帶 Origin 的（curl、伺服器端）不在這裡擋，交給每網段與全站額度管。 */
function browserRequestAllowed(req) {
  const h=(req&&req.headers)||{};
  const o=String(h.origin||'');
  if(!o)return true;
  const self=h.host?'https://'+String(h.host).toLowerCase():'';
  if(o!==self&&!allowedOrigin(o))return false;
  return String(h['content-type']||'').toLowerCase().startsWith('application/json');
}

Object.assign(clientNetwork,{networkOf,safeEqual,AUTH_SCRIPT,authCommand,authVerdict,RATE_SCRIPT,rateCommand,rateAllowed,pipelineResults,allowedOrigin,applyCors,browserRequestAllowed});
module.exports={clientNetwork};
