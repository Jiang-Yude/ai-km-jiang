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
