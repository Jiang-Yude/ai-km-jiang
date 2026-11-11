#!/bin/bash
# preflight「只擋這次改動造成的」比對用的共用函式（2026-11-11 從 preflight.sh 抽出，供 test-preflight-delta.sh 單獨測試）
# 由 scripts/preflight.sh source；本檔只定義變數與函式，不執行任何檢查。

# 問題行判斷與忽略行（原本寫在 preflight.sh，搬來這裡讓測試用同一份）
PROBLEM_RE='❌|ERROR|FAIL|✗|缺|斷|⛔|missing|not found|不在|沒有|找不到'
# 比對時忽略的行：單向連結提醒（link-graph 的 WARN，新文章一定會多）與行首的總結句。其餘每一行都比（阿港審：只比問題行會被舊問題遮住新問題）。
IGNORE_RE='WARN|單向|^[[:space:]]*(結果：|斷連 ERROR：)'

# 比對前把「掃了幾頁／幾篇」這類分母換成 N（2026-11-11 立，事故驅動）。
# 立因：2026-11-11 上線 claude-multiple-google-accounts，咪卡 widget 關的舊問題（東海 USR 課程頁漏掛載）
# 本該只警告，但摘要行「共 1 頁缺掛載（檢查 275 頁）」跟基準桌的「（檢查 274 頁）」字不同，
# 因為新增一頁文章讓分母多 1，整行被當成新問題擋下。任何新增頁面的部署都會這樣被舊問題卡住。
# 只換「掃描總數」這種分母；「缺幾頁」「ERROR 幾筆」「其中幾篇不在」這種問題數一律保留，
# 否則只印數量的檢查器數量變多會被放過（preflight.sh 檔頭的誠實邊界）。
# 新增檢查器若也印分母，在這裡補一條，並在 test-preflight-delta.sh 補一個案例。
PREFLIGHT_TOTAL_SED=(
  # 每條都錨定「整句摘要」的固定格式（行首起算），只換分母那個數字；明細行（路徑、頁名）就算含相同字串也不會被換（Codex 跨家審 2026-11-11）
  -e 's/^\([[:space:]]*共 [0-9][0-9]* 頁缺掛載\)（檢查 [0-9][0-9]* 頁）/\1（檢查 N 頁）/'           # check-mika-widget.mjs
  -e 's/^\([[:space:]]*\)已上線文章 [0-9][0-9]* 篇，其中 /\1已上線文章 N 篇，其中 /'                 # check-sitemap-coverage.mjs、check-llms-coverage.mjs
  -e 's/^\([[:space:]]*\)掃 [0-9][0-9]* 篇，有缺的見上。$/\1掃 N 篇，有缺的見上。/'                 # check-article-css.mjs
  -e 's/^\([[:space:]]*\)掃描文章頁：[0-9][0-9]* 篇$/\1掃描文章頁：N 篇/'                           # verify-interlink.js
  -e 's/^\([[:space:]]*\)兩支腳本齊全：[0-9][0-9]* 篇$/\1兩支腳本齊全：N 篇/'                       # verify-interlink.js（缺腳本會另外反映在 ERROR 筆數）
  -e 's/^\([[:space:]]*\)手寫精選例外：[0-9][0-9]* 篇$/\1手寫精選例外：N 篇/'                       # verify-interlink.js（設定數，不是問題數）
  -e 's/^\([[:space:]]*\)文章數：[0-9][0-9]*$/\1文章數：N/'                                         # link-graph.js check
)

# 把一段檢查器輸出整理成可比對的行：去掉忽略行與空行、分母換 N、排序去重
_delta_prep(){
  printf '%s\n' "$1" | grep -vE "$IGNORE_RE" | grep -v '^[[:space:]]*$' | sed "${PREFLIGHT_TOTAL_SED[@]}" | LC_ALL=C sort -u
}

# 這次輸出（$1）有、基準輸出（$2）沒有的行
_delta_new(){
  LC_ALL=C comm -23 <(_delta_prep "$1") <(_delta_prep "$2")
}

# ─── delta() 本體（2026-11-11 從 preflight.sh 搬來，讓 test-preflight-delta.sh 能做整合測試）───
BASE_WT=""
BASE_TMP=""
OLD_ISSUES=()
_cleanup_base(){ [[ -n "$BASE_WT" && "$BASE_WT" != FAIL ]] && git worktree remove --force "$BASE_WT" >/dev/null 2>&1; [[ -n "$BASE_TMP" ]] && rmdir "$BASE_TMP" 2>/dev/null; true; }
_passed(){  # $1＝結束碼 $2＝輸出；有「結果：」的檢查器另要求 結果：PASS
  [[ "$1" == 0 ]] || return 1
  if grep -q "結果：" <<<"$2"; then grep -q "結果：PASS" <<<"$2"; else return 0; fi
}
delta(){  # 用法：delta "名稱" 指令…；回 0＝過或只有舊問題，1＝本次造成或判斷不出來
  local name="$1"; shift
  local out rc base brc newp
  out=$("$@" 2>&1); rc=$?
  if _passed "$rc" "$out"; then return 0; fi
  printf '%s\n' "$out" | grep -iE "$PROBLEM_RE" | grep -vE "$IGNORE_RE" | head -15 | sed 's/^/    /'
  [[ "${PREFLIGHT_STRICT:-0}" == 1 ]] && return 1
  if [[ -z "$BASE_WT" ]]; then
    # 基準＝本次改動與 origin/main 的分叉點（阿港審：拿 HEAD 當基準，已 commit 的改動會被當成舊問題放過）。
    # 由 publish.sh 在 commit 前呼叫時分叉點就是 HEAD；在施工桌或 main 健康檢查時也都對。拿不到 origin/main 就照擋。
    local base_ref
    base_ref="${PREFLIGHT_BASE:-}"
    [[ -n "$base_ref" ]] || base_ref=$(git merge-base HEAD origin/main 2>/dev/null) || base_ref=""
    BASE_TMP="$(mktemp -d "${TMPDIR:-/tmp}/preflight-base.XXXXXX")"
    BASE_WT="$BASE_TMP/main"
    if [[ -z "$base_ref" ]] || ! git worktree add --detach -q "$BASE_WT" "$base_ref" >/dev/null 2>&1; then
      echo "    （建不了改動前的基準桌，無法分辨新舊，照擋）"; BASE_WT=FAIL
    fi
  fi
  [[ "$BASE_WT" == FAIL ]] && return 1
  base=$(cd "$BASE_WT" && "$@" 2>&1); brc=$?
  if _passed "$brc" "$base"; then echo "    （改動前的 main 這關是過的＝本次造成）"; return 1; fi
  local real_base; real_base=$(cd "$BASE_WT" && pwd -P)
  base="${base//$real_base/$PWD}"; base="${base//$BASE_WT/$PWD}"
  if [[ -z "$(_delta_prep "$out")" ]]; then
    echo "    （輸出裡沒有可比對的內容，無法分辨新舊，照擋）"; return 1
  fi
  newp=$(_delta_new "$out" "$base")
  if [[ -z "$newp" ]]; then
    echo "  ⚠️  ${name}：上面都是改動前就有的舊問題，不擋本次上線（交每日巡檢開卡）"
    OLD_ISSUES+=("$name"); return 0
  fi
  echo "    本次新出現的問題："; printf '%s\n' "$newp" | sed 's/^/      /'
  return 1
}
