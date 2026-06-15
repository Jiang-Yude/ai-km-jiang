/* ─── 課程渲染共用模組 ─── */
(function () {
  const COURSES = window.COURSES || [];
  const TODAY = new Date(new Date().toISOString().slice(0, 10)); // 00:00 today

  // ─── 工具 ───
  function parseDate(s) { return new Date(s); }
  function isIncubating(c) { return c.phase === "incubating"; }
  function isUpcoming(c) { return !isIncubating(c) && parseDate(c.date) >= TODAY; }
  function isPast(c) { return !isIncubating(c) && parseDate(c.date) < TODAY; }
  function monthKey(c) { return c.date.slice(0, 7); }   // "2026-05"
  function fmtDate(c) {
    const d = parseDate(c.date);
    // 沒給時間 = 時間未定 → 顯示模糊「M 月 · 時間待定」
    if (!c.time) {
      return `${d.getMonth()+1} 月 · 時間待定`;
    }
    const wk = ['日','一','二','三','四','五','六'][d.getDay()];
    const mm = String(d.getMonth()+1).padStart(2,'0');
    const dd = String(d.getDate()).padStart(2,'0');
    return `${mm}-${dd} (${wk}) ${c.time}`;
  }
  function escapeHtml(s) {
    return String(s||'').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  }

  // ─── CTA（報名按鈕 / 主辦 / 待定） ───
  function ctaHTML(c) {
    const r = c.registration || {};
    const D = window.CTA_DEFAULTS || {};
    switch (r.status) {
      case "open": {
        if (r.url) {
          const label = r.label || D.open_label || '報名 ↗';
          const note = r.note ? `<p class="cta-note">${escapeHtml(r.note)}</p>` : '';
          const tipAttr = r.tooltip ? ` data-tip="${escapeHtml(r.tooltip)}"` : '';
          const tipClass = r.tooltip ? ' cta-has-tip' : '';
          return `<div class="course-cta open">
            <a class="cta-btn${tipClass}" href="${escapeHtml(r.url)}" target="_blank" rel="noopener"${tipAttr}>${escapeHtml(label)}</a>
            ${note}
          </div>`;
        }
        const note = r.note ? escapeHtml(r.note) : (D.open_url_pending || '即將開放報名');
        return `<div class="course-cta pending"><p class="cta-note">${note}</p></div>`;
      }
      case "private": {
        const org = r.host_org || c.host;
        const note = r.note ? `<p class="cta-note">${escapeHtml(r.note)}</p>` : '';
        return `<div class="course-cta private">
          <p class="cta-private-tag">主辦：<strong>${escapeHtml(org)}</strong></p>
          <p class="cta-private-sub">封閉場次，由主辦邀約</p>
          ${note}
        </div>`;
      }
      case "pending": {
        const note = r.note ? escapeHtml(r.note) : (D.pending_text || '時間／報名方式待公告');
        return `<div class="course-cta pending"><p class="cta-note">${note}</p></div>`;
      }
      case "ended": {
        const note = r.note ? escapeHtml(r.note) : '已結束';
        const host = r.host_org ? `<p class="cta-private-tag">主辦：<strong>${escapeHtml(r.host_org)}</strong></p>` : '';
        return `<div class="course-cta ended">${host}<p class="cta-note">${note}</p></div>`;
      }
      default:
        return '';
    }
  }

  // ─── 模式 badges：場域（線上/實體/混合/podcast）+ 報名（開放/專場/待定） ───
  const VENUE_LABEL = {
    online: '線上',
    physical: '實體',
    hybrid: '線上＋實體',
    podcast: 'Podcast',
    tbd: '待定'
  };
  const REG_LABEL = {
    open: '開放報名',
    private: '專場',
    pending: '待開放',
    ended: '已結束'
  };
  function modeBadgesHTML(c) {
    const v = c.venue_mode || (c.type === 'podcast' ? 'podcast' : null);
    const r = (c.registration && c.registration.status) || null;
    const parts = [];
    if (isIncubating(c)) parts.push(`<span class="mode-badge phase-incubating">籌備中 · 徵求夥伴</span>`);
    if (v) parts.push(`<span class="mode-badge venue-${v}">${escapeHtml(VENUE_LABEL[v] || v)}</span>`);
    if (r && !isIncubating(c)) parts.push(`<span class="mode-badge reg-${r}">${escapeHtml(REG_LABEL[r] || r)}</span>`);
    return parts.length ? `<div class="card-modes">${parts.join('')}</div>` : '';
  }

  // ─── 沒圖時的佔位（明信片風：漸層底 + 月份 + 大日期 + 標題 + 主辦） ───
  function placeholderHTML(c) {
    const d = parseDate(c.date);
    const monthEn = ['JANUARY','FEBRUARY','MARCH','APRIL','MAY','JUNE','JULY','AUGUST','SEPTEMBER','OCTOBER','NOVEMBER','DECEMBER'][d.getMonth()];
    const monthShort = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][d.getMonth()];
    const r = c.registration || {};
    const orgLabel = (r.status === 'private' && r.host_org) ? `主辦：${r.host_org}` : c.type_label;
    return `<div class="card-thumbnail-placeholder">
      <div class="ph-decor ph-decor-a"></div>
      <div class="ph-decor ph-decor-b"></div>
      <div class="ph-top">
        <span class="ph-month-mark">${monthEn}</span>
      </div>
      <div class="ph-mid">
        <div class="ph-day">${d.getDate()}</div>
        <div class="ph-month-cn">${monthShort}</div>
      </div>
      <div class="ph-bottom">
        <div class="ph-title">${escapeHtml(c.title)}</div>
        <div class="ph-org">${escapeHtml(orgLabel)}</div>
      </div>
    </div>`;
  }

  // ─── 延伸資源（簡報、技能包等）───
  function materialsHTML(c) {
    if (!c.materials || !c.materials.length) return '';
    const links = c.materials.map(m =>
      `<a class="course-material" href="${escapeHtml(m.url)}" target="_blank" rel="noopener" style="display:inline-block;margin-top:10px;margin-right:14px;font-size:0.95rem;font-weight:600;color:var(--c-coral);border-bottom:1px dashed var(--c-coral);text-decoration:none;">${escapeHtml(m.label || '資源 ↗')}</a>`
    ).join('');
    return `<div class="card-materials">${links}</div>`;
  }

  // ─── 課程詳細頁連結（有 detail_url 才顯示） ───
  function detailLinkHTML(c) {
    if (!c.detail_url) return '';
    return `<a class="course-detail-link" href="${escapeHtml(c.detail_url)}" target="_blank" rel="noopener">完整課程內容與簡報 ↗</a>`;
  }

  // ─── 單張卡片 HTML（極簡版：圖 + 日期 + 標題 + 模式 badges + 詳細連結 + CTA） ───
  function cardHTML(c) {
    const thumb = c.image
      ? `<div class="card-thumbnail"><img src="${escapeHtml(c.image)}" alt="${escapeHtml(c.title)}" loading="lazy" /></div>`
      : placeholderHTML(c);

    return `
      <div class="list-card course-card${c.image ? ' has-thumb' : ''}" data-course-id="${escapeHtml(c.id)}">
        ${thumb}
        <div class="card-body">
          <div class="card-meta">
            <span class="card-date">${escapeHtml(fmtDate(c))}</span>
          </div>
          <h3>${escapeHtml(c.title)}</h3>
          ${modeBadgesHTML(c)}
          ${detailLinkHTML(c)}
          ${ctaHTML(c)}
        </div>
      </div>`;
  }

  // ─── 首頁：最近的課（未來 N 場） ───
  window.renderHomeUpcoming = function (selector, n) {
    const target = document.querySelector(selector);
    if (!target) return;
    const upcoming = COURSES
      .filter(isUpcoming)
      .filter(c => inferType(c) !== 'external' && inferType(c) !== 'podcast')
      .sort((a,b) => parseDate(a.date) - parseDate(b.date))
      .slice(0, n);
    if (upcoming.length === 0) {
      target.innerHTML = `<p style="text-align:center;color:var(--ink-faint);font-family:'Cormorant Garamond',serif;font-style:italic;font-size:1.1rem;padding:32px;">最近的課正在規劃中，<a href="courses.html" style="color:var(--c-coral);border-bottom:1px dashed var(--c-coral);">看看全部課程 →</a></p>`;
      return;
    }
    target.innerHTML = upcoming.map(cardHTML).join('');
  };

  // ─── 從 type_label 推 type（給 filter 用） ───
  function inferType(c) {
    const t = c.type_label || '';
    if (t.includes('免費')) return 'free';
    if (t.includes('付費')) return 'paid';
    if (t.includes('Podcast')) return 'podcast';
    if (t.includes('外部')) return 'external';
    return 'other';
  }

  // ─── 子頁：全部課程，月份分區（未來在上、過去在下） ───
  let _courseFilter = { search: '', type: 'all', venue: 'all' };
  window.renderAllCourses = function (selector) {
    const target = document.querySelector(selector);
    if (!target) return;

    // 套 filter
    const filtered = COURSES.filter(c => {
      // 免費講座頁只顯示免費講座（外部授課/Podcast 在邀約授課頁，付費課在收費課程頁）
      if (inferType(c) !== 'free') return false;
      if (_courseFilter.type !== 'all' && inferType(c) !== _courseFilter.type) return false;
      if (_courseFilter.venue !== 'all' && (c.venue_mode || 'other') !== _courseFilter.venue) return false;
      if (_courseFilter.search) {
        const q = _courseFilter.search.toLowerCase();
        const hay = [
          c.title || '', c.summary || '', c.venue || '', c.host || '',
          (c.tags || []).join(' '), c.type_label || ''
        ].join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    // 課程預告只顯示未來場次；已結束課程整理到 resources.html。
    const incubating = filtered.filter(isIncubating);
    let upcoming = filtered.filter(isUpcoming).sort((a,b)=>parseDate(a.date)-parseDate(b.date));
    // 每月兩堂：未來場次不足兩堂時，補最近的舊場次，免費講座頁永遠至少兩張卡
    if (upcoming.length < 2) {
      upcoming = upcoming.concat(filtered.filter(isPast).sort((a,b)=>parseDate(b.date)-parseDate(a.date)).slice(0, 2 - upcoming.length));
    }

    // 沒結果
    const emptyEl = document.getElementById('no-courses-results');
    if (emptyEl) emptyEl.classList.toggle('show', upcoming.length === 0);

    function groupByMonth(arr) {
      const groups = {};
      arr.forEach(c => {
        const k = monthKey(c);
        (groups[k] = groups[k] || []).push(c);
      });
      return groups;
    }

    function renderGroup(groups, monthOrderFn) {
      const keys = Object.keys(groups).sort(monthOrderFn);
      return keys.map(k => {
        const items = groups[k];
        const [y, m] = k.split('-');
        const monthLabel = ['一月','二月','三月','四月','五月','六月','七月','八月','九月','十月','十一月','十二月'][parseInt(m,10)-1];
        return `
          <div class="group-header">
            <h2>${y}-${m} ${monthLabel}</h2>
            <span class="group-count">${items.length} 場</span>
          </div>
          <div class="list-grid cols-3">
            ${items.map(cardHTML).join('')}
          </div>`;
      }).join('');
    }

    // 把 upcoming 拆三段：本月 / 下月 / 後續檔期
    const todayMonth = TODAY.getMonth();
    const todayYear = TODAY.getFullYear();
    const nextMonth = (todayMonth + 1) % 12;
    const nextYear = todayMonth === 11 ? todayYear + 1 : todayYear;
    function bucketOf(c) {
      const d = parseDate(c.date);
      if (d.getFullYear() === todayYear && d.getMonth() === todayMonth) return 'current';
      if (d.getFullYear() === nextYear && d.getMonth() === nextMonth) return 'next';
      return 'later';
    }
    const currentMonth = upcoming.filter(c => bucketOf(c) === 'current');
    const nextMonthArr = upcoming.filter(c => bucketOf(c) === 'next');
    const later = upcoming.filter(c => bucketOf(c) === 'later');

    function subsection(title, items, intro) {
      if (!items.length) return '';
      const introHTML = intro ? `<p class="group-intro">${intro}</p>` : '';
      return `
        <div class="group-header">
          <h2>${title}</h2>
          <span class="group-count">${items.length} 場</span>
        </div>
        ${introHTML}
        <div class="list-grid cols-3">
          ${items.map(cardHTML).join('')}
        </div>`;
    }

    let html = '';
    const hasUpcoming = upcoming.length;
    if (hasUpcoming) {
      html += `<div style="margin-bottom: 12px;"><div class="eyebrow">近期免費講座</div></div>`;
      html += subsection('本月', currentMonth);
      html += subsection('下月', nextMonthArr);
      html += subsection('後續檔期', later, '更後面的場次與時間未定的課程。');
    }
    // 過去課程目錄：已上過的免費講座，含完整操作手冊或回放
    const shownIds = new Set(upcoming.map(c => c.id));
    const pastCatalog = filtered.filter(isPast).filter(c => !shownIds.has(c.id)).sort((a,b)=>parseDate(b.date)-parseDate(a.date));
    if (pastCatalog.length) {
      html += `<div style="margin:44px 0 14px;"><div class="eyebrow">過去課程目錄</div><p class="group-intro" style="color:var(--ink-faint);margin-top:4px;">已上過的免費講座，含完整操作手冊或回放，挑有興趣的補看。</p></div>`;
      html += `<div class="list-grid cols-3">` + pastCatalog.map(c => {
        const thumb = c.image ? `<div class="card-thumbnail"><img src="${escapeHtml(c.image)}" alt="${escapeHtml(c.title)}" loading="lazy"/></div>` : placeholderHTML(c);
        return `<div class="list-card course-card${c.image ? ' has-thumb' : ''}">${thumb}<div class="card-body"><div class="card-meta"><span class="card-date">${escapeHtml(fmtDate(c))}</span></div><h3>${escapeHtml(c.title)}</h3>${detailLinkHTML(c)}${materialsHTML(c)}</div></div>`;
      }).join('') + `</div>`;
    }
    if (!html) {
      html = `<p style="text-align:center;color:var(--ink-faint);padding:48px;">目前沒有課程預告。已上完的課程與簡報請看 <a href="resources.html" style="color:var(--c-coral);border-bottom:1px dashed var(--c-coral);">學習資源</a>。</p>`;
    }
    target.innerHTML = html;
  };

  // ─── 邀約授課頁：外部授課 + Podcast，最近 + 過去戰績 ───
  window.renderInvitedTalks = function (selector) {
    const target = document.querySelector(selector);
    if (!target) return;
    const all = COURSES.filter(c => inferType(c) === 'external' || inferType(c) === 'podcast');
    const upcoming = all.filter(isUpcoming).sort((a,b)=>parseDate(a.date)-parseDate(b.date));
    const past = all.filter(isPast).sort((a,b)=>parseDate(b.date)-parseDate(a.date));
    function block(title, items) {
      if (!items.length) return '';
      return `<div class="group-header"><h2>${title}</h2><span class="group-count">${items.length} 場</span></div>
        <div class="list-grid cols-3">${items.map(cardHTML).join('')}</div>`;
    }
    let html = '';
    if (upcoming.length) html += `<div style="margin-bottom:12px;"><div class="eyebrow">最近的邀約</div></div>` + block('近期受邀', upcoming);
    if (past.length) html += `<div style="margin:36px 0 12px;"><div class="eyebrow">過去的戰績</div></div>` + block('講過的場次', past);
    if (!html) html = `<p style="text-align:center;color:var(--ink-faint);padding:48px;">邀約授課場次整理中。</p>`;
    target.innerHTML = html;
  };

  // ─── 自動執行（看頁面有沒有 target） ───
  document.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('invited-talks')) {
      window.renderInvitedTalks('#invited-talks');
    }
    if (document.getElementById('home-upcoming')) {
      window.renderHomeUpcoming('#home-upcoming', 3);
    }
    if (document.getElementById('all-courses')) {
      window.renderAllCourses('#all-courses');

      // 課程頁：搜尋 + 標籤過濾
      const search = document.getElementById('course-search');
      const rebind = () => {
        if (window.attachLocalSpotlight) document.querySelectorAll('.list-card').forEach(window.attachLocalSpotlight);
      };
      if (search) {
        search.addEventListener('input', (e) => {
          _courseFilter.search = e.target.value.trim();
          window.renderAllCourses('#all-courses');
          rebind();
        });
      }
      document.querySelectorAll('[data-filter-type]').forEach(chip => {
        chip.addEventListener('click', () => {
          document.querySelectorAll('[data-filter-type]').forEach(c => c.classList.remove('active'));
          chip.classList.add('active');
          _courseFilter.type = chip.dataset.filterType;
          window.renderAllCourses('#all-courses');
          rebind();
        });
      });
      document.querySelectorAll('[data-filter-venue]').forEach(chip => {
        chip.addEventListener('click', () => {
          document.querySelectorAll('[data-filter-venue]').forEach(c => c.classList.remove('active'));
          chip.classList.add('active');
          _courseFilter.venue = chip.dataset.filterVenue;
          window.renderAllCourses('#all-courses');
          rebind();
        });
      });
    }

    // 重新綁定卡片 hover spotlight（新卡片）
    if (window.attachLocalSpotlight) {
      document.querySelectorAll('.list-card').forEach(window.attachLocalSpotlight);
    }
  });
})();
