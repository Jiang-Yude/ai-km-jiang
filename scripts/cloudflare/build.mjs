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
  if (p.startsWith('.') || /^(functions|cloudflare|docs)\//.test(p) || ['vercel.json','wrangler.toml','README.md'].includes(p)) return 'deployment-internal';
  return 'static';
};
const files = execFileSync('git',['-C',root,'ls-files','-z'],{maxBuffer:10*1024*1024}).toString().split('\0').filter(Boolean);
const manifest = [];
for (const p of files) {
  const src=path.join(root,p);if(!fs.statSync(src).isFile())continue;
  const kind=classification(p); const entry={path:p,bytes:fs.statSync(src).size,sha256:hashes(src),classification:kind};
  manifest.push(entry);if(kind!=='static')continue;
  const dst=path.join(out,p);fs.mkdirSync(path.dirname(dst),{recursive:true});
  if(p.endsWith('.html')) {
    if (Object.hasOwn(legacyDecks,p)) {
      if(target!=='candidate')throw new Error('legacy deck exemption is candidate-only: '+p);
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
fs.writeFileSync(path.join(out,'_headers'),'/*\n'+(target==='candidate'?'  X-Robots-Tag: noindex, nofollow\n':'')+'  X-Content-Type-Options: nosniff\n  Cache-Control: public, max-age=0, must-revalidate\n  Referrer-Policy: strict-origin-when-cross-origin\n/api/*\n  Cache-Control: private, no-store\n/member/*\n  Cache-Control: private, no-store\n/admin/members/*\n  Cache-Control: private, no-store\n');
const redirects=['/en / 301','/en/ / 301','/en/index.html / 301'];
for(const kind of ['articles','ai-trends']) {
  for(const suffix of ['/index.html','/',''])redirects.push(`/en/${kind}/:slug${suffix} /${kind}/:slug/ 301`);
}
for(const name of ['agent','ai-trends','articles','cases','courses','invited-talks','knowledge-architecture','learn','offers','resources','skills'])redirects.push(`/en/${name}.html /${name}.html 301`);
redirects.push('/en/* / 301');
fs.writeFileSync(path.join(out,'_redirects'),redirects.join('\n')+'\n');
fs.writeFileSync(path.join(out,'_routes.json'),JSON.stringify({version:1,include:['/api/*','/member/*','/admin/members/*'],exclude:[]}));
// --outfile produces a multipart upload envelope, not executable JS. Pages advanced mode accepts an ES module directory.
execFileSync('wrangler',['pages','functions','build',path.join(root,'functions'),'--outdir='+path.join(out,'_worker.js'),'--compatibility-date=2026-09-04','--compatibility-flags=nodejs_compat','--minify'],{cwd:root,stdio:'inherit'});
const statics=manifest.filter(x=>x.classification==='static');
if(statics.length>20000||statics.some(x=>x.bytes>25*1024*1024))throw new Error('Pages asset limit exceeded');
fs.writeFileSync(path.join(buildRoot,'manifest.json'),JSON.stringify({target,commit:execFileSync('git',['-C',root,'rev-parse','HEAD']).toString().trim(),staticCount:statics.length,htmlCount:statics.filter(x=>x.path.endsWith('.html')).length,files:manifest,redirects},null,2));
fs.writeFileSync(path.join(buildRoot,'latest.json'),JSON.stringify({target,directory:out}));
console.log('BUILD_DIRECTORY='+out);
