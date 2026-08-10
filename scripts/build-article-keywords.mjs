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

function extract(text) {
  const count = new Map();
  const bump = (w) => {
    const k = w.trim();
    if (!k || k.length < 2 || k.length > 14) return;
    if (STOP.has(k) || CHROME.has(k)) return;
    if (/^[0-9\s．。，、；：！？·・-]+$/.test(k)) return;
    count.set(k, (count.get(k) || 0) + 1);
  };

  // ① 引號內的詞。排除問句與感嘆句：那是對話引用（「真的嗎？」「很煩耶」），不是專有名詞。
  for (const m of text.matchAll(/[「『]([^「」『』]{2,14})[」』]/g)) {
    if (/[？！?!，、。]/.test(m[1])) continue;
    bump(m[1]);
  }

  // ② 英文縮寫與產品名：含數字的縮寫（A2A、3X4）、全大寫縮寫（MCP、RAG）、駝峰產品名（ChatGPT、Codex）
  for (const m of text.matchAll(/\b([A-Z][A-Za-z]*\d[A-Za-z0-9]*|[A-Z]{2,8}|[A-Z][a-z]+[A-Z][A-Za-z]+)\b/g)) bump(m[1]);

  return [...count.entries()]
    .filter(([, n]) => n >= 1)
    .sort((a, b) => b[1] - a[1] || a[0].length - b[0].length)
    .slice(0, 14)
    .map(([w]) => w);
}

const out = {};
let files = 0;
for (const slug of fs.readdirSync(ARTICLES)) {
  const file = path.join(ARTICLES, slug, 'index.html');
  if (!fs.existsSync(file)) continue;
  files++;
  const kws = extract(stripTags(articleBody(fs.readFileSync(file, 'utf8'))));
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
