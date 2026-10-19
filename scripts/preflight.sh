#!/bin/bash
# ─── 官網上線前檢查（preflight）───
# 用法：bash scripts/preflight.sh
# 全綠 exit 0；任一項 FAIL exit 1（publish.sh 會擋下不部署）
# 2026-07-06 立：把人工健檢清單機器化，錯誤在部署前擋下。
set -uo pipefail
cd "$(dirname "$0")/.."
SAFE_DEPLOY_TOOL="${SAFE_DEPLOY_TOOL:-$HOME/Library/Mobile Documents/iCloud~md~obsidian/Documents/江昱德 主知識庫/_agent/tools/safe-deploy/safe-deploy.sh}"
FAIL=0
ok(){ echo "  ✅ $1"; }
bad(){ echo "  ❌ $1"; FAIL=1; }

echo "═══ 0/12 部署環境檢查 ═══"
if bash scripts/check-deploy-env.sh; then ok "部署環境"; else bad "部署環境未通過"; fi

echo "═══ 1/12 站點索引重建（含受控詞彙檢查）═══"
# 文章資料源一致性（2026-09-06 立）：articles-data.js 是一篇一檔 article.json 合併出的生成檔。
# 這一關擋兩件事：①有人照舊習慣直接手改 articles-data.js（漂移）②新文章放了 article.json 卻沒重建。
# 兩種都印出該怎麼修（--adopt 回寫／重建），不靜默覆蓋任何一邊。
if node scripts/build-articles-data.mjs --check 2>&1 | tail -1 | grep -q "✅"; then
  ok "文章資料源（article.json ⇄ articles-data.js 一致）"
else
  bad "articles-data.js 與 article.json 來源不一致：node scripts/build-articles-data.mjs（手改要保留就加 --adopt）"
fi
if node scripts/build-site-index.mjs 2>&1 | tail -1 | grep -q "✅"; then ok "site-index + 詞彙"; else bad "build-site-index 未通過"; fi
# 英文文章索引檢查已於 2026-09-22 拿掉：江江決定撤英文版（en/ 整個移除，301 轉回中文頁），
# build-en-articles-data.mjs 只剩空殼。英文內容備存在 git tag archive/en-final-2026-09-22。
# 咪卡檢索用的內文關鍵詞：每次發布重跑，新文章的專有名詞才會進索引。
# 立因（2026-08-11）：「半人馬」「A2A」都是只寫在內文、沒進索引，咪卡因此說站上沒有。
# 這一關重跑後若有變更就擋下，逼發布者把 article-keywords.js 一起帶進本次範圍。
node scripts/build-article-keywords.mjs > /dev/null 2>&1 || true
if git diff --quiet -- article-keywords.js 2>/dev/null; then
  ok "咪卡內文關鍵詞（已是最新）"
else
  bad "article-keywords.js 有更新未提交：把它加進本次發布範圍（新文章的關鍵詞沒進索引，咪卡會找不到）"
fi
# 索引覆蓋率（2026-08-12 立，事故驅動）：上一關只擋「自動抽詞檔沒同步」，
# 擋不住「人工別名沒補」與「改標題把詞洗掉」。8/12 定裝照那篇上線當輪沒補別名，
# 江江實測問「角色定妝照」查不到，就是這個洞。盤點另發現 37 篇改過標題、16 篇有詞掉出索引。
# 這一關與上一關同屬咪卡索引，刻意不另編號，維持「一個發布閘門」。
if node scripts/check-index-coverage.mjs; then
  ok "索引覆蓋率（新文章有別名、改標題沒洗掉詞）"
else
  bad "索引覆蓋率未過：見上方清單。補 search-aliases.js，或在 index-coverage-ignore.json 寫明不補的理由"
fi

# 標題公式（2026-09-12 立）：上一關擋「改標題把詞洗掉」，擋不住「副標一開始就寫錯」。
# 9/12 江江看 loop-four-entries 說「標題這麼長都沒講到重點」，長出的規則是
# 副標＝第二搜尋入口（不是金句、不是功能描述）。這支補那條規則的引擎。
# 只驗本次變更的文章；舊標題沒有「｜」與副標長度只提醒不擋（8/24 明訂舊文不回頭批改）。
# 誠實邊界：機器驗不了「主標是不是讀者真的會打的話」，那層靠 AUT 第五題與跨家審。
# 全站盤查用 node scripts/check-title-formula.mjs --all（只列清單不擋）。
if node scripts/check-title-formula.mjs; then
  ok "標題公式（副標是可搜尋的概念名，不是功能描述）"
else
  bad "標題公式未過：見上方清單。改副標，或在 title-formula-ignore.json 寫明這篇為什麼不套公式"
fi

# 圖片比例（2026-09-20 立，事故驅動）：封面做成直式、內文圖做成橫式，剛好相反。
# 封面服務分享縮圖（OG 1200x630 是橫的），內文圖服務一圖兩用（能直接當 4:5 輪播卡）。
# 只驗本輪改過 index.html 的文章；舊文不回頭批改。
# 誠實邊界：機器只驗比例與 class 對不對，驗不了圖畫得好不好、該不該有圖。
if node scripts/check-image-ratio.mjs; then
  ok "圖片比例（封面橫式、內文直式）"
else
  bad "圖片比例未過：見上方清單。重生該張圖，或在 image-ratio-ignore.json 寫明這篇為什麼不套"
fi
if node scripts/check-image-budget.mjs; then ok "圖片體積（新增圖 ≤400KB、寬 ≤1400px）"; else bad "圖片體積未過：見上方清單，縮寬 1400 並壓到 400KB 以下"; fi
# 列表封面欄位（2026-10-09 立，事故驅動）：文章頁有 hero 封面、article.json 卻沒 cover，文章列表卡片就沒封面，
# 之前沒有任何檢查擋。只驗本次變更的文章；舊文用 --all 列清單不擋。
if node scripts/check-article-cover.mjs; then
  ok "列表封面欄位（有 hero 封面的文章 article.json 都有 cover）"
else
  bad "列表封面欄位未過：見上方清單。article.json 補 cover，或在 article-cover-ignore.json 寫明理由"
fi

# 文章日期與 head（2026-10-19 立，盤查驅動）：81 篇缺 datePublished、98 篇沒有可見日期行、14 篇 <title> 與 article.json 不同，
# 規則 6/26 就有但模板沒接、也沒有檢查器。現在 head 與日期行由 build-article-head.mjs 從 article.json 生成，
# 這兩關擋「缺日期」與「有人手改 head 或改了 article.json 沒重生」。與上面幾關同屬資料源一致性，刻意不另編號。
if node scripts/check-article-dates.mjs; then
  ok "文章日期（article.json、JSON-LD、可見日期行三處一致）"
else
  bad "文章日期未過：見上方清單。改 article.json 後跑 node scripts/build-article-head.mjs --only=<id>"
fi
if node scripts/build-article-head.mjs --check; then
  ok "文章 head（title、og、twitter、JSON-LD、麵包屑與 article.json 一致）"
else
  bad "文章 head 與 article.json 不一致：跑 node scripts/build-article-head.mjs（不要手改 head）"
fi

echo "═══ 2/12 文章互聯腳本齊全 ═══"
if node scripts/verify-interlink.js 2>&1 | grep -q "結果：PASS"; then ok "interlink"; else bad "verify-interlink FAIL（有文章缺互聯腳本）"; fi

echo "═══ 3/12 雙向連結 ═══"
LG=$(node scripts/link-graph.js check 2>&1)
if echo "$LG" | grep -q "結果：PASS"; then
  W=$(echo "$LG" | grep -c "WARN" || true); ok "link-graph（單向提醒 $W 筆，不擋）"
else bad "link-graph 有斷連"; fi

echo "═══ 4/12 新頁面有進 sitemap 與 llms.txt ═══"
MISS=0
for f in *.html; do
  # _ 開頭＝本機工具檔（校稿器 tuner 等），跟 _trash/ 同一個慣例，不上線也不進 sitemap
  # 404.html＝自訂錯誤頁（2026-10-19 立），noindex，不該進 sitemap
  case "$f" in _*.html|google*|stats.html|search.html|agent.html|skills.html|index-parallel*.html|404.html) continue;; esac
  loc="${f}"; [ "$f" = "index.html" ] && loc="/"
  grep -q "$loc" sitemap.xml || { bad "sitemap 缺 $f"; MISS=1; }
done
[ $MISS -eq 0 ] && ok "sitemap 覆蓋"
# 已上線文章 sitemap 覆蓋（2026-09-22 立，4O 健檢抓到缺口）：上面那段只驗根目錄 *.html，
# 深度文章與 AI 趨勢有好幾篇上線了卻沒進 sitemap。這一關比對 articles-data.js 宣告的上線文章
# （排除 .vercelignore 擋板與 noindex）與 sitemap.xml，缺一篇就擋。
# 2026-10-09 起 sitemap 文章段是生成的（scripts/build-sitemap.mjs，merge-publish 重建步會跑）；
# 這一關還留著當保底：分支不必再手補 sitemap，但若有人繞過 merge-publish 直接 publish，這裡仍擋。
if node scripts/check-sitemap-coverage.mjs; then ok "已上線文章都在 sitemap"; else bad "有已上線文章不在 sitemap.xml（見上方清單）：跑 node scripts/build-sitemap.mjs 重建文章段，不用手補"; fi
# 2026-10-19 起 sitemap 也負責移除 noindex 頁、補收 privacy 等固定頁、文章 lastmod 等於 article.json；--check 擋「有人改了來源沒重建」。
if node scripts/build-sitemap.mjs --check; then ok "sitemap 與來源一致（含 noindex 移除、lastmod）"; else bad "sitemap.xml 需要重建：跑 node scripts/build-sitemap.mjs"; fi
# 靜態清單與課程 JSON-LD（2026-10-19 立，4O 體檢）：articles.html、courses.html 的 noscript 全清單、課程頁 Course JSON-LD 都是生成的。
if node scripts/build-static-lists.mjs --check; then ok "文章總站與課程頁靜態清單已是最新"; else bad "靜態清單需要重建：跑 node scripts/build-static-lists.mjs"; fi
if node scripts/build-course-jsonld.mjs --check; then ok "課程頁 Course JSON-LD 已是最新"; else bad "Course JSON-LD 需要重建：跑 node scripts/build-course-jsonld.mjs"; fi
# 已上線文章 llms.txt 覆蓋（2026-10-10 立）：原本只驗知識架構一頁，10-03 後 10 篇文章沒進 llms.txt 也沒人擋。
# 2026-10-19 起 llms.txt、llms-full.txt 文章段改由 build-llms.mjs 從 article.json 生成，覆蓋檢查同時驗標題。
if node scripts/check-llms-coverage.mjs; then ok "已上線文章都在 llms.txt 與 llms-full.txt，標題一致"; else bad "llms 文章段缺漏或標題過時（見上方清單）：跑 node scripts/build-llms.mjs，不要手補"; fi
if node scripts/build-llms.mjs --check; then ok "llms 文章段已是最新"; else bad "llms 文章段與 article.json 不一致：跑 node scripts/build-llms.mjs"; fi
grep -q "knowledge-architecture" llms.txt && ok "llms.txt 有知識架構" || bad "llms.txt 缺知識架構"

echo "═══ 5/12 主導覽一致性（2026-10-19 恢復，改單語）═══"
# 2026-09-22 撤英文版後本關整關停用，之後沒有任何機制檢查 216 頁手寫導覽；2026-10-19 盤查發現 2 頁 10 月新文章用舊標籤。
# check-bilingual-nav.mjs 改寫成單語版：比對連結目標與文字，不比空白與 active，沒有 --write。
# 只擋本次變更的頁（舊頁不一致只提醒），比照 check-title-formula，避免與本次無關的舊頁卡住每次發布。
if node scripts/check-bilingual-nav.mjs --changed; then ok "主導覽（本次變更的頁與主導覽六項一致）"; else bad "主導覽不一致（見上方「應為」清單，手動改，不要自動覆寫）"; fi
# WebMCP 工具層（2026-10-19 接線）：check-webmcp.mjs 早就有，但沒接進 preflight，首頁改成動態載入後一直 FAIL 沒人看到。
# 檢查器已改成認得動態掛載；工具是 AI 讀站的入口，與主導覽同屬「入口一致性」，刻意不另編號。
_wm="$(mktemp "${TMPDIR:-/tmp}/preflight-webmcp.XXXXXX")"
if node scripts/check-webmcp.mjs > "$_wm" 2>&1; then ok "WebMCP 工具層（唯讀邊界、掛載、實跑）"; else grep -E "❌|FAIL" "$_wm"; bad "WebMCP 檢查未過（完整輸出：node scripts/check-webmcp.mjs）"; fi
rm -f "$_wm"

echo "═══ 6/12 內部連結掃描 ═══"
python3 scripts/check-links.py && ok "內部連結" || bad "有內部斷鏈（見上）"

echo "═══ 7/12 文章版面樣式完整 ═══"
# 2026-08-24 立，事故驅動（同一個雷第二次）：文章 CSS 完全內嵌，模板過去缺 .tablewrap／.toc／.readmore，
# 新文章用到表格就得自己手抄 CSS，抄漏＝整塊退回瀏覽器預設。8/23、8/24 連兩篇上線後才被江江看到。
# 模板已補齊，這一關是保底。
if node scripts/check-article-css.mjs; then ok "文章版面樣式"; else bad "有文章用到版面 class 卻沒有對應 CSS（見上）"; fi
# 咪卡 widget 全站覆蓋（2026-08-30 立，事故驅動）：8/10 上線是一次性回填，模板漏行，
# 之後新文章全漏（累 13 篇）、en/ 的排除只寫在 commit 訊息裡沒人看得到。
# 模板已補行、全站已補齊，這一關是保底；刻意不掛的頁寫進 check-mika-widget.mjs 的 EXEMPT 附原因。
# 與上一關同屬「模板保底」，刻意不另編號（同索引覆蓋率關的慣例）。
if node scripts/check-mika-widget.mjs; then ok "咪卡 widget 覆蓋"; else bad "有頁面缺咪卡 widget 掛載（見上）"; fi
# 圖片拖曳護欄（2026-08-31 立，事故驅動：同一個雷炸兩次）：8/07 加的全站圖片互動預設把 hero
# 與內文圖全吃進去，讀者能把封面拖走、拉四角縮放。8/19 江江抓到一次、改好了，但 commit 停在分支
# 沒 merge 沒部署，且留著 img.interactive-image 開關，8/30 課程頁 hero 誤用，8/31 又被抓到。
# 現在 selector 改成明確 opt-in（只認 data-interactive-image），這一關擋「有人再把它放寬回去」。
if node scripts/check-image-drag.mjs; then ok "圖片拖曳護欄"; else bad "圖片互動 selector 被放寬或原生拖曳護欄被拿掉（見上）"; fi

echo "═══ 8/12 秘密掃描（未提交變更檔）═══"
if [[ ! -f "$SAFE_DEPLOY_TOOL" ]]; then
  bad "找不到共用秘密掃描入口"
elif bash "$SAFE_DEPLOY_TOOL" --scan-only "$PWD"; then
  ok "共用掃描全綠"
else
  bad "共用秘密掃描未通過"
fi

echo "═══ 9/12 內容 lint（本次變更檔）═══"
DASH=$(git diff HEAD --unified=0 -- '*.html' 2>/dev/null | grep '^+' | grep -c '——\|——' || true)
[ "${DASH:-0}" -eq 0 ] && ok "無新增破折號" || echo "  ⚠️  本次新增內容含破折號 $DASH 處（提醒，不擋）"

echo "═══ 10/12 排隊一致性（擋板與索引不可矛盾）═══"
# 2026-07-29 立，事故驅動：free-deploy-three-boundaries 的四索引接線隨 commit 61b058d 上線，
# 但 .vercelignore 擋板同時也在，Vercel 沒傳該資料夾 → 線上索引宣告存在、實際 404。
# 前七關全綠、safe-deploy 五站驗收也全綠，因為檢查都在本機跑（資料夾本機存在），
# 五站只打首頁/offers/cases/skills/site-index.json，不打新文章路徑。屬「零件各自沒錯、零件間矛盾沒人查」。
QBAD=0
BLOCKED=$(grep -E '^articles/[^/]+/$' .vercelignore 2>/dev/null | sed 's#^articles/##; s#/$##')
# 掃描範圍改為自動偵測（2026-08-12 改，事故驅動）：
# 原本寫死 articles-data.js／sitemap.xml／llms.txt／site-index.json 四個。
# article-keywords.js 是 2026-08-11 才長出來的生成檔，沒人回頭把它加進這個清單，
# 於是被擋文章的內文關鍵詞（含真實人名與私人細節）進了公開索引並上線（2026-08-12 事故，
# 修補見 commit c046bef：build-article-keywords.mjs 加 .vercelignore 過濾）。
# 根因是寫死清單的設計本身會週期性失效：每新增一個公開資料檔就多一個洞，且無機制提醒補。
# 改為自動列舉「進了版控、會被部署的資料檔」，日後新增自動涵蓋，不再依賴有人記得回來加。
# 排除 scripts/ 與 _templates/（.vercelignore 擋著不上線）、articles/（文章自己的內容不算矛盾）。
# 2026-09-06 補：ai-trends/<id>/article.json 是該篇自己的資料源，內容本來就含自己的 id，不算矛盾（articles/ 同理，原本就排除）。
PUBLIC_DATA=$(git ls-files -- '*.js' '*.json' '*.txt' '*.xml' 2>/dev/null \
  | grep -vE '^(scripts|_templates|node_modules)/' | grep -vE '^articles/' | grep -vE '^ai-trends/[^/]+/article\.json$')
if [ -z "$PUBLIC_DATA" ]; then
  # 前提不成立時硬報錯，不靜默跳過（跳過等於整關失效）
  bad "排隊一致性：無法列舉公開資料檔（git ls-files 無輸出），本關不能靜默跳過"; QBAD=1
fi
PUBDATA_N=$(printf '%s\n' "$PUBLIC_DATA" | grep -c . || true)
for id in $BLOCKED; do
  while read -r idx; do
    [ -n "$idx" ] && [ -f "$idx" ] || continue
    if grep -q "$id" "$idx" 2>/dev/null; then
      bad "排隊矛盾：$id 被 .vercelignore 擋著，卻出現在 $idx（上線後 404，或代號外洩到公開檔）"; QBAD=1
    fi
  done <<< "$PUBLIC_DATA"
done
DECLARED=$(grep -oE 'url: "articles/[^"]+/"' articles-data.js 2>/dev/null | sed 's#url: "articles/##; s#/"##')
for id in $DECLARED; do
  [ -d "articles/$id" ] || { bad "articles-data 宣告 $id 但資料夾不存在"; QBAD=1; }
  if grep -qE "^articles/$id/\$" .vercelignore 2>/dev/null; then
    bad "articles-data 宣告 $id 但被 .vercelignore 擋著"; QBAD=1
  fi
done
for d in articles/*/; do
  [ -f "$d/index.html" ] || continue
  id=$(basename "$d")
  grep -qE "^articles/$id/\$" .vercelignore 2>/dev/null && continue
  if grep -q '<meta name="robots" content="noindex' "$d/index.html" 2>/dev/null; then
    bad "已上線文章 $id 仍掛 noindex（會上線但永不被收錄）"; QBAD=1
  fi
done
[ $QBAD -eq 0 ] && ok "擋板與 ${PUBDATA_N} 個公開資料檔無矛盾（清單自動偵測，非寫死）"

echo "═══ 11/12 離線測試（tests/）═══"
# 2026-10-19 立：tests/ 五支從沒接進 preflight。能離線跑的照跑；要 redis 或 wrangler 的由 test-all.sh 依環境變數與 PATH 跳過並印原因。
if bash scripts/test-all.sh; then ok "離線測試（略過的項目見上方原因）"; else bad "tests/ 有測試失敗（見上方，完整輸出路徑已印出）"; fi

echo ""
if [ $FAIL -eq 0 ]; then echo "🟢 PREFLIGHT PASS"; else echo "🔴 PREFLIGHT FAIL：修完再跑"; fi
exit $FAIL
