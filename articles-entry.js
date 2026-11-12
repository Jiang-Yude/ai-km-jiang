/* articles-entry.js · 文章頁入口（2026-11-13 立，取代 articles-pain.js 的 ARTICLE_PAIN／ARTICLE_GUIDE）
   文章頁最上面那排「你現在想解決什麼」。每篇文章歸哪個入口、每個入口先推哪幾篇，都寫在這裡，不靠關鍵字比對。
   - ids：主入口是這一題的文章；also：副入口也算這一題（排在主入口後面）。一篇只有一個主入口。
   - picks：點了入口先推的文章，最多 3 篇，照這裡的順序顯示；不必湊滿。starter: true 的入口，picks 也是沒選任何入口時的「第一次來先看」。
   - 新文章上線：把 id 加進一個入口的 ids（真的同樣貼切再加一個 also）；哪題都不合就加進最下面的 ARTICLE_ENTRY_NONE。
     沒加的文章只會出現在全部文章與搜尋裡，不會出現在任何入口。檢查有沒有漏：node scripts/check-article-entry.mjs
   - 2026-11-13 首批歸類：Gemini 4 Argon 依標題與「解決什麼」歸類，Claude 複核精選。 */
window.ARTICLE_ENTRIES = [
  {
    key: "e1",
    label: "不知道 AI 從哪開始",
    desc: "第一次用、觀念怎麼建立、公司要不要導入，都在這裡。",
    starter: true,
    picks: [
      "teach-ai-not-learn-ai",                         // 為什麼你的 AI 每次都要重講一遍：教 AI 的四個步驟
      "ai-that-knows-you",                             // AI 回答總是不夠懂我，怎麼讓他更聰明？：從「懂我」到「能幫我做事」
      "prompt-to-loop-map",                            // 跟 AI 合作該從哪裡學起？
    ],
    ids: [
      "ai-employee-experienced-managers",              // AI 員工誰帶得好？有經驗的主管可能更有優勢
      "ai-agent-gap-fde",                              // AI 跑很快，企業跟很慢，中間的落差誰來補？
      "hormozi-stop-chasing-ai",                       // AI 時代創業，什麼才是別人拿不走的護城河？
      "ai-adoption-raise-not-install",                 // 企業導入 AI 為什麼這麼難？
      "cli-api-mcp-computer-use",                      // 叫 AI 幫你點餐，就懂 CLI、API、MCP
      "start-from-one-persons-problem",                // Tesla 內部的一套工作方法，把自動化排在最後一步
      "cathay-tech-conference-2026",                   // 公司導入 AI，資料要先整理到什麼程度？
      "ai-adoption-start-with-one-workflow",           // 公司請 AI 顧問來陪跑，要叫全部人一起來學嗎？
      "delete-before-automate",                        // 想用 AI 提升效率，結果都在瞎忙？
      "mac-for-agent-beginners",                       // 想學 Agent，我為什麼會先推薦 Mac？
      "same-question-different-answers",               // 同一個問題問兩次，AI 為什麼給出不同答案？：程式與 AI 的差異
      "llm-rag-agent-mcp",                             // LLM、RAG、Agent、MCP 哪個重要？用人體比喻看懂這四個怎麼疊起來
      "dont-learn-ai-tools",                           // 我上課不教 AI 工具，因為工具是 AI 該操作的
      "cognitive-debt",                                // AI 做的東西看不懂，可以先用再說嗎？：認知債可以欠，重點是懂得還
      "use-more-ai-not-enough",                        // 多數人只是用更多 AI，工作的形狀沒有變
      "ai-native-not-transformation",                  // 為什麼你的 AI 導入沒有效果：從三層論到組織那面牆
      "ten-year-anchor",                               // AI 知識焦慮的解法：在快速變動的時代，找到十年不變的錨點
      "answer-to-action-enterprise-ai-agent",          // 從 Answer 到 Action：我從簡立峰老師的公開觀察，看企業如何導入 AI Agent
      "one-on-one-questions",                          // AI 常見問題 37 問：知識庫怎麼建、技能包怎麼用、公司裡怎麼推
      "ai-tools-professional-judgment",                // 工具跟別人一樣，我的差異剩什麼？：拉開差距的是判斷力
      "manage-ai-with-management-knowledge",           // 用你已經有的管理知識來管理 AI，以豐田 TPS 為例
      "harness-mindset-for-bosses",                    // 給老闆的駕馭思維：把不敢對員工說的，講給 AI 聽（系列 02）
      "prompt-to-loop-map",                            // 跟 AI 合作該從哪裡學起？
      "ai-delegators-optimism",                        // AI 越來越強，會不會哪天就不需要我了？：越交給 AI 的人越不怕被取代
      "company-shape-is-the-moat",                     // AI 時代，公司還剩什麼別人拿不走？：真正的護城河是組織模式與信任
      "a2a-agent-protocol",                            // AI 代理要接手工作了，你的流程和知識準備好了嗎？
      "ai-capability-tiers",                           // 我到底算不算「會用 AI」的人？：AI 能力分級，用對產業的影響力排一張表
      "tidy-mess-before-consulting",                   // 找顧問前，先讓 AI 幫你把混亂整理成問題
      "vibe-coding-ten-half-products",                 // 學了一堆 AI 工具，不知道要拿來幹嘛？：你以為在做成品，其實在養十個半成品
      "how-ai-connects-software",                      // AI Agent 怎麼幫我們直接操作軟體？
      "own-ai-team-at-work",                           // 效率提升好幾倍，公司又不加薪，為什麼要做？：在公司上班也能有自己的 AI 團隊
      "program-vs-ai-skill-library",                   // 有標準答案的交給程式，沒標準答案的才輪到 AI
      "yongli-ai-workshop-tools-to-workflow",          // 商會一日 AI 工作坊：從工具理解到工作流程與知識庫
      "web-chat-ai-vs-desktop-agent",                  // 桌面版和開發者版差在哪？：網頁聊天型 AI 與桌面幹活型 AI 的分界（Codex）
      "ai-learning-map-reduce-anxiety",                // AI 資訊太多，下一步怎麼辦？：一張可追蹤的學習地圖降低焦慮
      "ai-course-map-from-entry-to-workflow",          // 不知道該從哪一堂課開始上？
    ],
    also: [
      "api-key-dont-paste-to-ai",                      // API key 可以貼給 AI 嗎？
      "ai-random-true-random",                         // 你以為 AI 在隨機抽，其實它最愛 7
      "knowledge-workers-new-model-guide",             // AI 換新版，下指令的方式要跟著改嗎？
      "audrey-tang-reverse-alignment",                 // 每天用 AI，怎麼知道自己沒有被它牽著走？
      "grok-bot-galaxy-day2-workshops",                // 客服、業務、開發客戶，AI 員工實際做到哪一步？
      "where-is-my-server",                            // 我的 Server 架在哪裡？
      "what-is-graph-engineering",                     // 可以放著讓 AI 自己跑完嗎？
      "eight-ai-system-concepts-2026",                 // 2026 年知識工作者的八個 AI 系統概念：從提示詞寫得好，到把系統搭起來
      "let-ai-do-the-setup",                           // 換電腦，設定又要重來一次嗎？：我把 OBS 交給 AI，一個選項都沒點過
      "answer-in-person-or-ai",                        // 同一個問題被問一百次，該親自回答還是丟給 AI
      "ai-employee-four-levels",                       // 訓練 AI 員工的四個層次：從自己會用，到讓 AI 幫你訓練 AI
      "teach-ai-not-learn-ai",                         // 為什麼你的 AI 每次都要重講一遍：教 AI 的四個步驟
      "ai-that-knows-you",                             // AI 回答總是不夠懂我，怎麼讓他更聰明？：從「懂我」到「能幫我做事」
      "agent-native-tools-software-interface",         // Agent 原生工具會讓軟體介面退到後台嗎？
      "strong-ai-models-knowledge-workflow-road",      // 先學工具還是先建知識庫？：模型像超跑，知識庫與工作流是你腳下的路
      "intent-first-prompting",                        // 指令越寫越長，AI 卻沒更好？：把你要什麼講清楚，剩下交給 AI（系列 01）
      "how-to-train-your-ai-employee",                 // 如何訓練自己的 AI 員工：員工＋顧問框架
      "spacex-ipo-musk-trillionaire-knowledge-work",   // 世界首富用一兆美金，替知識工作者指出的那條路
      "liberal-arts-agent-framework",                  // 現在還需要學寫程式嗎？：文科生也能設計自己的 Agent 框架
    ]
  },
  {
    key: "e2",
    label: "寫內容、做簡報、寫企劃",
    desc: "脆文、社群圖卡、簡報、提案、問卷與市調、影片。",
    picks: [
      "train-your-ai-agent-editor",                    // 沒空寫，可以叫 AI 幫我寫嗎？：讓 AI 認識你，比學會用 AI 更重要
      "one-sentence-video-to-deep-article",            // 我怎麼一句話，就讓我的 AI 把一支專題影片變成一篇深度文章？
      "slides-by-audience-sop",                        // 怎麼把 AI 訓練成懂你的簡報助理？
    ],
    ids: [
      "claude-beat-synced-video",                      // 用 Claude Code 剪影片，配樂從哪來、怎麼卡在拍子上？
      "ai-content-topic-picking",                      // 怎麼用 AI 找內容題目？
      "debate-summary-video-prompts",                  // 我怎麼叫 AI 幫我做摘要影片？
      "inspiration-production-system",                 // 每天想不到要發什麼？
      "slides-by-audience-sop",                        // 怎麼把 AI 訓練成懂你的簡報助理？
      "ai-slides-half-auto-google-slides",             // 叫 AI 做簡報，為什麼最後還是自己一個字一個字改？
      "one-sentence-video-to-deep-article",            // 我怎麼一句話，就讓我的 AI 把一支專題影片變成一篇深度文章？
      "ai-user-testing",                               // 做完的東西想找人幫忙看，卻找不到人？
      "claude-meta-ads-connector",                     // Meta 廣告後台可以整段交給 AI 嗎？
      "personal-poster-and-wallpaper",                 // 用手機做一張自己的電影海報和手機桌布：先讓 AI 認識你，它才畫得出你
      "notebooklm-real-photo-slides",                  // 把照片放進 NotebookLM，生一份用真實照片的簡報
      "character-costume-sheet-three-views",           // AI 每次生的角色都不一樣，用定裝照解決
      "train-your-ai-agent-editor",                    // 沒空寫，可以叫 AI 幫我寫嗎？：讓 AI 認識你，比學會用 AI 更重要
      "questionnaire-to-slides-agent-workflow",        // 把課前問卷變成簡報，再把流程存成技能包
      "give-ai-choices-not-descriptions",              // 跟 AI 調配色，別讓它一直猜：六組一次給你挑，挑了再微調
      "market-to-ai",                                  // 大家都用 AI 搜尋了，SEO 還有用嗎？：學用 AI 行銷，也學對 AI 行銷
      "parenting-story-ai-family-dialogue",            // 用 AI 把親子日常變成故事、插畫與家庭對話素材
      "ai-market-microcosm",                           // AI 就是整個市場的縮影：在花錢做市調前，先用 AI 測反應
      "ai-mvp-validation-before-product",              // 花大錢做產品前，先用 AI 驗證創業點子
    ],
    also: [
      "ai-image-api-cost",                             // gpt-image-2.5 生一張圖多少錢？
      "ai-era-websites-for-agents",                    // AI 時代，網站開始同時服務人與 AI
      "five-loops-content-line",                       // 哪些事可以交給 AI 自己跑完？
      "long-answer-three-layers",                      // AI 回答太長看不下去？把內容變成白話、流程圖與說明網頁
      "meta-prompt-thirty-versions",                   // 同一份提示詞，三十個人做出三十種東西
      "timing-and-forecast",                           // 資訊時差與市場預測：怎麼比市場早一步，又不會早太多
      "agent-web-turning-point",                       // 網路上一半以上的訪問已經不是人了，你的內容準備好被機器讀了嗎？
      "dual-track-planning-loop",                      // 如何讓兩個不同的 AI 互相挑錯、自己訂正？：我的企劃送出前先被模擬評審打了 2/5 分
      "youtube-to-opinion-report-workflow",            // 影片看完就忘了，怎麼變成用得上的東西？
      "teacher-prep-knowledge-workflow",               // 講師如何用知識管理流程，把備課變成可複用系統
    ]
  },
  {
    key: "e3",
    label: "整理資料、LINE 訊息、建知識庫",
    desc: "LINE 群、逐字稿與會議紀錄、文書報帳、筆記標籤、知識庫。",
    picks: [
      "diary-driven-agent-3x4",                        // 寫日記，就讓 AI 乖乖幫你做事：3X4 資料整理法
      "line-group-ai-workflow",                        // 散在 LINE 各群組的資料，怎麼每天自動下載歸檔
      "learn-obsidian-mechanism",                      // 一定要用 Obsidian 嗎？
    ],
    ids: [
      "claude-multiple-google-accounts",               // 一個人管五個 Google 帳號，Claude 要怎麼一次串起來？
      "course-video-multimodal-search",                // 電腦裡一大堆圖片、影片，AI 找得到嗎？
      "learn-obsidian-mechanism",                      // 一定要用 Obsidian 嗎？
      "ai-retrieval-pages-backlinks",                  // 資料越存越多，怎麼讓 AI 找得到？
      "diary-driven-agent-3x4-v2",                     // 3X4 資料整理法新版：三種日記我改了
      "pii-shield",                                    // 用 AI 整理個案紀錄，個資會直接送出去嗎？
      "ai-batch-work-without-seeing-data",             // 可以讓 AI 大量處理個資，又不讓它讀到內容嗎？
      "line-backup-who-can-see-it",                    // 那個 LINE 備份工具，怎麼讀到你的訊息？
      "rag-three-retrieval-modes",                     // 把資料丟給 AI，它其實沒有全部看完：RAG 的三種查法與怎麼選
      "start-with-a-wrong-draft",                      // 不知道怎麼開始，就先讓 AI 給你一個錯的版本
      "why-split-data-into-cards",                     // 檔案有圖有文，Markdown 放不了圖怎麼辦？：為什麼要把資料拆成卡片
      "post-class-organizing-loop",                    // 一堂課上完之後，我怎麼把它變成可以重複用的知識：課後整理 Loop 全流程拆解
      "dual-centaur-meeting",                          // 開會兩三小時才對齊，有辦法快一點嗎？
      "strong-ai-models-knowledge-workflow-road",      // 先學工具還是先建知識庫？：模型像超跑，知識庫與工作流是你腳下的路
      "knowledge-as-employee",                         // 做過筆記也建過知識庫，還缺什麼？：把知識當員工的分水嶺
      "knowledge-os-master-map",                       // 學了一堆整理法跟 AI 工作流，為什麼兜不起來？
      "meeting-record-agent-workflow",                 // 會議有錄音也有逐字稿，為什麼事後還是查不到重點？
      "tag-wiki-method",                               // 資料越堆越多，AI 反而找不到怎麼辦？：標籤連結法 Tag Wiki
      "line-group-ai-workflow",                        // 散在 LINE 各群組的資料，怎麼每天自動下載歸檔
      "knowledge-base-three-vault-split",              // 知識庫太大，資料該怎麼分庫？：我改成三庫分流
      "codex-only-auto-worklog",                       // 工作日記老是忘記寫，能叫 AI 自動收集嗎？：只用 Codex 就能做到
      "youtube-to-opinion-report-workflow",            // 影片看完就忘了，怎麼變成用得上的東西？
      "diary-driven-agent-3x4",                        // 寫日記，就讓 AI 乖乖幫你做事：3X4 資料整理法
      "teacher-prep-knowledge-workflow",               // 講師如何用知識管理流程，把備課變成可複用系統
      "ai-data-organization-usable-system",            // AI 時代怎麼整理資料，讓文件變成可用的系統
      "notebooklm-knowledge-analysis-assistant",       // NotebookLM 怎麼從資料整理工具變成知識分析助理
    ],
    also: [
      "inspiration-production-system",                 // 每天想不到要發什麼？
      "cathay-tech-conference-2026",                   // 公司導入 AI，資料要先整理到什麼程度？
      "ai-data-red-lines",                             // 公司資料可以貼給 AI 嗎？
      "make-your-ai-secretary",                        // 怎麼做一個 AI 小秘書
      "book-to-ai-consultant",                         // 叫 AI 扮演名人就好了，為什麼還要提煉？：四種快做法各自停在哪裡
      "long-document-review-layers",                   // AI 改了十幾次還是有錯，怎麼辦？：資料清理只是第一關，長文件審不出錯的三層設計
      "messaging-apps-ai-friendliness",                // 通訊軟體 AI 友善度比較：LINE、Telegram、Discord、Slack，你的 AI 該住在哪？
      "one-on-one-questions",                          // AI 常見問題 37 問：知識庫怎麼建、技能包怎麼用、公司裡怎麼推
      "meeting-into-verifiable-loop",                  // 一場會議整理，我把它做成了一條可驗收的迴圈
      "a2a-agent-protocol",                            // AI 代理要接手工作了，你的流程和知識準備好了嗎？
      "intangible-assets-grow-by-sharing",             // 把專業提煉給 AI，會不會被學走？：無形資產越分享越豐盛
      "tidy-mess-before-consulting",                   // 找顧問前，先讓 AI 幫你把混亂整理成問題
      "yongli-ai-workshop-tools-to-workflow",          // 商會一日 AI 工作坊：從工具理解到工作流程與知識庫
      "books-videos-pdf-ai-advisor",                   // 把書、影片、PDF 轉成可對話的 AI 顧問
    ]
  },
  {
    key: "e4",
    label: "做網站、放上網",
    desc: "做網頁、官網放哪裡、網域、名片、客服小工具。",
    picks: [
      "hosting-platform-decision-tree",                // 我做的網頁，要放在哪裡別人才打得開？
      "one-sentence-ai-website-workflow",              // 我只用一句話，AI 怎麼把網站做完？
      "github-vercel-cloudflare-compare",              // 網站放 GitHub、Vercel 還是 Cloudflare？三家免費額度、商用限制與功能差異
    ],
    ids: [
      "line-namecard-share-button",                    // 官網放一顆按鈕，讓人把你的 LINE 名片傳到好友或群組
      "cloudflare-free-plan-limits",                   // Cloudflare 免費方案夠用嗎？
      "ai-customer-service-api-cost",                  // 我想在官網放 AI 客服，API 是什麼、會不會很貴？
      "domain-and-account-ownership",                  // 網域要去哪裡買？小編要給帳號密碼嗎？
      "one-sentence-ai-website-workflow",              // 我只用一句話，AI 怎麼把網站做完？
      "cloudflare-service-map",                        // Cloudflare 免費版到底能做什麼？
      "hosting-platform-decision-tree",                // 我做的網頁，要放在哪裡別人才打得開？
      "website-as-workstation",                        // 網站做完之後就沒人再打開了
      "where-is-my-server",                            // 我的 Server 架在哪裡？
      "self-hosted-site-analytics",                    // 裝了 Google Analytics，為什麼還是不知道訪客卡在哪？
      "ai-era-websites-for-agents",                    // AI 時代，網站開始同時服務人與 AI
      "webmcp-day-one",                                // AI 開始會用網站了，我當天把官網接上
      "webnode-to-cloudflare-pages",                   // 官網搬家一個月零元：把攝影網站從 Webnode 整站搬到 Cloudflare Pages
      "github-vercel-cloudflare-compare",              // 網站放 GitHub、Vercel 還是 Cloudflare？三家免費額度、商用限制與功能差異
      "parallel-site-editing",                         // 兩個 AI 同時改一個網站，為什麼會打架？
      "who-can-see-your-site",                         // 你的網頁其實沒鎖：公開資訊、付費內容、機密隱私該放哪一層
      "free-deploy-three-boundaries",                  // AI 幫你把網頁做好了，該放哪？GitHub Pages 與 Vercel 完整比較
      "agent-web-turning-point",                       // 網路上一半以上的訪問已經不是人了，你的內容準備好被機器讀了嗎？
      "laptop-desktop-webpage-sync-icloud-git",        // 在家裡桌機上用 Codex 做好網頁後，出門用筆電想要改，就找不到檔案了？問題出在你把專案放錯地方
      "publish-gate",                                  // 多個 AI 改同一個網站，怎麼不打架：發佈閘門
    ],
    also: [
      "ai-customer-service-model-retest",              // 官網 AI 客服要用哪個模型？
      "give-ai-choices-not-descriptions",              // 跟 AI 調配色，別讓它一直猜：六組一次給你挑，挑了再微調
      "market-to-ai",                                  // 大家都用 AI 搜尋了，SEO 還有用嗎？：學用 AI 行銷，也學對 AI 行銷
    ]
  },
  {
    key: "e5",
    label: "把重複工作交給 AI",
    desc: "AI 小秘書、信件行事曆、排程、自動化。",
    picks: [
      "make-your-ai-secretary",                        // 怎麼做一個 AI 小秘書
      "run-with-ai-first-then-script",                 // 用 AI 做自動化，要先寫程式嗎？
      "what-is-loop-engineering",                      // 每件事 AI 都要我確認，怎麼可以更自動？
    ],
    ids: [
      "open-source-ai-agent-24h-compare",              // 喜歡 Grok Bot 的 AI 員工模式，但每月 30 美元太貴，能自己架一個嗎？（上篇）
      "run-with-ai-first-then-script",                 // 用 AI 做自動化，要先寫程式嗎？
      "task-queue-mod",                                // Claude Code Mod 做任務佇列
      "chatgpt-web-codex-console",                     // 讓網頁版 ChatGPT 當 Codex 總控台
      "ai-schedule-wake-interval",                     // 讓 AI 定時整理資料前，先決定它多久醒一次
      "grok-bot-galaxy-day2-workshops",                // 客服、業務、開發客戶，AI 員工實際做到哪一步？
      "ai-vs-script-four-situations",                  // 讓 AI 只做需要判斷的事，其他交給程式
      "loop-four-entries",                             // 要讓 AI 自己工作，該怎麼下指令？
      "make-your-ai-secretary",                        // 怎麼做一個 AI 小秘書
      "five-loops-content-line",                       // 哪些事可以交給 AI 自己跑完？
      "harness-to-loop",                               // AI 每一步都要我按確認，我可以放手到哪裡？
      "what-is-graph-engineering",                     // 可以放著讓 AI 自己跑完嗎？
      "let-ai-do-the-setup",                           // 換電腦，設定又要重來一次嗎？：我把 OBS 交給 AI，一個選項都沒點過
      "mobile-to-desktop-publish-loop",                // 人在外面，可以叫家裡的電腦先做嗎？：手機掃一次 QR code，桌機就開始跑
      "meeting-into-verifiable-loop",                  // 一場會議整理，我把它做成了一條可驗收的迴圈
      "loop-engineering-guardrails",                   // AI 一直停下來要授權，怎麼讓它順順跑完？：迴圈護欄的五條規則
      "ai-changed-behavior-into-workflow",             // 把不知不覺被 AI 改變的行為，抓成一套流程
      "my-three-loops",                                // 同樣的事，每次都要重新跟 AI 交代一遍？
      "what-is-loop-engineering",                      // 每件事 AI 都要我確認，怎麼可以更自動？
      "agent-workflow-builds-automation",              // 所謂的 AI 自動化，到底是 AI 在跑還是程式在跑？
    ],
    also: [
      "claude-multiple-google-accounts",               // 一個人管五個 Google 帳號，Claude 要怎麼一次串起來？
      "pstack-knowledge-workflow",                     // AI 做的東西要怎麼確認，才敢放手讓它自己做？
      "ai-manages-ai-focus",                           // AI 能跑的任務越來越多，人的專注力有限
      "ai-employees-manage-agents",                    // AI 任務多到管不過來，下一步怎麼辦？
      "meeting-mic-rescue-on-mac",                     // 原廠軟體只有 Windows 版，我請 AI 在 Mac 上寫一個自己用的
      "start-from-one-persons-problem",                // Tesla 內部的一套工作方法，把自動化排在最後一步
      "reevaluate-models-same-test",                   // AI 小工具該用便宜模型還是貴的？
      "delete-before-automate",                        // 想用 AI 提升效率，結果都在瞎忙？
      "grok-bot-galaxy-day3-shipping",                 // 三天用 AI 員工開一間公司，最後出貨了什麼？
      "ai-custom-work-compound",                       // AI 讓開發變快了，為什麼工作還是越做越多？
      "what-are-subagents",                            // 什麼叫子代理？從分頭查資料到 30 人工作坊頁面
      "session-messaging-reminder-layer",              // Claude Code 的對話視窗之間可以直接傳訊息了，但有些小限制還是要注意
      "use-more-ai-not-enough",                        // 多數人只是用更多 AI，工作的形狀沒有變
      "answer-to-action-enterprise-ai-agent",          // 從 Answer 到 Action：我從簡立峰老師的公開觀察，看企業如何導入 AI Agent
      "long-task-completion-rate",                     // Opus 5 實測：10 個步驟的 Loop，你的 AI 跑到第幾步就停了
      "old-prompts-intent-first-loop-engineering",     // 舊提示詞不必丟：用它提煉你的意圖，再走向迴圈工程
      "post-class-organizing-loop",                    // 一堂課上完之後，我怎麼把它變成可以重複用的知識：課後整理 Loop 全流程拆解
      "recovery-over-perfection",                      // AI 自動跑出錯了怎麼收拾？：設計能容錯的 Loop
      "ai-loop-safety-recovery",                       // AI 出錯不可怕，沒有備援才可怕：一次搞壞 170 檔案的教訓
      "how-ai-connects-software",                      // AI Agent 怎麼幫我們直接操作軟體？
      "line-group-ai-workflow",                        // 散在 LINE 各群組的資料，怎麼每天自動下載歸檔
      "codex-only-auto-worklog",                       // 工作日記老是忘記寫，能叫 AI 自動收集嗎？：只用 Codex 就能做到
      "program-vs-ai-skill-library",                   // 有標準答案的交給程式，沒標準答案的才輪到 AI
    ]
  },
  {
    key: "e6",
    label: "讓 AI 照我的方法做事",
    desc: "技能包、規則檔、提示詞、訓練 AI 員工、多個 AI 分工。",
    picks: [
      "claude-skills-knowledge-assets",                // Claude Skills 是什麼？把你的專業流程，變成 AI 能重複執行的知識資產
      "intent-first-prompting",                        // 指令越寫越長，AI 卻沒更好？：把你要什麼講清楚，剩下交給 AI（系列 01）
      "eight-ai-system-concepts-2026",                 // 2026 年知識工作者的八個 AI 系統概念：從提示詞寫得好，到把系統搭起來
    ],
    ids: [
      "skill-pack-three-layers",                       // AI 換新模型，技能包要整份重寫嗎？
      "ai-employee-ask-before-act",                    // 交辦給 AI 的事，為什麼總是做得跟我想的不一樣？
      "at-a-glance",                                   // AI 講的話太長、太複雜，讓我看不懂？
      "rules-need-an-engine",                          // 寫了一堆規則給 AI，為什麼還是沒人執行？
      "ai-manages-ai-focus",                           // AI 能跑的任務越來越多，人的專注力有限
      "handoff-continue-or-replace",                   // AI 交接任務的心得分享
      "knowledge-workers-new-model-guide",             // AI 換新版，下指令的方式要跟著改嗎？
      "ai-employees-manage-agents",                    // AI 任務多到管不過來，下一步怎麼辦？
      "ai-understands-ei-ha",                          // AI 怎麼理解「欸」和「蛤」？
      "grok-bot-galaxy-day3-shipping",                 // 三天用 AI 員工開一間公司，最後出貨了什麼？
      "grok-bot-galaxy-day1-founders",                 // 一個人怎麼帶 22 個 AI 員工？
      "ai-custom-work-compound",                       // AI 讓開發變快了，為什麼工作還是越做越多？
      "let-ai-review-itself",                          // 我明明都講過了，AI 為什麼還要再問我？
      "what-are-subagents",                            // 什麼叫子代理？從分頭查資料到 30 人工作坊頁面
      "eight-ai-system-concepts-2026",                 // 2026 年知識工作者的八個 AI 系統概念：從提示詞寫得好，到把系統搭起來
      "elon-musk-live-skill",                          // 馬斯克技能包：給創業者與主管的第一性原理顧問
      "book-to-ai-consultant",                         // 叫 AI 扮演名人就好了，為什麼還要提煉？：四種快做法各自停在哪裡
      "long-answer-three-layers",                      // AI 回答太長看不下去？把內容變成白話、流程圖與說明網頁
      "meta-prompt-thirty-versions",                   // 同一份提示詞，三十個人做出三十種東西
      "build-your-own-dictionary",                     // 我跟 AI 說「很煩」，它自己去加了一道機制
      "answer-in-person-or-ai",                        // 同一個問題被問一百次，該親自回答還是丟給 AI
      "copied-mechanism-is-no-mechanism",              // 直接抄別人的 Skills、工作流，其實沒什麼用
      "session-messaging-reminder-layer",              // Claude Code 的對話視窗之間可以直接傳訊息了，但有些小限制還是要注意
      "before-installing-others-skill",                // 裝了別人的技能包，AI 會不會被搞亂？：抄之前我會先做三件事
      "ai-employee-four-levels",                       // 訓練 AI 員工的四個層次：從自己會用，到讓 AI 幫你訓練 AI
      "teach-ai-not-learn-ai",                         // 為什麼你的 AI 每次都要重講一遍：教 AI 的四個步驟
      "rule-file-rebound",                             // 規則檔越寫越長，AI 有照做嗎？：你寫的規則大部分沒在執行
      "ai-that-knows-you",                             // AI 回答總是不夠懂我，怎麼讓他更聰明？：從「懂我」到「能幫我做事」
      "old-prompts-intent-first-loop-engineering",     // 舊提示詞不必丟：用它提煉你的意圖，再走向迴圈工程
      "ai-handoff-instructions",                       // 換了另一家 AI，技能包要怎麼搬？：交接指令，難的是決定不寫什麼
      "mika-to-laika-product-character-design",        // AI 助理換個平台，能力就不一樣：我為什麼把它拆成兩個角色
      "chatgpt-work-skills-web-version",               // ChatGPT 網頁版終於能用技能包了：ChatGPT Work 從上手到兩個雷
      "map-is-not-the-territory",                      // 為什麼 AI 一直猜錯、要我重講一遍？：地圖不等於實際地形
      "intent-first-prompting",                        // 指令越寫越長，AI 卻沒更好？：把你要什麼講清楚，剩下交給 AI（系列 01）
      "docs-as-system-design-agent",                   // 文件就是系統：非工程師怎麼設計 Agent 框架
      "decision-ladder-non-programmer",                // 叫 AI 講簡潔一點，它還是一堆廢話？
      "how-to-train-your-ai-employee",                 // 如何訓練自己的 AI 員工：員工＋顧問框架
      "books-videos-pdf-ai-advisor",                   // 把書、影片、PDF 轉成可對話的 AI 顧問
      "liberal-arts-agent-framework",                  // 現在還需要學寫程式嗎？：文科生也能設計自己的 Agent 框架
      "claude-skills-knowledge-assets",                // Claude Skills 是什麼？把你的專業流程，變成 AI 能重複執行的知識資產
      "semantic-rules-before-prompt-templates",        // 提示詞模板為什麼時好時壞？先懂 AI 是強一億倍的手機輸入法
    ],
    also: [
      "ai-employee-experienced-managers",              // AI 員工誰帶得好？有經驗的主管可能更有優勢
      "ai-employee-tests-new-tools",                   // 看到新 AI 工具，要自己去 GitHub 找來裝嗎？
      "know-ai-assign-ai",                             // 用 AI 跟用人一模一樣
      "diary-driven-agent-3x4-v2",                     // 3X4 資料整理法新版：三種日記我改了
      "chatgpt-web-codex-console",                     // 讓網頁版 ChatGPT 當 Codex 總控台
      "ai-adoption-raise-not-install",                 // 企業導入 AI 為什麼這麼難？
      "slides-by-audience-sop",                        // 怎麼把 AI 訓練成懂你的簡報助理？
      "one-sentence-video-to-deep-article",            // 我怎麼一句話，就讓我的 AI 把一支專題影片變成一篇深度文章？
      "opus-luna-model-division",                      // 頂規 AI 模型很貴，哪些事交給它、哪些交給便宜的？
      "ai-rule-file-slimming",                         // AI 規則檔裝了攔截器，52 天一條都沒擋下來
      "loop-four-entries",                             // 要讓 AI 自己工作，該怎麼下指令？
      "how-to-verify-ai-rule-changes",                 // 改完規則，怎麼知道 AI 到底有沒有變乖？
      "cross-ai-review-both-wrong",                    // OpenAI 出了官方外掛，讓 Codex 能接到 Claude Code 一起工作
      "personal-poster-and-wallpaper",                 // 用手機做一張自己的電影海報和手機桌布：先讓 AI 認識你，它才畫得出你
      "start-with-a-wrong-draft",                      // 不知道怎麼開始，就先讓 AI 給你一個錯的版本
      "after-ai-says-remembered",                      // 交代過的事 AI 為什麼老是忘記？：從『我記住了』到讓 AI 自己跑
      "three-levels-of-cross-review",                  // 怎麼設計讓兩個 AI 互審？：三種不同程度的審查機制設計
      "chatgpt-work-codex-choice",                     // ChatGPT Work、Codex、一般 ChatGPT 怎麼分工？先看電腦、資料與額度
      "manage-ai-with-management-knowledge",           // 用你已經有的管理知識來管理 AI，以豐田 TPS 為例
      "train-your-ai-agent-editor",                    // 沒空寫，可以叫 AI 幫我寫嗎？：讓 AI 認識你，比學會用 AI 更重要
      "questionnaire-to-slides-agent-workflow",        // 把課前問卷變成簡報，再把流程存成技能包
      "dual-centaur-meeting",                          // 開會兩三小時才對齊，有辦法快一點嗎？
      "knowledge-as-employee",                         // 做過筆記也建過知識庫，還缺什麼？：把知識當員工的分水嶺
      "knowledge-os-master-map",                       // 學了一堆整理法跟 AI 工作流，為什麼兜不起來？
      "ai-changed-behavior-into-workflow",             // 把不知不覺被 AI 改變的行為，抓成一套流程
      "harness-mindset-for-bosses",                    // 給老闆的駕馭思維：把不敢對員工說的，講給 AI 聽（系列 02）
      "prompt-to-loop-map",                            // 跟 AI 合作該從哪裡學起？
      "my-three-loops",                                // 同樣的事，每次都要重新跟 AI 交代一遍？
      "own-ai-team-at-work",                           // 效率提升好幾倍，公司又不加薪，為什麼要做？：在公司上班也能有自己的 AI 團隊
      "caught-ai-slacking-into-rules",                 // AI 寫的東西我怎麼確認它是對的？：抓到 AI 偷懶之後，我把它寫進流程規則
    ]
  },
  {
    key: "e7",
    label: "AI 做錯了，怎麼辦",
    desc: "東西是壞的、忘記交代、當機、互相檢查、安全與權限。",
    picks: [
      "ai-said-it-watched-the-video",                  // AI 交出一份很專業的分析，但它根本沒看過那支影片
      "dual-track-planning-loop",                      // 如何讓兩個不同的 AI 互相挑錯、自己訂正？：我的企劃送出前先被模擬評審打了 2/5 分
      "agent-three-layer-triage",                      // 「AI 說它做完了，可是東西是壞的」
    ],
    ids: [
      "ai-worktree-disk-cleanup",                      // 在電腦裡用 Agent 跑任務，硬碟突然就爆滿了？
      "api-key-dont-paste-to-ai",                      // API key 可以貼給 AI 嗎？
      "pstack-knowledge-workflow",                     // AI 做的東西要怎麼確認，才敢放手讓它自己做？
      "ai-random-true-random",                         // 你以為 AI 在隨機抽，其實它最愛 7
      "agent-three-layer-triage",                      // 「AI 說它做完了，可是東西是壞的」
      "ai-data-red-lines",                             // 公司資料可以貼給 AI 嗎？
      "ai-rule-file-slimming",                         // AI 規則檔裝了攔截器，52 天一條都沒擋下來
      "design-for-ai-errors",                          // AI 說「我確定」，它的回答我可以直接照做嗎？
      "how-to-verify-ai-rule-changes",                 // 改完規則，怎麼知道 AI 到底有沒有變乖？
      "loop-round-limit",                              // AI 自己跑，會不會一直跑到額度燒完？
      "cross-ai-review-both-wrong",                    // OpenAI 出了官方外掛，讓 Codex 能接到 Claude Code 一起工作
      "ai-said-it-watched-the-video",                  // AI 交出一份很專業的分析，但它根本沒看過那支影片
      "openrouter-deepseek-data-routing",              // OpenRouter 用 DeepSeek，資料就不會經過中國嗎？教你自己查實際路由供應商
      "after-ai-says-remembered",                      // 交代過的事 AI 為什麼老是忘記？：從『我記住了』到讓 AI 自己跑
      "three-levels-of-cross-review",                  // 怎麼設計讓兩個 AI 互審？：三種不同程度的審查機制設計
      "long-document-review-layers",                   // AI 改了十幾次還是有錯，怎麼辦？：資料清理只是第一關，長文件審不出錯的三層設計
      "long-task-completion-rate",                     // Opus 5 實測：10 個步驟的 Loop，你的 AI 跑到第幾步就停了
      "dual-track-planning-loop",                      // 如何讓兩個不同的 AI 互相挑錯、自己訂正？：我的企劃送出前先被模擬評審打了 2/5 分
      "recovery-over-perfection",                      // AI 自動跑出錯了怎麼收拾？：設計能容錯的 Loop
      "ai-loop-safety-recovery",                       // AI 出錯不可怕，沒有備援才可怕：一次搞壞 170 檔案的教訓
      "codex-log-health-check",                        // Codex 整個大當機？重安裝後第一步先檢查 logs_2.sqlite
      "caught-ai-slacking-into-rules",                 // AI 寫的東西我怎麼確認它是對的？：抓到 AI 偷懶之後，我把它寫進流程規則
    ],
    also: [
      "two-computers-combine-data-icloud",             // 三台電腦用同一個帳號，AI 用量要怎麼合、額度該由誰去查？
      "ai-employee-ask-before-act",                    // 交辦給 AI 的事，為什麼總是做得跟我想的不一樣？
      "auto-compact-mod",                              // 離開超過一小時回來，AI 對話為什麼變貴？
      "rules-need-an-engine",                          // 寫了一堆規則給 AI，為什麼還是沒人執行？
      "task-queue-mod",                                // Claude Code Mod 做任務佇列
      "handoff-continue-or-replace",                   // AI 交接任務的心得分享
      "pii-shield",                                    // 用 AI 整理個案紀錄，個資會直接送出去嗎？
      "ai-batch-work-without-seeing-data",             // 可以讓 AI 大量處理個資，又不讓它讀到內容嗎？
      "fixed-test-set-for-ai",                         // 新模型出來，我怎麼知道它對我的工作真的比較好？
      "ai-user-testing",                               // 做完的東西想找人幫忙看，卻找不到人？
      "claude-meta-ads-connector",                     // Meta 廣告後台可以整段交給 AI 嗎？
      "let-ai-review-itself",                          // 我明明都講過了，AI 為什麼還要再問我？
      "harness-to-loop",                               // AI 每一步都要我按確認，我可以放手到哪裡？
      "parallel-site-editing",                         // 兩個 AI 同時改一個網站，為什麼會打架？
      "same-question-different-answers",               // 同一個問題問兩次，AI 為什麼給出不同答案？：程式與 AI 的差異
      "who-can-see-your-site",                         // 你的網頁其實沒鎖：公開資訊、付費內容、機密隱私該放哪一層
      "cognitive-debt",                                // AI 做的東西看不懂，可以先用再說嗎？：認知債可以欠，重點是懂得還
      "before-installing-others-skill",                // 裝了別人的技能包，AI 會不會被搞亂？：抄之前我會先做三件事
      "rule-file-rebound",                             // 規則檔越寫越長，AI 有照做嗎？：你寫的規則大部分沒在執行
      "laptop-desktop-webpage-sync-icloud-git",        // 在家裡桌機上用 Codex 做好網頁後，出門用筆電想要改，就找不到檔案了？問題出在你把專案放錯地方
      "loop-engineering-guardrails",                   // AI 一直停下來要授權，怎麼讓它順順跑完？：迴圈護欄的五條規則
      "publish-gate",                                  // 多個 AI 改同一個網站，怎麼不打架：發佈閘門
      "map-is-not-the-territory",                      // 為什麼 AI 一直猜錯、要我重講一遍？：地圖不等於實際地形
    ]
  },
  {
    key: "e8",
    label: "選工具、看費用",
    desc: "工具與模型怎麼選、訂閱方案、額度與花費。",
    picks: [
      "chatgpt-work-codex-choice",                     // ChatGPT Work、Codex、一般 ChatGPT 怎麼分工？先看電腦、資料與額度
      "opus-luna-model-division",                      // 頂規 AI 模型很貴，哪些事交給它、哪些交給便宜的？
      "token-money-worth-doing",                       // 用 AI 解決一件事，花的錢值不值得？
    ],
    ids: [
      "two-computers-combine-data-icloud",             // 三台電腦用同一個帳號，AI 用量要怎麼合、額度該由誰去查？
      "auto-compact-mod",                              // 離開超過一小時回來，AI 對話為什麼變貴？
      "ai-employee-tests-new-tools",                   // 看到新 AI 工具，要自己去 GitHub 找來裝嗎？
      "google-ai-pro-api-credits",                     // Google AI Pro 每月送的 10 美元 API 額度，怎麼領、怎麼用
      "know-ai-assign-ai",                             // 用 AI 跟用人一模一樣
      "ai-customer-service-model-retest",              // 官網 AI 客服要用哪個模型？
      "token-money-worth-doing",                       // 用 AI 解決一件事，花的錢值不值得？
      "ai-model-token-efficiency",                     // 新的 AI 模型 Token 效率要怎麼比較？
      "opus-luna-model-division",                      // 頂規 AI 模型很貴，哪些事交給它、哪些交給便宜的？
      "reevaluate-models-same-test",                   // AI 小工具該用便宜模型還是貴的？
      "fixed-test-set-for-ai",                         // 新模型出來，我怎麼知道它對我的工作真的比較好？
      "ai-image-api-cost",                             // gpt-image-2.5 生一張圖多少錢？
      "ai-usage-audit",                                // AI 越用越貴，我掃了自己一個月的用量
      "messaging-apps-ai-friendliness",                // 通訊軟體 AI 友善度比較：LINE、Telegram、Discord、Slack，你的 AI 該住在哪？
      "chatgpt-work-codex-choice",                     // ChatGPT Work、Codex、一般 ChatGPT 怎麼分工？先看電腦、資料與額度
      "ai-cp-value-calculus",                          // 模型不是越聰明越好：我開始學著算 AI 的 CP 值
    ],
    also: [
      "open-source-ai-agent-24h-compare",              // 喜歡 Grok Bot 的 AI 員工模式，但每月 30 美元太貴，能自己架一個嗎？（上篇）
      "cloudflare-free-plan-limits",                   // Cloudflare 免費方案夠用嗎？
      "ai-customer-service-api-cost",                  // 我想在官網放 AI 客服，API 是什麼、會不會很貴？
      "ai-schedule-wake-interval",                     // 讓 AI 定時整理資料前，先決定它多久醒一次
      "cloudflare-service-map",                        // Cloudflare 免費版到底能做什麼？
      "grok-bot-galaxy-day1-founders",                 // 一個人怎麼帶 22 個 AI 員工？
      "line-backup-who-can-see-it",                    // 那個 LINE 備份工具，怎麼讀到你的訊息？
      "loop-round-limit",                              // AI 自己跑，會不會一直跑到額度燒完？
      "mac-for-agent-beginners",                       // 想學 Agent，我為什麼會先推薦 Mac？
      "github-vercel-cloudflare-compare",              // 網站放 GitHub、Vercel 還是 Cloudflare？三家免費額度、商用限制與功能差異
      "openrouter-deepseek-data-routing",              // OpenRouter 用 DeepSeek，資料就不會經過中國嗎？教你自己查實際路由供應商
      "free-deploy-three-boundaries",                  // AI 幫你把網頁做好了，該放哪？GitHub Pages 與 Vercel 完整比較
      "chatgpt-work-skills-web-version",               // ChatGPT 網頁版終於能用技能包了：ChatGPT Work 從上手到兩個雷
      "web-chat-ai-vs-desktop-agent",                  // 桌面版和開發者版差在哪？：網頁聊天型 AI 與桌面幹活型 AI 的分界（Codex）
    ]
  }
];

// 哪個入口都不合的文章（趨勢評論、個人觀點等）：只出現在全部文章與搜尋裡。
window.ARTICLE_ENTRY_NONE = [
  "first-principles-money-soup",                   // 從一篇賺錢雞湯文，看馬斯克第一性原理
  "audrey-tang-reverse-alignment",                 // 每天用 AI，怎麼知道自己沒有被它牽著走？
  "meeting-mic-rescue-on-mac",                     // 原廠軟體只有 Windows 版，我請 AI 在 Mac 上寫一個自己用的
  "agi-work-and-discovery",                        // AI 很會做事，距離 AGI 還差哪一步？從工作能力到創造新知的兩把尺
  "talent-vs-expertise",                           // 我的強項到底是什麼？：努力學來的是專業，輕鬆就會的才是天賦
  "timing-and-forecast",                           // 資訊時差與市場預測：怎麼比市場早一步，又不會早太多
  "personal-studio-vs-solo-company",               // 個人工作室與一人公司差在哪？我會看兩件事
  "agent-native-tools-software-interface",         // Agent 原生工具會讓軟體介面退到後台嗎？
  "four-lens-rapid-review",                        // 忙到迷惘時，用四視角快速復盤找回方向
  "intangible-assets-grow-by-sharing",             // 把專業提煉給 AI，會不會被學走？：無形資產越分享越豐盛
  "ai-king-off-battlefield",                       // AI 之王不上戰場：換個角度看蘋果、Google 與 AI 入口
  "spacex-ipo-musk-trillionaire-knowledge-work",   // 世界首富用一兆美金，替知識工作者指出的那條路
  "apple-wwdc26-siri-lobster-ai",                  // 蘋果的 Siri 終於要往「龍蝦 AI」進化了
  "demis-hassabis-agi-science-ai",                 // AGI 山腳下，真正被改寫的是稀缺時代的規則
  "relationship-boundary-ai-practice",             // 用 AI 練習課題分離、責任歸還與情緒回應
];
