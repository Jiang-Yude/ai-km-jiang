# 新電腦部署官網 SOP

本 repo 是江江教練官網 `ai-km-jiang`。正式站：<https://jiangyude.com/>。

目的：新筆電從零 clone、檢查、更新、發布時，不再靠口頭記憶，也不要只 `git push` 以為已上線。

> 現況（2026-10-19 改寫對齊程式）：**正式站 2026-10-09 起由 Cloudflare Pages 提供**（專案 `ai-km-jiang-cf-20261004`），
> `scripts/publish.sh` 預設 `PUBLISH_TARGET=cloudflare`。Vercel 是舊系統，**退場中，觀察期至 2026-11-08**
> （切換登記 `site-cf-cutover-20261009`，30 天觀察期），相關段落集中在本檔最後的「Vercel（退場中）」一節，平常不要照那節做。

## 0. 重要結論

- 這是靜態站：目前沒有 `package.json`，發布不需要 `npm install` 或 `node_modules`。
- Node 版本固定在 `.nvmrc`：Node 22。
- 唯一正式發布入口是：`bash scripts/publish.sh "本次修改說明" -- path1 path2`；多張工作桌的分支上線走 `bash scripts/merge-publish.sh <branch> "訊息"`（它最後也是呼叫 publish.sh）。
- 不要用裸 `git push` 代替發布；`git push` 只更新 GitHub，**不會**觸發 Cloudflare 部署（C 網是本機乾淨工作樹建置後推上去的）。
- 不要手動 `wrangler pages deploy`，也不要手動 `vercel --prod`；publish.sh 會走 preflight、秘密掃描、atomic push、C 網 production 部署、部署收據比對與正式站驗收。

## 1. 新電腦一次性安裝

```bash
# 1) 安裝 Node 22（若有 nvm）
nvm install
nvm use

# 2) 安裝 Cloudflare Wrangler CLI 並登入（C 網部署與本機 Functions 測試都要）
npm i -g wrangler
wrangler login

# 3) dig（正式站驗收用 Cloudflare 權威 NS 解析，避開本機 DNS 快取；macOS 內建，Linux 裝 dnsutils）
dig -v

# 4) clone repo
git clone https://github.com/Jiang-Yude/ai-km-jiang.git
cd ai-km-jiang

# 5) 設定 Git 身分
git config user.name "Jiang Yude"
git config user.email "130630081+Jiang-Yude@users.noreply.github.com"

# 6) 綁定品質閘門（pre-commit 擋分支 commit 生成檔與文章樣式缺漏；pre-push）
git config core.hooksPath scripts/git-hooks
```

若安全部署工具不在預設路徑（主知識庫 `_agent/tools/safe-deploy/safe-deploy.sh`），先設定：

```bash
export SAFE_DEPLOY_TOOL="/你的路徑/safe-deploy.sh"
```

## 2. 新電腦發布前檢查

```bash
cd /path/to/ai-km-jiang
bash scripts/check-deploy-env.sh
bash scripts/preflight.sh
```

期望結果：

```text
🟢 DEPLOY ENV PASS
🟢 PREFLIGHT PASS
```

`check-deploy-env.sh` 在 cloudflare 模式檢查 wrangler、dig、Node major、git 身分與 safe-deploy；只有 `PUBLISH_TARGET=vercel` 時才檢查 Vercel CLI。

## 3. 標準更新與發布流程

```bash
cd /path/to/ai-km-jiang
git pull --rebase
bash scripts/check-deploy-env.sh

# 修改明確檔案後，直接用明確路徑發布
bash scripts/publish.sh "本次修改說明" -- courses-data.js courses-render.js
```

`publish.sh` 會自動執行：

1. 取發布鎖（同機排隊）。
2. 部署環境檢查。
3. preflight（0 到 11 共 12 關：環境、資料源與生成檔一致、互聯、雙向連結、sitemap 與 llms、主導覽與 WebMCP、內部連結、版面樣式、秘密掃描、內容 lint、擋板一致性、離線測試）。
4. 明確變更範圍檢查：避免把其他 session 的草稿一起發出去。
5. commit。
6. `git pull --rebase`。
7. push 前秘密掃描。
8. main ＋ publish tag atomic push。
9. C 網 production 部署（`scripts/cloudflare/deploy-production.sh`，經 safe-deploy `--cf`）；部署期間 main 又前進就快轉重部署，最多 4 輪。
10. 比對部署收據的 commit。
11. 用 Cloudflare 權威 NS 解析驗收固定五站與本次動到的文章路徑 HTTP 200，抽驗擋板草稿 404（repo 裡沒有可驗的擋板就印「未驗」）。

生成檔（`scripts/generated-files.json` 列的那些）不要手改；分支上線時由 merge-publish 依同一份清單的 builders 順序重建。

## 4. 回退

- 內容回退：`git revert <commit>` 後重跑 `bash scripts/publish.sh "回退：說明" -- 檔案`。
- 整站退回 Vercel（切換登記的退路，屬重大操作，要江江當輪授權）：`bash scripts/cloudflare/rollback.sh`（預設 dry run，`--execute --approval 退回` 才動 DNS），之後發布要帶 `PUBLISH_TARGET=vercel`。

## 5. 預估耗時

- `bash scripts/check-deploy-env.sh`：約 5 到 20 秒。
- `bash scripts/preflight.sh`：約 1 到 2 分鐘，主要耗在內部連結、秘密掃描與離線測試。
- `bash scripts/publish.sh ...`：約 2 到 5 分鐘，主要耗在 C 網建置上傳與 HTTP 驗收。

第一次設定新電腦的主要耗時點：安裝 Node、wrangler 與登入、safe-deploy 工具路徑確認。這些應該在上課前完成，不要在課堂現場臨時做。

## 6. 常見卡住點

### 只 push 沒發布

症狀：GitHub 有新 commit，但正式站還是舊內容。

處理：不要再只跑 `git push`。回 repo 根目錄跑：

```bash
bash scripts/publish.sh "補發布：說明" -- path1 path2
```

### Node 版本不對

```bash
nvm install
nvm use
bash scripts/check-deploy-env.sh
```

### wrangler 未登入或缺 dig

症狀：`check-deploy-env.sh` 顯示缺少指令 wrangler 或 dig，或部署時 wrangler 要求登入。

處理：`npm i -g wrangler && wrangler login`；Linux 裝 dnsutils。

### safe-deploy 工具找不到

症狀：`SAFE_DEPLOY_TOOL` FAIL。

處理：複製安全部署工具到新電腦，或設定絕對路徑：

```bash
export SAFE_DEPLOY_TOOL="/你的路徑/safe-deploy.sh"
bash scripts/check-deploy-env.sh
```

### repo 有其他 session 的未提交變更

症狀：`publish.sh` 在明確路徑模式列出「未列入本次發布範圍的變更」。

處理：不要硬發。先看官網看板施工掛牌，等對方收工，或請對方交接／stash／commit。

## 7. 上課日前檢查清單

```bash
cd /path/to/ai-km-jiang
git pull --rebase
bash scripts/check-deploy-env.sh
bash scripts/preflight.sh
```

再打開正式頁確認：

```bash
curl -I https://jiangyude.com/
curl -I https://jiangyude.com/courses.html
```

若需要臨場改版，優先使用已驗證可發布的桌機或已通過本 SOP 的筆電。

## 8. Vercel（退場中，觀察期至 2026-11-08）

2026-10-09 前正式站在 Vercel（專案 Jiang_coach / ai-km-jiang，Git 整合自動部署＋別名促轉）。切到 Cloudflare 後 Vercel 仍保留當退路：
`vercel.json` 只對 `migration/cloudflare-20261004` 關閉 Git 部署，push main 仍會觸發 Vercel 建置；`ai-km-jiang.vercel.app` 不再被 publish.sh 促轉（推定停在切換前版本）。
觀察期到 2026-11-08（30 天），到期依切換登記簿驗收後才處置；沒跑過 rollback 演練（drill）不刪 Vercel 專案。

只有在整站退回 Vercel（見第 4 節）之後才需要下面的設定：

```bash
npm i -g vercel
vercel login
vercel link          # 選 Jiang_coach / ai-km-jiang
PUBLISH_TARGET=vercel bash scripts/check-deploy-env.sh
PUBLISH_TARGET=vercel bash scripts/publish.sh "說明" -- 檔案
```

Vercel 模式的 publish.sh：push 觸發 Vercel 從 GitHub 建置 → 等本次 SHA 的 production READY → 三網域促轉到 main 最新 → 驗收。不要手動 `vercel --prod`。

## 2026-09-13 資安修復的部署前置

> 歷史紀錄：本節寫於正式站仍在 Vercel 的時期，文中「Production 與 Preview」「Vercel 官方說明」指當時的 Vercel 環境；C 網的對應環境變數見 `wrangler.toml` 與 `scripts/cloudflare/secrets.py`。

此分支只有本機修復，尚未合併或部署。先執行 `node --test tests/*.cjs`，再依既有發布流程處理候選與正式促轉。

- Production 與 Preview 都要確認 Upstash URL/token 已設定且 pipeline/EVAL 可用；不能透過關掉限流來恢復服務。缺值、逾時或異常回應會停止付費 AI 呼叫，管理登入也會暫停。
- 課堂寬額度已移除（2026-09-14）：學員用自己的手機、也有線上課，沒有共用教室網路；所有頁面同一套每 IP 額度（預設每分鐘 20、每天 100，`MIKA_RATE_PER_MIN`／`MIKA_RATE_PER_DAY`）。課程頁只保留「一則算一次」的計次例外，路徑可假冒，所以不放寬任何額度。上課有人被擋就臨時調高 `MIKA_RATE_PER_DAY`，全站每日／每月上限不動。`MIKA_RATE_PER_MIN_COURSE`、`MIKA_RATE_PER_DAY_COURSE`、`MIKA_COURSE_IPS` 已不再讀取。
- 不明 IP 回 503，不共用匿名限流桶。Vercel 官方說明兩種 forwarding header 都由平台保護；其他既有端點採 x-forwarded-for 並不構成已證實的偽造漏洞。來源：https://vercel.com/docs/headers/request-headers
- 逾時的預扣不退款，避免已執行的計數或付費呼叫被誤判而放行；這可能保守消耗額度，需由管理者查證後調整。

管理登入密碼由站主自訂，不強制長度（2026-09-14 江江拍板：統計後台不是機密，會公開分享）；注意這支也回傳訪客問咪卡的原話。保留每 IP 原子 5 次錯誤上限，未加全站硬鎖，避免陌生人把管理者一起鎖住。不能先比對猜中的密碼並繞過限流，那會讓攻擊者在額度耗盡後繼續用 200／429 差異辨識正確猜測。

密碼文字填入 STATS_PASSWORD；若使用 STATS_PASSWORD_B64，須再對「該密碼文字」做一次 base64 編碼，不能直接把隨機位元組的 base64 當作 B64 設定值。後端會拒絕無法無損還原為 UTF-8 的設定。用隱藏輸入或密碼管理器處理，勿在指令歷史、對話或公開檔案留下實際值。候選站登入成功與錯誤限流均驗收後才促轉。錯誤事件目前只有安全聚合訊號，無法區分輪換來源；需要進階追蹤時另設隱私保存期限與具名責任，不直接增存原始 IP。

補強：聊天四層額度改成一次 EVAL 先檢查全部上限、通過才預留；已拒絕的請求不增全站計數，逾時仍不得盲目退款。IPv6 限流以 /64 共用桶，IPv4-mapped IPv6 對應 IPv4。候選部署須核對 IPv4／IPv6 header；缺值維持停止付費，不設繞過開關。正式前用真實 Upstash 驗 EVAL 相容，並由管理者查證實際用量後才調整計數，不提供匿名重置。來源：https://redis.io/docs/latest/develop/programmability/eval-intro/ 與 https://upstash.com/docs/redis/features/restapi

## 會員系統（2026-10-19 第一版，分支 wt/member，尚未部署）

Google 登入、文章留言、分級內容、管理後台。只在 Cloudflare Pages Functions 上運作（`functions/member/`、`functions/member-content/`、`functions/admin/members/`），Vercel 版沒有對應端點。共用程式在 `cloudflare/member-lib.mjs`，分級設定表在 `cloudflare/member-tiers.mjs`（中文名、包含關係、各級內容、傳送門商品對應，只改這一檔）。

### 環境變數（Production 與 Preview 都要設，值一律用隱藏輸入，不寫進 repo、指令歷史或對話）

| 變數 | 用途 | 備註 |
|---|---|---|
| `GOOGLE_CLIENT_ID` | Google 登入的 OAuth 用戶端 ID，驗 ID token 的 aud | 這個值會出現在網頁上，本來就是公開的 |
| `MEMBER_SESSION_SECRET` | 簽 session cookie 的 HMAC 金鑰 | 64 字隨機字串，少於 32 字系統會拒絕登入。可用 `openssl rand -hex 32` 產生。換掉等於全部會員登出 |
| `MEMBER_ALLOW_GUEST_COMMENT` | 設 `1` 時未登入訪客可只填暱稱留言，一律進待審 | 預設不設＝關閉 |
| `PORTALY_WEBHOOK_SECRET` | 傳送門 webhook 的 HMAC 驗證金鑰 | 至少 16 字；格式待查證，見下 |
| `STATS_PASSWORD_B64`／`STATS_PASSWORD` | 管理後台密碼 | 與站長儀表板共用，不另設 |
| `UPSTASH_REDIS_REST_URL`／`UPSTASH_REDIS_REST_TOKEN` | 儲存 | 沿用既有設定（備援 `KV_REST_API_*`） |

正式網域一樣要 `CF_SITE_MODE=production` 與 `CF_PROD_KEYS=original` 才會寫正式鍵，否則回 503；候選網域自動寫 `cf-preview-20261004:member:*` 隔離鍵。

### Google Cloud Console 設定步驟（江江做）

1. 到 Google Cloud Console，選或建一個專案。
2. 「API 和服務」→「OAuth 同意畫面」：使用者類型選「外部」，填應用程式名稱（例：江江教練官網）、支援 Email、授權網域填 `jiangyude.com`，範圍只要預設的 email、profile、openid，發布狀態改成「正式版」。
3. 「API 和服務」→「憑證」→「建立憑證」→「OAuth 用戶端 ID」，應用程式類型選「網頁應用程式」。
4. 「已授權的 JavaScript 來源」填：`https://jiangyude.com`、`https://www.jiangyude.com`，以及要測試的候選網域（`https://<專案名>.pages.dev` 與當次候選的 `https://<hash>.<專案名>.pages.dev`）。重新導向 URI 不用填（用彈出視窗模式）。
5. 建立後把「用戶端 ID」設成 `GOOGLE_CLIENT_ID`（Production 與 Preview）。用戶端密鑰本系統用不到，不要設進任何地方。

### 資料鍵（全部在 `member:` 前綴下，預覽站另加 `cf-preview-20261004:`）

- `member:u:<Google sub>`：會員記錄 JSON（email、name、picture、nick、tier 固定 ["free"]、emailTrusted、createdAt、lastLogin）。付費等級**不存在這裡**（2026-10-20 改，見下方「等級與信箱」）；登入與改暱稱都用 Lua 原子寫入，不會互相蓋掉
- `member:email:<email 小寫>` → 最近一次用這個信箱登入的 sub；`member:esubs:<email 小寫>` 用過這個信箱的所有 sub；`member:users` 全部 sub 的 set
- `member:sess:<id>` → `sub|撤銷世代`（30 天到期，刪掉即撤銷）；`member:usess:<sub>` 該會員的 session id set；`member:ugen:<sub>` 撤銷世代，強制登出時加一，舊世代的 session 全部失效
- `member:grant:<email 小寫>`：付費等級的唯一正本（可在登入前先登記）；`member:grantees` 有登記的 email set
- `member:vemail:<sub>`：站長在後台「確認信箱」時記下的信箱；信箱之後改了自動失效

### 等級與信箱（2026-10-20，Codex 第 3 輪跨家審後修）

- 等級每次都即時讀 `grant:<email>`，撤銷只要從授權表移除就立即生效，不會被同時發生的登入寫回。
- 預登記要「現在擁有這個信箱」才承接。自動承接只有兩種：gmail.com／googlemail.com，或 Google token 帶 `hd` 且等於信箱網域（Workspace）。
- 其他信箱（例如公司自架信箱、Yahoo、Outlook 綁的 Google 帳號）登入後只有免費等級，後台會員清單顯示「未確認」與「待確認才生效」的等級。站長核對訂單（例如請對方用該信箱回信）後按「確認信箱」才承接。原因：Google 說明第三方信箱的 email_verified 只代表當初驗證過，信箱之後可能換人。
- Google token 的 exp 容許 30 秒時鐘誤差；azp 有帶就必須等於本站 Client ID。

- `member:c:<文章路徑>`：留言 list，每筆 {id, sub, nick, text, ts, status, parent, guest}；`member:cpages` 有留言的文章 set
- `member:webhook:log`：傳送門 webhook 紀錄（最近 200 筆）
- `member:rl:*`、`member:admin:auth:*`：限流計數

### Portaly webhook 格式待查證

`POST /member/webhook/portaly` 目前只是骨架。Portaly 實際的 webhook 欄位、簽章標頭名稱、簽章算法都**尚未查證**。程式先假設：標頭 `X-Portaly-Signature`＝HMAC-SHA256(PORTALY_WEBHOOK_SECRET, 原始 body) 的十六進位，body 頂層有 `email` 與 `product_id`，且 product_id 在 `cloudflare/member-tiers.mjs` 的 `PORTALY_PRODUCTS` 對應表內（目前是空的）。不符合的一律只記到 `member:webhook:log` 回 202，不寫授權；簽章不符只記標頭名稱與大小。查到正式格式後改程式與對應表，再開 webhook。在那之前用管理後台 `/admin/members/` 手動補登記。

### 上線前驗收（候選站）

`node tests/2026-10-19-1534-member.test.mjs` 全綠後，候選站實測：Google 登入、改暱稱、留言、登出、後台補登記後開 `/member-content/course-3000/`、後台錯密碼限流。正式 Upstash 要確認 EVAL 可用 `cjson`（留言審核用）。

### 已知限制

- repo 是公開的：`member-content/` 底下的檔案在 GitHub 上任何人都讀得到，守門只保護官網網址。真正的付費教材不要放進這個 repo。
- Vercel 版沒有守門，若仍有人對 Vercel 發布，`/member-content/` 會變成公開靜態頁。

## 2026-10-19 安全審查修補（分支 wt/security）

本機修補，尚未合併或部署。合併後依既有候選與正式促轉流程處理。

- search-log 的 GET 已移除，讀搜尋紀錄一律走 /stats.html（stats-admin，有錯誤次數限流）。`MIKA_CHAT_READ_TOKEN` 不再能讀搜尋紀錄，只剩 mika-chat-log 的 GET 在用，現在也有每網段 15 分鐘錯 5 次的限流。
- 寫入端點的限流全部改成原子 Lua（view、search-log、mika-chat-log），以網段計（IPv6 取 /64），限流故障時不寫入、回 503。正式前用真實 Upstash 驗新 EVAL 相容（腳本只用 GET、INCR、TTL、EXPIRE、EXISTS）。
- 咪卡的回覆改由 /api/mika-chat 伺服器端寫紀錄，/api/mika-chat-log 拒收 role=bot。舊版 widget 快取期間會出現 bot 被拒的 400，屬預期。
- 咪卡 pageText 計入額度：`units＝問題計次＋ceil(頁面字數÷3000)`，可用 `MIKA_PAGE_CHARS_PER_UNIT` 調整。上課時若學員被擋，先調這個或 `MIKA_RATE_PER_DAY`。
- CORS 只對 jiangyude.com、www.jiangyude.com 與 ai-km-jiang-cf-20261004.pages.dev（含子網域）回標頭；/api/stats 維持全開。若有其他網站（例如 G 網名片）跨網域打 /api/view，會被瀏覽器擋下，要先把該網域加進 `lib/2026-09-13-0910-client-network.js` 與 `cloudflare/runtime.mjs` 兩處白名單。
- 安全標頭：X-Frame-Options DENY（scorecard 評量表例外）、HSTS、Permissions-Policy；CSP 目前是 Report-Only，觀察瀏覽器主控台沒有誤報後再改強制。
- tests/cloudflare-migration.mjs 已跟上（2026-10-19 整合）：假 Redis 依腳本內容分辨 AUTH、RATE、view 新鍵配額、咪卡四層額度四種 Lua，search-log 的 GET 改測 405；cloudflare-key-parity.mjs 的 view 比照 functions/api/view.js 帶 VIEW_KNOWN_URLS。本機以 wrangler 4.151.1 實跑 migration 18 項、key-parity 6 支全綠。
- 已知缺口：build.mjs 只對 search-log、mika-chat-log 的紀錄注入 `source: cloudflare`，mika-chat 伺服器端寫的咪卡回覆（role=bot）沒有來源欄位，C 網與 Vercel 寫的回覆在資料上分不出來。要補就改 build.mjs 第 81 行的注入範圍，並同步 key-parity 測試。

待辦：
- [ ] 待江江確認學員同意：courses/2026-08-danhai-public-art/showcase/ 與 courses/mobile-ai-creation-workshop/ 公開列出學員全名，已先改 noindex, nofollow；確認每位學員同意具名公開前不要改回 index。sitemap.xml 已由 build-sitemap.mjs 依 noindex 移除這兩頁（2026-10-19 整合時重建）。
- [ ] Vercel 退場觀察期至 2026-11-08。vercel.json 已把 main 的 Git 自動部署關掉（其他分支仍會產生 preview）。到期前先拔掉 Vercel 環境變數中的寫入金鑰（`KV_REST_API_TOKEN`／`UPSTASH_REDIS_REST_TOKEN`、`MIKA_LLM_API_KEY`、`ANTHROPIC_API_KEY`），舊站就無法再寫入正式 Upstash 或呼叫付費模型；到期驗收後再停用 Vercel 專案的 Git 整合。這屬切換登記簿管理範圍，記得在本地主庫 cutover.py 登記。
