# 官網 repo 遠端分支盤點（2026-10-21）

只列清單，沒有刪任何分支。基準：origin/main 071ef145，共 149 條遠端分支（不含 main）。

## 判斷方法

上線用 squash，分支不會變成 main 的祖先，所以看內容不看祖先關係。取分支相對 origin/main 分叉點的改動，排除 articles-data.js、site-index.json、article-keywords.js、sitemap.xml、en/articles-data.js 這五個生成檔，在 origin/main 的暫時 index 上檢查：

- 反向套得上、正向套不上：內容已在 main。
- 正向套得上、反向套不上：確定還沒上。
- 其他（兩向都套不上、兩向都套得上、只改生成檔）：要人看。

## 小計

| 分類 | 條數 |
|---|---:|
| 內容已在 main，可刪 | 36 |
| 確定還沒上 | 6 |
| 比不出來，要人看 | 107 |
| 合計 | 149 |

## 一、內容已在 main，可刪（36）

- article/3x4-v2-diagrams
- article/ai-adoption-raise-row-balance
- article/ai-batch-work-without-seeing-data
- article/ai-employee-tests-venv-figure
- article/ai-retrieval-diagrams
- article/ai-series-lesson0-reading
- article/ai-series-lesson4-6-actual
- article/batch-deploy
- article/card-forward-button
- article/card-portrait-brown
- article/chat-log-ttl
- article/clean-en-messaging
- article/course-0926-postclass-fix
- article/design-for-ai-errors-opening
- article/design-for-ai-errors-stroke
- article/fast-deploy
- article/fix-ai-random-author
- article/fix-ai-random-dictionary
- article/fix-at-a-glance-embed
- article/fix-daily-health-redirect
- article/fix-figure-height-auto
- article/fix-gitignore-wrangler
- article/fix-legacy-decks
- article/fix-referrer
- article/guard-img-height-auto
- article/know-ai-assign-ai
- article/privacy-policy
- article/share-icon-anim
- feat/line-cta-cards
- fix/line-namecard-lead
- fix/mika-cite-format
- fix/stats-admin-own-password
- site/course-1011-title
- site/dora-url-fyi
- site/dora-url-fyi-v2
- tool/coffee-roundtable-og

## 二、確定還沒上（6）

| 分支 | 最後 commit | 訊息（即改了什麼） | 主要改到的檔 |
|---|---|---|---|
| article/google-ai-pro-api-credits | 2026-10-21 | article.json 補列表封面欄位 | articles/google-ai-pro-api-credits/article.json,articles/google-ai-pro-api-credits/index.html,images/articles/google-ai-pro-api-credits-benefits.jpg |
| article/ai-understands-ei-ha-fix | 2026-10-03 | 欸和蛤：內文圖各段只留第二張（含 AGENTS.md 提示） | articles/ai-understands-ei-ha/index.html |
| article/launch-order-recommend | 2026-10-03 | 客服篇上線順序改成推薦（新手建議），補 Cloudflare 可先買網域與先用兩三頁上線跑通流程；網域篇同步 | articles/ai-customer-service-api-cost/index.html,articles/domain-and-account-ownership/index.html |
| article/rag-hire-not-pick | 2026-10-01 | 草稿：RAG 架構怎麼選（雇研究員比喻）三種流程動畫版，noindex、未部署 | articles/rag-hire-not-pick/article.json,articles/rag-hire-not-pick/index.html |
| article/course-series-slides-button | 2026-09-22 | 系列課報名頁 hero 加「正式六堂課簡報」按鈕，連學員站（密碼進入） | courses/2026-09-ai-series/index.html |
| article/meeting-notes-trilogy | 2026-09-07 | 三篇標題改為雙軌互審定案版 | articles/meeting-notes-1-transcribe/article.json,articles/meeting-notes-1-transcribe/index.html,articles/meeting-notes-2-clean/article.json |

## 三、比不出來，要人看（107）

| 分支 | 最後 commit | 訊息 | 主要改到的檔 | 比不出來的原因 |
|---|---|---|---|---|
| article/ai-employee-tests-carousel | 2026-10-21 | AI 員工自己裝自己測：截圖改左右滑輪播、內文補原串連結、朵拉插圖移到沙盒說明下 | articles/ai-employee-tests-new-tools/index.html | 正反向都套不上（main 已改過同一處，或只上了一部分） |
| article/ai-employee-tests-cover | 2026-10-21 | AI 員工自己裝自己測：補咪卡與朵拉封面、分享縮圖，文內加朵拉檢查小機器人的插畫 | articles/ai-employee-tests-new-tools/article.json,articles/ai-employee-tests-new-tools/index.html,images/articles/ai-employee-tests-new-tools-cover.jpg | 正反向都套不上（main 已改過同一處，或只上了一部分） |
| article/ai-employee-tests-new-tools | 2026-10-21 | 文章補上兩張真實截圖與 Threads 原串連結 | articles/ai-employee-tests-new-tools/article.json,articles/ai-employee-tests-new-tools/index.html,articles/ai-employees-manage-agents/article.json | 正反向都套不上（main 已改過同一處，或只上了一部分） |
| article/ai-employee-tests-screenshots | 2026-10-21 | 文章補上兩張真實截圖與 Threads 原串連結 | articles/ai-employee-tests-new-tools/index.html,images/articles/ai-employee-tests-new-tools-mention.jpg,images/articles/ai-employee-tests-new-tools-report.jpg | 正反向都套不上（main 已改過同一處，或只上了一部分） |
| article/draw-it-for-me | 2026-10-21 | demo 頁掛咪卡 widget（官網每頁必掛） | articles/ai-that-knows-you/article.json,articles/ai-understands-ei-ha/article.json,articles/at-a-glance/article.json | 正反向都套不上（main 已改過同一處，或只上了一部分） |
| article/fix-publish-gate-order | 2026-10-21 | 部署台：阿港程式審修正（rebase 衝突還原、push 收據判斷、main 健康檢查對齊遠端、撞檔連鎖暫停、複製檔比對 HEAD、凍結簡報不准移出版控） | scripts/cloudflare/check-legacy-decks.mjs,scripts/cloudflare/deploy-production.sh,scripts/cloudflare/rehearse-build.sh | 正反向都套不上（main 已改過同一處，或只上了一部分） |
| article/gate-tiering | 2026-10-21 | 部署台第 4 件：阿港審修正（基準改分叉點、整行比對、pre-push 驗全部待推 commit、巡檢拿不到最新版不算全綠） | scripts/daily-health-check.sh,scripts/daily-health-run.sh,scripts/git-hooks/pre-push | 正反向都套不上（main 已改過同一處，或只上了一部分） |
| article/home-service-first | 2026-10-21 | 凍結的九份舊課程簡報還原原版（C 網雜湊檢查，導覽列不改） | _templates/article-template.html,agent.html,ai-office/assistants.html | 正反向都套不上（main 已改過同一處，或只上了一部分） |
| fix/mika-cite-rules | 2026-10-21 | 咪卡客服：引用站內東西的規矩（提到就標編號、標題照原字、對不上就直說沒有），人設來源升 mika v1.7.0（28e6fa5） | agent.html,api/mika-chat.js,index.html | 正反向都套不上（main 已改過同一處，或只上了一部分） |
| tool/coffee-roundtable | 2026-10-21 | 咖啡圓桌示範：掛咪卡 widget | coffee-roundtable/index.html | 正反向都套不上（main 已改過同一處，或只上了一部分） |
| article/ai-random-true-random | 2026-10-20 | 隨機抽文章：寫出論文作者名字 | articles/ai-random-true-random/article.json,articles/ai-random-true-random/index.html,articles/ai-vs-script-four-situations/article.json | 正反向都套不上（main 已改過同一處，或只上了一部分） |
| article/rules-need-an-engine | 2026-10-20 | 深度文章：寫了一堆規則給 AI，為什麼還是沒人執行？｜立規矩除了機制，還要搭配引擎，舊規矩也要能退場 | articles/rules-need-an-engine/article.json,articles/rules-need-an-engine/index.html,images/articles/rules-need-an-engine-cover.jpg | 正反向都套不上（main 已改過同一處，或只上了一部分） |
| claude/old-article-chronicle | 2026-10-20 | 編年史化第三組互連、舊文圖片比例放行、codex-log 更新日期更正 | _templates/article-template.html,articles/auto-compact-mod/article.json,articles/auto-compact-mod/index.html | 正反向都套不上（main 已改過同一處，或只上了一部分） |
| claude/zealous-maxwell-oc23qq | 2026-10-20 | 會員與咪卡：Codex 第 3 輪其餘阻擋項 | 404.html,DEPLOYMENT.md,README.md | 正反向都套不上（main 已改過同一處，或只上了一部分） |
| article/card-3x4 | 2026-10-19 | 名片五張調成 3:4：以江江編輯器存檔版為底，第 1 張換咪卡有桌子 8 格動畫並放大到 120px；第 2-5 張重點字放大、間距加寬；Flex Simulator 實測最高 514px（寬 386） | card/line-carousel.json,card/line-flex.json,card/mika-desk-animation.png | 正反向都套不上（main 已改過同一處，或只上了一部分） |
| article/card-compact | 2026-10-19 | 名片壓成約 4:5：第 1 張改頭銜與說明、到肩膀圓框人像、咪卡動畫並排；第 2-4 張拿掉按鈕、重點合併；第 5 張改加入 LINE 社群；首頁分享鈕改分享圖示 | card/line-carousel.json,card/line-flex.json,card/portrait-round.png | 正反向都套不上（main 已改過同一處，或只上了一部分） |
| article/card-hello | 2026-10-19 | 名片：套用江江 18:30 編輯器存檔；第 5 張改一行字「直接在 LINE 回覆江江／立刻約免費 30 分鐘線上諮詢」拿掉社群按鈕；第 1 張用 LINE 聯絡江江改連個人 LINE | card/flex-render.js,card/index.html,card/line-carousel.json | 正反向都套不上（main 已改過同一處，或只上了一部分） |
| article/card-own-liff | 2026-10-19 | 名片改用江江自己的 LIFF：新增 /card/share/ 分享頁，首頁與 /card/ 分享按鈕改連 liff.line.me/2012081068-MnNPDX8P，移除借用的 liff.lovable.app | card/index.html,card/share/index.html,index.html | 正反向都套不上（main 已改過同一處，或只上了一部分） |
| article/line-namecard-share-button | 2026-10-19 | 文章補列表封面欄位 | articles/hosting-platform-decision-tree/article.json,articles/line-namecard-share-button/article.json,articles/line-namecard-share-button/index.html | 正反向都套不上（main 已改過同一處，或只上了一部分） |
| cloud/claude/site-fixes-20261019 | 2026-10-19 | 課後簡報鎖定 10 頁退回 main 原樣，Course JSON-LD 生成器跳過鎖定頁 | 404.html,DEPLOYMENT.md,README.md | 正反向都套不上（main 已改過同一處，或只上了一部分） |
| fix/share-page-first-card | 2026-10-19 | LINE 名片文章：第五段補上用別人工具的風險 | articles/line-namecard-share-button/article.json,articles/line-namecard-share-button/index.html,card/share/index.html | 正反向都套不上（main 已改過同一處，或只上了一部分） |
| site/card-line-share | 2026-10-18 | 咪卡 widget 檢查：/card/ 名片分享頁列入豁免並附原因 | card/extraction-animation.png,card/index.html,card/kanban-animation.png | 正反向都套不上（main 已改過同一處，或只上了一部分） |
| article/ai-manages-ai-focus | 2026-10-15 | 第 3 篇補側欄截圖實際案例、Grok Bot 官方來源、改用新版咪卡圖 | articles/ai-employees-manage-agents/article.json,articles/ai-manages-ai-focus/article.json,articles/ai-manages-ai-focus/index.html | 正反向都套不上（main 已改過同一處，或只上了一部分） |
| article/ai-retrieval-pages-backlinks | 2026-10-15 | 合併 main：解 3X4 新版、第 3 篇索引衝突（兩邊都保留；生成檔為 main 原樣） | articles/ai-retrieval-pages-backlinks/article.json,articles/ai-retrieval-pages-backlinks/index.html,articles/claude-skills-knowledge-assets/article.json | 正反向都套不上（main 已改過同一處，或只上了一部分） |
| article/diary-driven-agent-3x4-v2 | 2026-10-15 | 深度文章：3X4 資料整理法新版 三種日記我改了 | articles/diary-driven-agent-3x4-v2/article.json,articles/diary-driven-agent-3x4-v2/index.html,articles/diary-driven-agent-3x4/article.json | 正反向都套不上（main 已改過同一處，或只上了一部分） |
| article/task-queue-mod | 2026-10-14 | 深度文章上線：Claude Code Mod 做任務佇列 | articles/auto-compact-mod/article.json,articles/grok-bot-galaxy-day1-founders/article.json,articles/task-queue-mod/article.json | 正反向都套不上（main 已改過同一處，或只上了一部分） |
| site/course-1011-cover | 2026-10-14 | 10/11 免費講座補封面（OpenAI dots、GrokBot 直播海報） | courses-data.js,images/courses/2026-10-11-cloud-computer-ai-employees.jpg | 正反向都套不上（main 已改過同一處，或只上了一部分） |
| site/courses-experience | 2026-10-14 | 講師經歷拿掉法務部廉政署（實為桃園市政府政風處場次） | courses-data.js,courses.html | 正反向都套不上（main 已改過同一處，或只上了一部分） |
| article/add-dora-offer | 2026-10-13 | 服務方案加朵拉 DoraAI 卡（AI 實習生），連到 dora-aicat.pages.dev；萊卡編號改 05 | images/ai-office/dora/dora-offer-cover.webp,offers.html | 正反向都套不上（main 已改過同一處，或只上了一部分） |
| article/agent-three-layer-triage | 2026-10-10 | Agent 排障：補列表封面、拿掉已停用的 EN 連結 | articles/agent-three-layer-triage/article.json,articles/agent-three-layer-triage/index.html,images/articles/agent-three-layer-triage-cover.jpg | 正反向都套不上（main 已改過同一處，或只上了一部分） |
| article/ai-customer-service-model-retest | 2026-10-10 | check-mika-widget：豁免文章內嵌評量表 scorecard.html（iframe、noindex，母頁已掛咪卡） | articles/ai-cp-value-calculus/article.json,articles/ai-customer-service-api-cost/article.json,articles/ai-customer-service-model-retest/article.json | 正反向都套不上（main 已改過同一處，或只上了一部分） |
| article/chatgpt-web-codex-console | 2026-10-10 | 深度文章：讓網頁版 ChatGPT 當 Codex 總控台｜有官方 MCP，但限制還很多 | articles/ai-employees-manage-agents/article.json,articles/ai-image-api-cost/article.json,articles/character-costume-sheet-three-views/article.json | 正反向都套不上（main 已改過同一處，或只上了一部分） |
| article/cloudflare-free-plan-limits | 2026-10-10 | Cloudflare 免費方案：依江江決定拿掉 8/31 事故段（原雷四），雷數改四 | articles/cloudflare-free-plan-limits/article.json,articles/cloudflare-free-plan-limits/index.html,images/og/cloudflare-free-plan-limits.jpg | 正反向都套不上（main 已改過同一處，或只上了一部分） |
| article/fix-llms-og-2026-10-10 | 2026-10-10 | check-llms-coverage：Markdown 連結帶標題、連結文字不當目的地、壞網址不崩、註解與 data 屬性不算 noindex（跨家審第二輪） | images/og/handoff-continue-or-replace.jpg,llms.txt,scripts/check-llms-coverage.mjs | 正反向都套不上（main 已改過同一處，或只上了一部分） |
| article/handoff-continue-or-replace | 2026-10-10 | 深度文章上線：AI 交接任務的心得分享｜做得好繼續，跟做不好改做的兩種情況 | articles/ai-handoff-instructions/article.json,articles/handoff-continue-or-replace/article.json,articles/handoff-continue-or-replace/index.html | 正反向都套不上（main 已改過同一處，或只上了一部分） |
| article/revert-lesson0-20261010 | 2026-10-10 | Revert "第零堂課後實錄版" | courses/2026-09-ai-series/lesson-0/index.html | 正反向都套不上（main 已改過同一處，或只上了一部分） |
| article/search-aliases-pw-mask-2026-10-10 | 2026-10-10 | PwBlank 字型照規範：format 13 改掛 platform 0/encoding 6，加 format 4 備用表（英數、拉丁、圓點類）（跨家審第二輪） | search-aliases.js,stats.html | 正反向都套不上（main 已改過同一處，或只上了一部分） |
| article/ai-model-token-efficiency | 2026-10-09 | 合併 main；補 cover 欄位、sitemap、與 TokenMoney 雙向互連 | articles/ai-model-token-efficiency/article.json,articles/ai-model-token-efficiency/index.html,articles/fixed-test-set-for-ai/article.json | 正反向都套不上（main 已改過同一處，或只上了一部分） |
| article/auto-compact-mod | 2026-10-09 | 合併 main（TokenMoney 已上線）；補兩篇 cover 欄位與 auto-compact-mod sitemap | articles/auto-compact-mod/article.json,articles/auto-compact-mod/index.html,articles/codex-log-health-check/article.json | 正反向都套不上（main 已改過同一處，或只上了一部分） |
| article/knowledge-workers-new-model-guide | 2026-10-09 | 合併 main；補 cover 欄位與 sitemap | articles/knowledge-workers-new-model-guide/article.json,articles/knowledge-workers-new-model-guide/index.html,image-ratio-ignore.json | 正反向都套不上（main 已改過同一處，或只上了一部分） |
| article/token-money-worth-doing | 2026-10-09 | sitemap 補 token-money-worth-doing | articles/ai-customer-service-api-cost/article.json,articles/ai-image-api-cost/article.json,articles/codex-log-health-check/article.json | 正反向都套不上（main 已改過同一處，或只上了一部分） |
| migration/cloudflare-20261004 | 2026-10-09 | publish: fail verify when authoritative IP missing; production deploy main-only |  | 只改生成檔或沒有改動 |
| article/0908-three-articles | 2026-10-03 | 合併 main（相關文章與索引兩邊都保留） | articles/ai-customer-service-api-cost/article.json,articles/ai-customer-service-api-cost/index.html,articles/ai-slides-half-auto-google-slides/article.json | 正反向都套不上（main 已改過同一處，或只上了一部分） |
| article/ai-adoption-raise-cards | 2026-10-03 | 企業導入AI文章放入7張輪播卡，拿掉與卡片重複的三張流程圖 | articles/ai-adoption-raise-not-install/index.html,images/articles/ai-adoption-raise-not-install-card-01.jpg,images/articles/ai-adoption-raise-not-install-card-02.jpg | 正反向都套不上（main 已改過同一處，或只上了一部分） |
| article/ai-adoption-raise-cover-v2 | 2026-10-03 | 企業導入 AI 文章換封面：老闆硬拉暈頭轉向的 AI 進辦公室 | articles/ai-adoption-raise-not-install/index.html,images/articles/ai-adoption-raise-not-install-cover.jpg,images/og/ai-adoption-raise-not-install.jpg | 正反向都套不上（main 已改過同一處，或只上了一部分） |
| article/ai-adoption-raise-images-v2 | 2026-10-03 | 企業導入AI文章換架構圖版配圖：封面、四張流程圖改圖片、加一頁總結 | articles/ai-adoption-raise-not-install/index.html,images/articles/ai-adoption-raise-not-install-cover.jpg,images/articles/ai-adoption-raise-not-install-flow1.jpg | 正反向都套不上（main 已改過同一處，或只上了一部分） |
| article/ai-adoption-raise-media-row | 2026-10-03 | 企業導入AI文章：輪播卡改左右排、修正卡片長寬比 | articles/ai-adoption-raise-not-install/index.html | 正反向都套不上（main 已改過同一處，或只上了一部分） |
| article/ai-adoption-raise-no-video | 2026-10-03 | 企業導入 AI 文章拿掉影片引用，三階段改用自己的說法 | articles/ai-adoption-raise-not-install/index.html,search-aliases.js | 正反向都套不上（main 已改過同一處，或只上了一部分） |
| article/ai-adoption-raise-not-install | 2026-10-03 | 新文章：企業導入 AI 為什麼這麼難？買了工具同事都沒在用，AI 要從一件每天做的事開始養 | articles/ai-adoption-raise-not-install/article.json,articles/ai-adoption-raise-not-install/index.html,articles/ai-adoption-start-with-one-workflow/article.json | 正反向都套不上（main 已改過同一處，或只上了一部分） |
| article/ai-employees-manage-agents | 2026-10-03 | 文章：補新主標搜尋別名 | articles/ai-employees-manage-agents/article.json,articles/ai-employees-manage-agents/index.html,articles/cathay-tech-conference-2026/article.json | 正反向都套不上（main 已改過同一處，或只上了一部分） |
| article/ai-understands-ei-ha | 2026-10-03 | 欸和蛤：補 sitemap 與 llms.txt | articles/ai-handoff-instructions/article.json,articles/ai-rule-file-slimming/article.json,articles/ai-understands-ei-ha/article.json | 正反向都套不上（main 已改過同一處，或只上了一部分） |
| article/pii-shield | 2026-10-03 | 合併主線，search-aliases.js 兩邊別名都保留 | articles/ai-batch-work-without-seeing-data/article.json,articles/ai-data-red-lines/article.json,articles/pii-shield/article.json | 正反向都套不上（main 已改過同一處，或只上了一部分） |
| article/slides-by-audience-sop | 2026-10-03 | 先拿掉指向未上線文章 ai-slides-half-auto-google-slides 的兩處連結（那篇上線時補回） | articles/cloudflare-service-map/article.json,articles/hosting-platform-decision-tree/article.json,articles/how-to-train-your-ai-employee/article.json | 正反向都套不上（main 已改過同一處，或只上了一部分） |
| article/slides-merge | 2026-10-03 | 合併版：半自動篇舊網址 301 轉址、刪舊目錄、相關連結與搜尋別名合併（未上線） | articles/ai-slides-half-auto-google-slides/article.json,articles/ai-slides-half-auto-google-slides/index.html,articles/dual-track-planning-loop/article.json | 正反向都套不上（main 已改過同一處，或只上了一部分） |
| article/slides-relink | 2026-10-03 | 簡報助理篇補回連到半自動簡報篇（就近延伸＋這篇提到過的），兩篇 related 互加 | articles/ai-slides-half-auto-google-slides/article.json,articles/slides-by-audience-sop/article.json,articles/slides-by-audience-sop/index.html | 正反向都套不上（main 已改過同一處，或只上了一部分） |
| article/home-motion-and-architecture | 2026-09-30 | 上線關卡三處修正：搜尋別名補新副標、首頁咪卡客服掛載豁免、圖片比例關只認新增行碰到圖片 | _templates/article-template.html,agent.html,ai-office/lyca/index.html | 正反向都套不上（main 已改過同一處，或只上了一部分） |
| article/first-principles-money-soup | 2026-09-29 | 新增深度文章：從一篇賺錢雞湯文，看馬斯克第一性原理 | articles/ai-mvp-validation-before-product/article.json,articles/delete-before-automate/article.json,articles/elon-musk-live-skill/article.json | 正反向都套不上（main 已改過同一處，或只上了一部分） |
| article/fixed-test-set-for-ai-v2 | 2026-09-29 | fixed-test-set-for-ai：修限制段一題／兩題矛盾，改掉「不在A，在B」句型 | articles/fixed-test-set-for-ai/article.json,articles/fixed-test-set-for-ai/index.html | 正反向都套不上（main 已改過同一處，或只上了一部分） |
| article/opus-luna-model-division | 2026-09-29 | 深度文章：頂規 AI 模型很貴，哪些事交給它、哪些交給便宜的？｜Opus 5.5 動腦、Luna 搬磚的實際分工 | articles/ai-cp-value-calculus/article.json,articles/ai-schedule-wake-interval/article.json,articles/dual-track-planning-loop/article.json | 正反向都套不上（main 已改過同一處，或只上了一部分） |
| article/ai-adoption-start-with-one-workflow | 2026-09-26 | 上線準備：robots 改 index,follow、六篇相關文章回連、sitemap 與 llms 補登 | articles/ai-adoption-start-with-one-workflow/article.json,articles/ai-adoption-start-with-one-workflow/index.html,articles/ai-employee-four-levels/article.json | 正反向都套不上（main 已改過同一處，或只上了一部分） |
| article/ai-adoption-title-a | 2026-09-26 | 封面改用新主標重生，首圖與分享圖同一張 | articles/ai-adoption-start-with-one-workflow/article.json,articles/ai-adoption-start-with-one-workflow/index.html,images/articles/ai-adoption-start-with-one-workflow-cover.jpg | 正反向都套不上（main 已改過同一處，或只上了一部分） |
| article/course-0926-postclass | 2026-09-26 | 課後版：9/26 AI 做網站講座簡報回整逐字稿（課堂細節折疊、課堂示範四頁、官網導覽列、手機表格） | courses/2026-09-26-ai-site-and-deploy/index.html | 正反向都套不上（main 已改過同一處，或只上了一部分） |
| article/one-sentence-ai-website-workflow | 2026-09-26 | 新文章：我只用一句話，AI 怎麼把網站做完？（one-sentence-ai-website-workflow） | articles/ai-era-websites-for-agents/article.json,articles/claude-skills-knowledge-assets/article.json,articles/hosting-platform-decision-tree/article.json | 正反向都套不上（main 已改過同一處，或只上了一部分） |
| article/cathay-tech-conference-2026 | 2026-09-24 | 國泰年會文章：依 AUT 與 Codex 跨家審修訂、補 OG 圖 | articles/cathay-tech-conference-2026/article.json,articles/cathay-tech-conference-2026/index.html,images/articles/cathay-tech-conference-2026/card01.jpg | 正反向都套不上（main 已改過同一處，或只上了一部分） |
| article/cloudflare-service-map | 2026-09-24 | cloudflare-service-map 上線前更新：接上最新 main、加封面、9/24 複查官方數字（每輪上限、網域價格）、補 sitemap 與託管決策樹互連 | articles/cloudflare-service-map/article.json,articles/cloudflare-service-map/index.html,articles/github-vercel-cloudflare-compare/article.json | 正反向都套不上（main 已改過同一處，或只上了一部分） |
| article/grok-bot-galaxy-series-nav | 2026-09-24 | Grok Bot Galaxy 三篇：簡介下方加系列導覽互連、Day 2／Day 3 補 hero 封面、三篇補文章列表封面 | articles/grok-bot-galaxy-day1-founders/article.json,articles/grok-bot-galaxy-day1-founders/index.html,articles/grok-bot-galaxy-day2-workshops/article.json | 正反向都套不上（main 已改過同一處，或只上了一部分） |
| article/delete-before-automate | 2026-09-23 | 拿掉已撤除的英文版連結 | articles/ai-vs-script-four-situations/article.json,articles/delete-before-automate/article.json,articles/delete-before-automate/index.html | 正反向都套不上（main 已改過同一處，或只上了一部分） |
| article/ai-data-red-lines | 2026-09-22 | 修正：topic 標籤改受控詞彙「使用原則」、紅線那行拿掉破折號 | articles/ai-data-red-lines/article.json,articles/ai-data-red-lines/index.html,articles/ai-loop-safety-recovery/article.json | 正反向都套不上（main 已改過同一處，或只上了一部分） |
| article/grok-bot-galaxy-day1-founders | 2026-09-22 | 上線準備：補 sitemap、llms、llms-full、搜尋別名；拿掉已撤除的英文版切換 | articles/grok-bot-galaxy-day1-founders/article.json,articles/grok-bot-galaxy-day1-founders/index.html,images/articles/grok-bot-galaxy-day1-founders/card01.jpg | 正反向都套不上（main 已改過同一處，或只上了一部分） |
| article/grok-bot-galaxy-day2-workshops | 2026-09-22 | 上線準備：補 sitemap、llms、llms-full、搜尋別名 | articles/ai-employee-four-levels/article.json,articles/cli-api-mcp-computer-use/article.json,articles/grok-bot-galaxy-day2-workshops/article.json | 正反向都套不上（main 已改過同一處，或只上了一部分） |
| article/grok-bot-galaxy-day3-shipping | 2026-09-22 | 上線準備：補 sitemap、llms、llms-full、搜尋別名；Day 1、Day 2 相關文章補系列回連 | articles/grok-bot-galaxy-day1-founders/article.json,articles/grok-bot-galaxy-day2-workshops/article.json,articles/grok-bot-galaxy-day3-shipping/article.json | 正反向都套不上（main 已改過同一處，或只上了一部分） |
| article/infra-article-css-precommit | 2026-09-22 | 機制：pre-commit 改 NUL 分隔、git 指令失敗一律擋（Codex 複審 MINOR 兩點） | scripts/check-article-css.mjs,scripts/git-hooks/pre-commit | 正反向都套不上（main 已改過同一處，或只上了一部分） |
| article/remove-en-version | 2026-09-22 | 轉址改明確 301（Codex 跨家審：permanent:true 實為 308） | _templates/article-template.html,agent.html,ai-office/lyca/index.html | 正反向都套不上（main 已改過同一處，或只上了一部分） |
| article/fixed-test-set-for-ai | 2026-09-21 | fixed-test-set-for-ai：刪過程碎念，香氛工作坊改成判準拍板的講法 | _templates/article-template.html,articles/ai-cp-value-calculus/article.json,articles/fixed-test-set-for-ai/article.json | 正反向都套不上（main 已改過同一處，或只上了一部分） |
| article/ai-schedule-wake-interval | 2026-09-20 | 重建封面與索引資料 | articles/ai-image-api-cost/article.json,articles/ai-schedule-wake-interval/article.json,articles/ai-schedule-wake-interval/index.html | 正反向都套不上（main 已改過同一處，或只上了一部分） |
| article/why-ai-gives-bad-titles-first | 2026-09-20 | 配圖與可直接複製的提示詞段 | articles/why-ai-gives-bad-titles-first/article.json,articles/why-ai-gives-bad-titles-first/index.html,images/articles/why-ai-gives-bad-titles-first-cover.jpg | 正反向都套不上（main 已改過同一處，或只上了一部分） |
| article/course-0926-ai-site | 2026-09-19 | 標題定案與兩張咪卡海報：9/26 改用江江原話標題，9/21 補海報 | courses-data.js,images/courses/2026-09-21-more-bots-than-people.jpg,images/courses/2026-09-26-ai-site-and-deploy.jpg | 正反向都套不上（main 已改過同一處，或只上了一部分） |
| article/ai-vs-script-four-situations | 2026-09-18 | 深度文章草稿：讓 AI 只做需要判斷的事，其他交給程式｜四情境分工法 | articles/ai-vs-script-four-situations/article.json,articles/ai-vs-script-four-situations/index.html,images/articles/ai-vs-script-four-situations-cover.jpg | 正反向都套不上（main 已改過同一處，或只上了一部分） |
| article/covers-0901-0915 | 2026-09-18 | 文章列表卡片顯示封面，文字精簡成標題加一句「適合誰」 | articles-render.js,articles.html,articles/ai-custom-work-compound/article.json | 正反向都套不上（main 已改過同一處，或只上了一部分） |
| article/hosting-platform-decision-tree | 2026-09-17 | 託管平台決策樹：加生成封面（首圖區＋分享圖） | articles/free-deploy-three-boundaries/article.json,articles/github-vercel-cloudflare-compare/article.json,articles/hosting-platform-decision-tree/article.json | 正反向都套不上（main 已改過同一處，或只上了一部分） |
| fix/security-2026-09-13 | 2026-09-14 | 咪卡移除課程頁寬額度與教室 IP 白名單：學員用自己手機、也有線上課（江江 9/14）；課程頁只留一則算一次（Codex gpt-5.6-sol 審 PASS） | .vercelignore,DEPLOYMENT.md,api/mika-chat.js | 正反向都套不上（main 已改過同一處，或只上了一部分） |
| article/ai-custom-work-compound | 2026-09-13 | Merge remote-tracking branch 'origin/main' into article/ai-custom-work-compound | articles/ai-custom-work-compound/article.json,articles/ai-custom-work-compound/index.html,images/og/ai-custom-work-compound.jpg | 正反向都套不上（main 已改過同一處，或只上了一部分） |
| article/ai-rule-file-slimming | 2026-09-13 | 跨家審（Codex gpt-5.6-sol）部分採納：OpenAI 那句補上「換到 GPT-6 Astra」的範圍 | articles/ai-rule-file-slimming/article.json,articles/ai-rule-file-slimming/index.html,articles/how-to-verify-ai-rule-changes/article.json | 正反向都套不上（main 已改過同一處，或只上了一部分） |
| article/design-for-ai-errors | 2026-09-13 | 層層追問改用江江傳給客戶的原話，一頁總結圖換成四層追問總結 | articles/design-for-ai-errors/index.html,images/articles/design-for-ai-errors-summary.jpg | 正反向都套不上（main 已改過同一處，或只上了一部分） |
| article/fix-sitemap-llms-workstation | 2026-09-13 | 補 website-as-workstation 進 sitemap.xml 與 llms.txt | llms.txt | 正反向都套不上（main 已改過同一處，或只上了一部分） |
| article/where-is-my-server | 2026-09-13 | 修部署 preflight 抓到的問題：三個 table 補上 tablewrap 包裝 | articles/where-is-my-server/article.json,articles/where-is-my-server/index.html,images/articles/where-is-my-server-01.jpg | 正反向都套不上（main 已改過同一處，或只上了一部分） |
| article/website-as-workstation | 2026-09-12 | 五篇被連文章補 website-as-workstation 回連（雙向對稱） | articles/ai-data-organization-usable-system/article.json,articles/docs-as-system-design-agent/article.json,articles/post-class-organizing-loop/article.json | 正反向都套不上（main 已改過同一處，或只上了一部分） |
| article/ai-when-you-only-have-phone | 2026-09-11 | 補 make-your-ai-secretary 的站內搜尋別名 | articles/make-your-ai-secretary/article.json,articles/make-your-ai-secretary/index.html,images/articles/make-your-ai-secretary-brief.jpg | 正反向都套不上（main 已改過同一處，或只上了一部分） |
| article/claude-meta-ads-connector | 2026-09-11 | 三個表格包進 .tablewrap | articles/claude-meta-ads-connector/article.json,articles/claude-meta-ads-connector/index.html,images/articles/claude-meta-ads-connector-01-connected.jpg | 正反向都套不上（main 已改過同一處，或只上了一部分） |
| article/loop-four-entries | 2026-09-11 | 上線前置：補 sitemap、llms.txt，以及六篇 related 雙向回連 | articles/ai-user-testing/article.json,articles/harness-to-loop/article.json,articles/loop-engineering-guardrails/article.json | 正反向都套不上（main 已改過同一處，或只上了一部分） |
| article/ai-user-testing | 2026-09-10 | AUT 文章上架準備：解擋板＋補齊索引接線（江江 2026-09-10 授權上架） | articles/ai-market-microcosm/article.json,articles/ai-mvp-validation-before-product/article.json,articles/ai-user-testing/article.json | 正反向都套不上（main 已改過同一處，或只上了一部分） |
| article/how-to-verify-ai-rule-changes | 2026-09-10 | 深度文章草稿：改完規則怎麼知道 AI 到底有沒有變乖（未部署，.vercelignore 擋板） | .vercelignore,articles/how-to-verify-ai-rule-changes/article.json,articles/how-to-verify-ai-rule-changes/index.html | 正反向都套不上（main 已改過同一處，或只上了一部分） |
| article/danhai-0912-poster-optional | 2026-09-09 | 0912 課程頁：插畫版必做、電影海報版選做且要用實拍場景 | courses/2026-09-12-danhai-public-art/index.html | 正反向都套不上（main 已改過同一處，或只上了一部分） |
| article/mechanism-needs-an-engine | 2026-09-08 | 接線：site-index 帶上本篇（preflight 重跑產生器後的更新） | articles/build-your-own-dictionary/article.json,articles/caught-ai-slacking-into-rules/article.json,articles/copied-mechanism-is-no-mechanism/article.json | 正反向都套不上（main 已改過同一處，或只上了一部分） |
| article/skill-store | 2026-09-08 | 技能包商店：第三輪 SSR 對照後修四處（購買鈕不再被 catalog 失敗擋掉、待核對碼可自己拿掉重打、誤點登出加確認、通關碼與訂單編號文案分開） | api/skill-access.js,scripts/skill-store-sync.mjs,scripts/test-skill-access.mjs | 正反向都套不上（main 已改過同一處，或只上了一部分） |
| article/self-hosted-site-analytics | 2026-09-07 | 重建 articles-data.js：日期同步成 09-07（改 article.json 後忘了重跑生成腳本） | articles/self-hosted-site-analytics/article.json,articles/self-hosted-site-analytics/index.html,images/articles/analytics-1-tiles.jpg | 正反向都套不上（main 已改過同一處，或只上了一部分） |
| article/split-shared-hotspot | 2026-09-06 | split-shared-hotspot v2.1：套 Codex 複審（副標改「不用搶」、症狀歸屬改準、刪無來源句、補同篇仍會撞） | articles/five-loops-content-line/article.json,articles/parallel-site-editing/article.json,articles/publish-gate/article.json | 正反向都套不上（main 已改過同一處，或只上了一部分） |
| article/what-is-ai-office | 2026-09-05 | article(what-is-ai-office): 對象去識別化改通用組織團隊、第二步補複製實際工作資料夾、summary 改課程用詞 | .vercelignore,articles/what-is-ai-office/index.html,images/og/what-is-ai-office.jpg | 正反向都套不上（main 已改過同一處，或只上了一部分） |
| article/stats-admin | 2026-09-01 | 站長儀表板：stats.html 改成密碼保護的資料視覺化後台 | api/search-log.js,api/stats-admin.js,api/view.js | 正反向都套不上（main 已改過同一處，或只上了一部分） |
| article/stats-admin-v2 | 2026-09-01 | 站長儀表板四項修正：拿掉密碼提示、矩陣文字轉正、對話改成依訪客整合的對話串 | api/search-log.js,api/stats-admin.js,stats-dash.js | 正反向都套不上（main 已改過同一處，或只上了一部分） |
| article/stats-admin-v3 | 2026-09-01 | 每頁每日埋點的 TTL 改成 await，否則 serverless 凍結前送不出去 | api/view.js | 正反向都套不上（main 已改過同一處，或只上了一部分） |
| article/stats-admin-v4 | 2026-09-01 | 儀表板改成日期範圍查詢，對話明細改成訪客清單點開才展開 | api/stats-admin.js,stats-dash.js,stats.html | 正反向都套不上（main 已改過同一處，或只上了一部分） |
| article/view-ratelimit | 2026-09-01 | 補上獨立訪客與來源網站，AI 平台來源獨立成 GEO 成效指標 | api/stats-admin.js,api/view.js,stats-dash.js | 正反向都套不上（main 已改過同一處，或只上了一部分） |
| article/parallel-site-editing | 2026-08-19 | 深度文章草稿：兩個 AI 同時改一個網站，為什麼會打架？（parallel-site-editing） | articles/parallel-site-editing/index.html,images/articles/parallel-site-editing-cover.jpg,images/articles/parallel-site-editing-trio.jpg | 正反向都套不上（main 已改過同一處，或只上了一部分） |
| infra/parallel-publish | 2026-08-19 | 並行施工機制兩處實測修補：worktree 帶 .vercel/project.json、main 桌子可發布 | scripts/daily-health-check.sh,scripts/merge-publish.sh,scripts/new-article-workspace.sh | 正反向都套不上（main 已改過同一處，或只上了一部分） |
| drafts/laptop-unpushed-2026-08-15 | 2026-08-12 | 封面換 v2（翻開實體書版，比 v1 筆電版更貼近旅行簡報成品） | .vercelignore,articles/data-page-before-data-arrives/index.html,courses/senior-ai-story-workshop/deck.html | 正反向都套不上（main 已改過同一處，或只上了一部分） |
| publish/2026-07-12-chatgpt-work | 2026-07-10 | chore: 重試發布 7 月 12 日課程更新 |  | 只改生成檔或沒有改動 |

## 備註

- 交接線索中的 article/task-queue-mod、site/course-1011-cover、site/courses-experience 判在「要人看」，與線索預期一致；site/course-1011-title 判成「已在 main」。
- 交接線索寫 site/dora-url-fyi 確定還沒上，但 main 已在 2026-10-21 20:47 以 f855d8d5 上線同一改動，本次判為「已在 main」，site/dora-url-fyi-v2 亦同。
- 本清單由唯讀 git 指令產生，盤點期間若有人推新分支，數字會變。
