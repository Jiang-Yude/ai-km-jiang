# 新電腦部署官網 SOP

本 repo 是江江教練官網 `ai-km-jiang`。正式站：<https://jiangyude.com/>。

目的：新筆電從零 clone、檢查、更新、發布時，不再靠口頭記憶，也不要只 `git push` 以為已上線。

## 0. 重要結論

- 這是靜態站：目前沒有 `package.json`，發布不需要 `npm install` 或 `node_modules`。
- Node 版本固定在 `.nvmrc`：Node 22。
- 唯一正式發布入口是：`bash scripts/publish.sh "本次修改說明" -- path1 path2`。
- 不要用裸 `git push` 代替發布；`git push` 只更新 GitHub，不等於 Vercel production 已切到新內容。
- 不要手動 `vercel --prod`；本 repo 的 `publish.sh` 會走安全部署、候選驗收、正式別名切換與失敗回退。

## 1. 新電腦一次性安裝

```bash
# 1) 安裝 Node 22（若有 nvm）
nvm install
nvm use

# 2) 安裝 Vercel CLI（若尚未安裝）
npm i -g vercel

# 3) 登入 Vercel
vercel login

# 4) clone repo
git clone https://github.com/Jiang-Yude/ai-km-jiang.git
cd ai-km-jiang

# 5) 設定 Git 身分，避免本機 hostname email 造成 Vercel/GitHub 權限問題
git config user.name "Jiang Yude"
git config user.email "130630081+Jiang-Yude@users.noreply.github.com"

# 6) 綁定品質閘門
git config core.hooksPath scripts/git-hooks

# 7) 連到 Vercel 專案
vercel link
# 選 Jiang_coach / ai-km-jiang
```

若安全部署工具不在預設路徑，先設定：

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

若 `check-deploy-env.sh` 顯示 Vercel 未登入、缺 `.vercel/project.json`、Node major 不對、safe-deploy 找不到，先修完再發布。

## 3. 標準更新與發布流程

```bash
cd /path/to/ai-km-jiang
git pull --rebase
bash scripts/check-deploy-env.sh

# 修改明確檔案後，直接用明確路徑發布
bash scripts/publish.sh "本次修改說明" -- courses-data.js courses-render.js
```

`publish.sh` 會自動執行：

1. 部署環境檢查。
2. preflight：站點索引、雙語導覽、內部連結、秘密掃描、擋板一致性。
3. 明確變更範圍檢查：避免把其他 session 的草稿一起發出去。
4. commit。
5. `git pull --rebase`。
6. push 前秘密掃描。
7. main + publish tag atomic push。
8. safe-deploy 候選部署與 HTTP 驗收。
9. 切 `jiangyude.com` 正式別名；失敗時回退。

## 4. 預估耗時

在已登入 Vercel、safe-deploy 工具存在、repo 乾淨的電腦上：

- `bash scripts/check-deploy-env.sh`：約 5–20 秒，主要耗在 `vercel whoami`。
- `bash scripts/preflight.sh`：約 30–90 秒，主要耗在內部連結與秘密掃描。
- `bash scripts/publish.sh ...`：約 2–5 分鐘，主要耗在 Vercel 候選部署與 HTTP 驗收。

若是第一次設定新電腦，主要耗時點通常是：安裝 Node/Vercel CLI、Vercel login、`vercel link`、safe-deploy 工具路徑確認。這些應該在上課前完成，不要在課堂現場臨時做。

## 5. 常見卡住點

### 只 push 沒發布

症狀：GitHub 有新 commit，但正式站還是舊內容。

處理：不要再只跑 `git push`。回 repo 根目錄跑：

```bash
bash scripts/publish.sh "補發布：說明" -- path1 path2
```

### Node 版本不對

症狀：腳本語法或內建 API 行為不一致。

處理：

```bash
nvm install
nvm use
bash scripts/check-deploy-env.sh
```

### Vercel 未登入或沒 link

症狀：`check-deploy-env.sh` 顯示 Vercel login 或 `.vercel/project.json` FAIL。

處理：

```bash
vercel login
vercel link
bash scripts/check-deploy-env.sh
```

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

## 6. 上課日前檢查清單

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

## 2026-09-13 資安修復的部署前置

此分支只有本機修復，尚未合併或部署。先執行 `node --test tests/*.cjs`，再依既有發布流程處理候選與正式促轉。

- Production 與 Preview 都要確認 Upstash URL/token 已設定且 pipeline/EVAL 可用；不能透過關掉限流來恢復服務。缺值、逾時或異常回應會停止付費 AI 呼叫，管理登入也會暫停。
- 課堂寬額度已移除（2026-09-14）：學員用自己的手機、也有線上課，沒有共用教室網路；所有頁面同一套每 IP 額度（預設每分鐘 20、每天 100，`MIKA_RATE_PER_MIN`／`MIKA_RATE_PER_DAY`）。課程頁只保留「一則算一次」的計次例外，路徑可假冒，所以不放寬任何額度。上課有人被擋就臨時調高 `MIKA_RATE_PER_DAY`，全站每日／每月上限不動。`MIKA_RATE_PER_MIN_COURSE`、`MIKA_RATE_PER_DAY_COURSE`、`MIKA_COURSE_IPS` 已不再讀取。
- 不明 IP 回 503，不共用匿名限流桶。Vercel 官方說明兩種 forwarding header 都由平台保護；其他既有端點採 x-forwarded-for 並不構成已證實的偽造漏洞。來源：https://vercel.com/docs/headers/request-headers
- 逾時的預扣不退款，避免已執行的計數或付費呼叫被誤判而放行；這可能保守消耗額度，需由管理者查證後調整。

管理登入密碼由站主自訂，不強制長度（2026-09-14 江江拍板：統計後台不是機密，會公開分享）；注意這支也回傳訪客問咪卡的原話。保留每 IP 原子 5 次錯誤上限，未加全站硬鎖，避免陌生人把管理者一起鎖住。不能先比對猜中的密碼並繞過限流，那會讓攻擊者在額度耗盡後繼續用 200／429 差異辨識正確猜測。

密碼文字填入 STATS_PASSWORD；若使用 STATS_PASSWORD_B64，須再對「該密碼文字」做一次 base64 編碼，不能直接把隨機位元組的 base64 當作 B64 設定值。後端會拒絕無法無損還原為 UTF-8 的設定。用隱藏輸入或密碼管理器處理，勿在指令歷史、對話或公開檔案留下實際值。候選站登入成功與錯誤限流均驗收後才促轉。錯誤事件目前只有安全聚合訊號，無法區分輪換來源；需要進階追蹤時另設隱私保存期限與具名責任，不直接增存原始 IP。

補強：聊天四層額度改成一次 EVAL 先檢查全部上限、通過才預留；已拒絕的請求不增全站計數，逾時仍不得盲目退款。IPv6 限流以 /64 共用桶，IPv4-mapped IPv6 對應 IPv4。候選部署須核對 IPv4／IPv6 header；缺值維持停止付費，不設繞過開關。正式前用真實 Upstash 驗 EVAL 相容，並由管理者查證實際用量後才調整計數，不提供匿名重置。來源：https://redis.io/docs/latest/develop/programmability/eval-intro/ 與 https://upstash.com/docs/redis/features/restapi

## 2026-10-19 安全審查修補（分支 wt/security）

本機修補，尚未合併或部署。合併後依既有候選與正式促轉流程處理。

- search-log 的 GET 已移除，讀搜尋紀錄一律走 /stats.html（stats-admin，有錯誤次數限流）。`MIKA_CHAT_READ_TOKEN` 不再能讀搜尋紀錄，只剩 mika-chat-log 的 GET 在用，現在也有每網段 15 分鐘錯 5 次的限流。
- 寫入端點的限流全部改成原子 Lua（view、search-log、mika-chat-log），以網段計（IPv6 取 /64），限流故障時不寫入、回 503。正式前用真實 Upstash 驗新 EVAL 相容（腳本只用 GET、INCR、TTL、EXPIRE、EXISTS）。
- 咪卡的回覆改由 /api/mika-chat 伺服器端寫紀錄，/api/mika-chat-log 拒收 role=bot。舊版 widget 快取期間會出現 bot 被拒的 400，屬預期。
- 咪卡 pageText 計入額度：`units＝問題計次＋ceil(頁面字數÷3000)`，可用 `MIKA_PAGE_CHARS_PER_UNIT` 調整。上課時若學員被擋，先調這個或 `MIKA_RATE_PER_DAY`。
- CORS 只對 jiangyude.com、www.jiangyude.com 與 ai-km-jiang-cf-20261004.pages.dev（含子網域）回標頭；/api/stats 維持全開。若有其他網站（例如 G 網名片）跨網域打 /api/view，會被瀏覽器擋下，要先把該網域加進 `lib/2026-09-13-0910-client-network.js` 與 `cloudflare/runtime.mjs` 兩處白名單。
- 安全標頭：X-Frame-Options DENY（scorecard 評量表例外）、HSTS、Permissions-Policy；CSP 目前是 Report-Only，觀察瀏覽器主控台沒有誤報後再改強制。
- tests/cloudflare-migration.mjs 尚未跟上：第 63 行仍測 search-log 的 GET，假 Redis 的 EVAL 只認舊的兩種腳本，要補上 RATE_SCRIPT 與 view 新鍵配額的模擬才跑得過。

待辦：
- [ ] 待江江確認學員同意：courses/2026-08-danhai-public-art/showcase/ 與 courses/mobile-ai-creation-workshop/ 公開列出學員全名，已先改 noindex, nofollow；確認每位學員同意具名公開前不要改回 index。sitemap.xml 仍列著其中一頁，由生成器那邊一併處理。
- [ ] Vercel 退場觀察期至 2026-11-08。vercel.json 已把 main 的 Git 自動部署關掉（其他分支仍會產生 preview）。到期前先拔掉 Vercel 環境變數中的寫入金鑰（`KV_REST_API_TOKEN`／`UPSTASH_REDIS_REST_TOKEN`、`MIKA_LLM_API_KEY`、`ANTHROPIC_API_KEY`），舊站就無法再寫入正式 Upstash 或呼叫付費模型；到期驗收後再停用 Vercel 專案的 Git 整合。這屬切換登記簿管理範圍，記得在本地主庫 cutover.py 登記。
