/* ─── 江江教練 課程資料中心 ───
 * 唯一資料源，首頁「最近的課」跟 courses.html 都讀這份
 *
 * ─── 欄位 ───
 *   id           - 唯一識別碼，格式 YYYY-MM-DD-slug
 *   date         - YYYY-MM-DD（必填）
 *   time         - HH:MM 或 null
 *   duration_min - 分鐘數或 null
 *   title        - 課程標題
 *   type_label   - badge 上的中文標籤（保留給未來用）
 *   image        - 封面圖 4:5 直幅（"images/courses/xxx.jpg"）或 null
 *   venue_mode   - 場域：online / physical / hybrid / podcast / tbd
 *   host         - 講師
 *   tags         - 主題標籤（內部分類用，不顯示）
 *   summary      - 一段話介紹（給未來內頁用，卡片不顯示）
 *   detail_url   - 該堂課的內頁 URL（之後做才填）
 *   materials    - 簡報、技能包等延伸資源（之後做才填）
 *
 *   phase        - 課程階段：
 *                  不填或 "scheduled" = 依日期排（未來/過去）
 *                  "incubating"        = 籌備中（等邀約、等夥伴、等啟動），歸籌備區
 *
 *   registration - 報名資訊：
 *     status: "open"    - 開放報名（給 url + label）
 *             "private" - 專場（顯示主辦：xxx）
 *             "pending" - 待開放
 *             "ended"   - 已結束（過去場次用）
 *     url:    報名連結
 *     label:  按鈕文字（預設「報名 ↗」）
 *     host_org: 主辦單位（status=private 必填）
 *     note:   補充說明
 *
 * ─── 卡片顯示精簡為四件事 ───
 *   1. 圖（4:5）
 *   2. 時間（date + time）
 *   3. 主題（title）
 *   4. 模式 badge：場域 + 報名狀態
 *   + CTA 按鈕／主辦標示
 */

window.COURSES = [
  {
    id: "2026-06-21-use-knowledge-website",
    date: "2026-06-21",
    time: "20:00",
    title: "怎麼用我的知識官網：技能包是什麼、怎麼運作",
    type_label: "免費線上講座",
    image: null,
    venue_mode: "online",
    host: "江江教練",
    tags: ["知識官網", "Codex", "技能包", "Agent", "零基礎"],
    summary: "給還不太熟悉 Agent、想知道技能包是什麼、怎麼運作的新手。如果你常因為整理文書工作加班，可以下載 Codex；不會用的話，我有一個知識管理官網，裡面有技能包，甚至有教學。把官網網址貼給 Codex，網站就會教你怎麼使用它。這場晚上八點開講，我會現場示範一次。",
    detail_url: null,
    materials: [],
    registration: {
      status: "open",
      url: "https://line.me/R/ti/g2/V63_43ngbs_kq1mpVc9LlxXB-1kchHnwdsy3WQ",
      label: "加 LINE 社群報名 ↗",
      note: "6/21 晚上八點開講，零基礎新手入門場"
    }
  },
  {
    id: "2026-07-05-clerical-workflow-demo",
    date: "2026-07-05",
    time: null,
    title: "把學員問卷整理成課綱與簡報的完整流程",
    type_label: "免費線上講座",
    image: null,
    venue_mode: "online",
    host: "江江教練",
    tags: ["文書行政", "問卷整理", "課綱", "簡報製作", "工作流"],
    summary: "拆解一個很多人用得到的環節：我收到學員問卷後怎麼整理。把學員問卷、課程題目、最近的內容組合成新的課程內容，再做成簡報，也包含課程結束後的整理與重組。做文書、行政流程的人也能參考。",
    detail_url: null,
    materials: [],
    registration: {
      status: "pending",
      note: "時間與標題籌備中，最終以 LINE 社群公告為準"
    }
  },
  {
    id: "2026-05-23-agent-workflow",
    date: "2026-05-23",
    time: "20:00",
    title: "講師的 Agent 工作流",
    type_label: "免費線上講座",
    image: "images/courses/2026-05-23-agent-workflow.jpg",
    venue_mode: "online",
    host: "江江教練",
    tags: ["講師", "Agent", "工作流", "備課"],
    summary: "給講師、知識工作者：用 AI Agent 重新設計備課、知識管理、教材生產流程。",
    detail_url: "https://jiang-yude.github.io/my-0523-agent-workflow/",
    materials: [],
    registration: {
      status: "ended",
      note: "已結束，新場次會在 LINE 社群公布"
    }
  },
  {
    id: "2026-05-25-mobile-product-photo",
    date: "2026-05-25",
    time: "14:00",
    title: "手機 + AI 拍出自己的專業商品照",
    type_label: "外部授課",
    image: "images/courses/2026-05-25-mobile-product-photo.png",
    venue_mode: "physical",
    host: "江江教練",
    tags: ["手機攝影", "AI", "商品照", "在地商家"],
    summary: "在地商家專屬。用手機 + AI 工具建立自家品牌的視覺資產庫，不依賴攝影師也能持續產出。",
    detail_url: "https://jiang-yude.github.io/my-mobile-ai-product-photo/",
    materials: [],
    registration: {
      status: "private",
      host_org: "熊姐",
      note: "熊姐邀的在地商家專場"
    }
  },
  {
    id: "2026-05-30-yongli-ai-workshop",
    date: "2026-05-30",
    time: "10:00",
    title: "永力社 AI 應用工作坊",
    type_label: "外部授課",
    image: "images/courses/2026-05-30-yongli-ai-workshop.jpg",
    venue_mode: "physical",
    host: "江江教練",
    tags: ["扶輪社", "ChatGPT", "Gemini", "NotebookLM", "商會"],
    summary: "給商會社員：ChatGPT 專案、Gemini Gem、NotebookLM 三套工具的實作整合。",
    detail_url: "https://ai-km-jiang.vercel.app/courses/2026-05-30-yongli-ai-workshop/",
    materials: [
      { label: "上課簡報", url: "https://ai-km-jiang.vercel.app/courses/2026-05-30-yongli-ai-workshop/" }
    ],
    registration: {
      status: "private",
      host_org: "永力扶輪社",
      note: "扶輪社內部社員場次"
    }
  },
  {
    id: "2026-06-01-joy-podcast",
    date: "2026-06-01",
    time: null,
    title: "就享知 Joy Podcast 訪談",
    type_label: "Podcast",
    image: null,
    venue_mode: "podcast",
    host: "江江教練",
    tags: ["就享知", "Podcast", "AI輔助決策", "一人公司", "MVP", "思維框架"],
    summary: "就享知 Joy 的 Podcast 訪談主題參考，圍繞 AI 輔助決策、一人公司、MVP 與思維框架。",
    detail_url: null,
    materials: [],
    registration: {
      status: "pending",
      note: "播出後會更新連結"
    }
  },
  {
    id: "2026-06-07-ai-employee",
    date: "2026-06-07",
    time: "20:00",
    duration_min: 60,
    title: "怎麼訓練自己的 AI 員工",
    type_label: "免費線上講座",
    image: "images/courses/2026-06-03-1719-ai-employee-course-poster.jpg",
    venue_mode: "online",
    host: "江江教練",
    tags: ["AI員工", "AI Agent", "工作流", "一人公司", "創業者", "重複工作"],
    summary: "把 AI 從聊天工具，訓練成真的能幫你做事的 AI 員工。適合老闆、創業者、一人公司、接案者，以及想把 AI 真的放進工作流程的人。",
    detail_url: "https://ai-km-jiang.vercel.app/courses/2026-06-03-1719-ai-employee-course.html",
    materials: [],
    registration: {
      status: "ended",
      note: "已結束，新場次會在 LINE 社群公布"
    }
  },
  {
    id: "2026-06-14-confluence-workflow",
    date: "2026-06-14",
    time: "20:00",
    title: "把 YouTube 變成簡報：時間軸、截圖、重點一次整理好",
    type_label: "免費線上講座",
    image: null,
    venue_mode: "online",
    host: "江江教練",
    tags: ["YouTube", "簡報", "時間軸", "重點摘要", "AI工作流"],
    summary: "把 YouTube 連結交給 AI，就能整理出時間軸、截圖、重點摘要，甚至直接做成網頁和簡報。這場免費講座，我會拆解這套工作流怎麼跑。",
    detail_url: null,
    materials: [],
    registration: {
      status: "ended",
      note: "已結束，新場次會在 LINE 社群公布"
    }
  },
  {
    id: "2026-06-17-wenzao-agent-workflow",
    date: "2026-06-17",
    time: "12:00",
    duration_min: 60,
    title: "文藻大學「講師的 Agent 工作流」",
    type_label: "外部授課",
    image: "images/courses/2026-06-17-wenzao-agent-workflow.jpg",
    venue_mode: "online",
    host: "江江教練",
    tags: ["文藻大學", "講師", "行政人員", "Agent", "工作流", "知識庫"],
    summary: "給大學教授、講師與行政人員的線上課：從資料收集整理，到建立自己的知識庫與 AI 工作流。",
    detail_url: "https://ai-km-jiang.vercel.app/courses/2026-05-23-agent-workflow/",
    materials: [],
    registration: {
      status: "private",
      host_org: "文藻大學",
      note: "教師與行政人員專場，6/17 12:00-13:00"
    }
  },
  {
    id: "2026-06-27-parent-child-ai-story",
    date: "2026-06-27",
    time: "14:00",
    title: "星奇兒親子 AI 故事工作坊",
    type_label: "外部授課",
    image: null,
    venue_mode: "tbd",
    host: "江江教練 × 陳穎君",
    tags: ["親子", "AI故事", "兒童", "家庭"],
    summary: "陳穎君老師合作邀請的親子場。爸媽帶孩子一起用 AI 共創家庭故事。",
    detail_url: null,
    materials: [],
    registration: {
      status: "private",
      host_org: "陳穎君",
      note: "親子工作坊邀約場"
    }
  },
  {
    id: "2026-07-08-marketing-1",
    date: "2026-07-08",
    time: "19:00",
    duration_min: 120,
    title: "訓練你的 AI Agent 小編：把 AI 從工具，變成員工",
    type_label: "外部授課",
    image: "images/courses/2026-07-chiayi-marketing-series.jpg",
    venue_mode: "online",
    host: "江江教練",
    tags: ["嘉我好漾", "AI小編", "品牌特色", "靈感池", "開頭公式", "發文節奏"],
    summary: "嘉我好漾線上青創課，把 AI 從工具變成員工：① 先讓它認識你的品牌特色；② 建立靈感池，靈感詞加標籤，不用每次從零想；③ 五種開頭公式加發文節奏，吸睛轉單。",
    detail_url: null,
    materials: [],
    registration: {
      status: "open",
      url: "https://www.accupass.com/event/2606140311328045535890",
      label: "Accupass 報名 ↗",
      host_org: "嘉我好漾",
      note: "嘉義縣勞青處青創課程，7/8 19:00-21:00"
    }
  },
  {
    id: "2026-07-14-marketing-2",
    date: "2026-07-14",
    time: "19:00",
    duration_min: 120,
    title: "AI 圖文實作：讓 AI 圖不要有 AI 味",
    type_label: "外部授課",
    image: "images/courses/2026-07-chiayi-marketing-series.jpg",
    venue_mode: "online",
    host: "江江教練",
    tags: ["嘉我好漾", "AI圖文", "品牌資產", "降低AI味", "批量產出", "形象頁"],
    summary: "嘉我好漾線上青創課，讓 AI 圖不要有 AI 味：① 把品牌放進 prompt，做出別人複製不走的圖卡；② 一個主題一次做完圖卡、海報、簡報、貼文；③ 用 AI 做產品、形象頁與影片代操判斷。",
    detail_url: null,
    materials: [],
    registration: {
      status: "open",
      url: "https://www.accupass.com/event/2606140311328045535890",
      label: "Accupass 報名 ↗",
      host_org: "嘉我好漾",
      note: "嘉義縣勞青處青創課程，7/14 19:00-21:00"
    }
  },
  {
    id: "tbd-ai-design-workshop",
    date: "2026-12-31",
    time: null,
    title: "AI 圖文設計工作坊",
    type_label: "工作坊",
    image: "images/courses/tbd-ai-design-workshop.jpg",
    venue_mode: "tbd",
    host: "江江教練",
    tags: ["AI設計", "圖文", "品牌資產", "三視圖", "定妝照"],
    summary: "從一張圖到一套品牌資產。教你用三視圖定妝照、品牌風格檔，穩定產出整套品牌視覺。",
    phase: "incubating",
    detail_url: "https://jiang-yude.github.io/my-0523-agent-workflow/",
    materials: [],
    registration: {
      status: "pending",
      note: "歡迎課程主辦單位邀約合辦"
    }
  },
  {
    id: "2026-08-xx-esg-agent",
    date: "2026-08-15",
    time: null,
    title: "Agent 文書處理基礎班 · ESG 場",
    type_label: "付費實體課",
    image: null,
    venue_mode: "tbd",
    host: "江江教練",
    tags: ["ESG", "永續報告", "Agent", "文書處理", "商會"],
    summary: "給扶輪社、商會、ESG 顧問。",
    detail_url: null,
    materials: [],
    registration: {
      status: "pending",
      note: "等小薇顧問 8 月考完試後敲定日期"
    }
  },

  /* ─── 過去場次（5 場，從 my-resources 補上）─── */
  {
    id: "2026-05-20-relation-non-internal",
    date: "2026-05-20",
    time: "20:00",
    title: "關係不內耗練習課",
    type_label: "免費線上講座",
    image: "images/courses/2026-05-20-relation-non-internal.jpg",
    venue_mode: "online",
    host: "江江教練",
    tags: ["關係", "情緒", "AI輔助", "練習課"],
    summary: "用 AI 輔助練習處理人際關係內耗的線上講座。",
    detail_url: "https://jiang-yude.github.io/my-poll-relation-0520/",
    materials: [],
    registration: { status: "ended", note: "已結束，可看課後落點分析與內容" }
  },
  {
    id: "2026-05-05-mvp-validation",
    date: "2026-05-05",
    time: "19:00",
    title: "創業點子驗證術：AI 幫你試水溫",
    type_label: "外部授課",
    image: "images/courses/2026-05-05-mvp-validation.jpg",
    venue_mode: "online",
    host: "江江教練",
    tags: ["創業", "MVP", "OGSM", "嘉我好漾"],
    summary: "嘉義縣勞青處青創課程。OGSM、MVP 最小成本驗證、三視角拷問（納瓦爾、一人公司、技術）、Mika MVP 迭代軌跡。",
    detail_url: "https://jiang-yude.github.io/my-mvp-validation/",
    materials: [],
    registration: { status: "ended", host_org: "嘉我好漾", note: "已結束，完整資源含課後統整可在內頁查看" }
  },
  {
    id: "2026-05-03-pdf-ai-advisor",
    date: "2026-05-03",
    time: "20:00",
    title: "把書、影片、PDF 變成你的 AI 顧問",
    type_label: "免費線上講座",
    image: "images/courses/2026-05-03-pdf-ai-advisor.png",
    venue_mode: "online",
    host: "江江教練",
    tags: ["人格提煉", "AI顧問", "知識管理", "PDF"],
    summary: "人格思維提煉技能包的講座現場版。把書、論文、影片、Podcast 變成可對話的 AI 顧問。",
    detail_url: "https://gamma.app/docs/2026-05-03-PDF-AI--xc4qvo8va75cjog?mode=doc",
    materials: [],
    registration: { status: "ended", note: "已結束，簡報可在內頁查看" }
  },
  {
    id: "2026-04-29-harness-engineering",
    date: "2026-04-29",
    time: "20:00",
    title: "給文科生的 Harness Engineering × LLM Wiki 通識課",
    type_label: "免費線上講座",
    image: "images/courses/2026-04-29-harness-engineering.jpg",
    venue_mode: "online",
    host: "江江教練",
    tags: ["駕馭工程", "LLMWiki", "通識", "文科生"],
    summary: "大語言模型應用規劃 + LLM Wiki 個人知識管理通識課。",
    detail_url: "https://gamma.app/docs/Harness-Engineering-LLM-Wiki--hnq6v57py04hjch?mode=doc",
    materials: [],
    registration: { status: "ended", note: "已結束，簡報可在內頁查看" }
  },
  {
    id: "2026-03-29-learning-map",
    date: "2026-03-29",
    time: "20:00",
    title: "用 AI 打造你的學習地圖，從此不再資訊焦慮",
    type_label: "免費線上講座",
    image: "images/courses/2026-03-29-agent-learning-map.jpg",
    venue_mode: "online",
    host: "江江教練",
    tags: ["學習地圖", "知識管理", "資訊焦慮", "文科生"],
    summary: "給文科生的工作流學習地圖入門。",
    detail_url: "https://gamma.app/docs/-7dz617zxz58vjwi?mode=doc",
    materials: [],
    registration: { status: "ended", note: "已結束，簡報可在內頁查看" }
  }
];

/* ─── 全域 CTA 預設文案 ─── */
window.CTA_DEFAULTS = {
  open_label: "報名 ↗",
  open_url_pending: "即將開放報名，敬請鎖定 Threads",
  pending_text: "時間／報名方式待公告",
  private_prefix: "主辦：",
  private_suffix: "（封閉場次，由主辦邀約）"
};
