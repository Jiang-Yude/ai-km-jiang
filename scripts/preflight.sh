#!/bin/bash
# ─── 官網上線前檢查（preflight）───
# 用法：bash scripts/preflight.sh
# 全綠 exit 0；任一項 FAIL exit 1（publish.sh 會擋下不部署）
# 2026-07-06 立：把人工健檢清單機器化，錯誤在部署前擋下。
set -uo pipefail
cd "$(dirname "$0")/.."
SAFE_DEPLOY_TOOL="${SAFE_DEPLOY_TOOL:-/Users/jiangyude2/Library/Mobile Documents/iCloud~md~obsidian/Documents/江昱德 主知識庫/_agent/tools/safe-deploy/safe-deploy.sh}"
FAIL=0
ok(){ echo "  ✅ $1"; }
bad(){ echo "  ❌ $1"; FAIL=1; }

echo "═══ 0/10 部署環境檢查 ═══"
if bash scripts/check-deploy-env.sh; then ok "部署環境"; else bad "部署環境未通過"; fi

echo "═══ 1/10 站點索引重建（含受控詞彙檢查）═══"
if node scripts/build-site-index.mjs 2>&1 | tail -1 | grep -q "✅"; then ok "site-index + 詞彙"; else bad "build-site-index 未通過"; fi
if node scripts/build-en-articles-data.mjs --check; then ok "英文文章索引"; else bad "英文文章索引過期"; fi
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

echo "═══ 2/10 文章互聯腳本齊全 ═══"
if node scripts/verify-interlink.js 2>&1 | grep -q "結果：PASS"; then ok "interlink"; else bad "verify-interlink FAIL（有文章缺互聯腳本）"; fi

echo "═══ 3/10 雙向連結 ═══"
LG=$(node scripts/link-graph.js check 2>&1)
if echo "$LG" | grep -q "結果：PASS"; then
  W=$(echo "$LG" | grep -c "WARN" || true); ok "link-graph（單向提醒 $W 筆，不擋）"
else bad "link-graph 有斷連"; fi

echo "═══ 4/10 新頁面有進 sitemap 與 llms.txt ═══"
MISS=0
for f in *.html; do
  # _ 開頭＝本機工具檔（校稿器 tuner 等），跟 _trash/ 同一個慣例，不上線也不進 sitemap
  case "$f" in _*.html|google*|stats.html|search.html|agent.html|skills.html|index-parallel*.html) continue;; esac
  loc="${f}"; [ "$f" = "index.html" ] && loc="/"
  grep -q "$loc" sitemap.xml || { bad "sitemap 缺 $f"; MISS=1; }
done
[ $MISS -eq 0 ] && ok "sitemap 覆蓋"
grep -q "knowledge-architecture" llms.txt && ok "llms.txt 有知識架構" || bad "llms.txt 缺知識架構"

echo "═══ 5/10 雙語主導航 ═══"
if node scripts/check-bilingual-nav.mjs; then ok "雙語主導航"; else bad "雙語主導航不一致"; fi

echo "═══ 6/10 內部連結掃描 ═══"
python3 scripts/check-links.py && ok "內部連結" || bad "有內部斷鏈（見上）"

echo "═══ 7/10 秘密掃描（未提交變更檔）═══"
if [[ ! -f "$SAFE_DEPLOY_TOOL" ]]; then
  bad "找不到共用秘密掃描入口"
elif bash "$SAFE_DEPLOY_TOOL" --scan-only "$PWD"; then
  ok "共用掃描全綠"
else
  bad "共用秘密掃描未通過"
fi

echo "═══ 8/10 內容 lint（本次變更檔）═══"
DASH=$(git diff HEAD --unified=0 -- '*.html' 2>/dev/null | grep '^+' | grep -c '——\|——' || true)
[ "${DASH:-0}" -eq 0 ] && ok "無新增破折號" || echo "  ⚠️  本次新增內容含破折號 $DASH 處（提醒，不擋）"

echo "═══ 9/10 排隊一致性（擋板與索引不可矛盾）═══"
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
PUBLIC_DATA=$(git ls-files -- '*.js' '*.json' '*.txt' '*.xml' 2>/dev/null \
  | grep -vE '^(scripts|_templates|node_modules)/' | grep -vE '^articles/')
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

echo ""
if [ $FAIL -eq 0 ]; then echo "🟢 PREFLIGHT PASS"; else echo "🔴 PREFLIGHT FAIL：修完再跑"; fi
exit $FAIL
