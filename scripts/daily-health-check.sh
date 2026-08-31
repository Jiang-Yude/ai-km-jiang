#!/bin/bash
# 每日巡檢：全站互連、索引涵蓋、線上抽測、對外講法漂移、未上線分支（並行施工機制第三件套，2026-08-19 立）
# 2026-08-26 加第 5 項：對外講法漂移健檢（多站），設定在 scripts/messaging-sites/
# 設計：發布當下只跑 scoped preflight（管「我這篇沒壞」）；本腳本每日排程跑一次
#      （管「全站整體沒壞」），發現問題回報開卡，不自動修、不擋任何人的發布。
# 用法：bash scripts/daily-health-check.sh
#   排程（Codex）跑完把輸出貼回官網看板開卡。
#   exit 0＝全綠、1＝有紅項、2＝沒有發現問題但有檢查沒跑完（第 5 項連不上 GitHub API、第 6 項不在 repo 裡）。
#   2026-08-26 加 exit 2（Codex 跨家審指出：原本 API 失敗也印「全綠」＝假全綠）。
# 咪卡真實失敗問句（mika-failed-queries.mjs）需要 token，屬每週人工判斷流程，不在本腳本。
set -uo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"
BASE_URL="${SITE_BASE_URL:-https://jiangyude.com}"
FAIL=0
INCOMPLETE=0   # 有檢查沒跑完（不是紅項，但也不能說全綠）

echo "═══ 官網每日巡檢 $(TZ=Asia/Taipei date +"%Y-%m-%d %H:%M") ═══"

echo ""
echo "▶ 1/6 文章互聯完整性（verify-interlink）…"
if node scripts/verify-interlink.js; then
  echo "  ✅ PASS"
else
  echo "  ❌ FAIL：有文章缺互聯腳本或索引對不上"
  FAIL=1
fi

echo ""
echo "▶ 2/6 索引涵蓋（check-index-coverage）…"
if node scripts/check-index-coverage.mjs; then
  echo "  ✅ PASS"
else
  echo "  ❌ FAIL：有頁面沒被索引涵蓋（咪卡檢索會漏）"
  FAIL=1
fi

echo ""
echo "▶ 3/6 線上抽測：site-index 隨機 10 筆 URL 打正式站…"
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
echo "▶ 4/6 本地索引與遠端一致性：線上 site-index.json 可取得…"
_code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 "${BASE_URL}/site-index.json")
if [[ "$_code" == "200" ]]; then
  echo "  ✅ 200 site-index.json"
else
  echo "  ❌ ${_code} site-index.json（咪卡檢索的資料源打不開）"
  FAIL=1
fi

echo ""
echo "▶ 5/6 對外講法漂移健檢（多站）…"
# 檢查網站的對外自我介紹有沒有跟真相脫節：禁用詞、版本標記齊全、跟上游 repo 對版。
# 站台清單與每站設定在 scripts/messaging-sites/，加一個客戶站只要加一行，不用改程式。
python3 scripts/messaging-check.py
_mc=$?
if [[ "$_mc" -eq 0 ]]; then
  echo "  ✅ PASS"
elif [[ "$_mc" -eq 2 ]]; then
  echo "  ⚠️  沒跑完：連不上 GitHub API 或必要資料缺，這次沒驗到上游版本。不算紅項，但也不算綠"
  INCOMPLETE=1
else
  echo "  ❌ FAIL：對外講法跟真相漂移了（上面有檔名與行號），交人判斷要改哪一份，不自動修"
  FAIL=1
fi

echo ""
echo "▶ 6/6 未上線分支盤點（修好了但沒進 main 的東西）…"
# 2026-08-31 立，事故驅動：8/19 修好「hero 圖可被讀者拖走」的 commit 停在分支沒 merge、沒部署，
# 卡片留在「施工中掛牌」區被後續掛牌蓋掉，十二天沒人碰，同一個問題被江江抓第二次。
# 「修好了」跟「上線了」中間本來沒有任何東西在看，這一項就是補那個缺口。
# 跟本腳本其他項一樣是巡檢：只回報、不自動修、不擋任何人的發布。
# 分兩層：本週新跨線才算紅項（數量小、當天可處理）；存量只報總數不紅字，
# 否則 38 條存量會讓巡檢天天紅、蓋掉其他真紅項（Codex 跨家審指出的告警疲勞）。
bash scripts/check-stale-branches.sh 7
case $? in
  0) echo "  ✅ PASS" ;;
  2) echo "  ⚠️  這一項沒跑完，這次不算全綠"; INCOMPLETE=1 ;;
  *) echo "  ❌ FAIL：有分支本週剛滿七天還沒進 main，今天要給下落（上線或刪掉）"; FAIL=1 ;;
esac

echo ""
if [[ "$FAIL" -ne 0 ]]; then
  echo "═══ ❌ 有紅項：把上面輸出貼回官網看板開卡，交人判斷，不自動修 ═══"
  exit 1
elif [[ "$INCOMPLETE" -ne 0 ]]; then
  echo "═══ ⚠️ 沒有發現問題，但有檢查沒跑完，這次不算全綠 ═══"
  exit 2
else
  echo "═══ ✅ 全綠 ═══"
  exit 0
fi
