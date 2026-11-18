/* 文章結尾行動區塊｜2026-11-19
   江江拍板（主庫「2026-11-18-1243 決策定稿：官網成交入口與主打方案」第 2 題）：文章結尾留言加行動入口都放，入口分兩種。
   - 服務類（服務、案例、陪跑、企業導入）：預約免費 20 分鐘評估表單＋官方 LINE。
   - 工具類（其餘）：免費線上講座或 LINE 社群＋官方 LINE，另留一行小字連到預約表單。
   載入：由 member-comments.js 帶進來（每篇文章都已載入它），不逐篇改 HTML；新文章自動適用。
   分類：看 articles-data.js 該篇的主題標籤與標題，規則在 classify()；個別要改就寫進 FORCE。
   位置：頁尾 footer 之前、留言區之前（留言區由 member-comments.js 之後插在 footer 前，所以會排在本區塊下面）。 */
(function () {
  'use strict';
  var m = location.pathname.match(/^\/(articles|ai-trends)\/([a-z0-9][a-z0-9-]*)\/$/);
  if (!m || document.getElementById('jy-article-cta')) return;
  var slug = m[2];

  var FORM = 'https://docs.google.com/forms/d/e/1FAIpQLSdh32iYxwkY9WBe-0rYtsyoDMR2nxk9QusaDI70xpNRqPMXGg/viewform';
  var OA = 'https://line.me/R/ti/p/@713kczfc';
  var COMMUNITY = 'https://line.me/R/ti/g2/V63_43ngbs_kq1mpVc9LlxXB-1kchHnwdsy3WQ';
  var LECTURES = '/courses.html';

  /* 個別指定（slug: 'service' 或 'tool'），優先於下面的規則 */
  /* 2026-11-19 三家投票（Fable、阿港 Gemini 4 Argon、CX gpt-6-astra）兩票以上通過的改類 */
  var FORCE = {
    'open-source-ai-agent-24h-compare': 'tool', 'ai-king-off-battlefield': 'tool', 'ai-employee-tests-new-tools': 'tool',
    'four-lens-rapid-review': 'tool', 'ai-customer-service-model-retest': 'tool',
    'meeting-record-agent-workflow': 'service', 'dual-centaur-meeting': 'service', 'tidy-mess-before-consulting': 'service'
  };
  var SERVICE_TOPICS = ['數位轉型', '一人公司', '價值主張'];
  var SERVICE_WORDS = /陪跑|導入|老闆|企業|團隊|公司|AI ?員工|客戶|客服/;

  function classify() {
    if (FORCE[slug]) return FORCE[slug];
    var a = null, list = window.ARTICLES || [];
    for (var i = 0; i < list.length; i++) if (list[i].id === slug) { a = list[i]; break; }
    var title = a ? a.title : ((document.querySelector('h1') || {}).textContent || document.title);
    var topics = (a && a.tags && a.tags.topic) || [];
    for (var j = 0; j < topics.length; j++) if (SERVICE_TOPICS.indexOf(topics[j]) >= 0) return 'service';
    return SERVICE_WORDS.test(title) ? 'service' : 'tool';
  }

  function link(href, cls, text) {
    var n = document.createElement('a');
    n.href = href; n.className = cls; n.textContent = text;
    if (/^https?:/.test(href)) { n.target = '_blank'; n.rel = 'noopener'; }
    n.setAttribute('data-cta', cls.split(' ').pop());
    return n;
  }
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  var css = '' +
    '#jy-article-cta{max-width:760px;margin:48px auto 8px;padding:0 16px;box-sizing:border-box}' +
    '#jy-article-cta .ac-box{background:var(--bg-soft,#faf5ec);border:1px solid var(--line,#e8dfc9);border-radius:18px;padding:24px 22px}' +
    '#jy-article-cta h2{font-size:1.4rem;line-height:1.5;margin:0 0 8px}' +
    '#jy-article-cta p{font-size:18px;line-height:1.8;margin:0 0 16px;color:var(--ink-soft,#635c53)}' +
    '#jy-article-cta .ac-row{display:flex;flex-wrap:wrap;align-items:center;gap:12px 20px}' +
    '#jy-article-cta .ac-main{display:inline-block;font-size:18px;font-weight:700;padding:13px 26px;border-radius:999px;background:var(--c-coral,#e85a4f);color:#fff;text-decoration:none}' +
    '#jy-article-cta .ac-main:hover{filter:brightness(.95)}' +
    '#jy-article-cta .ac-sub{font-size:18px;font-weight:700;color:var(--ink,#1a1612);text-decoration:underline;text-underline-offset:4px}' +
    '#jy-article-cta .ac-small{font-size:18px;margin:14px 0 0}' +
    '#jy-article-cta .ac-small a{color:var(--ink,#1a1612);font-weight:700}';

  function render() {
    if (document.getElementById('jy-article-cta')) return;
    var kind = classify();
    var sec = el('section'); sec.id = 'jy-article-cta'; sec.setAttribute('data-kind', kind);
    sec.setAttribute('aria-label', '下一步');
    var box = el('div', 'ac-box'), row = el('div', 'ac-row');
    if (kind === 'service') {
      box.appendChild(el('h2', '', '想把這套用在你的工作上？'));
      box.appendChild(el('p', '', '先填表。我看過後，合適的話約免費 20 分鐘評估，只談適不適合、該選哪個方案。'));
      row.appendChild(link(FORM, 'ac-main form', '預約免費 20 分鐘評估'));
      row.appendChild(link(OA, 'ac-sub oa', '加官方 LINE 詢問'));
      box.appendChild(row);
    } else {
      /* 文章內原本的 cta-band 已經放了 LINE 社群，就改給免費講座，不重複 */
      var hasCommunity = !!document.querySelector('a[href*="ti/g2/V63_43ngbs"]');
      box.appendChild(el('h2', '', '想跟著一起學？'));
      box.appendChild(el('p', '', '我每個月有兩場免費線上講座，資訊都在 LINE 社群裡。'));
      row.appendChild(hasCommunity ? link(LECTURES, 'ac-main lectures', '看免費線上講座') : link(COMMUNITY, 'ac-main community', '加入 LINE 社群'));
      row.appendChild(link(OA, 'ac-sub oa', '加官方 LINE 詢問'));
      box.appendChild(row);
      var small = el('p', 'ac-small', '想請我到公司上課或陪跑，');
      small.appendChild(link(FORM, 'form', '填表預約免費 20 分鐘評估'));
      small.appendChild(document.createTextNode('。'));
      box.appendChild(small);
    }
    sec.appendChild(box);
    var st = el('style'); st.textContent = css; document.head.appendChild(st);
    var anchor = document.getElementById('jy-comments') || document.querySelector('footer.footer') || document.querySelector('footer');
    if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(sec, anchor);
    else document.body.appendChild(sec);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', render);
  else render();
})();
