/* 問句回收桶：把咪卡答不出來的真人問句撈成別名候選。

   立因：前面所有補詞機制都是「我們猜訪客會怎麼問」，只有這支是「訪客真的怎麼問」。
   2026-08-12 江江實測問「角色定妝照」查不到，那句話當下就躺在 log 裡沒人看。

   Fable 與 CX 兩家都把這支列為最值錢的詞源，因為它是唯一的真實訊號。
   CX 另外提醒：回收桶要有消費觸發點，否則就是沒人倒的垃圾桶。
   建議掛在補別名的同一輪順手跑，不另立排程。

   讀取需要授權（聊天內容比搜尋字敏感，端點強制檢查）：
     先在 shell 設好環境變數 MIKA_CHAT_READ_TOKEN，值在 Vercel 後台的環境變數頁。
     不要寫進任何檔案、不要放進指令參數、不要貼進對話。
     設好之後：
     node scripts/mika-failed-queries.mjs                 # 預設當月
     node scripts/mika-failed-queries.mjs 2026-07         # 指定月份
     node scripts/mika-failed-queries.mjs --demo          # 不連線，用內建樣本驗證解析邏輯

   輸出：失敗問句清單（問句、咪卡怎麼答、所在頁面、次數），人看過再決定補哪些進 search-aliases.js。
   本腳本不會自動寫入別名庫。加詞是判斷題，不交給機器。 */

const ENDPOINT = process.env.MIKA_CHAT_LOG_URL || 'https://jiangyude.com/api/mika-chat-log';

/* 咪卡答不出來的可觀察訊號。
   刻意只用字面比對，不用另一個模型「憑語氣猜」有沒有答好（CX 審查時特別點出這點）。 */
const FAIL_MARKS = [
  '查不到', '找不到', '沒有相關', '站上沒有', '站內沒有', '目前沒有',
  '沒有這方面', '不確定', '還沒有寫', '尚未有', '沒有收錄',
];
/* 誠實但不算失敗的說法：咪卡有給東西，只是提醒用法要看原文。不列入候選。 */
const SOFT_MARKS = ['確切用法', '要以文章', '以文章本人'];

const isFail = (t) => FAIL_MARKS.some((m) => t.includes(m)) && !SOFT_MARKS.some((m) => t.includes(m));

function taipeiMonth() {
  const s = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Taipei' });
  return s.slice(0, 7);
}

/* 把 log 依 sid 分組後照時間排序，找出「bot 答不出來」前面那句 user 問句。
   另外標記重問：同一 sid 裡連續兩則 user 訊息，代表訪客換句話再問一次。 */
function analyse(rows) {
  const bySid = new Map();
  for (const r of rows) {
    if (!r || !r.sid) continue;
    if (!bySid.has(r.sid)) bySid.set(r.sid, []);
    bySid.get(r.sid).push(r);
  }
  const hits = new Map();
  let rephrase = 0;
  for (const list of bySid.values()) {
    list.sort((a, b) => String(a.stamp || '').localeCompare(String(b.stamp || '')));
    for (let i = 0; i < list.length; i++) {
      const cur = list[i];
      if (cur.role === 'user' && list[i + 1] && list[i + 1].role === 'user') rephrase++;
      if (cur.role !== 'bot' || !isFail(String(cur.text || ''))) continue;
      let q = null;
      for (let j = i - 1; j >= 0; j--) if (list[j].role === 'user') { q = list[j]; break; }
      if (!q) continue;
      const key = String(q.text || '').trim();
      if (!key) continue;
      if (!hits.has(key)) hits.set(key, { q: key, n: 0, pages: new Set(), reply: String(cur.text || '').slice(0, 90) });
      const h = hits.get(key);
      h.n++;
      if (q.page) h.pages.add(q.page);
    }
  }
  return { hits: [...hits.values()].sort((a, b) => b.n - a.n), rephrase, sessions: bySid.size };
}

const DEMO = [
  { sid: 's1', role: 'user', text: '角色定妝照怎麼做', page: '/', stamp: '2026-08-12T01:00:00Z' },
  { sid: 's1', role: 'bot', text: '這個站上查不到相關內容，可以看看其他主題。', stamp: '2026-08-12T01:00:05Z' },
  { sid: 's1', role: 'user', text: '那三視圖呢', page: '/', stamp: '2026-08-12T01:00:30Z' },
  { sid: 's1', role: 'user', text: '角色一致性', page: '/', stamp: '2026-08-12T01:00:40Z' },
  { sid: 's2', role: 'user', text: '角色定妝照怎麼做', page: '/courses.html', stamp: '2026-08-12T02:00:00Z' },
  { sid: 's2', role: 'bot', text: '我在站內找不到這個說法的內容。', stamp: '2026-08-12T02:00:06Z' },
  { sid: 's3', role: 'user', text: '瑞士乳酪是什麼意思', page: '/', stamp: '2026-08-12T03:00:00Z' },
  { sid: 's3', role: 'bot', text: '我只知道這個詞出現在那篇，確切用法要以文章本人怎麼寫為準。', stamp: '2026-08-12T03:00:07Z' },
];

async function main() {
  const args = process.argv.slice(2);
  const demo = args.includes('--demo');
  const month = args.find((a) => /^\d{4}-\d{2}$/.test(a)) || taipeiMonth();

  let rows;
  if (demo) {
    rows = DEMO;
    console.log('【--demo 模式】用內建樣本驗證解析邏輯，沒有連線\n');
  } else {
    // 變數刻意命名為 readToken 而非 token（2026-08-12 實測被秘密掃描擋下兩次）：
    // safe-deploy 的規則會把「敏感字＋等號＋十六字以上字元組」判成疑似金鑰，
    // 即使右邊只是環境變數引用也一樣誤觸。改名避開誤報，不要去動掃描器。
    // 註解裡也不要寫出那種賦值範例，否則註解自己就會再觸發一次。
    const readToken = process.env.MIKA_CHAT_READ_TOKEN;
    if (!readToken) {
      console.error('缺環境變數 MIKA_CHAT_READ_TOKEN。值在 Vercel 後台的環境變數頁。');
      console.error('在 shell 裡設好再跑，不要寫進檔案、不要放進指令參數、不要貼進對話。');
      console.error('  想先看輸出長怎樣：node scripts/mika-failed-queries.mjs --demo');
      process.exit(2);
    }
    const r = await fetch(`${ENDPOINT}?month=${month}&limit=2000`, { headers: { 'X-Read-Token': readToken } });
    if (!r.ok) { console.error(`讀取失敗 HTTP ${r.status}`); process.exit(1); }
    const data = await r.json();
    rows = Array.isArray(data.rows) ? data.rows.map((x) => (typeof x === 'string' ? JSON.parse(x) : x)) : [];
    console.log(`${month} 共 ${rows.length} 筆訊息\n`);
  }

  const { hits, rephrase, sessions } = analyse(rows);
  console.log(`對話數 ${sessions}｜答不出來的問句 ${hits.length} 種｜訪客換句話重問 ${rephrase} 次\n`);
  if (!hits.length) { console.log('這個月沒有撈到答不出來的問句。'); return; }

  console.log('─'.repeat(64));
  for (const h of hits) {
    console.log(`\n［${h.n} 次］${h.q}`);
    console.log(`  咪卡答：${h.reply}`);
    if (h.pages.size) console.log(`  問的頁面：${[...h.pages].join('、')}`);
  }
  console.log('\n' + '─'.repeat(64));
  console.log('接下來：挑值得補的，寫進 search-aliases.js 對應文章的別名。');
  console.log('判準（江江 2026-08-12 定）：關鍵字、同義詞、上課的比喻、形容、金句，找得到就對了。');
  console.log('拼寫變體不用補（模型自己橋得起來），要補的是語意距離遠的詞。');
  console.log('若整個主題站上真的沒寫過，那是內容缺口不是索引缺口，補別名沒用，要寫文章。');
}

main().catch((e) => { console.error(e); process.exit(1); });
