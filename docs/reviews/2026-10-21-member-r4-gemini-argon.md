# 會員系統第 4 輪跨家審查（Gemini 4 Argon）

- producer_family：Anthropic（Claude）；reviewer_family：Google（gemini-4-argon，Gemini API 直呼）
- 審查範圍：3575ca6..817b8947 的 diff 與 7 個關鍵檔全文
- 日期：2026-10-21

逐項審查結果：

１、撤銷權限被併發登入寫回：已修
理由與位置：會員記錄不再儲存付費等級（functions/member/[[path]].js 的 login 函式固定寫入 tier: ['free']），所有權限判定與呈現皆改由 cloudflare/member-lib.mjs 的 memberTiers 函式及 functions/admin/members/[[path]].js 的 list 動作即時讀取 Redis 的 grant:<email> 集合。functions/admin/members/[[path]].js 的 revoke 動作直接從 grant:<email> 移除權限，因此併發登入不會寫回已撤銷的等級。

２、訪客稱呼注入 system prompt：已修
理由與位置：api/mika-chat.js 第 752 行對 body.name 進行清洗（移除控制字元、換行與括號）並存入 callName；第 835 行在 system prompt 僅放入靜態提示字串，不再包含訪客輸入；第 845 行將 callName 改掛入 llmMsgs 陣列中最後一則 user 角色的訊息開頭。

３、非 Gmail 信箱自動繼承付費等級：已修
理由與位置：cloudflare/member-lib.mjs 新增 emailTrusted 函式（第 295 至 301 行），僅在網域為 gmail.com／googlemail.com，或 Google ID token 帶有 hd 聲明且與信箱網域一致（Workspace）時回傳 true。memberTiers 函式（第 302 至 307 行）與後台 list（functions/admin/members/[[path]].js 第 75 行）皆檢查 u.emailTrusted === true 或 vemail:<sub> 等於當前信箱才授予權限；非上述信箱需由站長透過後台 confirm-email 動作手動寫入 vemail:<sub> 後方能承接等級。

４、暱稱與登入互相覆蓋：已修
理由與位置：cloudflare/member-lib.mjs 新增兩段 Redis Lua 腳本 USER_UPSERT_SCRIPT 與 USER_NICK_SCRIPT（第 312 至 313 行）。functions/member/[[path]].js 的 login（第 107 行）透過 EVAL 執行 USER_UPSERT_SCRIPT，於 Redis 端原子性地保留既有記錄的 nick 與 createdAt；nick 端點（第 145 行）透過 USER_NICK_SCRIPT 原子性地只修改 nick 欄位，消除讀改寫的競爭條件。

５、強制登出時剛好有人登入，session 存活：已修
理由與位置：導入撤銷世代機制。cloudflare/member-lib.mjs 的 verifySession（第 183 至 184 行）同時讀取 sess:<id> 與 ugen:<sub>，比對 sessValue(sub, gen) 是否一致。functions/member/[[path]].js 的 login（第 103、111 行）先讀取 ugen:<sub> 再將世代寫入 sess:<id>，並把 sub 記錄至 esubs:<email>。functions/admin/members/[[path]].js 的 revoke-sessions（第 126 至 133 行）透過 email:<email> 與 esubs:<email> 找出所有關聯 sub，先對所有 ugen:<sub> 執行 INCR，再刪除已知 session。若登入卡在強制登出期間，其預先讀到的舊世代寫入後也無法通過 verifySession 比對。

６、他站可借用咪卡聊天 API 花額度：已修
理由與位置：lib/2026-09-13-0910-client-network.js 新增 browserRequestAllowed 函式（第 89 至 96 行），當請求帶有 Origin 標頭時，檢查必須為同源（https://<host>）或通過 allowedOrigin 白名單，且 Content-Type 必須為 application/json（觸發瀏覽器 CORS 預檢，阻擋免預檢的跨站 text/plain 請求）。api/mika-chat.js 第 742 行在檢查 API key 與呼叫模型前先以 browserRequestAllowed 攔截並回傳 403。

７、密碼比對非定時比較：已修
理由與位置：cloudflare/member-lib.mjs（第 143 至 147 行）與 lib/2026-09-13-0910-client-network.js（第 34 至 38 行）的 safeEqual 函式皆改用 node:crypto 的 createHash('sha256') 將兩端輸入雜湊為固定 32 bytes 後，交由平台原語 timingSafeEqual 比對；scripts/cloudflare/build.mjs 與 cloudflare/runtime.mjs 亦同步注入 createHash 與 timingSafeEqual。

新的高中風險問題：
無。

總結論：通過

