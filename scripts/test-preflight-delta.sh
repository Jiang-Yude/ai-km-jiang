#!/bin/bash
# preflight 新舊問題比對測試（2026-11-11）：只測 preflight-delta-lib.sh 的行整理與比對，不跑任何真的檢查
# 用法：bash scripts/test-preflight-delta.sh
# 立因：新增一頁讓「（檢查 274 頁）」變「（檢查 275 頁）」，舊問題被當成新問題擋下部署。
set -uo pipefail
cd "$(dirname "$0")/.."
source scripts/preflight-delta-lib.sh
P=0; F=0
ok(){ P=$((P+1)); echo "  PASS  ${1}"; }
ng(){ F=$((F+1)); echo "  FAIL  ${1}"; }
# same 名稱 這次 基準：期待沒有新問題行
same(){ local n; n=$(_delta_new "${2}" "${3}"); if [[ -z "${n}" ]]; then ok "${1}"; else ng "${1}（多出：${n}）"; fi; }
# diff_ 名稱 這次 基準：期待有新問題行
diff_(){ local n; n=$(_delta_new "${2}" "${3}"); if [[ -n "${n}" ]]; then ok "${1}"; else ng "${1}（沒抓到新問題）"; fi; }

W1='    ✗ courses/2026-11-24-thu-usr-agent-workshop/index.html 缺咪卡 widget 掛載行（<script src="/mika-chat-widget.js" defer></script>）'
W2='    ✗ articles/new-page/index.html 缺咪卡 widget 掛載行（<script src="/mika-chat-widget.js" defer></script>）'
S275='共 1 頁缺掛載（檢查 275 頁）。新頁請照模板；刻意不掛請進本檔 EXEMPT 附原因。'
S274='共 1 頁缺掛載（檢查 274 頁）。新頁請照模板；刻意不掛請進本檔 EXEMPT 附原因。'
S2_275='共 2 頁缺掛載（檢查 275 頁）。新頁請照模板；刻意不掛請進本檔 EXEMPT 附原因。'

# 1 事故重現：舊問題不變，只是分母多 1 → 不算新問題
same "咪卡 widget：舊問題不變、檢查頁數 274→275" "${W1}"$'\n'"${S275}" "${W1}"$'\n'"${S274}"
# 2 真的多一頁缺掛載 → 要抓到
diff_ "咪卡 widget：新增一頁也缺掛載" "${W1}"$'\n'"${W2}"$'\n'"${S2_275}" "${W1}"$'\n'"${S274}"
# 3 只有問題數變（檢查器只印數量的情況）→ 問題數不能被正規化掉
diff_ "咪卡 widget：只有缺掛載數 1→2" '共 2 頁缺掛載（檢查 275 頁）。' '共 1 頁缺掛載（檢查 274 頁）。'
# 4 sitemap／llms：已上線篇數多 1、缺的那篇不變 → 不算新問題
same "sitemap：已上線文章 211→212、缺的不變" \
  $'  已上線文章 212 篇，其中 1 篇不在 sitemap.xml：\n    - articles/old-one/' \
  $'  已上線文章 211 篇，其中 1 篇不在 sitemap.xml：\n    - articles/old-one/'
# 5 sitemap：缺的篇數變多 → 要抓到
diff_ "sitemap：其中不在的篇數 1→2" \
  $'  已上線文章 212 篇，其中 2 篇不在 sitemap.xml：\n    - articles/old-one/\n    - articles/new-one/' \
  $'  已上線文章 211 篇，其中 1 篇不在 sitemap.xml：\n    - articles/old-one/'
# 6 版面樣式：掃描篇數變、缺的不變 → 不算新問題
same "文章版面樣式：掃 211→212 篇" \
  $'  ❌ articles/old/index.html\n     缺樣式：duo\n  掃 212 篇，有缺的見上。' \
  $'  ❌ articles/old/index.html\n     缺樣式：duo\n  掃 211 篇，有缺的見上。'
# 7 互聯腳本：頁數與齊全數都多 1、ERROR 不變 → 不算新問題
same "互聯腳本：掃描與齊全篇數 +1、ERROR 不變" \
  $'掃描文章頁：212 篇\n兩支腳本齊全：211 篇\nERROR：1 筆\n  ERROR old-page 缺 related-render.js' \
  $'掃描文章頁：211 篇\n兩支腳本齊全：210 篇\nERROR：1 筆\n  ERROR old-page 缺 related-render.js'
# 8 互聯腳本：ERROR 筆數變多 → 要抓到
diff_ "互聯腳本：ERROR 1→2 筆" $'掃描文章頁：212 篇\nERROR：2 筆' $'掃描文章頁：211 篇\nERROR：1 筆'
# 9 雙向連結：文章數 +1、單向 WARN 數變（本來就忽略）→ 不算新問題
same "雙向連結：文章數 +1、單向 WARN 變多" \
  $'文章數：213\n斷連 ERROR：1　單向 WARN：147\n  broken: a -> b' \
  $'文章數：212\n斷連 ERROR：1　單向 WARN：146\n  broken: a -> b'
# 10 明細行裡的數字（日期）照比 → 明細不同要抓到
diff_ "明細行裡的數字照比（日期不同的頁）" \
  '    ✗ courses/2026-11-25-x/index.html 缺咪卡 widget 掛載行' \
  '    ✗ courses/2026-11-24-x/index.html 缺咪卡 widget 掛載行'

# 11 路徑剛好含摘要字串（Codex 跨家審實測的漏擋）→ 明細不同要抓到
diff_ "明細路徑含「已上線文章 N 篇」也照比" \
  '    ✗ articles/已上線文章 275 篇/index.html 缺咪卡 widget 掛載行' \
  '    ✗ articles/已上線文章 274 篇/index.html 缺咪卡 widget 掛載行'
diff_ "明細路徑含「檢查 N 頁」也照比" \
  '    ✗ notes/（檢查 275 頁）/index.html 缺咪卡 widget 掛載行' \
  '    ✗ notes/（檢查 274 頁）/index.html 缺咪卡 widget 掛載行'
# 12 互聯：手寫精選例外數變動、ERROR 不變 → 不算新問題
same "互聯腳本：手寫精選例外 1→2 篇" \
  $'手寫精選例外：2 篇\nERROR：1 筆\n  ERROR old-page 缺 related-render.js' \
  $'手寫精選例外：1 篇\nERROR：1 筆\n  ERROR old-page 缺 related-render.js'
# 13 llms 實際格式：分母變、缺的不變 → 不算新問題
same "llms.txt：已上線文章 211→212、缺的不變" \
  $'  已上線文章 212 篇，其中 1 篇不在 llms.txt：\n    - https://jiangyude.com/articles/old/' \
  $'  已上線文章 211 篇，其中 1 篇不在 llms.txt：\n    - https://jiangyude.com/articles/old/'

# ─── 整合測試：用假 git 倉庫實跑 delta()（基準桌、結束碼、各種判斷）───
# 假倉庫開在系統暫存區，不刪（本庫禁 rm -r），由系統定期清
# 先清掉會把 git 導到別的倉庫的環境變數（Codex 跨家審第四輪：繼承 GIT_DIR 可讓下面的檢查通過、實際卻改到別的倉庫）
unset GIT_DIR GIT_WORK_TREE GIT_INDEX_FILE GIT_OBJECT_DIRECTORY GIT_ALTERNATE_OBJECT_DIRECTORIES GIT_COMMON_DIR GIT_NAMESPACE GIT_CEILING_DIRECTORIES GIT_DISCOVERY_ACROSS_FILESYSTEM
# 安全閘（Codex 跨家審第二輪）：暫存資料夾或假倉庫建不起來就整支停下，絕不讓 git 指令落到真實倉庫
R=$(mktemp -d "${TMPDIR:-/tmp}/pfdelta.XXXXXX") || { echo "  FAIL  整合：建不了暫存資料夾，停止"; exit 1; }
[[ -n "${R}" && -d "${R}" ]] || { echo "  FAIL  整合：暫存資料夾路徑無效，停止"; exit 1; }
R=$(cd "${R}" && pwd -P) || { echo "  FAIL  整合：讀不到暫存資料夾實際路徑，停止"; exit 1; }
[[ -n "${R}" && -d "${R}" && "${R}" == /* ]] || { echo "  FAIL  整合：暫存資料夾實際路徑無效，停止"; exit 1; }
git -C "${R}" init -q || { echo "  FAIL  整合：git init 失敗，停止"; exit 1; }
[[ "$(git -C "${R}" rev-parse --show-toplevel 2>/dev/null)" == "${R}" ]] || { echo "  FAIL  整合：假倉庫不是獨立倉庫，停止"; exit 1; }
git -C "${R}" config user.email t@t && git -C "${R}" config user.name t
mkdir -p "${R}/pages"
cat > "${R}/check.sh" <<'CHK'
#!/bin/bash
# 假的咪卡 widget 檢查器：pages/ 下內容含 BAD 的算缺掛載，輸出格式照 check-mika-widget.mjs
n=$(ls pages | wc -l | tr -d ' ')
c=0
for f in pages/*; do grep -q BAD "${f}" && { echo "    ✗ ${f} 缺咪卡 widget 掛載行"; c=$((c+1)); }; done
if [[ ${c} -gt 0 ]]; then echo "共 ${c} 頁缺掛載（檢查 ${n} 頁）。新頁請照模板；刻意不掛請進本檔 EXEMPT 附原因。"; exit 1; fi
echo "咪卡 widget 覆蓋：${n} 頁全數掛載"
CHK
commit(){ [[ "$(git -C "${R}" rev-parse --show-toplevel)" == "${R}" ]] || exit 1; git -C "${R}" add -A && git -C "${R}" commit -qm "${1}"; git -C "${R}" rev-parse HEAD; }
LIB="${PWD}/scripts/preflight-delta-lib.sh"
# run_delta 基準ref：在乾淨子程序裡跑一次 delta，回結束碼
run_delta(){ ( cd "${R}" && source "${LIB}" && trap _cleanup_base EXIT && PREFLIGHT_BASE="${1}" delta "測試關" bash check.sh >/dev/null 2>&1 ); }
echo ok > "${R}/pages/a"; echo ok > "${R}/pages/b"; CLEAN=$(commit clean)
echo BAD > "${R}/pages/a"; OLDBAD=$(commit old-bad)
echo ok > "${R}/pages/c"; commit add-good-page >/dev/null
run_delta "${OLDBAD}"; [[ $? -eq 0 ]] && ok "整合：舊問題＋新增一頁好頁（事故重現）→ 放行" || ng "整合：舊問題＋新增好頁被擋"
echo BAD > "${R}/pages/d"; commit add-bad-page >/dev/null
run_delta "${OLDBAD}"; [[ $? -eq 1 ]] && ok "整合：新增一頁也缺掛載 → 擋" || ng "整合：新增壞頁沒被擋"
run_delta "${CLEAN}"; [[ $? -eq 1 ]] && ok "整合：基準這關是過的 → 擋" || ng "整合：基準過、現在壞卻沒擋"
run_delta "0000000000000000000000000000000000000000"; [[ $? -eq 1 ]] && ok "整合：建不了基準桌 → 照擋" || ng "整合：建不了基準桌卻放行"
( cd "${R}" && source "${LIB}" && trap _cleanup_base EXIT && PREFLIGHT_STRICT=1 PREFLIGHT_BASE="${OLDBAD}" delta "測試關" bash check.sh >/dev/null 2>&1 ); [[ $? -eq 1 ]] && ok "整合：PREFLIGHT_STRICT=1 舊問題也擋" || ng "整合：STRICT 沒擋"
git -C "${R}" worktree prune; if git -C "${R}" worktree list | grep -q preflight-base; then ng "整合：基準桌沒清掉"; else ok "整合：基準桌都清掉了"; fi

echo "結果：PASS ${P}｜FAIL ${F}"
[[ ${F} -eq 0 ]]
