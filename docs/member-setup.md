# 會員登入與文章留言：啟用步驟

2026-11-04 立。程式已經上線但預設關閉（`MEMBER_ENABLED = "0"`），關閉時文章頁完全看不到留言區、不影響現有網站。照下面五步做完就會打開。

本檔放在 `docs/`，Cloudflare 建置時不會發布到網站上。

## 這套做了什麼

- 讀者用 Google 帳號登入，在每篇文章（`/articles/<slug>/`、`/ai-trends/<slug>/`）底部留言；沒登入也看得到留言。
- 留言直接公開；你（管理員）在留言旁邊會看到「隱藏」按鈕，事後處理廣告、攻擊或個資。讀者可以刪自己的留言。
- 每人 10 分鐘最多 5 則、一天 30 則；1 到 1000 字純文字，第一版不做巢狀回覆。
- 暱稱與頭像：登入後可以自己取暱稱（最多 20 字），改了之後舊留言也一起更新；「江江、江昱德、管理員、官方、站長、客服、咪卡」這類字只有管理員能用，避免冒名。頭像三選一：Google 照片、名字首字、12 個圖示。不開放上傳照片（免審圖、免另開圖片儲存空間，也少一個資安破口）。一天最多改 10 次。
- 資料存在現有的 Upstash Redis，不另開服務。會員只存 Google 識別碼、名稱、頭像網址、自取的暱稱與頭像選擇、email 的雜湊（不存 email 原文）、登入時間。
- 程式：`cloudflare/member.mjs`（後端）、`functions/member/[[path]].js`（路由）、`member-comments.js`（前端）、`tests/member.test.mjs`（測試：`node tests/member.test.mjs`）。

## 第 1 步：Google Cloud 建立 OAuth 用戶端

1. 開 <https://console.cloud.google.com/>，建立一個專案（例如「jiangyude-com」）。
2. 左側「Google Auth Platform」→「品牌塑造」（OAuth 同意畫面）：
   - 使用者類型選「外部」。
   - 應用程式名稱：江江教練 · AI 知識管理；使用者支援 email 填你的信箱。
   - 授權網域：`jiangyude.com`。
   - 首頁：`https://jiangyude.com/`；隱私權政策：`https://jiangyude.com/privacy/`。
3. 「資料存取」（範圍）只加 `openid`、`email`、`profile` 三個基本範圍，不要加其他的。
4. 「目標對象」把發布狀態改成「實際運作中」（只用基本範圍，不需要 Google 審核）。
5. 「用戶端」→ 建立用戶端 →「網頁應用程式」：
   - 已授權的重新導向 URI 加兩個：
     - `https://jiangyude.com/member/callback`
     - `https://www.jiangyude.com/member/callback`
   - 建立後會拿到「用戶端 ID」和「用戶端密鑰」。

## 第 2 步：把用戶端 ID 寫進 wrangler.toml

用戶端 ID 不是機密，可以放進 repo。打開 `wrangler.toml` 的 `[env.production.vars]`：

```toml
MEMBER_ENABLED = "1"
GOOGLE_CLIENT_ID = "（貼上用戶端 ID，結尾是 .apps.googleusercontent.com）"
```

## 第 3 步：把機密設定進 Cloudflare（不要寫進 repo）

在本機 repo 資料夾執行，畫面會請你貼上值：

```bash
wrangler pages secret put GOOGLE_CLIENT_SECRET --project-name ai-km-jiang-cf-20261004
```

```bash
wrangler pages secret put MEMBER_ADMIN_EMAILS --project-name ai-km-jiang-cf-20261004
```

`MEMBER_ADMIN_EMAILS` 填你自己登入用的 Google 信箱；要多個管理員用逗號分開。

## 第 4 步：發布

照平常流程用 `scripts/publish.sh` 或 `scripts/merge-publish.sh` 發布，讓 wrangler.toml 的新設定生效。

## 第 5 步：上線驗收

1. 打開任一篇文章、捲到最下面，應該看到「留言」和「用 Google 登入」。
2. 登入後回到同一篇文章，留一則測試留言。
3. 用你的管理員帳號看到「隱藏」按鈕，按下後用無痕視窗確認看不到那則留言；再按「取消隱藏」。
4. 自己的留言按「刪除」。
5. 按「登出」。

## 建議加做（非必要）

- Upstash 主控台確認資料庫的持久化與每日備份已開啟（會員與留言都在裡面）。
- Cloudflare 主控台 → 安全性 → WAF → 速率限制規則：對 `/member/*` 設每個 IP 每分鐘 30 次，多一層防洗版。免費方案有一條規則可用。
- 關掉功能：把 `MEMBER_ENABLED` 改回 `"0"` 再發布，留言區立刻消失，資料保留。

## 安全設計重點（2026-11 資安對照）

- Google 回傳的身分憑證會驗簽章，並檢查發給的是本站用戶端（`aud`），避免別的網站的憑證被拿來冒名登入（對照 2026-10 公開的 CVE-2026-111639）。
- 登入後只跳回站內路徑，擋開放轉址偷登入憑證（對照 CVE-2026-63094）。
- 登出時立即刪除伺服器端 session 並清 Cookie（對照 CVE-2026-34454 類型問題）。
- 寫入動作要同站 Origin 加自訂標頭；Cookie 是 `__Host-` 前綴、HttpOnly、Secure、SameSite=Lax。
- 留言一律當純文字顯示，夾帶的 HTML 或程式碼不會執行。
- 不存 email 原文；會員程式不依賴任何 npm 套件（2026 年 npm 蠕蟲事件頻繁）。
- 預覽站的資料用不同前綴，跟正式站分開。
