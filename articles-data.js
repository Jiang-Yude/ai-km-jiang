/* ============================================================
   articles-data.js  ·  深度文章總站唯一資料源（Single Source of Truth）
   ------------------------------------------------------------
   新增一篇文章 = 在 window.ARTICLES 陣列尾端加一個物件即可。
   articles.html 會自動長出卡片與交集篩選。

   ⚠️ 標籤一律從 window.ARTICLE_TAGS 的受控清單挑，對齊知識庫
      tag-dictionary.md，不要自創字串。三個篩選維度：
        topic        主題  → D2內容（這篇在講什麼）
        level        難度  → D3難度等級（零基礎入門/基礎/進階/專業）
        content_type 類型  → 文章種類（教學/觀點/趨勢/案例）
   「適合誰」不做篩選（身份會重疊），只用 audience 欄位寫成一句話放卡片。

   ⚠️ related 雙向對稱：A 的 related 列了 B，B 的 related 也要列回 A。
      手寫精選版頁面（own-ai-team-at-work）的相關文章在 HTML 內手寫，
      不靠本檔，故不在這裡跟它做雙向。

   待辦（受控詞彙四方同步，尚未做到 Obsidian 字典）：
     新增 D3文件用途：教學文章/觀點文章/趨勢文章/案例文章
     新增 D2主題：AI趨勢；D2工具：Codex
     難度 D3：零基礎→零基礎入門（或補別名）
   ============================================================ */

window.ARTICLE_TAGS = {
  topic: [
    "知識管理", "AI工作流", "AIAgent", "工作流程", "工具操作",
    "技能包設計", "ClaudeSkills", "知識庫", "輔助決策",
    "差異比較", "數位轉型", "隱性知識", "提示詞設計", "AI趨勢"
  ],
  level: ["零基礎入門", "基礎", "進階", "專業"],
  content_type: ["教學文章", "觀點文章", "趨勢文章", "案例文章"]
};

window.ARTICLES = [

  /* ── 1. 代理工作流蓋自動化工作流（案例）── */
  {
    id: "agent-workflow-builds-automation",
    url: "articles/agent-workflow-builds-automation/",
    date: "2026-06-16",
    title: "我用 Agent，幫我設一套程式自動化工作流",
    problem: "搞不清楚「AI 自動化」到底是 AI 在跑、還是程式在跑，也不知道 AI 該插手在哪一段。",
    audience: "想把重複工作變成會自己跑的流程、又分不清 AI 與程式分工的人。",
    summary: "自動化要分成兩個概念看：Agent 工作流幫我把流程建起來，程式自動化工作流建好之後自己跑。用 Codex 設定 LINE 備份機器人的案例，拆解兩者的分工，並給一個判斷哪一段交給 AI、哪一段交給程式的實用框架。",
    tags: {
      topic: ["AI工作流", "AIAgent", "工作流程", "工具操作"],
      level: ["基礎"],
      content_type: ["案例文章"]
    },
    external: { threads: "https://www.threads.com/@jiang_yude_coach", vocus: null },
    related: ["program-vs-ai-skill-library", "how-to-train-your-ai-employee", "line-group-ai-workflow", "codex-log-health-check", "how-ai-connects-software", "meeting-record-agent-workflow", "vibe-coding-ten-half-products", "ai-delegators-optimism", "ai-changed-behavior-into-workflow", "give-ai-choices-not-descriptions"]
  },

  /* ── 2. 只用 Codex 建立自動工作日誌（教學）── */
  {
    id: "codex-only-auto-worklog",
    url: "articles/codex-only-auto-worklog/",
    date: "2026-06-16",
    title: "只用 Codex，也能建立自己的自動工作日誌",
    problem: "用 AI 做完一輪事，晚上卻說不清楚今天完成了什麼；工具一多，工作痕跡更散。",
    audience: "剛開始用 Codex、想讓它幫你記錄每天工作的人，以及在猶豫要不要上跨 Agent 工作鏡子的人。",
    summary: "只用 Codex 就用它的定時任務自動記錄；同時用多款 Agent，才需要跨 Agent 工作鏡子。附可直接複製的提示詞。",
    tags: {
      topic: ["AI工作流", "AIAgent", "工作流程", "知識管理"],
      level: ["零基礎入門"],
      content_type: ["教學文章"]
    },
    external: { threads: "https://www.threads.com/@jiang_yude_coach", vocus: "https://vocus.cc/salon/Jiang_Coach" },
    related: ["questionnaire-to-slides-agent-workflow", "own-ai-team-at-work", "caught-ai-slacking-into-rules", "line-group-ai-workflow", "codex-log-health-check", "meeting-record-agent-workflow", "vibe-coding-ten-half-products"]
  },

  /* ── 3. 有標準答案的交給程式，沒標準答案的才輪到 AI（觀點）── */
  {
    id: "program-vs-ai-skill-library",
    url: "ai-trends/program-vs-ai-skill-library/",
    date: "2026-06-15",
    title: "有標準答案的交給程式，沒標準答案的才輪到 AI",
    problem: "企業導入 AI 卡在不知道用在哪、也不知道怎麼讓 AI 真的會做公司的事。",
    audience: "想導入 AI、又怕用錯地方的經營者與團隊負責人。",
    summary: "用一個判斷框架把工作分成確定與不確定：確定交給程式和 ERP，不確定才輪到 AI，再把它整合成技能庫。",
    tags: {
      topic: ["ClaudeSkills", "技能包設計", "知識庫", "差異比較", "數位轉型"],
      level: ["進階"],
      content_type: ["觀點文章"]
    },
    external: { threads: null, vocus: null },
    related: ["own-ai-team-at-work", "agent-workflow-builds-automation", "how-ai-connects-software", "decision-ladder-non-programmer"]
  },

  /* ── 4-6. 趨勢判讀 ── */
  {
    id: "spacex-ipo-musk-trillionaire-knowledge-work",
    url: "ai-trends/spacex-ipo-musk-trillionaire-knowledge-work/",
    date: "2026-06-13",
    title: "世界首富用一兆美金，替知識工作者指出的那條路",
    problem: "執行被自動化後，知識工作者還剩下什麼價值、該守住什麼。",
    audience: "擔心工作被 AI 取代、想找到不可替代位置的知識工作者。",
    summary: "從 SpaceX 上市與招股書「自動化知識工作」，看執行被自動化後，該守住的判斷與該做的知識庫。",
    tags: {
      topic: ["AI趨勢", "知識管理"],
      level: ["基礎"],
      content_type: ["趨勢文章"]
    },
    external: { threads: null, vocus: null },
    related: ["elon-musk-live-skill", "ai-capability-tiers", "company-shape-is-the-moat"]
  },
  {
    id: "demis-hassabis-agi-science-ai",
    url: "ai-trends/demis-hassabis-agi-science-ai/",
    date: "2026-06-09",
    title: "AGI 山腳下，真正被改寫的是稀缺時代的規則",
    problem: "AGI 與後稀缺時代，個人與組織的知識管理規則會怎麼變。",
    audience: "想提前看懂 AI 長期趨勢、為知識資產佈局的人。",
    summary: "從 Stanford GSB 對談出發，看 AGI、後稀缺、智能與意識分離，如何改寫 AI 知識管理與 AI 員工。",
    tags: {
      topic: ["AI趨勢", "知識管理"],
      level: ["基礎"],
      content_type: ["趨勢文章"]
    },
    external: { threads: null, vocus: null },
    related: ["ai-capability-tiers"]
  },
  {
    id: "apple-wwdc26-siri-lobster-ai",
    url: "ai-trends/apple-wwdc26-siri-lobster-ai/",
    date: "2026-06-09",
    title: "蘋果的 Siri 終於要往「龍蝦 AI」進化了",
    problem: "各家大廠都把助理推向能讀介面、叫工具、串 App 完成任務，這對個人工作流代表什麼。",
    audience: "想跟上 AI 助理形態變化、調整自己工作流的人。",
    summary: "從 WWDC26 看 Apple Intelligence、App Intents 到 Xcode agents，判讀助理正在變成會自己動手的形態。",
    tags: {
      topic: ["AI趨勢", "AIAgent"],
      level: ["基礎"],
      content_type: ["趨勢文章"]
    },
    external: { threads: null, vocus: null },
    related: ["ai-capability-tiers", "vibe-coding-ten-half-products"]
  },

  /* ── 7. 抓到 AI 偷懶之後，把它寫進流程規則（案例）── */
  {
    id: "caught-ai-slacking-into-rules",
    url: "articles/caught-ai-slacking-into-rules/",
    date: "2026-06-08",
    title: "抓到 AI 偷懶之後，我把它寫進流程規則",
    problem: "AI 可能沒有執行外部動作，卻用一個看起來完成任務的回答蓋過去，你不確定它有沒有真的照流程做事。",
    audience: "已經開始用 ChatGPT、Codex、Claude、Gemini 分工，常叫 AI 去查、去叫另一個模型、幫我記住的人。",
    summary: "我叫 Codex 請 Claude 修文，它沒真的叫卻回了一版像完成的答案。復盤怎麼追問 AI 有沒有真的執行外部動作，並把踩坑寫成規則。附可直接複製的檢查句。",
    tags: {
      topic: ["AIAgent", "AI工作流", "工作流程"],
      level: ["基礎"],
      content_type: ["案例文章"]
    },
    external: { threads: "https://www.threads.com/@jiang_yude_coach", vocus: "https://vocus.cc/salon/Jiang_Coach" },
    related: ["codex-only-auto-worklog", "decision-ladder-non-programmer", "publish-gate"]
  },

  /* ── 8. AI 之王不上戰場（觀點）── */
  {
    id: "ai-king-off-battlefield",
    url: "articles/ai-king-off-battlefield/",
    date: "2026-06-17",
    title: "AI 之王不上戰場：換個角度看蘋果、Google 與 AI 入口",
    problem: "看 AI 發展很容易只盯著誰跑分高、誰的模型強，少了從產業結構與入口角度看趨勢的視角。",
    audience: "常追 AI 新聞、習慣用跑分和排行榜看誰強，想拉遠一點理解 AI 趨勢的人。",
    summary: "一個角度而非預言：把模型公司想成將軍、掌握入口的公司想成後台的王。當模型越來越商品化，真正稀缺的可能是入口。不是要你相信結論，是多一個觀察趨勢的視角。",
    tags: {
      topic: ["AI趨勢", "差異比較", "數位轉型"],
      level: ["基礎"],
      content_type: ["觀點文章"]
    },
    external: { threads: "https://www.threads.com/@jiang_yude_coach", vocus: "https://vocus.cc/salon/Jiang_Coach" },
    related: ["ai-capability-tiers", "company-shape-is-the-moat"]
  },

  /* ── 9. 知識庫太大，改成三庫分流（教學）── */
  {
    id: "knowledge-base-three-vault-split",
    url: "articles/knowledge-base-three-vault-split/",
    date: "2026-06-19",
    title: "知識庫太大，我改成三庫分流",
    problem: "知識庫越長越大、全部混在一個庫，找文件要捲很久，AI 也常讀到用不到的東西、找不到該執行的程式。想拆開又不知道照什麼標準拆。",
    audience: "知識庫越長越大、開始翻不動，想把它拆開又不知道該照什麼標準拆的人。",
    summary: "一套可以照做的拆庫方法：別用檔案型別分，改問「這東西是誰要用的」，分成主庫（人用）、副庫（AI 執行）、對外庫（受眾），再立一條先讀檢索頁再存檔的流程，外加一個以能運作為準的例外處理。",
    tags: {
      topic: ["知識管理", "知識庫", "AIAgent"],
      level: ["基礎"],
      content_type: ["教學文章"]
    },
    external: { threads: "https://www.threads.com/@jiang_yude_coach", vocus: "https://vocus.cc/salon/Jiang_Coach" },
    related: ["diary-driven-agent-3x4", "tag-wiki-method"]
  },

  /* ── 10. 在公司上班，你也可以有自己的 AI 團隊（觀點，手寫精選版）── */
  {
    id: "own-ai-team-at-work",
    url: "articles/own-ai-team-at-work/",
    date: "2026-06-20",
    title: "在公司上班，你也可以有自己的 AI 團隊",
    problem: "在公司上班，總覺得多做也沒用，想把工作變成自己的系統卻不知道從哪開始，也一直訓練不出自己的 AI。",
    audience: "在公司上班、又想把工作做成一套系統的人，特別是有資源的中高階主管，以及想經營副業、未來自己接案的資深工作者。",
    summary: "把自己從員工心態切換成一人公司老闆，公司是你目前唯一的長期固定客戶。同樣的事差別只在心態，而沒有這個轉換，是訓練不出自己的 AI 團隊的。",
    tags: {
      topic: ["AIAgent", "數位轉型"],
      level: ["零基礎入門"],
      content_type: ["觀點文章"]
    },
    external: { threads: "https://www.threads.com/@jiang_yude_coach", vocus: null },
    related: ["codex-only-auto-worklog", "program-vs-ai-skill-library", "how-to-train-your-ai-employee", "elon-musk-live-skill"]
  },

  /* ── 11. AI 就是整個市場的縮影：先用 AI 測反應（教學）── */
  {
    id: "ai-market-microcosm",
    url: "articles/ai-market-microcosm/",
    date: "2026-06-20",
    title: "AI 就是整個市場的縮影：在花錢做市調前，先用 AI 測反應",
    problem: "想推新產品、新課程、新服務，又沒把握有沒有人買；做大規模市場調查又慢又貴，landing page 哪裡被誤解也看不出來。",
    audience: "想推新產品、新課程、新服務但還沒把握有沒有人買的人；做一人公司或中小企業、沒預算大規模做市調的人；已有 landing page 想先檢查哪裡被誤解的人。",
    summary: "AI 讀過海量真實的人寫的東西，本身就是市場的縮影。高露潔與 PyMC Labs 的研究證實，先讓 AI 寫反應再換算成分數，模擬購買意願能接近真人自我一致性的九成。附可複製提示詞與免費技能包。",
    tags: {
      topic: ["輔助決策", "AI工作流", "提示詞設計"],
      level: ["零基礎入門"],
      content_type: ["教學文章"]
    },
    external: { threads: "https://www.threads.com/@jiang_yude_coach", vocus: null },
    related: ["elon-musk-live-skill", "ai-capability-tiers"]
  },

  /* ── 12. 如何訓練自己的 AI 員工：員工＋顧問框架（教學）── */
  {
    id: "how-to-train-your-ai-employee",
    url: "articles/how-to-train-your-ai-employee/",
    date: "2026-06-21",
    title: "如何訓練自己的 AI 員工：員工＋顧問框架",
    problem: "知道該用 AI，卻習慣自己動手操作工具；想把工作交出去，又不知道怎麼把第一個 AI 員工真的訓練出來。",
    audience: "想把重複的行政、文書、查證交給 AI，並開始建立自己一套 AI 工作流的工作者、一人公司與創作者。",
    summary: "一場實作工作坊的教學簡報。把 AI 當員工照你的方式幹活，再加一群顧問幫你挑盲點；從組織架構、隱性知識提煉七層，到把節點串成工作流，最後是真正最值錢的能力：判斷一個問題值多少。",
    tags: {
      topic: ["AIAgent", "AI工作流", "隱性知識"],
      level: ["零基礎入門"],
      content_type: ["教學文章"]
    },
    external: { threads: "https://www.threads.com/@jiang_yude_coach", vocus: null },
    related: ["strong-ai-models-knowledge-workflow-road", "questionnaire-to-slides-agent-workflow", "teacher-prep-knowledge-workflow", "own-ai-team-at-work", "agent-workflow-builds-automation", "line-group-ai-workflow", "elon-musk-live-skill", "codex-log-health-check", "how-ai-connects-software", "meeting-record-agent-workflow", "decision-ladder-non-programmer", "tidy-mess-before-consulting", "diary-driven-agent-3x4", "docs-as-system-design-agent", "what-is-loop-engineering", "map-is-not-the-territory", "intangible-assets-grow-by-sharing", "manage-ai-with-management-knowledge"]
  },

  /* ── 13. LINE 群組也能變成 AI 工作流入口（教學）── */
  {
    id: "line-group-ai-workflow",
    url: "articles/line-group-ai-workflow/",
    date: "2026-06-22",
    title: "散在 LINE 各群組的資料，怎麼每天自動下載歸檔",
    problem: "團隊資料散在 LINE 群組裡，文字、圖片、PDF 和連結當下看得到，過幾天要整理時卻很難找回來。",
    audience: "已經有 LINE 群組的課程、社群、小團隊與專案協作者，想把散在各群組的資料先收回來再交給 AI 整理的人。",
    summary: "把散在 LINE 各群組的訊息、圖片、PDF 和檔案，用官方帳號每天自動收下來、分資料夾歸檔，再讓 Agent 整理。Mika 是示範角色。",
    tags: {
      topic: ["AI工作流", "AIAgent", "工具操作"],
      level: ["零基礎入門"],
      content_type: ["教學文章"]
    },
    external: { threads: "https://www.threads.com/@jiang_yude_coach", vocus: null },
    related: ["agent-workflow-builds-automation", "codex-only-auto-worklog", "how-to-train-your-ai-employee"]
  },

  /* ── 14. 活的馬斯克技能包（教學）── */
  {
    id: "elon-musk-live-skill",
    url: "articles/elon-musk-live-skill/",
    date: "2026-06-22",
    title: "活的馬斯克技能包：給創業者與主管的第一性原理顧問",
    problem: "創業者、主管和老闆需要有人協助拆問題、反問假設、看見盲點，同時又希望參考公開資料時能分清楚本人內容、公司一手資訊、新聞報導與新聞評論。",
    audience: "想用第一性原理拆產品、團隊、資源配置與決策盲點的創業者、主管、老闆，以及想下載開源技能包實作的人。",
    summary: "這篇介紹馬斯克第一性原理對練技能包：把馬斯克常見的第一性原理思考方式整理成 AI 顧問流程，陪創業者與主管練習拆產品、市場、團隊與資源配置問題。",
    tags: {
      topic: ["技能包設計", "AIAgent", "輔助決策", "AI工作流"],
      level: ["零基礎入門"],
      content_type: ["教學文章"]
    },
    external: { threads: "https://www.threads.com/@jiang_yude_coach", vocus: null },
    related: ["spacex-ipo-musk-trillionaire-knowledge-work", "how-to-train-your-ai-employee", "own-ai-team-at-work", "ai-market-microcosm", "vibe-coding-ten-half-products"]
  },

  /* ── 15. Codex log 健康巡檢（教學）── */
  {
    id: "codex-log-health-check",
    url: "articles/codex-log-health-check/",
    date: "2026-06-23",
    title: "Codex 整個大當機？重安裝後第一步先檢查 logs_2.sqlite",
    problem: "Codex Desktop 打不開、更新無效、最後只能重安裝，重裝後任務和本機工作現場也可能一起消失。",
    audience: "每天使用 Codex Desktop 的知識工作者、講師、一人公司與 AI Agent 使用者，特別是已經把 Codex 當成日常工作台的人。",
    summary: "用學員實際當機畫面當案例，整理 logs_2.sqlite 是什麼、出事時怎麼安全處理、怎麼設定每 3 到 5 天自動巡檢，以及如何靠工作日誌和技能包避免任務心血跟著工具故障一起不見。",
    tags: {
      topic: ["工具操作", "AI工作流", "AIAgent"],
      level: ["零基礎入門"],
      content_type: ["教學文章"]
    },
    external: { threads: "https://www.threads.com/@jiang_yude_coach", vocus: null },
    related: ["codex-only-auto-worklog", "agent-workflow-builds-automation", "how-to-train-your-ai-employee"]
  },

  /* ── 16. AI Agent 怎麼直接操作軟體（教學）── */
  {
    id: "how-ai-connects-software",
    url: "articles/how-ai-connects-software/",
    date: "2026-06-24",
    title: "AI Agent 怎麼幫我們直接操作軟體？",
    problem: "一聽到 API、CLI、MCP 就覺得很工程，搞不懂 AI Agent 到底怎麼幫你直接操作軟體、哪些事可以放心交辦。",
    audience: "想用 AI 幫忙做事卻被名詞卡住的知識工作者，以及已經在用 Codex、Claude，想搞懂它怎麼接軟體的一人公司、主管與老闆。",
    summary: "把 AI 接軟體的四種方式（協議直連、CLI、操作網頁、操作電腦）翻成白話，每種配上實際用 Codex 的例子，給一個判斷順序，再用 USB 比喻講清楚 MCP，最後談知識工作者可以怎麼開始用。",
    tags: {
      topic: ["AIAgent", "AI工作流", "工具操作", "差異比較"],
      level: ["零基礎入門"],
      content_type: ["教學文章"]
    },
    external: { threads: "https://www.threads.com/@jiang_yude_coach", vocus: null },
    related: ["questionnaire-to-slides-agent-workflow", "teacher-prep-knowledge-workflow", "how-to-train-your-ai-employee", "agent-workflow-builds-automation", "program-vs-ai-skill-library", "docs-as-system-design-agent", "vibe-coding-ten-half-products"]
  },

  /* ── 17. 我的會議記錄 Agent 工作流（教學）── */
  {
    id: "meeting-record-agent-workflow",
    url: "articles/meeting-record-agent-workflow/",
    date: "2026-06-23",
    updated: "2026-07-10",
    title: "我的會議記錄 Agent 工作流",
    problem: "會議有錄音、有逐字稿，卻缺少待辦、風險、決策脈絡與現場觀察，之後很難回查，也難以支持下一步判斷。",
    audience: "常開會、做顧問或跑合作，需要把談話沉澱成知識資產，並希望用 AI 協助整理與分析的人。",
    summary: "從現場錄音、OBS 線上錄影、MacWhisper 或 VibeVoice-ASR 轉錄開始，逐步補上現場觀察、保留原始資料、生成會議策略書與交付初稿，再用多種思維模型檢測盲點。",
    tags: {
      topic: ["AI工作流", "知識管理", "工作流程", "輔助決策", "工具操作"],
      level: ["基礎"],
      content_type: ["教學文章"]
    },
    external: { threads: "https://www.threads.com/@jiang_yude_coach", vocus: "https://vocus.cc/salon/Jiang_Coach" },
    related: ["agent-workflow-builds-automation", "codex-only-auto-worklog", "how-to-train-your-ai-employee", "diary-driven-agent-3x4", "tidy-mess-before-consulting"]
  },

  /* ── 18. 不寫程式的人也能用的決策階梯（觀點）── */
  {
    id: "decision-ladder-non-programmer",
    url: "articles/decision-ladder-non-programmer/",
    date: "2026-06-24",
    title: "Ponytail：不寫程式的人，也能用的「決策階梯」",
    problem: "AI 很愛講廢話，寫文章越寫越發散、整理資料囉嗦、請它規劃越講越大包，只說「簡潔一點」它根本照不了。",
    audience: "每天用 AI 寫文章、整理資料、做決策但不寫程式，或正在訓練自己 AI 員工、想讓它先判斷再行動的人。",
    summary: "我把工程師技能包 Ponytail 的「決策階梯」搬到不寫程式的場景，講清楚一條能一格一格打勾的階梯怎麼用，以及讓它真正生效的關鍵：舉證反轉。",
    tags: {
      topic: ["輔助決策", "技能包設計", "AI工作流", "知識管理", "提示詞設計"],
      level: ["基礎"],
      content_type: ["觀點文章"]
    },
    external: { threads: "https://www.threads.com/@jiang_yude_coach", vocus: "https://vocus.cc/salon/Jiang_Coach" },
    related: ["caught-ai-slacking-into-rules", "how-to-train-your-ai-employee", "docs-as-system-design-agent", "tidy-mess-before-consulting", "program-vs-ai-skill-library", "ai-delegators-optimism", "four-lens-rapid-review", "manage-ai-with-management-knowledge"]
  },

  /* ── 19. 你在 AI 世界的哪一階：AI 能力分級榜（觀點）── */
  {
    id: "ai-capability-tiers",
    url: "articles/ai-capability-tiers/",
    date: "2026-06-26",
    title: "你在 AI 世界的哪一階？我用「對產業的影響力」排了一張表",
    problem: "不知道自己在 AI 浪潮裡站在什麼位置，也不知道下一步該往哪走。",
    audience: "想對照自己在 AI 領域位置、或要判斷團隊裡誰適合做哪種 AI 工作的人。",
    summary: "我用「對產業的影響力」當軸，把個人對 AI 的位置從 T0 到 T13 排成一張十四層的表，幫你對照自己、找到下一步方向。",
    tags: {
      topic: ["AI趨勢", "輔助決策", "差異比較", "AIAgent"],
      level: ["基礎"],
      content_type: ["觀點文章"]
    },
    external: { threads: "https://www.threads.com/@jiang_yude_coach", vocus: "https://vocus.cc/salon/Jiang_Coach" },
    related: ["ai-king-off-battlefield", "demis-hassabis-agi-science-ai", "spacex-ipo-musk-trillionaire-knowledge-work", "ai-market-microcosm", "vibe-coding-ten-half-products", "apple-wwdc26-siri-lobster-ai", "company-shape-is-the-moat", "ai-delegators-optimism"]
  },

  /* ── 20. 文件就是系統：非工程師怎麼設計 Agent 框架（教學）── */
  {
    id: "docs-as-system-design-agent",
    url: "articles/docs-as-system-design-agent/",
    date: "2026-06-25",
    updated: "2026-06-27",
    title: "文件就是系統：非工程師怎麼設計 Agent 框架",
    problem: "不會寫程式，卡在「設計 Agent 好像是工程師的事」，不知道怎麼把一個角色做成會自己判斷的 AI。",
    audience: "會帶人、會設計流程，卻被「Agent 很技術」擋住的創作者、老師與經營者。",
    summary: "我帶你看「文件就是系統」這個觀念，從人格思維提煉把角色做到會自己判斷，一路長到單一 Agent 與多 Agent 系統，並附上可複用的提示詞。",
    tags: {
      topic: ["AIAgent", "技能包設計", "AI工作流", "隱性知識", "提示詞設計"],
      level: ["基礎"],
      content_type: ["教學文章"]
    },
    external: { threads: "https://www.threads.com/@jiang_yude_coach", vocus: "https://vocus.cc/salon/Jiang_Coach" },
    related: ["strong-ai-models-knowledge-workflow-road", "questionnaire-to-slides-agent-workflow", "teacher-prep-knowledge-workflow", "diary-driven-agent-3x4", "how-ai-connects-software", "how-to-train-your-ai-employee", "decision-ladder-non-programmer", "tidy-mess-before-consulting", "what-is-loop-engineering", "tag-wiki-method", "ai-delegators-optimism", "intangible-assets-grow-by-sharing", "publish-gate", "laptop-desktop-webpage-sync-icloud-git", "manage-ai-with-management-knowledge"]
  },

  /* ── 21. 你以為在做一個成品，其實在養十個半成品（觀點）── */
  {
    id: "vibe-coding-ten-half-products",
    url: "articles/vibe-coding-ten-half-products/",
    date: "2026-06-26",
    title: "你以為在做一個成品，其實在養十個半成品",
    problem: "什麼都想用 AI 做，結果手上一堆開到一半、收不了尾的專案，不知道怎麼停。",
    audience: "還停在網頁版 AI 聊天、想試 vibe coding、或剛開始用 Agent 的人。",
    summary: "我用一支從聊天到 Agent 的訪談短片，帶你看工具怎麼把慾望放大，再附上我自己用 AI 顧問做第一性原理收斂、把八個專案篩成三個的真實做法。",
    tags: {
      topic: ["AIAgent", "AI工作流", "輔助決策", "工具操作", "AI趨勢"],
      level: ["基礎"],
      content_type: ["觀點文章"]
    },
    external: { threads: "https://www.threads.com/@jiang_yude_coach", vocus: null },
    related: ["elon-musk-live-skill", "codex-only-auto-worklog", "ai-capability-tiers", "how-ai-connects-software", "agent-workflow-builds-automation", "apple-wwdc26-siri-lobster-ai"]
  },

  /* ── 22. 找顧問前，先讓 AI 幫你把混亂整理成問題（教學）── */
  {
    id: "tidy-mess-before-consulting",
    url: "articles/tidy-mess-before-consulting/",
    date: "2026-06-26",
    title: "找顧問前，先讓 AI 幫你把混亂整理成問題",
    problem: "想找人討論，卻連自己卡在哪都講不清楚，被請「先整理好再來」卻整理不出來。",
    audience: "想找顧問或團隊討論、卻講不清楚問題，或想用 AI 理思緒卻不知從何開始的人。",
    summary: "我教你開一個 ChatGPT 專案資料夾把資料集中，讓 AI 先把一團亂拆成三層、整理成一個別人接得住的問題，附一段可直接貼的提示詞。",
    tags: {
      topic: ["知識管理", "AI工作流", "提示詞設計", "輔助決策", "工作流程"],
      level: ["零基礎入門"],
      content_type: ["教學文章"]
    },
    external: { threads: "https://www.threads.com/@jiang_yude_coach", vocus: "https://vocus.cc/salon/Jiang_Coach" },
    related: ["how-to-train-your-ai-employee", "diary-driven-agent-3x4", "decision-ladder-non-programmer", "docs-as-system-design-agent", "meeting-record-agent-workflow"]
  },

  /* ── 23. 寫日記，就讓 AI 乖乖幫你做事：3X4 資料整理法（教學）── */
  {
    id: "diary-driven-agent-3x4",
    url: "articles/diary-driven-agent-3x4/",
    date: "2026-05-28",
    title: "寫日記，就讓 AI 乖乖幫你做事：3X4 資料整理法",
    problem: "想建知識庫卻不知從哪開始，AI 老是抓不到自己的重點。",
    audience: "已經在用 AI 卻覺得它抓不到重點、想建知識庫卻不知從何下手的一人公司、自由工作者、創業者。",
    summary: "我用自己在用的 3X4 資料整理法，三種日記決定寫什麼、四種時效決定放哪裡，帶你把散亂資料整理成任何一家 AI 都讀得懂的知識庫，不用寫程式。",
    tags: {
      topic: ["知識管理", "知識庫", "AIAgent", "隱性知識", "AI工作流"],
      level: ["零基礎入門"],
      content_type: ["教學文章"]
    },
    external: { threads: "https://www.threads.com/@jiang_yude_coach", vocus: "https://vocus.cc/salon/Jiang_Coach" },
    related: ["questionnaire-to-slides-agent-workflow", "teacher-prep-knowledge-workflow", "docs-as-system-design-agent", "how-to-train-your-ai-employee", "knowledge-base-three-vault-split", "tidy-mess-before-consulting", "meeting-record-agent-workflow", "inspiration-production-system", "why-split-data-into-cards"]
  },

  /* ── 24. 用我寫一篇文章的工作流，講清楚什麼是迴圈工程（教學）── */
  {
    id: "what-is-loop-engineering",
    url: "articles/what-is-loop-engineering/",
    date: "2026-06-27",
    updated: "2026-06-27",
    title: "用我寫一篇文章的工作流，講清楚什麼是迴圈工程（Loop Engineering）",
    problem: "你已經會用 AI，但每次做事都要一步一步叫它，叫到很累；聽過「要設計 loop，不要只寫提示詞」卻不知道那是什麼意思。",
    audience: "常做同一類工作（寫文章、整理會議、回客戶），想把重複流程變成會自己跑完的迴圈的非工程師。",
    summary: "全程不用程式，用我寫一篇文章的工作流，把迴圈工程講清楚：它跟提示詞差在哪、一個迴圈的五個階段與最少零件、什麼時候才值得做成迴圈。",
    tags: {
      topic: ["AI工作流", "工作流程", "提示詞設計", "AIAgent"],
      level: ["基礎"],
      content_type: ["教學文章"]
    },
    external: { threads: "https://www.threads.com/@jiang_yude_coach", vocus: null },
    related: ["strong-ai-models-knowledge-workflow-road", "questionnaire-to-slides-agent-workflow", "teacher-prep-knowledge-workflow", "docs-as-system-design-agent", "how-to-train-your-ai-employee", "my-three-loops", "ai-loop-safety-recovery", "recovery-over-perfection", "ai-changed-behavior-into-workflow", "ai-delegators-optimism", "publish-gate", "loop-engineering-guardrails", "dual-centaur-meeting", "manage-ai-with-management-knowledge"]
  },

  /* ── 無形資產，越分享越豐盛（觀點）── */
  {
    id: "intangible-assets-grow-by-sharing",
    url: "articles/intangible-assets-grow-by-sharing/",
    date: "2026-06-28",
    updated: "2026-06-28",
    title: "無形資產，越分享越豐盛",
    problem: "你天天在累積經驗、做判斷，但這些無形的東西好像留不下來，也換不成錢。",
    audience: "想把自己的經驗、思維變成可以累積的資產，而不只是賣時間的知識工作者。",
    summary: "從一顆蘋果跟一個微笑的故事講起，說明無形資產為什麼越分享越豐盛；在 AI 時代，經驗與判斷可以被放大成知識資本，並分享我從自媒體到數位商會、想成為無形資本家的前進階梯。",
    tags: {
      topic: ["知識管理", "AIAgent", "知識庫"],
      level: ["基礎"],
      content_type: ["觀點文章"]
    },
    external: { threads: "https://www.threads.com/@jiang_yude_coach", vocus: null },
    related: ["how-to-train-your-ai-employee", "docs-as-system-design-agent", "company-shape-is-the-moat"]
  },

  /* ── 當 AI 代理開始互相對話：A2A 機制（趨勢）── */
  {
    id: "a2a-agent-protocol",
    url: "articles/a2a-agent-protocol/",
    date: "2026-06-28",
    updated: "2026-06-30",
    title: "AI 代理要接手工作了，你的流程和知識準備好了嗎？",
    problem: "AI 代理開始能互相交辦工作，但企業的流程還沒被整理成機器讀得懂的結構。",
    audience: "想在 AI 代理協作時代先把組織流程與知識準備好的個人工作者與小團隊。",
    summary: "當 AI 代理開始能互相交辦工作，真正的瓶頸不在技術，在於企業的流程有沒有被整理成機器讀得懂的結構。從知識架構的角度，談組織該怎麼盤點流程、立唯一真相來源、拆解任務、劃清資料邊界與審核點，附名片示範與一個可立刻試的小實驗。",
    tags: {
      topic: ["AIAgent", "AI趨勢", "AI工作流"],
      level: ["基礎"],
      content_type: ["趨勢文章"]
    },
    external: { threads: "https://www.threads.com/@jiang_yude_coach", vocus: null },
    related: ["market-to-ai","dual-track-planning-loop", "dual-centaur-meeting"]
  },

  /* ── 可以學用 AI 行銷，還可以學對 AI 行銷（觀點）── */
  {
    id: "market-to-ai",
    url: "articles/market-to-ai/",
    date: "2026-06-29",
    updated: "2026-06-29",
    title: "現在這個時間點，可以學「用 AI 行銷」，還可以學「對 AI 行銷」",
    problem: "現在才要開始學行銷，不知道時間該花在用 AI 做行銷，還是別的地方。",
    audience: "現在才要開始學行銷，靠專業被看見的個人工作者、一人公司與中小團隊。",
    summary: "當 AI 開始幫人做決定，行銷的對象就多出一個 AI。用 AI 行銷是把 AI 當工具，對 AI 行銷是把 AI 當受眾。兩件都值得學，但對 AI 行銷現在才剛打開、還沒擠。附四步開始與名片自測。",
    tags: {
      topic: ["AI趨勢", "AIAgent", "差異比較"],
      level: ["基礎"],
      content_type: ["觀點文章"]
    },
    external: { threads: "https://www.threads.com/@jiang_yude_coach", vocus: null },
    related: ["a2a-agent-protocol"]
  },
  {
    id: "four-lens-rapid-review",
    url: "articles/four-lens-rapid-review/",
    date: "2026-06-30",
    updated: "2026-06-30",
    title: "忙到迷惘時，用四視角快速復盤找回方向",
    problem: "手上同時開好幾條線，每條都在動，忙得很充實，卻說不出哪一條真正重要。",
    audience: "同時推好幾個專案、抓不到重點的經營者、團隊主管，與得自己當軍師的一人公司。",
    summary: "一套六步快速復盤法：攤平事實、回饋槓桿象限、四視角輪審、外化路徑篩子，最後收斂成本週一個動作。忙到發散時用來校準方向，一張紙就能跑。",
    tags: {
      topic: ["輔助決策", "一人公司"],
      level: ["基礎"],
      content_type: ["觀點文章"]
    },
    external: { threads: "https://www.threads.com/@jiang_yude_coach", vocus: null },
    related: ["decision-ladder-non-programmer"]
  },
  {
    id: "give-ai-choices-not-descriptions",
    url: "articles/give-ai-choices-not-descriptions/",
    date: "2026-06-30",
    updated: "2026-06-30",
    title: "跟 AI 調配色，別讓它一直猜：六組一次給你挑，挑了再微調",
    problem: "跟 AI 調配色、調樣式，最耗時的就是它猜一個、你說不對、它再猜的來回，又慢又燒額度。",
    audience: "會用 AI 做網頁、圖卡、簡報，卡在配色與樣式來回試的人。",
    summary: "與其讓 AI 一次次猜，不如請它一次配六組並排你直接挑，挑中當場微調，定稿一鍵複製。文章內有可以直接玩的互動配色校稿器，並連到公開技能包 ai-web-tuner。",
    tags: {
      topic: ["AI工作流", "AIAgent"],
      level: ["基礎"],
      content_type: ["教學文章"]
    },
    external: { threads: "https://www.threads.com/@jiang_yude_coach", vocus: null },
    related: ["agent-workflow-builds-automation"]
  },

  /* ── 當我開始理解迴圈，把三個工作流設計成 Loop（觀點）── */
  {
    id: "my-three-loops",
    url: "articles/my-three-loops/",
    date: "2026-06-30",
    updated: "2026-06-30",
    title: "當我開始理解迴圈，把三個工作流設計成 Loop",
    problem: "每天用 AI 做事，卻每次都要把同樣的事重新交代一遍，覺得不夠有系統、又怕這要會寫程式才做得到。",
    audience: "不會寫程式、但想更有系統地讓 AI 幫自己做事的知識工作者、一人公司與小團隊。",
    summary: "你不用會寫程式，只要會寫規則，就能讓 AI 有系統地照你的方法做事。提示詞是這次幫我做這個，規則是以後每次都照這樣做。用三條我自己在跑的 loop 當例子，加一個今天就能做的第一步。",
    tags: {
      topic: ["AI工作流", "AIAgent", "工作流程"],
      level: ["基礎"],
      content_type: ["觀點文章"]
    },
    external: { threads: "https://www.threads.com/@jiang_yude_coach", vocus: null },
    related: ["what-is-loop-engineering", "ai-loop-safety-recovery", "recovery-over-perfection", "ai-delegators-optimism"]
  },

  /* ── 公司護城河：組織模式、共識、影響力與信任（觀點）── */
  {
    id: "company-shape-is-the-moat",
    url: "articles/company-shape-is-the-moat/",
    date: "2026-06-30",
    title: "AI 時代真正的護城河：組織模式、共識、影響力與使用者信任",
    problem: "模型、產品、技術都被快速複製，搞不清楚 AI 時代一家公司還剩下什麼別人拿不走。",
    audience: "在建團隊或一人公司、或正在選擇加入哪家公司，想知道什麼值得長期投資的人。",
    summary: "創投人 Jaya Gupta 主張護城河是公司長成的樣子，我整理她的論述，再補上更具體的看法：組織模式像骨架可以照畫，真正抄不走的是共識、影響力與使用者信任這些時間長出來的累積。",
    tags: {
      topic: ["AI趨勢", "知識管理"],
      level: ["基礎"],
      content_type: ["觀點文章"]
    },
    external: { threads: "https://www.threads.com/@jiang_yude_coach", vocus: null },
    related: ["intangible-assets-grow-by-sharing", "ai-king-off-battlefield", "spacex-ipo-musk-trillionaire-knowledge-work", "ai-capability-tiers", "own-ai-team-at-work", "manage-ai-with-management-knowledge"]
  },

  /* ── 把標籤變成卡片，知識庫才活起來：標籤連結法 Tag Wiki（教學）── */
  {
    id: "tag-wiki-method",
    url: "articles/tag-wiki-method/",
    date: "2026-07-01",
    updated: "2026-07-06",
    title: "把標籤變成卡片，知識庫才活起來：標籤連結法 Tag Wiki",
    problem: "資料越存越多卻越來越找不到，標籤亂增生，最後變成存了等於沒存。",
    audience: "個人知識工作者、顧問、想讓 AI 讀懂自己知識庫的人。",
    summary: "把標籤從貼上去的關鍵字，升級成一張能自己下定義、又能互連的卡片。用受控維度管理、幾乎不用 YAML，並講清楚這套方法跟密集互聯、RAG 之間是互補不是取代的關係，外加顧問跨客戶做知識整合的隔離原則，以及受控詞彙的版本控管機制（字典檔唯一真相、逐版變更紀錄、機器可讀衍生檔驗證）。",
    tags: {
      topic: ["知識管理", "知識庫", "工具操作"],
      level: ["基礎"],
      content_type: ["教學文章"]
    },
    external: { threads: "https://www.threads.com/@jiang_yude_coach", vocus: null },
    related: ["questionnaire-to-slides-agent-workflow", "teacher-prep-knowledge-workflow", "knowledge-base-three-vault-split", "docs-as-system-design-agent", "ai-loop-safety-recovery", "inspiration-production-system", "why-split-data-into-cards"]
  },

  /* ── AI 出錯不可怕，沒有備援才可怕：一次搞壞 170 檔案的教訓（觀點）── */
  {
    id: "ai-loop-safety-recovery",
    url: "articles/ai-loop-safety-recovery/",
    date: "2026-07-01",
    updated: "2026-07-01",
    title: "AI 出錯不可怕，沒有備援才可怕：一次搞壞 170 檔案的教訓",
    problem: "讓 AI 自動跑比較大的批次工作，最怕出錯又不知道怎麼收場。",
    audience: "已經開始讓 AI 自動執行任務、擔心出錯沒辦法挽回的知識工作者與一人公司。",
    summary: "一次全自動改名任務，子代理把 170 個檔案打壞還回報「完成」。這篇整理我怎麼靠獨立複驗、驗證過的備份、跨家驗證三道防線零遺失收場，以及看懂這件事之後，Loop 工程真正該設計的是什麼。",
    tags: {
      topic: ["AI工作流", "工作流程", "AIAgent"],
      level: ["基礎"],
      content_type: ["觀點文章"]
    },
    external: { threads: "https://www.threads.com/@jiang_yude_coach", vocus: null },
    related: ["what-is-loop-engineering", "my-three-loops", "tag-wiki-method", "recovery-over-perfection", "loop-engineering-guardrails", "laptop-desktop-webpage-sync-icloud-git"]
  },

  /* ── 與其期待不出錯的 AI 系統，不如設計能容錯的 Loop（教學）── */
  {
    id: "recovery-over-perfection",
    url: "articles/recovery-over-perfection/",
    date: "2026-07-02",
    updated: "2026-07-02",
    title: "與其期待不出錯的 AI 系統，不如設計能容錯的 Loop",
    problem: "讓 AI 自動跑比較大的任務時，最怕出錯又不知道從哪裡開始收拾。",
    audience: "已經開始把整理檔案、批次修改、系統設定交給 AI 執行，想要一套具體步驟、不只是原則的知識工作者。",
    summary: "AI 一定會出錯，人也會下錯指令，設計不會犯錯的系統不可能。這篇整理容錯 Loop 六步：分大小、留後路、先小試、分批留痕、換腦驗收、寫收工筆記，每步都有完成條件與常見的坑，附一個 300 份檔案改名的完整示範，以及出錯之後的五個標準動作。",
    tags: {
      topic: ["AI工作流", "工作流程", "AIAgent"],
      level: ["基礎"],
      content_type: ["教學文章"]
    },
    external: { threads: "https://www.threads.com/@jiang_yude_coach", vocus: null },
    related: ["ai-loop-safety-recovery", "my-three-loops", "what-is-loop-engineering"]
  },

  /* ── 別再寫死指令：把你要什麼講清楚，剩下交給 AI（系列 01）（教學）── */
  {
    id: "intent-first-prompting",
    url: "articles/intent-first-prompting/",
    date: "2026-06-27",
    updated: "2026-07-02",
    title: "別再寫死指令：把你要什麼講清楚，剩下交給 AI（系列 01）",
    problem: "學過提示詞、指令越寫越長，AI 卻還是只照你寫的做，沒有更好的表現。",
    audience: "會下指令但覺得 AI 發揮不出來的知識工作者，以及想搞懂提示詞、上下文、駕馭、迴圈這幾個詞差在哪的人。",
    summary: "2024 年 AI 只有 60 分，把流程寫死是在幫它；現在它能想到你想不到的做法，寫死反而綁住它。這篇講意圖優先：把為什麼做、做到什麼程度講清楚，方法留給 AI，附三組可複製提示詞與四個名詞的賽馬圖解。",
    tags: {
      topic: ["提示詞設計", "AI工作流"],
      level: ["零基礎入門"],
      content_type: ["教學文章"]
    },
    external: { threads: "https://www.threads.com/@jiang_yude_coach", vocus: null },
    related: ["harness-mindset-for-bosses", "prompt-to-loop-map", "map-is-not-the-territory"]
  },

  /* ── 給老闆的駕馭思維：把不敢對員工說的，講給 AI 聽（系列 02）（教學）── */
  {
    id: "harness-mindset-for-bosses",
    url: "articles/harness-mindset-for-bosses/",
    date: "2026-07-02",
    updated: "2026-07-02",
    title: "給老闆的駕馭思維：把不敢對員工說的，講給 AI 聽（系列 02）",
    problem: "當了幾十年老闆、主管，帶人很有一套，但覺得學 AI 工具很痛苦，AI 產出也只是看起來還行。",
    audience: "中小企業老闆、主管、一人公司：帶人有經驗、想把管理本事直接用到 AI 上的人。",
    summary: "AI 已經能當員工，而且你可以對它比對員工狠十倍：它不會離職、不會抱怨。這篇講駕馭思維，附駕馭十問、向內反問、好老闆對照表，全部可直接複製，最後補 Anthropic 創業手冊的提醒：AI 讓你做得快，做對的判斷反而更值錢。",
    tags: {
      topic: ["提示詞設計", "輔助決策"],
      level: ["零基礎入門"],
      content_type: ["教學文章"]
    },
    external: { threads: "https://www.threads.com/@jiang_yude_coach", vocus: null },
    related: ["intent-first-prompting", "prompt-to-loop-map", "loop-engineering-guardrails"]
  },

  /* ── 從提示詞工程到迴圈工程：一張圖看懂四階段（知識地圖）── */
  {
    id: "prompt-to-loop-map",
    url: "articles/prompt-to-loop-map/",
    date: "2026-07-02",
    updated: "2026-07-02",
    title: "從提示詞工程到迴圈工程：一張圖看懂四階段（知識地圖）",
    problem: "文章一篇一篇散著讀，抓不到「怎麼跟 AI 合作」這件事的全貌跟先後順序。",
    audience: "想有系統地把這個站的 AI 協作文章從頭讀到尾、需要一張總覽地圖的人。",
    summary: "提示詞工程、上下文工程、駕馭工程、迴圈工程，四個階段一條主軸，把 20 篇文章全部掛上去：越往下，你越不用管 AI 怎麼做，越專心在你要什麼。從任一站進去，順著往下讀。",
    tags: {
      topic: ["AI工作流", "提示詞設計"],
      level: ["零基礎入門"],
      content_type: ["教學文章"]
    },
    external: { threads: "https://www.threads.com/@jiang_yude_coach", vocus: null },
    related: ["intent-first-prompting", "harness-mindset-for-bosses"]
  },

  /* ── 越把工作交給 AI 的人，越希望 AI 更強，越不怕被取代（趨勢）── */
  {
    id: "ai-delegators-optimism",
    url: "articles/ai-delegators-optimism/",
    date: "2026-07-01",
    updated: "2026-07-01",
    title: "越把工作交給 AI 的人，越希望 AI 更強，越不怕被取代",
    problem: "每天用 AI，心裡卻偶爾冒出一句：它越來越強，會不會哪天就不需要我了。",
    audience: "一人公司、接案者、組織裡以讀想寫判斷為主的知識工作者。",
    summary: "從 Anthropic Cadences 報告的五張圖表拆起，看越會把工作交給 AI 的人為什麼越不怕被取代；附一套把任務分三層、把流程做成技能包的做法。分清報告事實、受訪者預期與我的判斷，並標明樣本限制。",
    tags: {
      topic: ["AI趨勢", "AI工作流", "輔助決策", "AIAgent"],
      level: ["基礎"],
      content_type: ["趨勢文章"]
    },
    external: { threads: "https://www.threads.com/@jiang_yude_coach", vocus: null },
    related: ["what-is-loop-engineering", "my-three-loops", "agent-workflow-builds-automation", "docs-as-system-design-agent", "decision-ladder-non-programmer", "ai-capability-tiers", "dual-centaur-meeting"]
  },

  /* ── 把不知不覺被 AI 改變的行為，抓成一套流程（教學）── */
  {
    id: "ai-changed-behavior-into-workflow",
    url: "articles/ai-changed-behavior-into-workflow/",
    date: "2026-07-04",
    title: "把不知不覺被 AI 改變的行為，抓成一套流程",
    problem: "已經常常用 AI，卻沒發現自己的工作習慣早就被改變，也沒把它固定成流程。",
    audience: "想把自己已經在做、卻還沒固定下來的 AI 用法，變成可重複流程的知識工作者。",
    summary: "出差查行程時，我發現第一個動作已從打開地圖變成問 AI。用迴圈工程四步（找出行為、觀察變數、固定流程、變成提示詞）把不知不覺的 AI 習慣整理成可重複執行的流程，文末附可複製的提示詞。",
    tags: {
      topic: ["AI工作流", "工作流程", "提示詞設計", "隱性知識"],
      level: ["基礎"],
      content_type: ["觀點文章"]
    },
    external: { threads: "https://www.threads.com/@jiang_yude_coach", vocus: null },
    related: ["what-is-loop-engineering", "agent-workflow-builds-automation"]
  },

  /* ── 地圖不等於實際地形（觀點）── */
  {
    id: "map-is-not-the-territory",
    url: "articles/map-is-not-the-territory/",
    date: "2026-07-05",
    title: "地圖不等於實際地形",
    problem: "跟 AI 工作常卡住，它一直猜錯、要你重講一遍，卻說不清楚問題到底出在哪。",
    audience: "天天用 AI、想把專業判斷交給它，卻發現最難的是把判斷「講清楚」的顧問、教練、知識工作者。",
    summary: "從 Anthropic 工程師 Thariq 的「地圖不等於實際地形」談起，把四種未知接到隱性知識提煉：先把地圖畫清楚，AI 跑真實任務的成功率就高很多。附動手前就能用的提問法。",
    tags: {
      topic: ["隱性知識", "提示詞設計", "知識管理"],
      level: ["基礎"],
      content_type: ["觀點文章"]
    },
    external: { threads: "https://www.threads.com/@jiang_yude_coach", vocus: null },
    related: ["how-to-train-your-ai-employee", "intent-first-prompting"]
  },

  /* ── 把課前問卷變成簡報，再把流程存成技能包（教學）── */
  {
    id: "questionnaire-to-slides-agent-workflow",
    url: "articles/questionnaire-to-slides-agent-workflow/",
    date: "2026-07-06",
    updated: "2026-07-16",
    title: "把課前問卷變成簡報，再把流程存成技能包",
    problem: "剛開始學 Agent，知道 AI 可以做簡報，卻不清楚怎麼從資料蒐集、整理、產出成品，一路沉澱成可重複的工作流，也不知道怎麼連到技能包與知識庫。",
    audience: "AI 新手、講師、顧問、內容創作者，以及想把備課或簡報流程做成可複用系統的人。",
    summary: "一篇新手必讀的 Agent 基礎教學示範與正式 SOP 入口：從課前問卷和課綱整理出教學簡報，再把做簡報的步驟沉澱成 Agent 工作流、lecture-prep 技能包與知識庫。",
    tags: {
      topic: ["AIAgent", "AI工作流", "技能包設計", "知識庫"],
      level: ["零基礎入門"],
      content_type: ["教學文章"]
    },
    external: { threads: null, vocus: null },
    related: ["teacher-prep-knowledge-workflow", "codex-only-auto-worklog", "how-to-train-your-ai-employee", "how-ai-connects-software", "docs-as-system-design-agent", "diary-driven-agent-3x4", "what-is-loop-engineering", "tag-wiki-method"]
  },

  /* ── 講師如何用知識管理流程，把備課變成可複用系統（教學）── */
  {
    id: "teacher-prep-knowledge-workflow",
    url: "articles/teacher-prep-knowledge-workflow/",
    date: "2026-05-23",
    title: "講師如何用知識管理流程，把備課變成可複用系統",
    problem: "講師平常累積很多素材、靈感和學員問題，但真正要備課時仍然常從零開始，課後資料也沒有回到下一次流程。",
    audience: "講師、顧問、老師、內容創作者，以及想把課程、簡報與課後整理變成可複用系統的知識工作者。",
    summary: "從「講師的 Agent 工作流」整理出八階段知識管理流程：找資料、靈感池、課前問卷、開課前推廣、備課、交付品、課後再製、跨課程複用，讓每次上課都餵養下一次。",
    tags: {
      topic: ["知識管理", "AI工作流", "AIAgent", "知識庫"],
      level: ["基礎"],
      content_type: ["教學文章"]
    },
    external: { threads: null, vocus: null },
    related: ["questionnaire-to-slides-agent-workflow", "how-to-train-your-ai-employee", "how-ai-connects-software", "docs-as-system-design-agent", "diary-driven-agent-3x4", "what-is-loop-engineering", "tag-wiki-method"]
  },

  /* ── 發佈閘門：多個 AI 改同一個網站怎麼不打架（教學）── */
  {
    id: "publish-gate",
    url: "articles/publish-gate/",
    date: "2026-07-06",
    updated: "2026-07-06",
    title: "多個 AI 改同一個網站，怎麼不打架：發佈閘門",
    problem: "用 AI 維護網站，多個任務改來改去開始版本錯亂，部署後才發現連結壞了、索引沒跟上。",
    audience: "已經有網站、常請 AI 幫忙改版，或同時開多個 AI 任務的人。",
    summary: "用我自己的翻車現場，講版本錯亂的三個來源，給一套三層防護：工作區隔離（git worktree）、發佈閘門（preflight＋一鍵發佈）、強制力（pre-push hook）。附公開技能包 publish-gate，交給你的 AI 五步裝完。",
    tags: {
      topic: ["AI工作流", "工作流程", "工具操作"],
      level: ["基礎"],
      content_type: ["教學文章"]
    },
    external: { threads: "https://www.threads.com/@jiang_yude_coach", vocus: null },
    related: ["docs-as-system-design-agent", "what-is-loop-engineering", "caught-ai-slacking-into-rules"]
  }
,

  /* ── 簡報轉深度文章批次 2026-07-07 ── */
  {
    id: "yongli-ai-workshop-tools-to-workflow",
    url: "articles/yongli-ai-workshop-tools-to-workflow/",
    date: "2026-05-30",
    title: "商會一日 AI 工作坊：從工具理解到工作流程與知識庫",
    problem: "企業 AI 課程容易停在工具展示，學員不知道怎麼回到日常工作與知識庫。",
    audience: "商會、中小企業主、內訓規劃者，以及想把 AI 導入工作流程的人。",
    summary: "一場商會一日 AI 工作坊的完整記錄：從拆掉工具焦慮、認識 AI 邊界，到 ChatGPT 專案、NotebookLM、桌面型 Agent 與技能包，帶企業主把 AI 放進真實工作流程。",
    tags: {"topic":["AI工作流","工具操作","知識庫","數位轉型"],"level":["零基礎入門"],"content_type":["案例文章"]},
    external: { threads: null, vocus: null },
    related: ["web-chat-ai-vs-desktop-agent", "claude-skills-knowledge-assets"]
  },
  {
    id: "youtube-to-opinion-report-workflow",
    url: "articles/youtube-to-opinion-report-workflow/",
    date: "2026-06-14",
    title: "把一支 YouTube 變成觀點報告網頁的完整工作流",
    problem: "影片看完後很難沉澱成報告、教案與可重複工作流。",
    audience: "內容創作者、講師、知識工作者，以及想示範 Agent 工作流的新手。",
    summary: "完整示範把 YouTube 影片變成觀點報告網頁：NotebookLM 轉逐字稿、桌面型 Agent 本機整理、設計技能包排版，加上交任務、驗收、沉澱技能包的思考方式。",
    tags: {"topic":["AI工作流","工具操作","技能包設計"],"level":["基礎"],"content_type":["教學文章"]},
    external: { threads: null, vocus: null },
    related: ["notebooklm-knowledge-analysis-assistant", "web-chat-ai-vs-desktop-agent"]
  },
  {
    id: "loop-engineering-guardrails",
    url: "articles/loop-engineering-guardrails/",
    date: "2026-07-06",
    title: "迴圈護欄：讓 AI 自動跑，又不跑出安全範圍的五條規則",
    problem: "AI 能連續自動工作之後，一個沒被挑戰過的錯誤判斷，會被後面每一圈放大。",
    audience: "已經讓 AI 自動連跑任務、常把工作交接給第二個 AI 或子代理的人。",
    summary: "把駕馭工程和迴圈工程接在一起的五條護欄：未抗辯假設、三視角抗辯、Non-goals 與允許路徑、換路煞車、驗收證據分級。讓 AI 連續自動工作時，錯誤不會一路滾大。",
    tags: {"topic":["AI工作流","AIAgent","跨家審稿"],"level":["基礎"],"content_type":["教學文章"]},
    external: { threads: null, vocus: null },
    related: ["what-is-loop-engineering","harness-mindset-for-bosses","ai-loop-safety-recovery","dual-track-planning-loop"]
  },
  {
    id: "parenting-story-ai-family-dialogue",
    url: "articles/parenting-story-ai-family-dialogue/",
    date: "2026-06-27",
    title: "用 AI 把親子日常變成故事、插畫與家庭對話素材",
    problem: "親子日常容易消散，也不知道怎麼用 AI 變成有溫度的共同創作。",
    audience: "想和孩子一起用 AI 創作的家長，以及設計親子 AI 課程的人。",
    summary: "親子說故事 AI 工作坊完整記錄：紅番茄協議的引導方法、順稿與插畫提示詞、真人電影海報技巧，一份親子故事長出五種成品，最後回到家庭對話。",
    tags: {"topic":["AI工作流","工具操作","知識管理"],"level":["零基礎入門"],"content_type":["案例文章"]},
    external: { threads: null, vocus: null },
    related: ["relationship-boundary-ai-practice", "books-videos-pdf-ai-advisor"]
  },
  {
    id: "ai-mvp-validation-before-product",
    url: "articles/ai-mvp-validation-before-product/",
    date: "2025-09-10",
    title: "花大錢做產品前，先用 AI 驗證創業點子",
    problem: "很多創業點子還沒驗證真實需求，就先投入產品、課程或服務開發。",
    audience: "有產品或課程點子、正在規劃 MVP 或前期市場驗證的人。",
    summary: "客戶都說很棒但就是不買單？用真實需求調查法加 AI 顧問驗證創業點子：三大提問心法、VJPD 框架、承諾訊號評分，先驗證需求再投入產品開發。",
    tags: {"topic":["輔助決策","AI工作流","提示詞設計"],"level":["零基礎入門"],"content_type":["教學文章"]},
    external: { threads: null, vocus: null },
    related: ["ai-market-microcosm"]
  },
  {
    id: "books-videos-pdf-ai-advisor",
    url: "articles/books-videos-pdf-ai-advisor/",
    date: "2026-05-03",
    title: "把書、影片、PDF 轉成可對話的 AI 顧問",
    problem: "書、影片與 PDF 常被摘要完就放著，沒有轉成能追問與協助判斷的顧問系統。",
    audience: "想把外部資料變成可對話顧問、正在設計人格技能包的人。",
    summary: "把外部材料變成能追問的 AI 顧問完整方法：整理來源、萃取思維框架、寫顧問設定、驗證契合度。以把 Naval 的書與訪談做成數位分身為真實案例。",
    tags: {"topic":["知識管理","AIAgent","技能包設計","輔助決策"],"level":["基礎"],"content_type":["教學文章"]},
    external: { threads: null, vocus: null },
    related: ["notebooklm-knowledge-analysis-assistant", "youtube-to-opinion-report-workflow", "why-split-data-into-cards"]
  },
  {
    id: "liberal-arts-agent-framework",
    url: "articles/liberal-arts-agent-framework/",
    date: "2026-04-20",
    title: "文科生不寫程式，也能讓 AI 接手工作：設計自己的 Agent 框架",
    problem: "文科背景的人常以為 Agent 框架只能從工程語法開始學。",
    audience: "文科背景知識工作者、講師，以及想把個人知識庫變成 AI 工作系統的人。",
    summary: "給文科生的 Agent 框架設計通識課：駕馭工程三件事、迴圈工程與三種日記、LLM Wiki 知識圖譜與 Tag Wiki 標籤系統，不寫程式也能讓 AI 接手工作。",
    tags: {"topic":["AIAgent","知識管理","知識庫","AI工作流"],"level":["基礎"],"content_type":["教學文章"]},
    external: { threads: null, vocus: null },
    related: ["what-is-loop-engineering", "loop-engineering-guardrails", "web-chat-ai-vs-desktop-agent"]
  },
  {
    id: "ai-learning-map-reduce-anxiety",
    url: "articles/ai-learning-map-reduce-anxiety/",
    date: "2026-03-29",
    title: "用 AI 建一張可追蹤的學習地圖，降低資訊焦慮",
    problem: "AI 資訊太多，學習者容易一直收藏資源，卻不知道下一步。",
    audience: "正在學 AI 的新手、課程設計者，以及想建立技能樹的人。",
    summary: "收藏夾存了一堆「以後再看」？用 Agent 把散落各處的學習資料整理成看得見的學習地圖：技能樹、學習履歷、個人設定檔，三層架構含老師教案與排班系統案例。",
    tags: {"topic":["知識管理","AIAgent","工作流程"],"level":["零基礎入門"],"content_type":["教學文章"]},
    external: { threads: null, vocus: null },
    related: ["ai-course-map-from-entry-to-workflow", "ai-data-organization-usable-system"]
  },
  {
    id: "relationship-boundary-ai-practice",
    url: "articles/relationship-boundary-ai-practice/",
    date: "2026-05-20",
    title: "用 AI 練習課題分離、責任歸還與情緒回應",
    problem: "關係溝通裡的情緒、責任與界線常混在一起，讓人不知道怎麼回應。",
    audience: "想用 AI 做低風險溝通練習、理解課題分離與責任歸還的人。",
    summary: "關係不內耗練習課完整整理：課題分離與責任歸還的引導方法、冷分析與熱陪伴兩種 AI 練習模式、視角翻譯與抗拒應對，以及最重要的紅線清單。AI 是練習場，不是心理治療。",
    tags: {"topic":["輔助決策","提示詞設計","AI工作流"],"level":["零基礎入門"],"content_type":["教學文章"]},
    external: { threads: null, vocus: null },
    related: ["parenting-story-ai-family-dialogue", "semantic-rules-before-prompt-templates"]
  },
  {
    id: "web-chat-ai-vs-desktop-agent",
    url: "articles/web-chat-ai-vs-desktop-agent/",
    date: "2026-05-11",
    title: "網頁版聊天型 AI 和桌面型幹活 AI：Codex 是裝進電腦裡的 GPT 桌面版",
    problem: "新手常把所有 AI 都當聊天框，不知道桌面型 Agent 可以直接接工作流程。",
    audience: "剛開始分辨 AI 工具的人，以及想教新手理解 Codex 的講師。",
    summary: "用新手聽得懂的方式分清聊天型 AI、網頁工具與桌面型 Agent：專案模式的三個痛點、桌面版的範式轉變、Codex 與三層分工工作流，文科生不用寫程式也能上手。",
    tags: {"topic":["差異比較","AIAgent","工具操作","AI工作流"],"level":["零基礎入門"],"content_type":["教學文章"]},
    external: { threads: null, vocus: null },
    related: ["youtube-to-opinion-report-workflow", "liberal-arts-agent-framework"]
  },
  {
    id: "ai-course-map-from-entry-to-workflow",
    url: "articles/ai-course-map-from-entry-to-workflow/",
    date: "2026-03-20",
    title: "從入門到工作流：江江教練的 AI 課程地圖",
    problem: "AI 課程如果只看單堂主題，學員很難知道每一堂課如何連成能力路線。",
    audience: "想理解江江教練課程系統的新學員，以及規劃 AI 課程地圖的教學者。",
    summary: "一張垂直結構的 AI 課程地圖：地基層 Agent 導入、往上套用現成工作流、往下深挖資料整理、隱性知識與語意工程三條線，終點是 Agent 一人公司營運團隊。",
    tags: {"topic":["AI工作流","知識管理","技能包設計"],"level":["零基礎入門"],"content_type":["觀點文章"]},
    external: { threads: null, vocus: null },
    related: ["ai-learning-map-reduce-anxiety", "claude-skills-knowledge-assets"]
  },
  {
    id: "ai-data-organization-usable-system",
    url: "articles/ai-data-organization-usable-system/",
    date: "2026-03-09",
    title: "AI 時代怎麼整理資料，讓文件變成可用的系統",
    problem: "文件很多但找不到、接不上工作流，AI 也無法穩定讀懂。",
    audience: "剛開始整理知識庫、想讓 AI 能使用自己資料的人。",
    summary: "整理 AI 時代資料整理基礎班的完整方法：用 Markdown 四個語法、卡片化、連結與受控詞彙，把文件變成人和 AI 都能用的系統，包含可直接複製的提示詞。",
    tags: {"topic":["知識管理","知識庫","AIAgent"],"level":["零基礎入門"],"content_type":["教學文章"]},
    external: { threads: null, vocus: null },
    related: ["semantic-rules-before-prompt-templates", "notebooklm-knowledge-analysis-assistant", "claude-skills-knowledge-assets", "why-split-data-into-cards"]
  },
  {
    id: "semantic-rules-before-prompt-templates",
    url: "articles/semantic-rules-before-prompt-templates/",
    date: "2026-01-24",
    title: "提示詞模板為什麼時好時壞？先懂 AI 是強一億倍的手機輸入法",
    problem: "只背提示詞模板時，遇到任務變形就容易讓模型誤解。",
    audience: "想理解提示詞底層邏輯、正在建立知識庫與工作規則的人。",
    summary: "提示詞設計的底層原理：AI 是詞語關聯的計算機，像強一億倍的手機輸入法。從課題分離的三步修正、角色設定的限制到負向提示詞的陷阱，先懂語意再套模板。",
    tags: {"topic":["提示詞設計","隱性知識","知識管理"],"level":["基礎"],"content_type":["教學文章"]},
    external: { threads: null, vocus: null },
    related: ["ai-data-organization-usable-system", "claude-skills-knowledge-assets"]
  },
  {
    id: "claude-skills-knowledge-assets",
    url: "articles/claude-skills-knowledge-assets/",
    date: "2026-02-28",
    title: "Claude Skills 是什麼？把你的專業流程，變成 AI 能重複執行的知識資產",
    problem: "很多工作流程只留在一次對話裡，下一次 AI 仍然要重新學。",
    audience: "第一次聽到 Claude Skills、想把固定流程沉澱成知識資產的人。",
    summary: "用 Claude Skills 理解技能包：它是給 AI 看的操作手冊，把你的專業流程、格式標準、最佳狀態封裝成可重複執行的知識資產。含兩種製作方法與備份要點。",
    tags: {"topic":["ClaudeSkills","技能包設計","知識管理"],"level":["零基礎入門"],"content_type":["教學文章"]},
    external: { threads: null, vocus: null },
    related: ["semantic-rules-before-prompt-templates", "ai-data-organization-usable-system", "manage-ai-with-management-knowledge"]
  },
  {
    id: "notebooklm-knowledge-analysis-assistant",
    url: "articles/notebooklm-knowledge-analysis-assistant/",
    date: "2026-01-04",
    title: "NotebookLM 怎麼從資料整理工具變成知識分析助理",
    problem: "NotebookLM 常被拿來摘要資料，卻沒有用來追問、比對與找盲點。",
    audience: "剛開始使用 NotebookLM，想建立可追問知識庫的人。",
    summary: "NotebookLM 應用大全：從讓 AI 摘要，進化到讓報告來讀你。個人檔案設定、多來源知識庫、跨領域課綱合作案例，加上 PDF 陷阱與 Markdown 內容邊界兩個整理技巧。",
    tags: {"topic":["知識管理","工具操作","輔助決策"],"level":["零基礎入門"],"content_type":["教學文章"]},
    external: { threads: null, vocus: null },
    related: ["youtube-to-opinion-report-workflow", "books-videos-pdf-ai-advisor"]
  },
  {
    id: "strong-ai-models-knowledge-workflow-road",
    url: "articles/strong-ai-models-knowledge-workflow-road/",
    date: "2026-07-10",
    updated: "2026-07-11",
    title: "模型像超跑，知識庫與工作流就是你腳下的路",
    problem: "模型一代比一代強，為什麼同樣的 AI，別人用起來像換了引擎，你用起來還是原地打滑。",
    audience: "已經在用 AI、想知道下一步該投資什麼的知識工作者與一人公司。",
    summary: "Claude Fable、GPT-5.6 Sol 這類強模型出現後，知識庫、工作流、規則與驗收方式造成的差距更明顯。用泥巴路、柏油路與高速公路三種道路環境，帶你完成六步 AI 鋪路流程。",
    tags: {"topic":["AI趨勢","知識管理","AI工作流","駕馭工程 HarnessEngineering"],"level":["基礎"],"content_type":["教學文章"]},
    external: { threads: null, vocus: null },
    related: ["docs-as-system-design-agent", "what-is-loop-engineering", "how-to-train-your-ai-employee"]
  },
  {
    id: "dual-track-planning-loop",
    url: "articles/dual-track-planning-loop/",
    date: "2026-07-12",
    title: "讓兩個 AI 互相挑錯：我的企劃在送出前，先被模擬評審打了 2/5 分",
    problem: "AI 寫企劃又快又順，但單一模型自己寫自己審，看不到自己的盲點，還會被你的想法錨定。",
    audience: "用 AI 寫提案、企劃、報告，輸不起一次盲點的知識工作者與一人公司。",
    summary: "企劃雙軌互審 loop：兩個不同家的 AI 同輸入各自獨立寫完、互相挑錯、整合留決策點、對家終審。以一場真實政府補助提案首跑為案例，附兩段可直接複製的提示詞。",
    tags: {"topic":["AI工作流","跨家審稿","輔助決策"],"level":["基礎"],"content_type":["案例文章"]},
    external: { threads: null, vocus: null },
    related: ["loop-engineering-guardrails", "a2a-agent-protocol", "docs-as-system-design-agent"]
  },
  {
    id: "dual-centaur-meeting",
    url: "articles/dual-centaur-meeting/",
    date: "2026-07-11",
    updated: "2026-07-12",
    title: "雙人馬會議：我帶我的 Agent，你帶你的 Agent，四方一起開",
    problem: "複雜專案的會議常開兩三個小時才對齊目標，全部交給 AI 代理去談，又會掉太多細節。",
    audience: "跟客戶或合作夥伴談複雜專案、已經有自己常用 AI，想讓它從打草稿進到正式協作流程的知識工作者。",
    summary: "雙人馬會議是中間解：人加 Agent 對 人加 Agent，Agent 先把資料過濾完，人只聊決策、信任與承諾。附五步流程與 PAAP、AAP、AA 三階段演進判斷，以及納瓦爾對談的兩個可回看時間碼。",
    tags: {"topic":["AIAgent","AI工作流","AI趨勢"],"level":["基礎"],"content_type":["觀點文章"]},
    external: { threads: null, vocus: null },
    related: ["a2a-agent-protocol", "ai-delegators-optimism", "what-is-loop-engineering"]
  },
  {
    id: "laptop-desktop-webpage-sync-icloud-git",
    url: "articles/laptop-desktop-webpage-sync-icloud-git/",
    date: "2026-07-11",
    updated: "2026-07-12",
    title: "在家裡桌機上用 Codex 做好網頁後，出門用筆電想要改，就找不到檔案了？問題出在你把專案放錯地方",
    problem: "在桌機用 AI 做好網頁，換一台筆電想改，卻找不到檔案；把程式碼放進 iCloud 又常常撞同步衝突。",
    audience: "用多台電腦、多個 AI 助手做網頁或程式專案，被檔案同步與版本混亂困擾、非工程背景的創作者。",
    summary: "iCloud 適合放文件，程式碼要交給 git。一次真實搬家紀錄，附完整步驟與可複製提示詞，讓多台電腦、多個 AI 助手共用唯一真相。",
    tags: {"topic":["AI工作流","知識管理","工作流程"],"level":["基礎"],"content_type":["教學文章"]},
    external: { threads: null, vocus: null },
    related: ["docs-as-system-design-agent", "ai-loop-safety-recovery"]
  },
  {
    id: "inspiration-production-system",
    url: "articles/inspiration-production-system/",
    date: "2026-07-13",
    updated: "2026-07-13",
    title: "靈感產出系統：教你建立內容創作的靈感池",
    problem: "每天硬想今天發什麼想到累；有一堆舊素材卻要用時找不到。",
    audience: "一人公司、自媒體、想穩定經營社群卻卡在選題的知識工作者。",
    summary: "把靈感當成可以系統性產出的東西：三個來源（過去累積的內容、AI 模擬受眾、熱門話題）加上標籤撈取系統，配一套從話題到貼文的實操流程，以及沒靈感時請 AI 搜話題並從大眾與專業兩個角度選題的流程，讓有個人特色的穩定發文變成一套會自己運轉的系統。",
    tags: {"topic":["AI工作流","工作流程","知識管理"],"level":["基礎"],"content_type":["教學文章"]},
    external: { threads: "https://www.threads.com/@jiang_yude_coach", vocus: null },
    related: ["tag-wiki-method", "diary-driven-agent-3x4"]
  },
  {
    id: "post-class-organizing-loop",
    url: "articles/post-class-organizing-loop/",
    date: "2026-07-15",
    updated: "2026-07-15",
    title: "一堂課上完之後，我怎麼把它變成可以重複用的知識：課後整理 Loop 全流程拆解",
    problem: "一堂課上完，留下逐字稿、課前簡報、學員提問，散著沒整理，三天後就散掉，簡報還是課前骨架版，學員問過的好問題下次備課想引用卻找不到。",
    audience: "會上課、開講座、帶工作坊，每次結束都留下大量素材卻常放到爛掉，想用 AI 整理課程內容卻不知道怎麼設標準的講師與教學者。",
    summary: "把課後整理拆成一條六步輸送帶：同一份材料生出教學手冊、課後實錄版簡報、官網課程頁三種成品，並用兩層審核確保 AI 整理出來的東西能用。附觸發分流、六步交付物、兩層審核分法與常見坑，可照著替自己的整理流程搭一條一樣的輸送帶。",
    tags: {"topic":["AI工作流","知識管理","工作流程"],"level":["零基礎入門"],"content_type":["教學文章"]},
    external: { threads: null, vocus: null },
    related: ["how-to-train-your-ai-employee", "docs-as-system-design-agent", "inspiration-production-system"]
  },
  {
    id: "manage-ai-with-management-knowledge",
    url: "articles/manage-ai-with-management-knowledge/",
    date: "2026-07-16",
    updated: "2026-07-16",
    title: "用你已經有的管理知識來管理 AI，以豐田 TPS 為例",
    problem: "公司想開始用 AI，第一個反應是覺得要從零學一套新技術、得先招工程師先買系統，於是一直停在之後再說。",
    audience: "已經有一套管人、管流程、管品質經驗，卻覺得 AI 是工程師的事、不知道自己的管理經驗算不算數的經營者或主管。",
    summary: "多數企業導入 AI 不缺底子：你管人、管流程、管品質的管理知識，本來就能翻譯成管理 AI 的方法。用豐田 TPS 當例子，把標準化、自働化停線、持續改善對應成 AI 可落地的規則主檔、自動攔截、回寫標準，附一張把既有管理知識翻成 AI 流程的檢查表與可先動的第一步。",
    tags: {"topic":["數位轉型","知識管理","AI工作流","隱性知識"],"level":["零基礎入門"],"content_type":["教學文章"]},
    external: { threads: "https://www.threads.com/@jiang_yude_coach", vocus: null },
    related: ["how-to-train-your-ai-employee", "docs-as-system-design-agent", "what-is-loop-engineering", "claude-skills-knowledge-assets", "company-shape-is-the-moat", "decision-ladder-non-programmer"]
  },

  /* ── 為什麼要把資料拆成卡片：從 PDF 難讀到 AI 檢索的卡片化教學（教學·江江精選）── */
  {
    id: "why-split-data-into-cards",
    url: "articles/why-split-data-into-cards/",
    date: "2026-07-20",
    updated: "2026-07-20",
    featured: true,
    title: "為什麼要把資料拆成卡片：從 PDF 難讀到 AI 檢索的卡片化教學",
    problem: "手上一堆 PPT 跟 PDF 想讓 AI 幫忙整理，結果 AI 讀不懂、答不準，不知道問題出在哪。",
    audience: "教材塞滿 PPT 與 PDF 的講師、聽過卡片盒筆記法但不知道它跟 AI 有什麼關係的人、想把舊資料變成可重複使用素材庫的知識工作者。",
    summary: "PDF 是印刷格式，AI 讀起來是座標跟亂碼；丟越多資料給 AI，準確度越是雪崩式下滑。這篇用投影頁互動動畫講整條邏輯：拉滑桿看資料量與準確度的關係、點標籤體驗檢索、看卡片怎麼拆解合併重組，文末附可直接複製的原子化拆解提示詞。",
    tags: {
      topic: ["知識管理", "知識庫", "AI工作流"],
      level: ["零基礎入門"],
      content_type: ["教學文章"]
    },
    external: { threads: "https://www.threads.com/@jiang_yude_coach", vocus: null },
    related: ["tag-wiki-method", "diary-driven-agent-3x4", "books-videos-pdf-ai-advisor", "ai-data-organization-usable-system"]
  }
];
