#!/bin/bash
# ─── 官網上線前檢查（preflight）───
# 用法：bash scripts/preflight.sh
# 全綠 exit 0；任一項 FAIL exit 1（publish.sh 會擋下不部署）
# 2026-07-06 立：把人工健檢清單機器化，錯誤在部署前擋下。
set -uo pipefail
cd "$(dirname "$0")/.."
FAIL=0
ok(){ echo "  ✅ $1"; }
bad(){ echo "  ❌ $1"; FAIL=1; }

echo "═══ 1/7 站點索引重建（含受控詞彙檢查）═══"
if node scripts/build-site-index.mjs 2>&1 | tail -1 | grep -q "✅"; then ok "site-index + 詞彙"; else bad "build-site-index 未通過"; fi

echo "═══ 2/7 文章互聯腳本齊全 ═══"
if node scripts/verify-interlink.js 2>&1 | grep -q "結果：PASS"; then ok "interlink"; else bad "verify-interlink FAIL（有文章缺互聯腳本）"; fi

echo "═══ 3/7 雙向連結 ═══"
LG=$(node scripts/link-graph.js check 2>&1)
if echo "$LG" | grep -q "結果：PASS"; then
  W=$(echo "$LG" | grep -c "WARN" || true); ok "link-graph（單向提醒 $W 筆，不擋）"
else bad "link-graph 有斷連"; fi

echo "═══ 4/7 新頁面有進 sitemap 與 llms.txt ═══"
MISS=0
for f in *.html; do
  case "$f" in google*|stats.html|search.html|agent.html) continue;; esac
  loc="${f}"; [ "$f" = "index.html" ] && loc="/"
  grep -q "$loc" sitemap.xml || { bad "sitemap 缺 $f"; MISS=1; }
done
[ $MISS -eq 0 ] && ok "sitemap 覆蓋"
grep -q "knowledge-architecture" llms.txt && ok "llms.txt 有知識架構" || bad "llms.txt 缺知識架構"

echo "═══ 5/7 內部連結掃描 ═══"
python3 scripts/check-links.py && ok "內部連結" || bad "有內部斷鏈（見上）"

echo "═══ 6/7 秘密掃描（未提交變更檔）═══"
HITS=$(git status --short | awk '{print $2}' | while read -r f; do
  [ -f "$f" ] && grep -lEi "sk-[a-zA-Z0-9]{20}|AKIA[0-9A-Z]{16}|api[_-]?key\s*[:=]\s*['\"][A-Za-z0-9]{16,}" "$f" 2>/dev/null; done | head -3)
[ -z "$HITS" ] && ok "無疑似金鑰" || bad "疑似金鑰：$HITS"

echo "═══ 7/7 內容 lint（本次變更檔）═══"
DASH=$(git diff HEAD --unified=0 -- '*.html' 2>/dev/null | grep '^+' | grep -c '——\|——' || true)
[ "${DASH:-0}" -eq 0 ] && ok "無新增破折號" || echo "  ⚠️  本次新增內容含破折號 $DASH 處（提醒，不擋）"

echo ""
if [ $FAIL -eq 0 ]; then echo "🟢 PREFLIGHT PASS"; else echo "🔴 PREFLIGHT FAIL：修完再跑"; fi
exit $FAIL
