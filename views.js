// 網頁瀏覽計數（前端）。每頁載入這支即可。
// 顯示：在頁面放 <span data-views="page"></span> / data-views="section" / data-views="global"，數字會自動填進去。
// 防重刷：同一瀏覽器、同一頁、同一小時只送一次 +1（其餘只讀數字顯示）。不碰 IP、不管隱私。
(function () {
  function path() {
    var p = location.pathname.split('?')[0].split('#')[0];
    if (p.length > 1 && p.slice(-11) === '/index.html') p = p.slice(0, -10);
    if (p.length > 1 && p.slice(-1) !== '/' && p.indexOf('.') === -1) p = p + '/';
    return p;
  }
  function hourStamp() {
    // 台灣時區的 YYYY-MM-DD-HH，作為「一小時一次」的鍵
    var s = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', hour12: false,
    }).format(new Date());
    return s.replace(/[^0-9]/g, '').slice(0, 10); // YYYYMMDDHH
  }
  function fill(name, val) {
    if (val == null) return;
    var els = document.querySelectorAll('[data-views="' + name + '"]');
    for (var i = 0; i < els.length; i++) els[i].textContent = Number(val).toLocaleString();
  }
  try {
    var p = path();
    var key = 'viewed:' + p + ':' + hourStamp();
    var firstThisHour = true;
    try { firstThisHour = !localStorage.getItem(key); } catch (e) {}
    fetch('/api/view', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: p, increment: firstThisHour }),
    })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (firstThisHour) { try { localStorage.setItem(key, '1'); } catch (e) {} }
        fill('page', d.page);
        fill('section', d.section);
        fill('global', d.global);
      })
      .catch(function () {});
    // 分區小計：列表頁放 <span data-views-section="articles"></span>，另外抓 /api/stats 填
    if (document.querySelector('[data-views-section]')) {
      fetch('/api/stats').then(function (r) { return r.json(); }).then(function (s) {
        var secs = s.sections || {};
        var els = document.querySelectorAll('[data-views-section]');
        for (var i = 0; i < els.length; i++) {
          var name = els[i].getAttribute('data-views-section');
          if (secs[name] != null) els[i].textContent = Number(secs[name]).toLocaleString();
        }
      }).catch(function () {});
    }
  } catch (e) {}
})();
