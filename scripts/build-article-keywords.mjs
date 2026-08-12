/* 從文章內文抽「文中提到的專有名詞」，產生 article-keywords.js 供咪卡檢索用。
   立因（2026-08-11 江江實測）：同學上課聽到「半人馬」，回官網問咪卡，咪卡說站上沒有。
   實際上「雙人馬會議」那篇內文就寫著「半人馬模式」，但索引三層（標題、摘要、別名庫）
   都沒有這個詞，所以永遠撈不到。A2A 一樣：內文 18 篇提過，索引只有一篇的別名收了它。
   這不是檢索技術不夠強，是詞根本沒進索引，換向量索引也一樣撈不到。

   抽兩類：
   ① 引號「」『』裡的詞：江江寫作時專有名詞習慣加引號（半人馬模式、標籤連結法都是）
   ② 英文縮寫與產品名：A2A、MCP、RAG、CLI、OGSM、Codex 這種

   用法：node scripts/build-article-keywords.mjs
   產出：article-keywords.js（window.ARTICLE_KEYWORDS = { slug: [詞...] }）*/

import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(import.meta.dirname, '..');
const ARTICLES = path.join(ROOT, 'articles');

/* 被 .vercelignore 擋著的文章不進索引（2026-08-12 立，事故驅動）。
   立因：擋板只擋「頁面上不上線」，擋不住這支腳本 —— 它掃 articles/ 底下所有資料夾，
   於是一篇不該上線的草稿，頁面線上 404，內文關鍵詞卻進了公開的 article-keywords.js。
   判準用 .vercelignore 而非 articles-data.js，因為擋板是「不上線」的直接聲明。
   事故細節與該篇代號記在官網看板，不寫在這裡：本檔在 scripts/ 目前不部署，
   但生成檔建置化會放行 scripts/，屆時這裡的註解就會公開。 */
function loadBlocked() {
  const f = path.join(ROOT, '.vercelignore');
  if (!fs.existsSync(f)) return new Set();
  return new Set(
    fs.readFileSync(f, 'utf8')
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.startsWith('articles/'))
      .map((l) => l.replace(/^articles\//, '').replace(/\/$/, ''))
      .filter(Boolean)
  );
}
const BLOCKED = loadBlocked();

/* 太通用、抽出來只會變雜訊的詞，不收 */
const STOP = new Set([
  'AI', 'A', 'I', 'The', 'And', 'You', 'It', 'To', 'In', 'Of', 'For', 'Is', 'This', 'That',
  'HTML', 'CSS', 'JS', 'PDF', 'URL', 'OK', 'PS', 'ID', 'IT', 'PC', 'TV', 'DM',
  '文章', '工作', '知識', '資料', '問題', '方法', '東西', '事情', '時候', '地方', '什麼',
  '這個', '那個', '自己', '他們', '我們', '你們', '可以', '因為', '所以', '但是', '如果',
  '一個', '沒有', '就是', '不是', '還是', '已經', '真的', '其實', '直接', '開始',
]);

/* 每篇都有的字（導覽列、頁尾、社群連結）＝零鑑別度，收了反而讓訪客問什麼都全站命中。
   由下方 dropUbiquitous() 依實際出現篇數自動再砍一次，這裡只擋已知的固定殼。 */
const CHROME = new Set(['EN', 'LINE', 'Threads', 'Facebook', 'Instagram', 'YouTube', 'LinkedIn', 'Vocus', 'GitHub']);

/* ── 2026-08-12 降噪（Fable 與 CX 雙審，江江原則：關鍵字、同義詞、比喻、金句要找得到，用最精簡的方式）──
   起因：定裝照那篇的「也可能被說成」欄混進 HEX、STEP、C000C6、FFAAD5、全身、比較認真。
   這些佔 prompt 字數又不會被搜，還會干擾模型掃目錄。
   注意：頻率判準（篇內兩次以上才收）實測會誤殺半人馬、三視圖與金句，因為有價值的詞常常一篇只出現一次。
   所以這裡一律用詞形與去重，不用頻率。 */

/* 章節殼與流程標記，被 [A-Z]{2,8} 規則誤抓成縮寫 */
const STRUCTURAL = new Set([
  'STEP', 'STAGE', 'LEVEL', 'DAY', 'TIME', 'FIRST', 'INSIDE', 'HUMAN', 'LAYER', 'SIGNAL',
  'ACT', 'CODE', 'DOCUMENT', 'TRACE', 'ERROR', 'SLUG', 'HEX', 'COLOR', 'TITLE', 'NOTE',
  'MM', 'DD', 'YYYY', 'HHMM', 'KNOWN', 'KNOWNS', 'UNKNOWN', 'UNKNOWNS',
]);

/* 色碼：C000C6、FFAAD5、#1A2B3C。要求含數字，才不會誤殺全字母的縮寫 */
const isHexish = (w) => /^#?[0-9A-Fa-f]{4,8}$/.test(w) && /\d/.test(w);

/* 一到兩個大寫字母：AA、BT、CD、CI、CP、DB。鑑別度太低 */
const isShortCaps = (w) => /^[A-Z]{1,2}$/.test(w);

/* 對話片段：「我要藍色」「比較認真」「照這套做」。
   ⚠️ 八字長度上限是硬條件，不能拿掉。2026-08-12 實測：不設上限會把金句
   「你的文件就是你的系統」（11 字、開頭是「你」）整句砍掉，那正是江江要保留的比喻與金句層。
   短的是對話碎片，長的是金句，長度就是這兩者最可靠的分界。 */
const looksLikeUtterance = (w) =>
  w.length <= 8
  && (/^(?:我|你|他|她|大家|這|那|請|幫|讓|把|叫|照|要|可以|怎麼|為什麼|哪些|哪裡|如果|先|再|比較)/.test(w)
    || /(?:嗎|呢|吧|耶|喔|啦)$/.test(w));

/* 載入「同一行 prompt 已經印過的欄位」：標題、problem 前 45 字、人工別名。
   立因：buildFullIndexBlock() 每行已經印了這些，keywords 再收一次是純浪費。
   半人馬與三視圖會因此從自動抽詞消失，那不是誤殺，它們已在標題或別名層可見，目錄行最終內容不變。 */
function loadVisible() {
  const vis = {};
  const add = (id, s) => { vis[id] = (vis[id] || '') + '｜' + s; };
  const art = fs.readFileSync(path.join(ROOT, 'articles-data.js'), 'utf8');
  for (const m of art.matchAll(/id:\s*"([^"]+)"([\s\S]*?)\n  \}/g)) {
    const body = m[2];
    const g = (f) => {
      const x = body.match(new RegExp('\\b' + f + ':\\s*"((?:[^"\\\\]|\\\\.)*)"'));
      return x ? x[1] : '';
    };
    add(m[1], g('title') + '｜' + g('problem').slice(0, 45));
  }
  const alFile = path.join(ROOT, 'search-aliases.js');
  if (fs.existsSync(alFile)) {
    const al = fs.readFileSync(alFile, 'utf8');
    for (const m of al.matchAll(/"([a-z0-9-]+)":\s*\[([\s\S]*?)\]/g)) add(m[1], m[2]);
  }
  return vis;
}

/* 只取文章主體：<article> 優先，退而求其次抓 <main>，都沒有才用整頁。
   立因：導覽列與頁尾的字每篇都一樣，混進來會讓關鍵詞全站雷同。 */
function articleBody(html) {
  const m = html.match(/<article[\s\S]*?<\/article>/i) || html.match(/<main[\s\S]*?<\/main>/i);
  return m ? m[0] : html;
}

function stripTags(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<nav[\s\S]*?<\/nav>/gi, ' ')
    .replace(/<footer[\s\S]*?<\/footer>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z]+;/gi, ' ');
}

function extract(text, visible = '') {
  const count = new Map();
  const bump = (w) => {
    const k = w.trim();
    if (!k || k.length < 2 || k.length > 14) return;
    if (STOP.has(k) || CHROME.has(k)) return;
    if (/^[0-9\s．。，、；：！？·・-]+$/.test(k)) return;
    if (isHexish(k) || isShortCaps(k) || STRUCTURAL.has(k)) return;   // 2026-08-12 降噪
    if (visible.includes(k)) return;                                   // 同行已印過，不重複佔字
    if (looksLikeUtterance(k)) return;                                 // 對話片段
    count.set(k, (count.get(k) || 0) + 1);
  };

  // ① 引號內的詞。排除問句與感嘆句：那是對話引用（「真的嗎？」「很煩耶」），不是專有名詞。
  for (const m of text.matchAll(/[「『]([^「」『』]{2,14})[」』]/g)) {
    if (/[？！?!，、。]/.test(m[1])) continue;
    bump(m[1]);
  }

  // ② 英文縮寫與產品名：含數字的縮寫（A2A、3X4）、全大寫縮寫（MCP、RAG）、駝峰產品名（ChatGPT、Codex）
  for (const m of text.matchAll(/\b([A-Z][A-Za-z]*\d[A-Za-z0-9]*|[A-Z]{2,8}|[A-Z][a-z]+[A-Z][A-Za-z]+)\b/g)) bump(m[1]);

  /* 同篇子字串去重：「半人馬」與「半人馬模式」留短的即可，字面命中夠用，語意層看得懂。
     排序改成長詞優先再看次數：原本同次數時短詞優先，剛好讓通用短詞擠掉專有名詞。 */
  const ranked = [...count.entries()]
    .sort((a, b) => b[1] - a[1] || b[0].length - a[0].length)
    .map(([w]) => w);
  const kept = [];
  for (const w of ranked) {
    if (kept.some((k) => k.includes(w))) continue;
    kept.push(w);
  }
  return kept.slice(0, 12);
}

const VISIBLE = loadVisible();
const out = {};
let files = 0;
for (const slug of fs.readdirSync(ARTICLES)) {
  if (BLOCKED.has(slug)) continue;   // .vercelignore 擋著的草稿不進公開索引
  const file = path.join(ARTICLES, slug, 'index.html');
  if (!fs.existsSync(file)) continue;
  files++;
  const kws = extract(stripTags(articleBody(fs.readFileSync(file, 'utf8'))), VISIBLE[slug] || '');
  if (kws.length) out[slug] = kws;
}

/* 出現在超過三成文章裡的詞＝沒有鑑別度（訪客一問就全站命中），砍掉。
   這是機械保底：CHROME 名單只擋得住已知的殼，這一關擋的是漏網的。 */
function dropUbiquitous() {
  const seen = new Map();
  for (const ws of Object.values(out)) for (const w of new Set(ws)) seen.set(w, (seen.get(w) || 0) + 1);
  const cap = Math.max(6, Math.round(Object.keys(out).length * 0.3));
  const banned = new Set([...seen.entries()].filter(([, n]) => n > cap).map(([w]) => w));
  for (const slug of Object.keys(out)) {
    out[slug] = out[slug].filter((w) => !banned.has(w));
    if (!out[slug].length) delete out[slug];
  }
  return banned;
}
const banned = dropUbiquitous();

const banner = `/* 文章內文的專有名詞，由 scripts/build-article-keywords.mjs 自動產生，不要手改。
   用途：咪卡檢索用。同學記得的詞常常只出現在內文（例如「半人馬」出現在雙人馬會議那篇的內文，
   標題、摘要、別名庫都沒有），沒有這一層就永遠撈不到。
   重跑：node scripts/build-article-keywords.mjs */\n`;
fs.writeFileSync(
  path.join(ROOT, 'article-keywords.js'),
  banner + 'window.ARTICLE_KEYWORDS = ' + JSON.stringify(out, null, 0) + ';\n'
);

console.log(`掃了 ${files} 篇，產出 ${Object.keys(out).length} 篇的關鍵詞`);
console.log('因為太常見被砍掉的詞:', banned.size ? [...banned].join('、') : '（無）');
console.log('檔案大小:', fs.statSync(path.join(ROOT, 'article-keywords.js')).size, 'bytes');
