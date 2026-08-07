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
