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
    title: "我用 AI 代理工作流，蓋一套程式自動化工作流",
    problem: "搞不清楚「AI 自動化」到底是 AI 在跑、還是程式在跑，也不知道 AI 該插手在哪一段。",
    audience: "想把重複工作變成會自己跑的流程、又分不清 AI 與程式分工的人。",
    summary: "工作流可以拆兩層：建立自動化，跟自動化自己跑。前面交給 AI 代理，後面可以完全是程式。",
    tags: {
      topic: ["AI工作流", "AIAgent", "工作流程", "工具操作"],
      level: ["基礎"],
      content_type: ["案例文章"]
    },
    external: { threads: "https://www.threads.com/@jiang_yude_coach", vocus: null },
    related: ["program-vs-ai-skill-library", "how-to-train-your-ai-employee", "line-group-ai-workflow", "codex-log-health-check", "how-ai-connects-software"]
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
    related: ["own-ai-team-at-work", "caught-ai-slacking-into-rules", "line-group-ai-workflow", "codex-log-health-check"]
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
    related: ["own-ai-team-at-work", "agent-workflow-builds-automation", "how-ai-connects-software"]
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
    related: ["elon-musk-live-skill"]
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
    external: { threads: null, vocus: null }
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
    external: { threads: null, vocus: null }
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
    related: ["codex-only-auto-worklog"]
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
    external: { threads: "https://www.threads.com/@jiang_yude_coach", vocus: "https://vocus.cc/salon/Jiang_Coach" }
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
    external: { threads: "https://www.threads.com/@jiang_yude_coach", vocus: "https://vocus.cc/salon/Jiang_Coach" }
  },

  /* ── 10. 在公司上班，你也可以有自己的 AI 團隊（觀點）── */
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
    related: ["elon-musk-live-skill"]
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
    related: ["own-ai-team-at-work", "agent-workflow-builds-automation", "line-group-ai-workflow", "elon-musk-live-skill", "codex-log-health-check", "how-ai-connects-software"]
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
    summary: "這篇介紹活的馬斯克技能包：把馬斯克常見的第一性原理思考方式整理成 AI 顧問流程，每天用 Codex 自動更新公開資料；新聞只作參考提醒，正式技能包本體仍需人工審核。",
    tags: {
      topic: ["技能包設計", "AIAgent", "輔助決策", "AI工作流"],
      level: ["零基礎入門"],
      content_type: ["教學文章"]
    },
    external: { threads: "https://www.threads.com/@jiang_yude_coach", vocus: null },
    related: ["spacex-ipo-musk-trillionaire-knowledge-work", "how-to-train-your-ai-employee", "own-ai-team-at-work", "ai-market-microcosm"]
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
    related: ["how-to-train-your-ai-employee", "agent-workflow-builds-automation", "program-vs-ai-skill-library"]
  }

];
