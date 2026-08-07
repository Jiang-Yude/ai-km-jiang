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
for id in $BLOCKED; do
  for idx in articles-data.js sitemap.xml llms.txt site-index.json; do
    if grep -q "$id" "$idx" 2>/dev/null; then
      bad "排隊矛盾：$id 被 .vercelignore 擋著，卻出現在 $idx（上線後會是 404）"; QBAD=1
    fi
  done
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
[ $QBAD -eq 0 ] && ok "擋板與四索引無矛盾"

echo ""
if [ $FAIL -eq 0 ]; then echo "🟢 PREFLIGHT PASS"; else echo "🔴 PREFLIGHT FAIL：修完再跑"; fi
exit $FAIL
