// 會員分級設定表（單一正本）：分級中文名、包含關係、各級可看的內容、傳送門（Portaly）商品代號對應。
// 改分級或加內容只改這一檔；伺服器（functions/member、functions/member-content、functions/admin/members）
// 與前端（經 GET /member/entitlements 取得）都讀這裡，不另寫第二份。
//
// includes：高階包含低階。course-30000 包含 course-8000，course-8000 包含 course-3000，全部包含 free。
// free：登入即有，不需要補登記。

export const TIERS = {
  'free':         {name: '免費會員',            includes: []},
  'course-3000':  {name: '3000 元課程學員',     includes: ['free']},
  'course-8000':  {name: '8000 元課程學員',     includes: ['course-3000']},
  'course-30000': {name: '3 萬元課程學員',      includes: ['course-8000']},
};

// 各級專屬內容。檔案放 repo 的 member-content/<tier>/...，url 的第一段資料夾名必須等於 tier。
// 注意：本 repo 是公開 repo，放進來的檔案在 GitHub 上任何人都讀得到；這裡的保護只管官網。
// 真正的付費內容請放外部受保護位置，這裡只放連結頁或示範頁。
export const CONTENT = [
  {tier: 'course-3000', title: '3000 元課程學員專區（示範頁）', url: '/member-content/course-3000/'},
];

// 傳送門商品代號 → 分級。Portaly webhook 格式尚未查證，對應表先留空：
// 收到的商品代號不在表內一律只記錄到 webhook log，不寫授權。
// 查證格式後再填，例：'portaly-product-id-xxx': 'course-3000'
export const PORTALY_PRODUCTS = {};

export function isTier(id) {
  return typeof id === 'string' && Object.hasOwn(TIERS, id);
}

// 展開包含關係：['course-8000'] → course-8000、course-3000、free
export function expandTiers(list) {
  const out = new Set(), stack = [...(list || [])];
  while (stack.length) {
    const t = stack.pop();
    if (!isTier(t) || out.has(t)) continue;
    out.add(t);
    stack.push(...TIERS[t].includes);
  }
  return out;
}

export function tierLabel(id) {
  return isTier(id) ? TIERS[id].name : '';
}
