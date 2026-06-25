// ai-km-jiang 官網流量｜GA4 每 10 天自動匯出 Google 試算表
// 用法：sheets.new → 命名「江江官網流量」→ 擴充功能 > Apps Script → 貼上本檔 →
//       左側「服務 +」加 Google Analytics Data API（識別碼 AnalyticsData）→
//       函式選 setup → 執行 → 完成 OAuth 授權（由江江本人點允許）。
// 只改下面 PROPERTY_ID（GA4「資源設定」裡的純數字 ID，不是 G-XXXX）即可。
// 詳見技能包 references：2026-06-05-2224 GA4每10天自動匯出Google試算表SOP。

// ===== 設定（複製給別的網站只改這裡）=====
const PROPERTY_ID = '填GA4純數字資源ID';  // 例 539651368；在 GA4 管理 > 資源設定 找
const LOOKBACK_DAYS = 10;
const BACKFILL_DAYS = 90;
const TOP_N = 10;
const SNAPSHOT_TABS = ['總覽', '熱門頁', '來源', '國家', '裝置', '瀏覽器'];

function setup() {
  ScriptApp.getProjectTriggers().forEach(t => {
    if (t.getHandlerFunction() === 'run') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('run').timeBased().everyDays(LOOKBACK_DAYS).atHour(9).create();
  dedupeSnapshotTabs();
  run();
}

function run() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const tz = ss.getSpreadsheetTimeZone();
  const today = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');
  const start = LOOKBACK_DAYS + 'daysAgo';
  const stampRange = LOOKBACK_DAYS + 'daysAgo~today';

  SNAPSHOT_TABS.forEach(name => removeSnapshotRows_(ss, name, today, stampRange));

  const overview = report_({
    dateRanges: [{ startDate: start, endDate: 'today' }],
    metrics: ['totalUsers', 'screenPageViews', 'sessions', 'bounceRate']
  });
  const ov = (overview.rows && overview.rows[0]) ? overview.rows[0].metricValues.map(m => m.value) : ['0','0','0','0'];
  appendRow_(ss, '總覽', ['抓取日', '期間', '訪客', '瀏覽量', '工作階段', '跳出率'],
    [today, stampRange, num_(ov[0]), num_(ov[1]), num_(ov[2]), pct_(ov[3])]);

  const dims = [
    ['熱門頁', 'pagePath'], ['來源', 'sessionSource'], ['國家', 'country'],
    ['裝置', 'deviceCategory'], ['瀏覽器', 'browser']
  ];
  dims.forEach(([tab, dim]) => {
    const r = report_({
      dateRanges: [{ startDate: start, endDate: 'today' }],
      dimensions: [{ name: dim }],
      metrics: [{ name: 'totalUsers' }, { name: 'screenPageViews' }],
      orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }],
      limit: TOP_N
    });
    const rows = (r.rows || []).map(row => [
      today, stampRange, row.dimensionValues[0].value,
      num_(row.metricValues[0].value), num_(row.metricValues[1].value)
    ]);
    appendRows_(ss, tab, ['抓取日', '期間', tab, '訪客', '瀏覽量'], rows);
  });

  backfillDailyOverview();
}

function backfillDailyOverview() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const r = report_({
    dateRanges: [{ startDate: BACKFILL_DAYS + 'daysAgo', endDate: 'today' }],
    dimensions: [{ name: 'date' }],
    metrics: ['totalUsers', 'screenPageViews', 'sessions', 'bounceRate'],
    orderBys: [{ dimension: { dimensionName: 'date' } }]
  });

  const sh = resetSheet_(ss, '每日總覽', ['日期', '訪客', '瀏覽量', '工作階段', '跳出率']);
  (r.rows || []).forEach(row => {
    const d = row.dimensionValues[0].value;
    const mv = row.metricValues.map(m => m.value);
    sh.appendRow([formatGaDate_(d), num_(mv[0]), num_(mv[1]), num_(mv[2]), pct_(mv[3])]);
  });
}

function report_(body) {
  if (!body.metrics) body.metrics = [];
  body.metrics = body.metrics.map(m => typeof m === 'string' ? { name: m } : m);
  return AnalyticsData.Properties.runReport(body, 'properties/' + PROPERTY_ID);
}
function dedupeSnapshotTabs() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  SNAPSHOT_TABS.forEach(name => dedupeSheetRows_(ss, name));
}
function dedupeSheetRows_(ss, name) {
  const sh = ss.getSheetByName(name);
  if (!sh) return;
  const lastRow = sh.getLastRow();
  const lastCol = sh.getLastColumn();
  if (lastRow < 3 || lastCol < 2) return;
  const rows = sh.getRange(2, 1, lastRow - 1, lastCol).getDisplayValues();
  const seen = new Set();
  for (let i = rows.length - 1; i >= 0; i--) {
    const key = rows[i].join('');
    if (seen.has(key)) { sh.deleteRow(i + 2); } else { seen.add(key); }
  }
}
function sheet_(ss, name, header) {
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.appendRow(header);
    sh.getRange(1, 1, 1, header.length).setFontWeight('bold');
  }
  return sh;
}
function resetSheet_(ss, name, header) {
  let sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  sh.clearContents();
  sh.appendRow(header);
  sh.getRange(1, 1, 1, header.length).setFontWeight('bold');
  return sh;
}
function removeSnapshotRows_(ss, name, dateValue, rangeValue) {
  const sh = ss.getSheetByName(name);
  if (!sh) return;
  const lastRow = sh.getLastRow();
  if (lastRow < 2) return;
  const values = sh.getRange(2, 1, lastRow - 1, 2).getDisplayValues();
  for (let i = values.length - 1; i >= 0; i--) {
    if (values[i][0] === dateValue && values[i][1] === rangeValue) { sh.deleteRow(i + 2); }
  }
}
function appendRow_(ss, name, header, row) { sheet_(ss, name, header).appendRow(row); }
function appendRows_(ss, name, header, rows) { const sh = sheet_(ss, name, header); rows.forEach(r => sh.appendRow(r)); }
function num_(v) { return Number(v) || 0; }
function pct_(v) { return (Math.round((Number(v) || 0) * 1000) / 10) + '%'; }
function formatGaDate_(yyyymmdd) { return yyyymmdd.slice(0,4) + '-' + yyyymmdd.slice(4,6) + '-' + yyyymmdd.slice(6,8); }
