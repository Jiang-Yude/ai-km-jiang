// 技能包商店目錄（公開檔，進 repo）。
// 只放「網頁要顯示的」：編號、名稱、一句話、價格、傳送門連結。
// Drive 下載連結不在這裡（在 Upstash，由 api/skill-access.js 依權限發），免費包在 skills.html 免費區照舊。
// price 為 null → 頁面顯示「定價中」；portalyUrl 為 null → 「傳送門購買」按鈕不可點。
// price 由江江填（Portaly 後台改價後，這裡也要改，或叫 AI 改）；portalyUrl 已於 2026-09-08 填入 18 件停用商品。同檔給瀏覽器（window.SKILL_STORE）與 Node（require）用。
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SKILL_STORE = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  return {
    version: '2026-09-08',
    packs: [
      { id: '01', title: '資料清理', line: '把 Word、簡報、圖片變成 AI 讀得懂的乾淨純文字', price: null, portalyUrl: 'https://portaly.cc/Jiang_Yude/product/A18zZZMvn3FoaL37czwl' },
      { id: '02', title: '3X4 資料整理法', line: '三種日記乘四種時效，讓你的文件變成你的系統', price: null, portalyUrl: 'https://portaly.cc/Jiang_Yude/product/1knvoIf6u3MXNwhlneQJ' },
      { id: '03', title: 'Tag Wiki 個人知識庫', line: '用標籤和連結，把散筆記變成查得到的知識庫', price: null, portalyUrl: 'https://portaly.cc/Jiang_Yude/product/gJmVVT2JE51GEjKjInyw' },
      { id: '04', title: '逐字稿整理', line: '會議錄音變三層資產：逐字稿、摘要、行動清單', price: null, portalyUrl: 'https://portaly.cc/Jiang_Yude/product/eHR9L23lFJNRXW852Fly' },
      { id: '05', title: '使用者模擬', line: '讓 AI 扮你的客戶、學員、評審，上場前先試水溫', price: null, portalyUrl: 'https://portaly.cc/Jiang_Yude/product/r2UNKYGlMNya8N9cfSBU' },
      { id: '06', title: '讓 AI 的回答更好閱讀', line: '一次只決定一件事，AI 的長回答變好讀的決策頁', price: null, portalyUrl: 'https://portaly.cc/Jiang_Yude/product/sg0ysIqVKhVkwyAvEyhh' },
      { id: '07', title: '基本網頁製作', line: '不會程式也能做出雙擊就開的網頁，含上線教學', price: null, portalyUrl: 'https://portaly.cc/Jiang_Yude/product/dmO1hDMd1gIMjtMUt8E7' },
      { id: '08', title: '網站 4O 優化', line: '網站做好後，讓它被人找到、被 AI 引用', price: null, portalyUrl: 'https://portaly.cc/Jiang_Yude/product/atXghdizQ8xwRIeiVsYz' },
      { id: '09', title: '簡報製作', line: '瀏覽器就能放映的簡報，一頁一重點', price: null, portalyUrl: 'https://portaly.cc/Jiang_Yude/product/bu3sSqNH3tqa4IGo5rgZ' },
      { id: '10', title: '把你的方法寫成 AI 規則', line: '你的標準寫成規則檔，AI 不用每次重教', price: null, portalyUrl: 'https://portaly.cc/Jiang_Yude/product/Or0CeCCqhQOY0MzsdvEs' },
      { id: '11', title: '迴圈工程', line: '讓 AI 照你的清單自我檢查，改到通過才交', price: null, portalyUrl: 'https://portaly.cc/Jiang_Yude/product/K3DpnYYR6uXZbnWN5w48' },
      { id: '12', title: 'LINE OA 存訊助理', line: '群組訊息自動備存、可檢索、每天摘要', price: null, portalyUrl: 'https://portaly.cc/Jiang_Yude/product/v9iPbwieOHkv4yRkDkPf' },
      { id: '13', title: '知識庫整理與月度健檢', line: '用了兩三個月開始亂，先量再備份再收，之後每月半小時讓亂回不來', price: null, portalyUrl: 'https://portaly.cc/Jiang_Yude/product/qRQZ2D9W3ljlrsV8xmMw' },
      { id: '14', title: '會議記錄與策略報告', line: '逐字稿三層整理、語氣鐵則、去冒犯用詞，最後長成一份策略報告', price: null, portalyUrl: 'https://portaly.cc/Jiang_Yude/product/G1sh5JzNwQzwij5bE8kH' },
      { id: '15', title: '網站部署', line: '網站怎麼上線，四種公開程度怎麼選', price: null, portalyUrl: 'https://portaly.cc/Jiang_Yude/product/sDmFMkZBaurZQYROXwXf' },
      { id: '16', title: 'C 網部署與半私密', line: '註冊、登入、部署，以及只給特定人看的頁面怎麼設', price: null, portalyUrl: 'https://portaly.cc/Jiang_Yude/product/Y5rdVK5BZXtV6X4TNkKo' },
      { id: '17', title: '並行施工機制', line: '多個 AI 或多個人同時改同一個網站不互相蓋掉', price: null, portalyUrl: 'https://portaly.cc/Jiang_Yude/product/zKhDaRwmjZHvKEj73GN5' },
      { id: '18', title: 'AI 客服規劃', line: '官網要掛 AI 客服之前，先想清楚成本、知識來源與紅線', price: null, portalyUrl: 'https://portaly.cc/Jiang_Yude/product/7nfvdT9uHtXWylBwTDWK' }
    ]
  };
});
