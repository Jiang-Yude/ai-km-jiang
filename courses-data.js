/* ─── 江江教練 課程資料中心 ───
 * 唯一資料源，首頁「最近的課」跟 courses.html 都讀這份
 *
 * ─── 欄位 ───
 *   id           - 唯一識別碼，格式 YYYY-MM-DD-slug
 *   date         - YYYY-MM-DD；籌備中且日期未定可填 null
 *   date_label   - 有填就優先顯示（多日系列課用；date 仍管排序與過期），date=null 時預設「日期待定」
 *   time         - HH:MM 或 null
 *   duration_min - 分鐘數或 null
 *   title        - 課程標題
 *   type_label   - ⚠️ 不是裝飾，是分區路由依據：courses-render.js inferType() 用關鍵字判類。
 *                  含「免費」→免費講座區｜含「付費」→收費課程區｜含「Podcast」／「外部」→邀約授課區。
 *                  機構邀約／專場一律寫「外部授課」。關鍵字都不含＝other：只會出現在近期課程，
 *                  日期一過就從課程頁消失（僅 registration.status="private" 有 fallback 收進邀約區）。
 *                  2026-08-06 事故補記：8/4 卡曾寫「實體課程」，課後整張卡從課程頁消失。
 *   image        - 封面圖 4:5 直幅（"images/courses/xxx.jpg"）或 null
 *   venue_mode   - 場域：online / physical / hybrid / podcast / tbd
 *   host         - 講師
 *   tags         - 主題標籤（內部分類用，不顯示）
 *   summary      - 一段話介紹（給未來內頁用，卡片不顯示）
 *   detail_url   - 該堂課的內頁 URL（之後做才填）
 *   detail_label - 內頁連結文字；不填時預設「完整課程內容與簡報 ↗」
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
    id: "2026-09-09-npo-impact-report-workshop",
    date: "2026-09-09",
    time: "09:30",
    duration_min: null,
    title: "使命有跡：NPO 永續影響力報告書 AI 共創工作坊",
    type_label: "付費實體課＋線上場",
    image: "images/courses/2026-09-npo-impact-report-workshop.jpg",
    venue_mode: "hybrid",
    venue_label: "實體＋線上",
    host: "永力智庫顧問團隊",
    tags: ["永力智庫", "社會影響力", "永續報告書", "AI工作流", "工作坊"],
    summary: "同一梯次共四場：9/9 與 9/23 兩個實體工作坊日（台北市萬華區，09:30 開始），中間再加 9/16 與 9/30 兩場線上兩小時課。帶著真實資料上課，兩天實作加兩次線上跟進，做出可用的永續影響力報告書 1.0。",
    detail_url: "https://jiang-yude.github.io/yongli-thinktank-site/",
    detail_label: "查看課程資訊 ↗",
    materials: [],
    registration: {
      status: "pending",
      note: "同一梯次四場：9/9（實體）、9/16（線上兩小時）、9/23（實體）、9/30（線上兩小時）。報名方式待主辦單位公告。"
    }
  },
  {
    id: "2026-08-21-danhai-public-art",
    date: "2026-08-21",
    time: null,
    duration_min: 180,
    title: "淡水公共藝術 AI 創作課",
    type_label: "實體工作坊（旅學堂特約合作）",
    image: "images/courses/2026-08-danhai-public-art.jpg",
    venue_mode: "physical",
    venue_label: "實體",
    host: "江江教練",
    tags: ["公共藝術", "敘事轉譯", "AI生圖", "提示詞", "在地故事", "零基礎"],
    summary: "與旅學堂特約合作的走讀加創作工作坊。上午走讀淡海輕軌沿線的幾米公共藝術，下午用 AI 把早上聽到的故事變成一張屬於自己的淡水形象角色，再由全桌共創一個主角，做成六格繪本。一支手機就可以參加，不用先會用 AI。",
    detail_url: "courses/2026-08-danhai-public-art/",
    materials: [],
    registration: {
      status: "private",
      host_org: "旅學堂",
      note: "同一套課程兩場：綠山線 8/21（五）、藍海線 9/12（六）。報名與場次資訊以旅學堂公告為準。"
    }
  },
  {
    id: "2026-08-20-senior-ai-story-workshop",
    date: "2026-09-13",
    date_label: "邀約開課",
    time: "09:00",
    duration_min: 180,
    title: "樂齡 AI 工作坊：把你的故事，做成一張海報",
    type_label: "外部授課",
    image: "images/courses/2026-senior-ai-story-workshop.jpg",
    venue_mode: "physical",
    venue_label: "實體",
    host: "江江教練",
    tags: ["樂齡", "AI生圖", "電影海報", "旅行簡報", "說故事", "零基礎"],
    summary: "學員說自己的故事，AI 負責視覺、排版與剪輯。先用 ChatGPT 生一張以自己為主角的個人生活風格照，時間夠再把同一段故事變成一首歌、一份故事簡報、一支說故事短片和一張個人簡介。一支手機就可以參加，不用電腦基礎。",
    detail_url: "courses/senior-ai-story-workshop/",
    materials: [],
    registration: {
      status: "private",
      host_org: "財團法人社區電腦推廣教育基金會",
      note: "社區居民專場，非對外公開報名。"
    }
  },
  {
    id: "2026-08-15-ai-that-knows-you",
    date: "2026-08-15",
    time: "14:00",
    duration_min: 180,
    title: "讓你的 AI 更懂你：從「懂我」到「能幫我做事」",
    type_label: "工作坊",
    image: "images/courses/2026-08-15-ai-that-knows-you.jpg",
    venue_mode: "physical",
    venue_label: "實體",
    host: "江江教練",
    tags: ["AIAgent", "數位分身", "提示詞", "ChatGPT", "零基礎"],
    summary: "永力智庫主辦、育成社福基金會共同主辦的三小時實體工作坊，地點在育成蕃薯藤餐廳。現場帶你弄懂 AI 代理人、體驗做好的顧問型 AI，再一步一步完成手機上的設定。走完三步，你的 AI 會從「聊得來」變成「幫得上」。不用會電腦，一支手機就可以參加。",
    detail_url: "courses/2026-08-15-ai-that-knows-you/",
    materials: [],
    registration: {
      status: "private",
      url: null,
      label: null,
      host_org: "永力智庫",
      note: "扶輪社友與邀請來賓參加，非對外公開報名。詳細內容見課程介紹與上課頁。"
    }
  },
  {
    id: "2026-08-04-digital-creation-1",
    date: "2026-08-25",
    date_label: "8 月四天：8/4、8/11、8/18、8/25",
    time: "09:00",
    duration_min: 360,
    title: "數位起步走 輕鬆玩創作：8 月數位創作課程 四天系列",
    type_label: "外部授課",
    image: "images/courses/2026-08-04-digital-creation-1.jpg",
    venue_mode: "physical",
    venue_label: "臺中",
    host: "江江教練",
    tags: ["AI應用", "圖片生成", "提示詞設計", "零基礎入門", "自媒體"],
    summary: "八月數位創作課程，四天：8/4、8/11、8/18、8/25，對象是只用手機、多數沒碰過 AI 的中高齡學員。第一天用五個問題讓 AI 認識你、做出個人設定檔，再用自己的照片生出形象照；接著是圖文創作、剪輯與社群發布、互動經營。簡報一個入口，隨四天課程陸續更新，完課後整合四天內容與學員作品集。簡報裡所有指令都可以整段複製直接用。",
    detail_url: null,
    materials: [
      { label: "上課簡報 ↗", url: "https://jiangyude.com/courses/2026-08-04-digital-creation-1/" }
    ],
    registration: {
      status: "private",
      host_org: "臺中市女兒館",
      note: "四堂系列課 8/4、8/11、8/18、8/25，機構邀約授課，不對外報名。"
    }
  },
  {
    id: "2026-08-02-dual-model-review-loop",
    date: "2026-08-02",
    time: "20:00",
    duration_min: null,
    title: "文科生也能設計的雙模型互審機制與迴圈工程",
    type_label: "免費線上講座",
    image: "images/courses/2026-08-02-dual-model-review-loop.jpg",
    venue_mode: "online",
    venue_label: "線上",
    host: "江江教練",
    tags: ["AIAgent", "MultiAgent", "跨家審稿", "迴圈工程"],
    summary: "給不會寫程式的知識工作者與 Agent 新手，分享為什麼要讓兩個模型互相審查、迴圈工程怎麼設計，以及從交代任務到收到回報的完整流程。",
    detail_url: null,
    materials: [
      { label: "上課簡報 ↗", url: "https://jiangyude.com/courses/2026-08-02-dual-model-review-loop/" },
      { label: "文章｜當我開始理解迴圈，把三個工作流設計成 Loop ↗", url: "https://jiangyude.com/articles/my-three-loops/" },
      { label: "文章｜讓兩個 AI 互相挑錯：企劃雙軌互審 loop ↗", url: "https://jiangyude.com/articles/dual-track-planning-loop/" }
    ],
    registration: {
      status: "open",
      url: "https://line.me/R/ti/g2/V63_43ngbs_kq1mpVc9LlxXB-1kchHnwdsy3WQ",
      label: "加入 LINE 社群 ↗",
      note: "免費參加，課程連結會在上課前半小時公布於 LINE 社群；課程時長待公告"
    }
  },
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
      status: "ended",
      url: null,
      label: null,
      note: "本場已於 2026-06-21 結束"
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
    // 2026-08-12 設回 null：原本指 https://jiang-yude.github.io/my-0523-agent-workflow/，
    // 但該頁現在整份是「AI 圖文設計工作坊完整教案」（章節 Positioning／Teaching Mainline／
    // Advanced Case／Iteration Log／Takeaway），沒有講師 Agent 工作流的內容。repo 名對得上日期，
    // 內容後來被換掉、repo 名沒改。課程頁「免費講座 · 過去目錄」寫著「含完整簡報或回放，挑有興趣的補看」，
    // 留著會讓想補看這場的訪客點到另一堂課。找到這場真正的簡報頁再補回來。
    detail_url: null,
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
    detail_url: "https://jiangyude.com/courses/2026-05-30-yongli-ai-workshop/",
    materials: [
      { label: "上課簡報", url: "https://jiangyude.com/courses/2026-05-30-yongli-ai-workshop/" }
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
    detail_url: "https://jiangyude.com/courses/2026-06-03-1719-ai-employee-course.html",
    materials: [
      { label: "完整講座簡報", url: "https://jiangyude.com/courses/ai-employee-deck/" }
    ],
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
    // 2026-08-12 補：這場的課程頁一直在線上（HTTP 200、robots index,follow），但沒接進資料，
    // 等於 courses.html 與咪卡都看不到它。標題自證是同一場（「6/14 免費線上講座」）。
    detail_url: "https://jiangyude.com/courses/2026-06-14-youtube-report/",
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
    detail_url: "https://jiangyude.com/courses/2026-05-23-agent-workflow/",
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
    image: "images/courses/2026-06-27-parent-child-ai-story.jpg",
    venue_mode: "tbd",
    host: "江江教練 × 陳穎君",
    tags: ["親子", "AI故事", "兒童", "家庭", "角色設定", "三視圖"],
    summary: "陳穎君老師合作邀請的親子場。爸媽帶孩子一起用 AI 共創家庭故事。",
    detail_url: "courses/2026-06-27-parenting-storytelling-ai/",
    materials: [],
    registration: {
      status: "private",
      host_org: "陳穎君",
      note: "親子工作坊邀約場"
    }
  },
  {
    id: "2026-07-05-slide-to-skill",
    date: "2026-07-05",
    time: "20:00",
    duration_min: 60,
    title: "每次都從頭重做簡報？把流程存成技能包",
    type_label: "免費線上講座",
    image: "images/courses/2026-07-05-slide-to-skill.jpg",
    venue_mode: "online",
    host: "江江教練",
    tags: ["簡報", "課前問卷", "技能包", "AI工作流", "知識累積"],
    summary: "從一個實際工作問題出發：把課前問卷加課綱變成一份簡報，再把整套流程存成可重複使用的技能包，附一份合成示範問卷可下載練習。",
    detail_url: "courses/2026-07-05-slide-to-skill/",
    materials: [],
    registration: {
      status: "open",
      note: "免費參加，講座連結在 LINE 社群記事本公布"
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
    detail_url: "https://jiangyude.com/courses/2026-07-08-ai-agent-editor/",
    materials: [
      { label: "上課簡報 ↗", url: "https://jiangyude.com/courses/2026-07-08-ai-agent-editor/" },
      { label: "學員問卷落點地圖 ↗", url: "https://jiangyude.com/courses/2026-07-08-ai-agent-editor/map.html" }
    ],
    registration: {
      status: "ended",
      url: null,
      label: null,
      host_org: "嘉我好漾",
      note: "本場已於 2026-07-08 結束，上課簡報已上線"
    }
  },
  {
    id: "2026-07-12-chatgpt-work-admin",
    date: "2026-07-12",
    time: "20:00",
    title: "ChatGPT Work 到底能幫行政工作做什麼？",
    type_label: "免費線上講座",
    image: "images/courses/2026-07-12-chatgpt-work-admin.jpg",
    venue_mode: "online",
    host: "江江教練",
    tags: ["ChatGPT Work", "行政工作", "AI工作流", "工作交代"],
    summary: "從一般行政工作的角度，帶大家看懂 ChatGPT Work 到底能幫我們做什麼，以及該怎麼交代，才真的能幫你省下時間。",
    detail_url: "https://jiangyude.com/courses/2026-07-12-chatgpt-work/",
    materials: [
      { label: "課後版簡報 ↗", url: "https://jiangyude.com/courses/2026-07-12-chatgpt-work/" }
    ],
    registration: {
      status: "ended",
      url: null,
      label: null,
      note: "本場已於 2026-07-12 結束，課後版簡報已上線"
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
    detail_url: "https://ai-visual-ws-4e74f0.vercel.app/",
    materials: [
      { label: "上課簡報 ↗", url: "https://ai-visual-ws-4e74f0.vercel.app/" },
      { label: "學員問卷落點地圖 ↗", url: "https://jiangyude.com/courses/2026-07-08-ai-agent-editor/map.html" }
    ],
    registration: {
      status: "ended",
      url: null,
      label: null,
      host_org: "嘉我好漾",
      note: "本場已於 2026-07-14 結束，上課簡報已上線"
    }
  },
  {
    id: "tbd-ai-design-workshop",
    date: null,
    date_label: "日期待定",
    time: null,
    title: "AI 圖文設計工作坊",
    type_label: "工作坊",
    image: "images/courses/tbd-ai-design-workshop.jpg",
    venue_mode: "tbd",
    host: "江江教練",
    tags: ["AI設計", "圖文", "品牌資產", "三視圖", "定妝照", "角色設定", "角色一致性"],
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
    date: null,
    date_label: "日期待定",
    time: null,
    title: "Agent 文書處理基礎班 · ESG 場",
    type_label: "付費實體課",
    image: null,
    venue_mode: "tbd",
    host: "江江教練",
    tags: ["ESG", "永續報告", "Agent", "文書處理", "商會"],
    summary: "給扶輪社、商會、ESG 顧問。",
    phase: "incubating",
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

/* ─── 常設收費課程（課程總覽頁「收費課程」區資料源） ───
 * 與 window.COURSES 分開：COURSES 是有日期的場次，PAID_OFFERS 是常設報名項目。
 * 舊渲染器（首頁最近的課、邀約授課頁）只讀 COURSES，不受這個陣列影響。
 * 詳細介紹與報名都在 offers.html 對應錨點（銷售頁保留不動）。
 */
window.PAID_OFFERS = [
  {
    id: "offer-invite",
    title: "課程邀約",
    price: "講師費 2,000 元／小時",
    brief: "企業、學校、社群邀約授課。不含車馬費，主題可客製，或從講過的場次挑。",
    level: "邀約",
    venue_mode: "hybrid",
    venue_label: "到你那裡或線上",
    tags: ["邀約", "企業", "學校", "社群"],
    anchor: "cases.html",
    cta: "談邀約 →"
  },
  {
    id: "offer-online",
    title: "線上課程",
    price: "規劃中",
    brief: "預錄課程重整規劃中，上架後在這裡公告。",
    level: "入門",
    venue_mode: "online",
    venue_label: "線上",
    tags: ["預錄課", "線上課程"],
    anchor: null
  },
  {
    id: "offer-workshop",
    title: "實體一天工作坊＋長期陪跑",
    price: "規劃中",
    brief: "一天實體工作坊加長期陪跑，服務方案設計中，想帶團隊導入可以先聊。",
    level: "團隊導入",
    venue_mode: "physical",
    venue_label: "實體",
    tags: ["工作坊", "陪跑", "團隊"],
    anchor: "cases.html",
    cta: "先聊聊 →"
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
