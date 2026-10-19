import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import os from 'node:os';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const legacyDecks = JSON.parse(fs.readFileSync(path.join(root,'cloudflare/legacy-decks.json'),'utf8'));
const target = process.argv.find(a=>a.startsWith('--target='))?.split('=')[1] || 'candidate';
if(!['candidate','production'].includes(target))throw new Error('unknown build target');
const buildRoot = process.env.CF_BUILD_ROOT || path.join(os.tmpdir(),'ai-km-jiang-cf-build');
const out = path.join(buildRoot,crypto.randomUUID());
fs.mkdirSync(out,{recursive:true});
const generated = path.join(root,'.cloudflare-generated');fs.mkdirSync(generated,{recursive:true});
const hashes = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const patterns = fs.readFileSync(path.join(root,'.vercelignore'),'utf8').split(/\r?\n/).map(s=>s.trim()).filter(s=>s&&!s.startsWith('#'));
const glob = p => new RegExp('^'+p.split('**/').map(part=>part.split('*').map(s=>s.replace(/[.+?^${}()|[\]\\]/g,'\\$&')).join('.*')).join('(?:.*/)?')+'$');
const classification = p => {
  for (const pat of patterns) {
    if (pat.endsWith('/') && (p.startsWith(pat) || ('/'+p).includes('/'+pat))) return 'vercelignore:'+pat;
    if (glob(pat).test(p) || (!pat.includes('/') && glob(pat).test(path.basename(p)))) return 'vercelignore:'+pat;
  }
  if (/^(api|lib)\//.test(p)) return 'runtime';
  if (p.startsWith('.') || /^(functions|cloudflare|docs)\//.test(p) || ['vercel.json','wrangler.toml','README.md','DEPLOYMENT.md'].includes(p)) return 'deployment-internal';
  return 'static';
};
const files = execFileSync('git',['-C',root,'ls-files','-z'],{maxBuffer:10*1024*1024}).toString().split('\0').filter(Boolean);
const manifest = [];
const legacyIncluded = [];
for (const p of files) {
  const src=path.join(root,p);if(!fs.statSync(src).isFile())continue;
  const kind=classification(p); const entry={path:p,bytes:fs.statSync(src).size,sha256:hashes(src),classification:kind};
  manifest.push(entry);if(kind!=='static')continue;
  const dst=path.join(out,p);fs.mkdirSync(path.dirname(dst),{recursive:true});
  if(p.endsWith('.html')) {
    if (Object.hasOwn(legacyDecks,p)) {
      legacyIncluded.push(p);
      if(entry.sha256!==legacyDecks[p])throw new Error('legacy deck changed; new review required: '+p);
      fs.copyFileSync(src,dst);
      entry.outputSha256=hashes(dst);entry.legacyUnchanged=true;
      continue;
    }
    let html=fs.readFileSync(src,'utf8');
    // Platform-specific beacons cannot collect on Pages. Preserve the source and the independent Upstash views.js.
    html=html.replace(/<script\b[^>]*\bsrc=["']\/_vercel\/(?:insights|speed-insights)\/script\.js["'][^>]*>[\s\S]*?<\/script>/gi,'');
    if(target==='candidate') {
      html=html.replace(/<meta\s+name=["']robots["'][^>]*>/gi,'');
      html=html.replace(/<head\b[^>]*>/i, m=>m+'\n<meta name="robots" content="noindex, nofollow">');
    }
    if(p==='stats.html') html=html.replace(/<body\b[^>]*>/i,m=>m+'\n<aside style="padding:1rem;background:#fff6d6;color:#222">資料連續性：正式 C 網沿用 V 網的流量、搜尋及聊天資料。候選站使用隔離測試資料。原紀錄的保存期限維持不變。原計數方式保留，C 網改用 Cloudflare 提供的來源 IP；API 回應 history 會標示切換時間，切換前不填入假日期。</aside>');
    fs.writeFileSync(dst,html);
  } else fs.copyFileSync(src,dst);
  entry.outputSha256=hashes(dst);
}
const win={};
for(const p of ['search-aliases.js','courses-data.js','article-keywords.js','slides-data.js'])
  vm.runInNewContext(fs.readFileSync(path.join(root,p),'utf8'),{window:win},{timeout:1000});
const items=JSON.parse(fs.readFileSync(path.join(root,'site-index.json'),'utf8')).items;
fs.writeFileSync(path.join(generated,'catalog.mjs'),'export const siteWindow='+JSON.stringify(win)+';\nexport const siteItems='+JSON.stringify(items)+';\n');
for(const name of ['view','stats','stats-admin','search-log','mika-chat-log','mika-chat']) {
  let code=fs.readFileSync(path.join(root,'api',name+'.js'),'utf8');
  code=code.replace("const {clientNetwork}=require('../lib/2026-09-13-0910-client-network.js');",'');
  code=code.replace(/const \{ isIP \} = require\('(node:)?net'\);/g,'');
  code=code.replace("const fs = require('fs');",'').replace("const path = require('path');",'');
  code=code.replaceAll('process.env','env');
  if(name==='mika-chat') {
    // 2026-10-09 咪卡雙軌：把 lib/llm-router.js 內嵌進來（Pages 打包不吃 require）
    const reqLine="const { routeChat } = require('../lib/llm-router.js');";
    if(!code.includes(reqLine))throw new Error('llm-router require mismatch');
    let router=fs.readFileSync(path.join(root,'lib/llm-router.js'),'utf8').replaceAll('process.env','env');
    if(!router.includes('module.exports = {'))throw new Error('llm-router export mismatch');
    router=router.replace(/module\.exports = \{/,'return {');
    code=code.replace(reqLine,'const { routeChat } = (() => {\n'+router+'\n})();');
    const start=code.indexOf('  const root = process.cwd();'),end=code.indexOf('  const ranked = items',start);
    if(start<0||end<0)throw new Error('catalog transform mismatch');
    code=code.slice(0,start)+`  const win = siteWindow;\n  const aliases = win.SEARCH_ALIASES || {};\n  const keywords = win.ARTICLE_KEYWORDS || {};\n  const slugOf = (u) => String(u || '').replace(/^\\/+|\\/+$/g, '').replace(/^articles\\//, '');\n  const items = siteItems;\n\n`+code.slice(end);
    code=code.replace(/module\.exports\._test =[^\n]+/,'');
  }
  if(['search-log','mika-chat-log'].includes(name))code=code.replace('const entry = JSON.stringify({',"const entry = JSON.stringify({\n    source: 'cloudflare', countingVersion: 'legacy-v1',");
  if(!code.includes('module.exports = async'))throw new Error('handler transform mismatch');
  code=code.replace('module.exports = async','const handler = async');
  const network=fs.readFileSync(path.join(root,'lib/2026-09-13-0910-client-network.js'),'utf8').replace("const {isIP}=require('node:net');",'').replace('module.exports={clientNetwork};','');
  const prefix=name==='mika-chat'?"import {siteWindow,siteItems} from './catalog.mjs';\n":'';
  fs.writeFileSync(path.join(generated,name+'.mjs'),prefix+'export default function createHandler(env,fetch,{isIP,Buffer}) {\nconst clientNetwork=((URL)=>{\n'+network+'\nreturn clientNetwork;})(globalThis.URL);\n'+code+'\nreturn handler;\n}\n');
}
if(target==='candidate')fs.writeFileSync(path.join(out,'robots.txt'),'User-agent: *\nDisallow: /\n');
if(!fs.existsSync(path.join(out,'404.html')))fs.writeFileSync(path.join(out,'404.html'),'<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="robots" content="noindex, nofollow"><title>找不到頁面</title></head><body><h1>找不到頁面</h1><a href="/">回首頁</a></body></html>');
// 2026-10-19 安全標頭（安全審查 L1）：
//   X-Frame-Options DENY＝別站不能把本站框起來（stats.html 點擊劫持）；唯一被自家文章內嵌的
//   評量表 scorecard 用 ! 拿掉這個標頭（.html 與去副檔名兩種網址都列）。
//   HSTS 一年含子網域；Permissions-Policy 關掉站上沒用到的鏡頭、麥克風、定位、付款、USB、興趣追蹤。
//   CSP 先用 Report-Only（只在瀏覽器主控台回報、不擋），來源依 2026-10-19 全站掃描：
//   Cloudflare beacon、cdnjs（Chart.js）、jsdelivr（marked）、LINE LIFF、YouTube 內嵌與 iframe_api、
//   Google Fonts，另預留 Google 登入（accounts.google.com、apis.google.com，會員系統正在接）。
//   站上大量內嵌 <script> 與 style 屬性，所以暫時含 'unsafe-inline'，觀察一段時間沒有誤報再改強制。
const csp=["default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://static.cloudflareinsights.com https://cdnjs.cloudflare.com https://cdn.jsdelivr.net https://static.line-scdn.net https://www.youtube.com https://s.ytimg.com https://accounts.google.com https://apis.google.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://accounts.google.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  "img-src 'self' data: blob: https://jiangyude.com https://img.youtube.com https://i.ytimg.com https://jiang-yude.github.io https://danhai-showcase.pages.dev https://*.googleusercontent.com",
  "connect-src 'self' https://cloudflareinsights.com https://static.cloudflareinsights.com https://cdn.jsdelivr.net https://accounts.google.com https://api.line.me https://liffsdk.line-scdn.net",
  "frame-src 'self' https://www.youtube.com https://www.youtube-nocookie.com https://danhai-showcase.pages.dev https://jiang-yude.github.io https://accounts.google.com https://apis.google.com",
  "frame-ancestors 'self'","base-uri 'self'","form-action 'self'","object-src 'none'"].join('; ');
const security='  X-Frame-Options: DENY\n  Strict-Transport-Security: max-age=31536000; includeSubDomains\n  Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()\n  Content-Security-Policy-Report-Only: '+csp+'\n';
const framable='/articles/ai-customer-service-model-retest/scorecard.html\n  ! X-Frame-Options\n/articles/ai-customer-service-model-retest/scorecard\n  ! X-Frame-Options\n';
// 快取（2026-10-19 效能盤查）：圖片 1 天新鮮、7 天內可先給舊版再背景更新；封面有原地覆寫的慣例，所以不用 immutable。
// 「! Cache-Control」先拆掉 /* 那條的 max-age=0，避免兩條規則的值被 Cloudflare 用逗號併在一起。JS、CSS 不設長快取（沒有內容雜湊版本參數前不上 immutable）。
const cache='/images/*\n  ! Cache-Control\n  Cache-Control: public, max-age=86400, stale-while-revalidate=604800\n/*.webp\n  ! Cache-Control\n  Cache-Control: public, max-age=86400, stale-while-revalidate=604800\n';
fs.writeFileSync(path.join(out,'_headers'),'/*\n'+(target==='candidate'?'  X-Robots-Tag: noindex, nofollow\n':'')+'  X-Content-Type-Options: nosniff\n  Cache-Control: public, max-age=0, must-revalidate\n  Referrer-Policy: strict-origin-when-cross-origin\n'+security+framable+cache+'/api/*\n  Cache-Control: private, no-store\n/member/*\n  Cache-Control: private, no-store\n/admin/members/*\n  Cache-Control: private, no-store\n/member-content/*\n  Cache-Control: private, no-store\n  X-Robots-Tag: noindex, nofollow\n');
const redirects=['/en / 301','/en/ / 301','/en/index.html / 301'];
for(const kind of ['articles','ai-trends']) {
  for(const suffix of ['/index.html','/',''])redirects.push(`/en/${kind}/:slug${suffix} /${kind}/:slug/ 301`);
}
for(const name of ['agent','ai-trends','articles','cases','courses','invited-talks','knowledge-architecture','learn','offers','resources','skills'])redirects.push(`/en/${name}.html /${name}.html 301`);
redirects.push('/en/* / 301');
fs.writeFileSync(path.join(out,'_redirects'),redirects.join('\n')+'\n');
fs.writeFileSync(path.join(out,'_routes.json'),JSON.stringify({version:1,include:['/api/*','/member/*','/admin/members/*','/member-content/*'],exclude:[]}));
// --outfile produces a multipart upload envelope, not executable JS. Pages advanced mode accepts an ES module directory.
execFileSync('wrangler',['pages','functions','build',path.join(root,'functions'),'--outdir='+path.join(out,'_worker.js'),'--compatibility-date=2026-09-04','--compatibility-flags=nodejs_compat','--minify'],{cwd:root,stdio:'inherit'});
const statics=manifest.filter(x=>x.classification==='static');
if(statics.length>20000||statics.some(x=>x.bytes>25*1024*1024))throw new Error('Pages asset limit exceeded');
// 正式建置含歷史課後頁時，必須用課後關卡同一支檢查器驗過豁免（短期未過期，或原始逐字稿不存在的雜湊綁定放行）。
// 驗不過就停止，不寫 latest.json，避免拿到未驗證的產物。
if(legacyIncluded.length){
  try {
    const evidence=process.env.SAFE_DEPLOY_POSTCLASS_EVIDENCE_DIR;
    if(!evidence||!fs.existsSync(evidence))throw new Error('build with legacy decks requires SAFE_DEPLOY_POSTCLASS_EVIDENCE_DIR');
    const checker=process.env.POSTCLASS_CHECKER||path.join(os.homedir(),'Library/Mobile Documents/iCloud~md~obsidian/Documents/江昱德 主知識庫/_agent/tools/postclass-loop/2026-09-28-1010 check-postclass-loop.py');
    if(!fs.existsSync(checker))throw new Error('postclass checker not found: '+checker);
    execFileSync('python3',[checker,'--deploy-dir',out,'--evidence-dir',evidence],{stdio:'inherit'});
  } catch (error) {
    fs.rmSync(out,{recursive:true,force:true});
    throw error;
  }
}
fs.writeFileSync(path.join(buildRoot,'manifest.json'),JSON.stringify({target,commit:execFileSync('git',['-C',root,'rev-parse','HEAD']).toString().trim(),staticCount:statics.length,htmlCount:statics.filter(x=>x.path.endsWith('.html')).length,files:manifest,redirects},null,2));
fs.writeFileSync(path.join(buildRoot,'latest.json'),JSON.stringify({target,directory:out}));
console.log('BUILD_DIRECTORY='+out);
