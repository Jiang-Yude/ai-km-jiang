// 打包時預先畫好「靠 JS 才長出來」的列表，讓不跑 JS 的讀者也看得到內容。
// 立因（2026-11-27）：福研的阿福（ChatGPT）讀 jiangyude.com/articles 只拿到空殼「符合 0 篇」。
// 手機網頁版、免費版 ChatGPT／Gemini 抓網頁多半不跑 JS，所以列表必須直接寫在 HTML 裡。
// 做法：在 Node 用假 DOM 跑該頁自己的 <script src> 與 DOMContentLoaded，取出容器的 innerHTML，
// 寫回輸出的 HTML。瀏覽器照樣會重畫同一段，畫面不會跳。原始檔不動，只改打包產物。
// 要加新頁：在 cloudflare/prerender.json 加「頁面: [容器 id…]」。
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// 只在瀏覽器有意義的腳本（統計、咪卡浮鈕），打包時不跑。其餘腳本出錯一律擋下，不吞錯。
const SKIP_SCRIPTS = ['/views.js', 'views.js', '/mika-chat-widget.js', 'mika-chat-widget.js'];

function fakeElement(id) {
  return {
    id, innerHTML: '', textContent: '', value: '', style: {}, dataset: {}, children: [],
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    addEventListener() {}, removeEventListener() {}, setAttribute() {}, getAttribute() { return null; },
    appendChild() {}, insertAdjacentHTML() {}, querySelector() { return null; }, querySelectorAll() { return []; },
    closest() { return null; }, focus() {}, scrollIntoView() {},
  };
}

export function renderContainers(root, page, html, ids, skip = []) {
  const existing = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]));
  const store = {};
  const get = id => (existing.has(id) ? (store[id] ??= fakeElement(id)) : null);
  const ready = [];
  const body = fakeElement('body');
  const document = {
    getElementById: get,
    querySelector: s => (/^#[\w-]+$/.test(s) ? get(s.slice(1)) : null),
    querySelectorAll: () => [],
    addEventListener: (type, fn) => { if (type === 'DOMContentLoaded') ready.push(fn); },
    createElement: () => fakeElement(''), body, head: fakeElement('head'), documentElement: fakeElement('html'),
    readyState: 'loading', cookie: '',
  };
  const storage = { getItem() { return null; }, setItem() {}, removeItem() {} };
  const win = {
    document, console: { log() {}, warn() {}, error() {}, info() {} },
    location: { search: '', hash: '', pathname: '/' + page, href: 'https://jiangyude.com/' + page, origin: 'https://jiangyude.com' },
    addEventListener() {}, removeEventListener() {}, localStorage: storage, sessionStorage: storage,
    matchMedia: () => ({ matches: false, addEventListener() {}, addListener() {} }),
    history: { replaceState() {}, pushState() {} }, navigator: { userAgent: 'prerender' },
    setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0, requestAnimationFrame: () => 0,
    IntersectionObserver: class { observe() {} disconnect() {} },
    fetch: () => new Promise(() => {}), // 永不回應：不連網，也不會因未處理的 rejection 讓打包崩潰
  };
  win.window = win; win.self = win;
  const ctx = vm.createContext(win);
  const errors = [];
  const srcs = [...html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["']/gi)].map(m => m[1].split('?')[0])
    .filter(s => !/^(https?:)?\/\//.test(s) && !s.startsWith('/_') && !SKIP_SCRIPTS.includes(s) && !skip.includes(s));
  for (const s of srcs) {
    // 絕對路徑從站根算，相對路徑從該頁所在資料夾算；不准跑出 repo。
    const f = path.resolve(s.startsWith('/') ? root : path.join(root, path.dirname(page)), s.replace(/^\//, ''));
    if (!f.startsWith(root + path.sep)) throw new Error('prerender：腳本路徑跑出 repo：' + s);
    if (!fs.existsSync(f)) throw new Error('prerender：' + page + ' 引用的腳本不存在：' + s);
    try { vm.runInContext(fs.readFileSync(f, 'utf8'), ctx, { timeout: 2000, filename: s }); }
    catch (e) { errors.push(s + ': ' + e.message); }
  }
  for (const fn of ready) { try { fn(); } catch (e) { errors.push('DOMContentLoaded: ' + e.message); } }
  const out = {};
  for (const id of ids) out[id] = store[id]?.innerHTML || '';
  return { out, errors };
}

// 換掉 id 那個元素的內容（同名標籤數深度找結尾）。找不到就丟錯，不靜默略過。
export function replaceInner(html, id, inner) {
  const open = new RegExp('<([a-zA-Z][\\w-]*)\\b[^>]*\\bid="' + esc(id) + '"[^>]*>');
  const m = open.exec(html);
  if (!m) throw new Error('prerender：找不到容器 #' + id);
  const tag = m[1].toLowerCase();
  const start = m.index + m[0].length;
  const re = new RegExp('<(/?)' + tag + '\\b[^>]*>', 'gi');
  re.lastIndex = start;
  let depth = 1, t;
  while ((t = re.exec(html))) {
    if (t[0].endsWith('/>')) continue;
    depth += t[1] ? -1 : 1;
    if (depth === 0) return html.slice(0, start) + inner + html.slice(t.index);
  }
  throw new Error('prerender：#' + id + ' 沒有結尾標籤');
}

export function prerenderPage(root, page, html, config) {
  const ids = config.containers;
  const { out, errors } = renderContainers(root, page, html, ids, config.skipScripts || []);
  if (errors.length) throw new Error(`prerender：${page} 的腳本在打包時出錯：${errors.join('；')}`);
  for (const id of ids) {
    const min = config.minChars ?? 200;
    if (out[id].length < min) {
      throw new Error(`prerender：${page} #${id} 只畫出 ${out[id].length} 字元（下限 ${min}）`);
    }
    html = replaceInner(html, id, out[id]);
  }
  if (config.count) {
    const n = (out[config.count.from].match(new RegExp(esc(config.count.pattern), 'g')) || []).length;
    if (n === 0) throw new Error(`prerender：${page} 數不到任何一張卡（pattern ${config.count.pattern}），卡片 class 可能改名了`);
    html = replaceInner(html, config.count.id, config.count.template.replace('{n}', String(n)));
  }
  // 「找不到結果」這類只在篩選後才該出現的區塊，加 hidden，免得 AI 讀到「目前沒有符合的文章」。
  // 頁面 CSS 的 .show{display:block} 會蓋過 hidden，所以 JS 照樣切得出來。
  for (const id of config.hide || []) {
    const re = new RegExp('(<[a-zA-Z][\\w-]*\\b[^>]*\\bid="' + esc(id) + '")([^>]*>)');
    const m = re.exec(html);
    if (!m) throw new Error('prerender：找不到要藏的 #' + id);
    if (!/\shidden(\s|=|>|$)/.test(m[0].replace(/"[^"]*"/g, '""'))) html = html.replace(re, '$1 hidden$2');
  }
  return html;
}

export function loadConfig(root) {
  return JSON.parse(fs.readFileSync(path.join(root, 'cloudflare', 'prerender.json'), 'utf8'));
}

// 防回頭：根目錄公開頁不跑 JS 時看得到的字太少，就擋下打包（新做的列表頁忘了登記會在這裡被抓到）。
export function checkThinPages(root, out, thin) {
  const bad = [];
  for (const f of fs.readdirSync(out)) {
    if (!f.endsWith('.html') || (thin.allow || []).includes(f)) continue;
    // 用原始檔判斷是不是公開頁（候選站打包會替每頁加 noindex，不能看產物）。
    const src = path.join(root, f);
    if (fs.existsSync(src) && /<meta\s+name=["']robots["'][^>]*noindex/i.test(fs.readFileSync(src, 'utf8'))) continue;
    const html = fs.readFileSync(path.join(out, f), 'utf8');
    const body = html.replace(/<head[\s\S]*?<\/head>|<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<nav[\s\S]*?<\/nav>|<header[\s\S]*?<\/header>|<footer[\s\S]*?<\/footer>/gi, '');
    const text = body.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    if (text.length < thin.minChars) bad.push(`${f}（${text.length} 字）`);
  }
  if (bad.length) throw new Error('prerender：這些公開頁不跑 JS 幾乎是空的，AI 讀不到：' + bad.join('、') + '。把容器加進 cloudflare/prerender.json 的 pages，或確定本來就短再放進 thinCheck.allow。');
}
