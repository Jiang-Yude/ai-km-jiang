# 江江教練官網 v0.8 學習地圖與 SEO/GEO 重整

正式站：https://ai-km-jiang.vercel.app/

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
└── README.md
```

## v0.8 資訊架構

- 首頁：總入口，放最近課程與五個主要入口。
- 課程預告：還沒上課、即將上課的場次。
- 課後簡報：上完課後可閱讀或可實作的內容；有封面的課程卡要顯示封面。
- 學習地圖：把實際課後簡報、課程、教學文章與技能包串成任務型學習路徑。
- Skills 下載：Claude Code Skills 與工具入口。
- 合作案例：已完成產品、報告書、互動系統與去敏感示範範本。提案與想法先標示為整理中，不列入已完成案例。

Phase 1 不新增文章頁。文章先保留在課後簡報頁的方格子與 Threads 入口，並由學習地圖負責串進路徑；等內容量與分類穩定後再獨立成 `articles.html`。

## SEO / GEO 維護

每次新增主要頁面或重要內容時，同步檢查：

1. `sitemap.xml` 是否有新頁與正確 lastmod。
2. `llms.txt` 是否更新核心頁、學習路徑、未來課程。
3. `llms-full.txt` 是否和公開頁上的真實內容一致。
4. `site-index.json` 是否補上新內容與四維標籤。
5. 公開學習頁不要放 `noindex`；工具頁如 `tuner.html` 可以保留 noindex。

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
   https://ai-km-jiang.vercel.app/images/og/<slug>.jpg
   ```
   （`og:title` 本來就帶文章標題，不用改。）
4. `vercel --prod --yes` → `git push`。

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

存檔 → `git push` → 30 秒後線上自動更新。

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
3. `cd` 進來 `git add courses-data.js && git commit -m "新增課程：XX" && git push`

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

```bash
git add . && git commit -m "..." && git push
```

GitHub Pages 自動部署（30-60 秒）。
