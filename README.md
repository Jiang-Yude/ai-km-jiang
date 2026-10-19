# 江江教練官網 v0.8 學習地圖與 SEO/GEO 重整

正式站：https://jiangyude.com/

本版從 v0.7 複製成獨立工作副本，主改版目標是把「課程預告、課後簡報、學習地圖、Skills、合作案例」重新分流，並新增公開索引與 GEO 友善檔案。

## 檔案結構

```
.
├── index.html          # 首頁（hero + 最近的課 + 五入口 + 自介）
├── learn.html          # 學習地圖（實際簡報、課程、教學文章與技能包串成路徑）
├── courses.html        # 課程預告子頁（未來 + 過去全部）
├── resources.html      # 課後簡報子頁（已上課簡報、講義、範例網頁、文章）
├── skills.html         # Skills 下載子頁（含標籤過濾）
├── cases.html          # 合作案例（已完成與可公開示範）
├── site-index.json     # 搜尋、標籤、知識圖譜的公開索引基礎
├── llms.txt            # AI 搜尋摘要
├── llms-full.txt       # AI 搜尋完整摘要
├── sitemap.xml         # 搜尋引擎 sitemap
├── tuner.html          # 色彩 spotlight 調校工具
├── styles.css          # 全站共用樣式
├── courses-data.js     # 課程資料中心（唯一資料源）
├── courses-render.js   # 首頁 + 子頁的課程渲染邏輯
├── spotlight.js        # 滑鼠跟隨光暈
├── robots.txt          # 爬蟲規則
├── 404.html            # 自訂 404（2026-10-19 起；連結一律絕對路徑、noindex）
└── README.md
```

## 會員系統（2026-10-19 第一版）

Google 登入、文章留言、分級內容與管理後台，細節與環境變數見 DEPLOYMENT.md「會員系統」。會員中心在 `/member/`、後台在 `/admin/members/`。首頁與導覽列的會員入口還沒放，等江江決定放哪。

## v0.8 資訊架構

- 首頁：總入口，放最近課程與五個主要入口。
- 課程預告：還沒上課、即將上課的場次。
- 課後簡報：上完課後可閱讀或可實作的內容；有封面的課程卡要顯示封面。
- 學習地圖：把實際課後簡報、課程、教學文章與技能包串成任務型學習路徑。
- Skills 下載：Claude Code Skills 與工具入口。
- 合作案例：已完成產品、報告書、互動系統與去敏感示範範本。提案與想法先標示為整理中，不列入已完成案例。

Phase 1 不新增文章頁。文章先保留在課後簡報頁的方格子與 Threads 入口，並由學習地圖負責串進路徑；等內容量與分類穩定後再獨立成 `articles.html`。

## SEO / GEO 維護

2026-10-19 起，文章相關的 SEO／GEO 欄位都由 article.json 生成，**不要手補**（見下一節「生成器與生成檔」）。
人工仍要顧的只剩：

1. `sitemap.xml` 的非文章頁（根目錄頁、課程頁）：新頁要手加一筆；noindex 頁會被生成器自動拿掉。
2. `llms.txt`、`llms-full.txt` 的手寫段（接待協議、服務、課程判斷規則、引用偏好）：和公開頁上的真實內容一致。文章段是生成的。
3. `site-index.json` 是生成檔（build-site-index.mjs），手改無效；新內容改它的來源（article.json、courses-data.js、skills.html、site-manual-entries.json）。
4. 公開學習頁不要放 `noindex`；工具頁如 `tuner.html` 可以保留 noindex。

## 生成器與生成檔（2026-10-19 整理）

生成檔清單的唯一來源是 `scripts/generated-files.json`：merge-publish.sh、pre-commit、agent-claim-check.sh、check-branch-generated.mjs 都讀它（`node scripts/generated-files.mjs list` 可列出），重建順序也寫在同一份的 `builders`。

| 生成器 | 產出 | 來源 | preflight 怎麼擋 |
|---|---|---|---|
| build-articles-data.mjs | articles-data.js | article.json | `--check`（第 1 關） |
| build-site-index.mjs | site-index.json | articles-data.js 等 | 重跑（第 1 關） |
| build-article-keywords.mjs | article-keywords.js | 文章內文 | 重跑後有 diff 就擋（第 1 關） |
| build-article-head.mjs | 文章頁 head 的 title、og、twitter、canonical、Article＋BreadcrumbList JSON-LD、hero 下的可見日期行 | article.json（職稱讀 profile.json） | `--check` 與 check-article-dates.mjs（第 1 關） |
| build-course-jsonld.mjs | 課程頁 Course JSON-LD（`id="course-jsonld"`） | courses-data.js | `--check`（第 4 關） |
| build-sitemap.mjs | sitemap.xml 文章段、lastmod、noindex 移除、privacy 等固定頁 | article.json、頁面 robots meta | `--check` 與 check-sitemap-coverage（第 4 關） |
| build-llms.mjs | llms.txt、llms-full.txt 的文章段 | article.json、scripts/llms-article-notes.json | `--check` 與 check-llms-coverage（驗網址與標題，第 4 關） |
| build-static-lists.mjs | articles.html、courses.html 的 noscript 全清單 | article.json、courses-data.js | `--check`（第 4 關） |

改標題、改日期：只改 article.json，再跑 `node scripts/build-article-head.mjs --only=<slug>`（本機看效果）；上線時 merge-publish 會全部重建。

## 人工熱區：search-aliases.js

`search-aliases.js`（站內搜尋、咪卡、WebMCP 共用的口語別名庫）**仍是手寫檔**，也是目前並行施工最常撞衝突的檔（新文章幾乎都要補一條）。排隊上線撞到它時，merge-publish 會停下要人判斷（exit 20），照兩邊都保留的原則手動合併。

為什麼沒有拆成 `search-aliases.json`＋一行載入器（2026-10-19 評估）：

1. 讀它的地方要「同步」拿到 `window.SEARCH_ALIASES`：search.js、articles-render.js、webmcp-tools.js 在載入當下就用。改成執行時 fetch JSON 會變非同步，三支都要改寫等待邏輯。
2. 後端 `api/mika-chat.js` 與 `scripts/cloudflare/build.mjs` 把 `search-aliases.js` 當 JavaScript 原始碼讀進 vm 執行，載入器在那裡不會執行，咪卡會拿到空別名。
3. 就算改成「手寫 JSON＋生成 JS」，每篇新文章仍要在同一個 JSON 檔加一行，衝突只是換檔案，不會消失。

真正能消掉衝突的做法是每篇的別名搬進自己的 `article.json`（例如 `aliases` 欄位），由生成器合併出 search-aliases.js、非文章的別名留一個小手寫檔；這要動 191 份 article.json 與 check-index-coverage，另案處理。

## 深度文章資料源（一篇一檔，2026-09-06 起）

- **來源（唯一真相）**：每篇文章自己資料夾裡的 `articles/<id>/article.json`（趨勢文在 `ai-trends/<id>/article.json`），加上受控標籤清單 `articles-tags.json`。範本：`_templates/article.example.json`。
- **生成檔**：`articles-data.js`（瀏覽器與 `related-render.js`、`articles-render.js` 讀的那個）由 `node scripts/build-articles-data.mjs` 合併產生，**不要手改**。順序依（updated 或 date）新到舊，與總覽頁顯示一致。
- **為什麼拆**：舊的單檔每篇上線都要 append 一筆，是多個 session 並行施工時唯一每次都撞的共享熱點（2026-09-05 圖譜工程 v2 分析）。拆開後各桌只動自己資料夾；`merge-publish.sh` 上線時統一重建，生成檔衝突自動收 main 版再重建。
- **三種指令**：`--check` 只比對不寫（preflight 第 1 關會跑，不一致就擋）；不帶參數＝重建，偵測到有人直接手改 `articles-data.js` 會停下列出是哪幾筆；`--adopt` 把那些手改回寫成 `article.json` 再重建（遷移與救援用）；`--force` 丟掉手改。
- **被 `.vercelignore` 整資料夾擋著的文章**（`articles/<id>/`）生成時自動略過並印出，索引不會宣告一個不會上線的頁面。

## 文章分享封面（OG 圖）機制

文章分享到 Threads/FB 時，預覽圖（`og:image`）若沒設好，會退回直式人像 `images/intro-jiang.png`，被平台裁成「只剩脖子」的醜預覽。

**解法：每篇文章用自己的 hero 標題卡當分享封面。** hero 區（eyebrow＋大標＋副標，暖色拿鐵底）本身就是一張現成的橫式封面，自動截下來即可，不必每篇畫插畫。

### 新文章上線時的固定步驟

1. 建好 `articles/<slug>/index.html`（hero 文字填好）。
2. 截封面：
   ```
   node scripts/og-shot.mjs <slug>
   ```
   產出 `images/og/<slug>.jpg`（1200×630 @2x）。
3. 把該篇 `<head>` 的 `og:image` 與 `twitter:image` 指到：
   ```
   https://jiangyude.com/images/og/<slug>.jpg
   ```
   （`og:title` 本來就帶文章標題，不用改。）
4. 先 `git add --` 本篇新增／修改的明確檔案，再執行 `bash scripts/publish.sh "新增文章：<slug>"`；也可用 `bash scripts/publish.sh "新增文章：<slug>" -- path1 path2`。腳本只允許 `main` 且 upstream 必須是 `origin/main`，會先做 preflight 與兩次秘密掃描，再經共用安全部署工具上線並做五個端點的 HTTP 可達性驗收。

可一次傳多個 slug 批次截。需要全域 `playwright`（`npm i -g playwright && playwright install chromium`）。

> 注意：平台會快取 OG 圖。換圖後若預覽還是舊的，把連結刪掉重貼一次通常就會抓新圖。

## 課程同步機制

### 新增課程
**改 `courses-data.js` 一個檔，首頁跟子頁自動同步**。

加一個 object 到 `window.COURSES` 陣列尾：

```js
{
  id: "2026-09-15-new-class",
  date: "2026-09-15",          // YYYY-MM-DD（必填）
  time: "19:00",                // HH:MM 或 null
  duration_min: 90,
  title: "新課標題",
  type: "free",                 // free / paid / external / podcast
  type_label: "免費線上講座",
  summary: "一句介紹",
  venue: "線上 Zoom",
  host: "江江教練",
  status_tags: ["申請制"],      // 選填
  register_url: null,
  detail_url: null,             // 之後做單堂內頁才填
  tags: ["主題", "標籤"],
  materials: []                 // 之後放簡報、技能包
}
```

存檔後執行 `bash scripts/publish.sh "新增課程：XX" -- courses-data.js`；不要只做 `git push`，也不要手動 `wrangler pages deploy` 或 `vercel --prod`。課程頁的 Course JSON-LD 與 courses.html 的靜態清單會由生成器從 courses-data.js 重建。

### 自動顯示邏輯
- **首頁「最近的課」**：自動取 `date >= 今天` 的前 3 場
- **courses.html 子頁**：
  - 上半「未來的課」：未來課程按月份分區（升序）
  - 下半「過去的紀錄」：過去課程按月份分區（降序，最近的在前）
- **6/1 之後 5 月的課自動從首頁下架**，但保留在子頁「過去的紀錄」區

### 「上課程看板：XX」觸發詞（標準流程）
雷哥說「上課程看板：5/23 講師 Agent 工作流」→ AI 同步三處：
1. 改 `00 工作台/課程看板.md` 加卡片
2. 改本資料夾的 `courses-data.js` 加 object
3. `cd` 進來執行 `bash scripts/publish.sh "新增課程：XX" -- courses-data.js`

## 配色調整

開 `tuner.html` 滑桿調好 → 複製 CSS → 貼進 `styles.css` 的 `:root` 區塊：

```css
--sp-shadow: hsla(...);
--sp-shadow-edge: hsla(...);
--sp-card-shadow: hsla(...);
--sp-radius: ...px;
--sp-card-radius: ...px;
```

## 部署

完整新電腦 SOP 見 [`DEPLOYMENT.md`](DEPLOYMENT.md)（部署現況的正本）。

現況（2026-10-09 起）：正式站 jiangyude.com 由 **Cloudflare Pages** 提供（專案 `ai-km-jiang-cf-20261004`），`scripts/publish.sh` 預設 `PUBLISH_TARGET=cloudflare`。Vercel 是舊系統，**退場中，觀察期至 2026-11-08**，只在整站退回時使用（見 DEPLOYMENT.md 第 8 節）。

本 repo 目前是靜態站，沒有 `package.json`；一般發布不需要 `npm install` 或重建 `node_modules`。Node 版本用 `.nvmrc` 固定在 22。

發布前先跑：

```bash
bash scripts/check-deploy-env.sh
bash scripts/preflight.sh
```

唯一正式發布入口：

```bash
git add -- 本次明確檔案
bash scripts/publish.sh "本次修改說明"

# 或讓腳本只加入列出的明確路徑（推薦，避免夾帶其他 session 變更）
bash scripts/publish.sh "本次修改說明" -- path1 path2
```

腳本先取發布鎖與跑部署環境檢查，鎖定 `main` 且要求 upstream＝`origin/main`，再依序執行：官網 preflight → 驗明確檔案範圍 → 秘密掃描 → commit → `git pull --rebase` → 再掃描 → main 明確 refspec＋tag atomic push → 從本機乾淨工作樹建置並經共用 `safe-deploy.sh --cf` 推 C 網 production（部署期間 main 前進就快轉重部署，最多 4 輪）→ 比對部署收據的 commit → 用 Cloudflare 權威 NS 解析驗收固定五站與本次文章路徑 HTTP 200、抽驗擋板草稿 404。驗收失敗時回退方式是 `git revert` 後重跑 publish.sh；整站退回 Vercel 用 `scripts/cloudflare/rollback.sh`（要江江當輪授權）。不要手動執行 `wrangler pages deploy` 或 `vercel --prod`，也不要用裸 `git push` 代替完整發布（push 不會觸發 C 網部署）。

秘密掃描刻意檢查 repo 的實際工作樹，不因 `.gitignore` 或 `.vercelignore` 放行真值；因此 repo 內任何 `.env*` 真實憑證都會讓發布停止。這是安全閘門，不是掃描器故障，禁止繞過。憑證應放在 Cloudflare Pages 專案的環境變數（退場中的 Vercel 專案同理），再經明確授權移出 repo 工作樹；不可把值貼進對話、README 或 commit。

### 離線測試

`bash scripts/test-all.sh`（preflight 第 11 關會跑）：quota 單元測試與 cutover 離線模擬一律跑；redis 測試要設 `REDIS_SERVER`、`REDIS_CLI`；cloudflare key-parity 與 migration 要 PATH 上有 wrangler（`SKIP_CLOUDFLARE_TESTS=1` 可強制跳過）。缺條件的會印出略過原因，不算失敗。
