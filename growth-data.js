/* ─── 知識庫成長史 · 唯一資料源 ───
 * 往時間軸加里程碑＝改 GROWTH_ERAS；往四象限地圖加定位點＝改 GROWTH_PINS。
 * 頁面（knowledge-architecture.html 成長史區塊）自動渲染，版面不用動。
 * x: 0 個人 → 100 企業；y: 0 輔助決策 → 100 流程自動。
 */
window.GROWTH_ERAS = [
    {y:"未來",n:"接下來想做的",c:"var(--c-sky)",plan:1,m:[
      {d:"規劃中",t:"陸續補上",mn:"接下來想做的正在規劃，之後補上。"}
    ]},
    {y:"持續",n:"持續融合",c:"var(--c-sage)",o:"知識庫變成一個底盤，遇到新方法就檢查能不能吸收進來。",m:[
      {d:"最近",t:"迴圈工程（Loop）",f:"新",mn:"把一次性任務改成可追蹤、可複查、可接續的迴圈。",l:[{t:"讀：什麼是迴圈工程",u:"articles/what-is-loop-engineering/"}]},
      {d:"2026-07",t:"磚頭協議",mn:"每個專案一份素材中樞，AI 先讀中樞就懂全貌。"},
      {d:"持續",t:"把外部方法變成自己的",mn:"遇到新機制先拆成規則、欄位或流程再併入。"}
    ]},
    {y:"2026 下半",n:"規則變成機制",c:"var(--c-mint)",o:"規則寫了不會自己執行。這段時間做的事，是讓每條規則都有東西推著它跑：自動攔截、互審、留得回去。",m:[
      {d:"2026-09",t:"驗收就是迴圈",f:"新",mn:"任何一個環節，加上讓 AI 自己驗收、自己修改的流程，就變成迴圈。",q:"加上驗收的技能包，就是迴圈工程。"},
      {d:"2026-09",t:"技能包情境路由",mn:"每次對話自動比對該用哪個技能包，只指路、不塞內容，規則主檔也跟著瘦身。",l:[{t:"讀：規則檔瘦身",u:"articles/ai-rule-file-slimming/"}]},
      {d:"2026-09",t:"切換要留得回去",mn:"換儲存位置、換系統時新舊並存，觀察期過了、驗收過才刪舊的；沒演練過退回，不准刪。"},
      {d:"2026-08",t:"圖譜工程",mn:"把好幾條各自能跑完的線接起來，共用同一份進度、講好誰等誰。",l:[{t:"讀：迴圈工程與圖譜工程",u:"articles/what-is-graph-engineering/"}]},
      {d:"2026-08",t:"官網並行施工",mn:"好幾個 AI 同時改官網，各有各的工作桌，上線排隊，不會互相蓋掉。",l:[{t:"讀：兩個 AI 同時改網站",u:"articles/parallel-site-editing/"}]},
      {d:"2026-08",t:"跨家審稿",mn:"AI 的產出交給另一家公司的 AI 審，同一家模型互審不算數。",l:[{t:"讀：三種互審設計",u:"articles/three-levels-of-cross-review/"}]},
      {d:"2026-07",t:"機制要有引擎",f:"轉捩點",mn:"每條常設規則都要掛上自動攔截、流程掛點或排程其中一種，掛不上就不立；同一件事只在一個地方維護。"},
      {d:"2026-07",t:"企劃雙軌互審",mn:"兩家 AI 各自從頭做、過程互相看不到，再互審、整合，最後由對家審一次。",l:[{t:"讀：企劃先被模擬評審打分",u:"articles/dual-track-planning-loop/"}]},
      {d:"2026-07",t:"迴圈護欄",mn:"讓 AI 順順跑完，不一直停下來要授權；重大結論與交接前，先過一輪假設與證據的檢查。",l:[{t:"讀：迴圈護欄五條規則",u:"articles/loop-engineering-guardrails/"}]}
    ]},
    {y:"2026",n:"工具退場",c:"var(--c-coral)",o:"AI 接上後，Obsidian 退到後面當介面（沒有不用它），重點變成設計讓 AI 找得到的文件。",m:[
      {d:"2026 初",t:"從操作工具，到設計可讀結構",f:"轉捩點",mn:"重點不是用 AI 操作 Obsidian，而是把雙向連結與檢索設計進文件架構。",q:"AI 找得到、不會出錯，那我就直接讓 AI 對文件就好。",l:[{t:"讀：文件就是系統",u:"articles/docs-as-system-design-agent/"}]},
      {d:"2026 上半",t:"技能包與員工分工",mn:"每種工作寫成技能包，AI 照規則就知道扮演什麼角色。",l:[{t:"讀：你也可以有 AI 團隊",u:"articles/own-ai-team-at-work/"},{t:"下載技能包",u:"skills.html",sk:1}]},
      {d:"2026-06",t:"AGENTS.md 單一真相",mn:"散落的規則收成唯一主檔，所有 AI 讀同一份、不打架。再分四層：會自動攔截的 Hook、每次都讀的主檔、按情境讀的技能包、各家 AI 自己的記憶。"},
      {d:"2026 上半",t:"跨家協作與駕馭思維",mn:"多個 AI 分工還能彼此驗證，流程可追溯。",l:[{t:"讀：給老闆的駕馭思維",u:"articles/harness-mindset-for-bosses/"}]},
      {d:"2026-06",t:"知識官網對外輸出",mn:"讓知識被外部的人和 AI 找到，不只留自己看。",l:[{t:"讀：三庫分流",u:"articles/knowledge-base-three-vault-split/"}]},
      {d:"2026-05",t:"3x4 資料整理法",mn:"3 種日記決定寫什麼，4 種時效決定放哪裡，把散亂資料整理成任何一家 AI 都讀得懂的知識庫。",l:[{t:"讀：3x4 資料整理法",u:"articles/diary-driven-agent-3x4/"}]}
    ]},
    {y:"2025",n:"想串起來",c:"var(--c-sand)",o:"這一年開始研究文件之間怎麼連，讓關聯不只靠人腦記。",m:[
      {d:"2025",t:"研究雙向連結與檢索",mn:"文件變多，研究 Obsidian 雙向連結與那張看關聯的知識圖譜。",l:[{t:"讀：地圖不等於地形",u:"articles/map-is-not-the-territory/"}]},
      {d:"2025 起",t:"從標籤整理法，到 Tag Wiki",mn:"先發展出四維度標籤整理法；後來把整套收斂成一個動作，叫它標籤連結法 Tag Wiki，知識庫才真的活起來。",l:[{t:"讀：標籤連結法 Tag Wiki",u:"articles/tag-wiki-method/"}]}
    ]},
    {y:"2024",n:"倉庫年",c:"var(--ink-faint)",o:"最一開始，把文章、資料、工作記錄都存起來。在這之前根本沒有存檔習慣，東西散在各處，連整理都無從整理起。",m:[
      {d:"起點",t:"從沒有存檔習慣，到開始存",mn:"以前文章、資料、工作記錄散在各處，沒有存檔習慣，連要整理都無從下手。第一步就是把它們都集中存起來。",q:"那不叫系統，那只是倉庫。"}
    ]}
  ];

window.GROWTH_PINS = [
    {t:"標籤連結法 Tag Wiki",x:18,y:18,c:"var(--c-sand)",u:"articles/tag-wiki-method/"},
    {t:"3x4 資料整理法",x:30,y:32,c:"var(--c-sand)",u:"articles/diary-driven-agent-3x4/"},
    {t:"四維度標籤",x:13,y:32,c:"var(--c-sand)"},
    {t:"知識官網",x:26,y:15,c:"var(--c-sand)",u:"articles/knowledge-base-three-vault-split/"},
    {t:"意圖優先（提示詞）",x:38,y:44,c:"var(--c-sand)",u:"articles/intent-first-prompting/"},
    {t:"技能包系統",x:32,y:64,c:"var(--c-sage)",u:"skills.html"},
    {t:"迴圈工程",x:44,y:76,c:"var(--c-sage)",u:"articles/what-is-loop-engineering/"},
    {t:"AGENTS 單一真相",x:22,y:62,c:"var(--c-sage)"},
    {t:"駕馭思維（給老闆）",x:76,y:22,c:"var(--c-coral)",u:"articles/harness-mindset-for-bosses/"},
    {t:"跨家協作",x:64,y:46,c:"var(--c-coral)",u:"articles/own-ai-team-at-work/"},
    {t:"AI 辦公室／AI 員工",x:78,y:72,c:"var(--c-sky)",u:"ai-office/"},
    {t:"磚頭協議（專案）",x:66,y:66,c:"var(--c-sky)"},
    {t:"跨家審稿",x:46,y:30,c:"var(--c-mint)",u:"articles/three-levels-of-cross-review/"},
    {t:"圖譜工程",x:58,y:80,c:"var(--c-mint)",u:"articles/what-is-graph-engineering/"},
    {t:"驗收就是迴圈",x:36,y:86,c:"var(--c-mint)"}
  ];
