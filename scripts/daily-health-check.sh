#!/bin/bash
# 每日巡檢：全站互連、索引涵蓋、線上抽測（並行施工機制第三件套，2026-08-19 立）
# 設計：發布當下只跑 scoped preflight（管「我這篇沒壞」）；本腳本每日排程跑一次
#      （管「全站整體沒壞」），發現問題回報開卡，不自動修、不擋任何人的發布。
# 用法：bash scripts/daily-health-check.sh
#   排程（Codex）跑完把輸出貼回官網看板開卡；exit 0＝全綠、非 0＝有紅項。
# 咪卡真實失敗問句（mika-failed-queries.mjs）需要 token，屬每週人工判斷流程，不在本腳本。
set -uo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"
BASE_URL="${SITE_BASE_URL:-https://jiangyude.com}"
FAIL=0

echo "═══ 官網每日巡檢 $(TZ=Asia/Taipei date +"%Y-%m-%d %H:%M") ═══"

echo ""
echo "▶ 1/4 文章互聯完整性（verify-interlink）…"
if node scripts/verify-interlink.js; then
  echo "  ✅ PASS"
else
  echo "  ❌ FAIL：有文章缺互聯腳本或索引對不上"
  FAIL=1
fi

echo ""
echo "▶ 2/4 索引涵蓋（check-index-coverage）…"
if node scripts/check-index-coverage.mjs; then
  echo "  ✅ PASS"
else
  echo "  ❌ FAIL：有頁面沒被索引涵蓋（咪卡檢索會漏）"
  FAIL=1
fi

echo ""
echo "▶ 3/4 線上抽測：site-index 隨機 10 筆 URL 打正式站…"
SAMPLE=$(node -e '
  const idx = JSON.parse(require("fs").readFileSync("site-index.json", "utf8"));
  // 只抽站內路徑；站外資源連結（github.io、gamma.app 等）歸每週 check-links 管
  const items = (Array.isArray(idx) ? idx : idx.items || []).filter(i => i.url && !/^https?:/i.test(i.url));
  const seed = Number(new Date().toISOString().slice(0, 10).replace(/-/g, ""));
  const picked = items.filter((_, i) => (i * 2654435761 + seed) % items.length < 10).slice(0, 10);
  console.log(picked.map(i => i.url).join("\n"));
' 2>/dev/null)
if [[ -z "$SAMPLE" ]]; then
  echo "  ❌ FAIL：讀不到 site-index.json 的 url 清單"
  FAIL=1
else
  while IFS= read -r _u; do
    [[ -z "$_u" ]] && continue
    _path="/${_u#/}"
    _code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 "${BASE_URL}${_path}")
    if [[ "$_code" == "200" ]]; then
      echo "  ✅ 200 ${_path}"
    else
      echo "  ❌ ${_code} ${_path}（索引宣告存在但線上不是 200，咪卡會領人撞牆）"
      FAIL=1
    fi
  done <<<"$SAMPLE"
fi

echo ""
echo "▶ 4/4 本地索引與遠端一致性：線上 site-index.json 可取得…"
_code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 "${BASE_URL}/site-index.json")
if [[ "$_code" == "200" ]]; then
  echo "  ✅ 200 site-index.json"
else
  echo "  ❌ ${_code} site-index.json（咪卡檢索的資料源打不開）"
  FAIL=1
fi

echo ""
if [[ "$FAIL" -eq 0 ]]; then
  echo "═══ ✅ 全綠 ═══"
else
  echo "═══ ❌ 有紅項：把上面輸出貼回官網看板開卡，交人判斷，不自動修 ═══"
fi
exit "$FAIL"
