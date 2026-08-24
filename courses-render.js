/* ─── 課程渲染共用模組 ─── */
(function () {
  const COURSES = window.COURSES || [];
  const TODAY = new Date(new Date().toISOString().slice(0, 10)); // 00:00 today

  // ─── 工具 ───
  function parseDate(s) { return s ? new Date(s) : new Date(8640000000000000); }
  function isIncubating(c) { return c.phase === "incubating"; }
  function isUpcoming(c) { return !isIncubating(c) && !!c.date && parseDate(c.date) >= TODAY; }
  function isPast(c) { return !isIncubating(c) && !!c.date && parseDate(c.date) < TODAY; }
  function monthKey(c) { return c.date ? c.date.slice(0, 7) : 'tbd'; }   // "2026-05"
  function fmtDate(c) {
    if (c.date_label) return c.date_label;   // 多日系列課給 date_label 直接顯示（date 仍管排序與過期）
    if (!c.date) return '日期待定';
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
  const FEE_LABEL = { free: '免費課', paid: '付費課', external: '邀約課', podcast: '邀約課' };
  const FEE_COLOR = { free: 'var(--c-mint)', paid: 'var(--c-coral)', external: 'var(--c-sand)', podcast: 'var(--c-sand)' };
  function feeBadgeHTML(c) {
    const ft = inferType(c);
    if (!FEE_LABEL[ft]) return '';
    return `<span class="mode-badge" style="background:transparent;border:1px solid ${FEE_COLOR[ft]};color:${FEE_COLOR[ft]}">${FEE_LABEL[ft]}</span>`;
  }
  function modeBadgesHTML(c) {
    const v = c.venue_mode || (c.type === 'podcast' ? 'podcast' : null);
    const r = (c.registration && c.registration.status) || null;
    const parts = [];
    if (isIncubating(c)) parts.push(`<span class="mode-badge phase-incubating">籌備中 · 徵求夥伴</span>`);
    const fee = feeBadgeHTML(c);
    if (fee) parts.push(fee);
    if (v) parts.push(`<span class="mode-badge venue-${v}">${escapeHtml(VENUE_LABEL[v] || v)}</span>`);
    if (r && !isIncubating(c)) parts.push(`<span class="mode-badge reg-${r}">${escapeHtml(REG_LABEL[r] || r)}</span>`);
    return parts.length ? `<div class="card-modes">${parts.join('')}</div>` : '';
  }

  // ─── 沒圖時的佔位（明信片風：漸層底 + 月份 + 大日期 + 標題 + 主辦） ───
  function placeholderHTML(c) {
    if (!c.date) {
      const r = c.registration || {};
      const orgLabel = (r.status === 'private' && r.host_org) ? `主辦：${r.host_org}` : c.type_label;
      return `<div class="card-thumbnail-placeholder">
        <div class="ph-decor ph-decor-a"></div>
        <div class="ph-decor ph-decor-b"></div>
        <div class="ph-top"><span class="ph-month-mark">TO BE ANNOUNCED</span></div>
        <div class="ph-mid"><div class="ph-day">TBD</div></div>
        <div class="ph-bottom">
          <div class="ph-title">${escapeHtml(c.title)}</div>
          <div class="ph-org">${escapeHtml(orgLabel)}</div>
        </div>
      </div>`;
    }
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
    return `<a class="course-detail-link" href="${escapeHtml(c.detail_url)}" target="_blank" rel="noopener">${escapeHtml(c.detail_label || '完整課程內容與簡報 ↗')}</a>`;
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
          ${materialsHTML(c)}
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
    const trueUpcoming = filtered.filter(isUpcoming).sort((a,b)=>parseDate(a.date)-parseDate(b.date));
    // 空窗判斷：完全沒有未來的免費場 → 顯示「下月規劃中、加社群」提示，不補過去場硬湊
    const isFreeGap = trueUpcoming.length === 0;
    let upcoming = trueUpcoming;
    // 有未來場但不足兩堂時補最近舊場次湊兩張；空窗時不補，留給提示卡
    if (!isFreeGap && upcoming.length < 2) {
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
    // 空窗：沒有未來免費場時顯示「下月規劃中、加社群」提示卡（人看版，呼應 AI 接待話術）
    if (isFreeGap) {
      const lineUrl = 'https://line.me/R/ti/g2/V63_43ngbs_kq1mpVc9LlxXB-1kchHnwdsy3WQ';
      html += `<div class="note-box" style="margin-bottom:32px;">
        <div class="eyebrow">免費線上講座</div>
        <h3>下個月的課表還在規劃中</h3>
        <p>這個月兩場免費講座已經上完了。加入我的 LINE 社群一起討論、提出你想聽的主題，好的問題很可能就成為下一場免費講座的題目。</p>
        <div class="btn-row" style="margin-top:14px;"><a class="button line" href="${lineUrl}" target="_blank" rel="noopener">加入 LINE 社群一起討論 ↗</a></div>
      </div>`;
    }
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

  // ─── 課程總覽頁：收費 + 免費 + 邀約 合併渲染（courses.html 用；純新增，不影響上方三個渲染器） ───
  let _mFilter = { type: 'all', venue: 'all', q: '' };
  const LEVEL_COLOR = { '入門': 'var(--c-mint)', '實作': 'var(--c-sand)', '團隊導入': 'var(--c-coral)' };
  function paidCardHTML(o) {
    const lv = o.level ? `<span class="mode-badge" style="background:transparent;border:1px solid ${LEVEL_COLOR[o.level]||'var(--line)'};color:${LEVEL_COLOR[o.level]||'var(--ink-soft)'}">${escapeHtml(o.level)}</span>` : '';
    const vn = o.venue_label ? `<span class="mode-badge venue-${o.venue_mode||'tbd'}">${escapeHtml(o.venue_label)}</span>` : '';
    return `
      <div class="list-card course-card" data-course-id="${escapeHtml(o.id)}">
        <div class="card-body">
          <div class="card-meta"><span class="card-date" style="font-weight:700;color:var(--c-coral);">${escapeHtml(o.price)}</span></div>
          <h3>${escapeHtml(o.title)}</h3>
          <div class="card-modes">${vn}${lv}</div>
          <p style="font-size:0.98rem;color:var(--ink-soft);line-height:1.7;margin:10px 0 0;">${escapeHtml(o.brief)}</p>
          ${o.anchor ? `<div class="course-cta open" style="margin-top:12px;"><a class="cta-btn" href="${escapeHtml(o.anchor)}">${escapeHtml(o.cta || '瞭解更多 →')}</a></div>` : ''}
        </div>
      </div>`;
  }
  window.renderMergedCourses = function (selector) {
    const target = document.querySelector(selector);
    if (!target) return;
    const F = _mFilter;
    const q = (F.q || '').toLowerCase();
    const hitQ = (parts) => !q || parts.join(' ').toLowerCase().includes(q);
    const hitVenue = (v) => F.venue === 'all' || (v || '') === F.venue;
    const grid = (items) => `<div class="list-grid cols-3">${items.join('')}</div>`;
    const header = (t, n, intro) => `<div class="group-header"><h2>${t}</h2><span class="group-count">${n} 項</span></div>` + (intro ? `<p class="group-intro">${intro}</p>` : '');
    let html = '';

    // 近期課程置頂：免費、付費、邀約合看，最近要上的排最前（2026-07-08 江江指示）
    if (F.type === 'all') {
      const soon = COURSES
        .filter(c => isUpcoming(c) && hitVenue(c.venue_mode) && hitQ([c.title, c.summary || '', (c.tags || []).join(' '), c.type_label || '']))
        .sort((a, b) => parseDate(a.date) - parseDate(b.date))
        .slice(0, 6);
      if (soon.length) {
        html += header('近期課程', soon.length, '最近要上的課排最前面；免費課、付費課、邀約課看卡片上的標籤。');
        html += grid(soon.map(cardHTML));
      }

      const incubating = COURSES
        .filter(c => isIncubating(c) && hitVenue(c.venue_mode) && hitQ([c.title, c.summary || '', (c.tags || []).join(' '), c.type_label || '']));
      if (incubating.length) {
        html += header('籌備中', incubating.length, '日期與報名方式尚未確定的課程。');
        html += grid(incubating.map(cardHTML));
      }
    }

    // 收費課程（常設 offers + 有日期的付費場次）
    if (F.type === 'all' || F.type === 'paid') {
      const offers = (window.PAID_OFFERS || []).filter(o => hitVenue(o.venue_mode) && hitQ([o.title, o.brief, o.level, (o.tags||[]).join(' ')]));
      const paidRuns = COURSES.filter(c => inferType(c) === 'paid' && !isIncubating(c) && hitVenue(c.venue_mode) && hitQ([c.title, c.summary||'', (c.tags||[]).join(' ')]));
      if (offers.length + paidRuns.length) {
        html += header('收費課程', offers.length + paidRuns.length, '');
        html += grid(offers.map(paidCardHTML).concat(paidRuns.map(cardHTML)));
      }
    }
    // 免費講座（未來場次 + 過去目錄）
    if (F.type === 'all' || F.type === 'free') {
      const free = COURSES.filter(c => inferType(c) === 'free' && hitVenue(c.venue_mode) && hitQ([c.title, c.summary||'', (c.tags||[]).join(' ')]));
      const up = free.filter(isUpcoming).sort((a,b)=>parseDate(a.date)-parseDate(b.date));
      const past = free.filter(isPast).sort((a,b)=>parseDate(b.date)-parseDate(a.date));
      if (up.length) { html += header('免費講座 · 近期', up.length); html += grid(up.map(cardHTML)); }
      else if (F.type === 'free' || F.type === 'all') {
        html += header('免費講座', 0, '');
        html += `<div class="note-box" style="margin-bottom:28px;"><h3>下個月的免費課表還在規劃中</h3><p>加入 <a href="https://line.me/R/ti/g2/V63_43ngbs_kq1mpVc9LlxXB-1kchHnwdsy3WQ" target="_blank" rel="noopener" style="color:var(--c-coral);">LINE 社群</a> 提出你想聽的主題，好的問題很可能就是下一場講座。</p></div>`;
      }
      if (past.length) { html += header('免費講座 · 過去目錄', past.length, '已上過的講座，含完整簡報或回放，挑有興趣的補看。'); html += grid(past.map(cardHTML)); }
    }
    // 邀約授課（外部授課 + Podcast）
    if (F.type === 'all' || F.type === 'invited') {
      const inv = COURSES.filter(c => (inferType(c) === 'external' || inferType(c) === 'podcast' || (inferType(c) === 'other' && (c.registration || {}).status === 'private')) && hitVenue(c.venue_mode) && hitQ([c.title, c.summary||'', (c.tags||[]).join(' ')]));
      const up = inv.filter(isUpcoming).sort((a,b)=>parseDate(a.date)-parseDate(b.date));
      const past = inv.filter(isPast).sort((a,b)=>parseDate(b.date)-parseDate(a.date));
      if (up.length) { html += header('邀約授課 · 近期受邀', up.length); html += grid(up.map(cardHTML)); }
      if (past.length) { html += header('邀約授課 · 講過的場次', past.length, '企業、學校、社群的邀約場。想邀課請走服務方案頁。'); html += grid(past.map(cardHTML)); }
    }

    if (!html) html = `<p style="text-align:center;color:var(--ink-faint);padding:48px;">沒有符合條件的課程，換個篩選或關鍵字試試。</p>`;
    target.innerHTML = html;
    if (window.attachLocalSpotlight) target.querySelectorAll('.list-card').forEach(window.attachLocalSpotlight);
  };

  document.addEventListener('DOMContentLoaded', () => {
    if (!document.getElementById('merged-courses')) return;
    window.renderMergedCourses('#merged-courses');
    const s = document.getElementById('merged-search');
    if (s) s.addEventListener('input', e => { _mFilter.q = e.target.value.trim(); window.renderMergedCourses('#merged-courses'); });
    document.querySelectorAll('[data-mtype]').forEach(chip => chip.addEventListener('click', () => {
      document.querySelectorAll('[data-mtype]').forEach(c => c.classList.remove('active'));
      chip.classList.add('active'); _mFilter.type = chip.dataset.mtype; window.renderMergedCourses('#merged-courses');
    }));
    document.querySelectorAll('[data-mvenue]').forEach(chip => chip.addEventListener('click', () => {
      document.querySelectorAll('[data-mvenue]').forEach(c => c.classList.remove('active'));
      chip.classList.add('active'); _mFilter.venue = chip.dataset.mvenue; window.renderMergedCourses('#merged-courses');
    }));
  });

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
