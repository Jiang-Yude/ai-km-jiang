#!/bin/bash
# 促轉迴圈情境模擬（2026-09-27）：從 publish.sh 抽出促轉迴圈，用假的 git／vercel／查詢函式跑，不碰真的網域
# 用法：bash test-promote-loop.sh <publish.sh 絕對路徑>
set -uo pipefail
PUB="${1:?}"
LOOP=$(sed -n '/^ROUND=0$/,/^echo "▶ 正式站路徑驗收…"$/p' "$PUB" | sed '$d')
P=0; F=0

run_case() {  # $1 情境名；其餘由呼叫前設定的變數決定假環境
  local desc="$1" out rc
  out=$(
    set -eo pipefail
    W=$(mktemp -d)
    echo "$ALIAS_INIT" > "$W/alias"; echo 0 > "$W/unknown_left"; echo "$UNKNOWN_TIMES" > "$W/unknown_left"
    echo "$TIP_SEQ" | tr ' ' '\n' > "$W/tips"
    sleep() { :; }
    DOMAINS=(a.example b.example c.example)
    PUBLISHED_SHA=old1; OWN_URL=u-old1
    git() {
      case "$1" in
        (fetch) [[ $(wc -l < "$W/tips") -gt 1 ]] && sed -i '' 1d "$W/tips"; return 0 ;;  # 每次 fetch 讀到遠端下一個狀態
        (rev-parse) head -1 "$W/tips" ;;
        (merge-base) return 0 ;;
      esac
    }
    remote_main() { head -1 "$W/tips"; }
    wait_ready() { echo "u-$1"; }
    deploy_info() {  # 建置網址 u-<名稱>，名稱裡的數字就是建立時間
      echo "${1//[!0-9]/} production"
    }
    alias_target() {
      local n; n=$(cat "$W/unknown_left")
      if (( n > 0 )); then echo $((n - 1)) > "$W/unknown_left"; echo ""; return; fi
      cat "$W/alias"
    }
    vercel() {  # vercel alias set https://<url> <domain>
      [[ "$1" == "alias" ]] || return 1
      echo "${3#https://}" > "$W/alias"; echo "SET ${3#https://}" >> "$W/log"
      # 情境：第一次切換後 main 前進（另一台推了新 commit）
      if [[ -n "${ADVANCE_AFTER_FIRST_SET:-}" && ! -f "$W/advanced" ]]; then touch "$W/advanced"; sed -i '' 1d "$W/tips"; fi
    }
    eval "$LOOP"
    echo "FINAL_ALIAS=$(cat "$W/alias") TIP=${TIP} SETS=$(grep -c SET "$W/log" 2>/dev/null || echo 0)"
  ) 2>&1; rc=$?
  if [[ $rc -eq 0 && "$out" == *"$EXPECT"* ]]; then P=$((P+1)); echo "  PASS  ${desc}"; else F=$((F+1)); echo "  FAIL  ${desc}（rc=${rc}）"; printf '%s\n' "$out" | tail -5 | sed 's/^/        /'; fi
}

# 1 單純情境：main 就是本次，網域在舊版 → 切到本次
ALIAS_INIT=u-old0 UNKNOWN_TIMES=0 TIP_SEQ="old1" EXPECT="FINAL_ALIAS=u-old1 TIP=old1" run_case "一般發布：切到本次"
# 2 網域已指向更新的建置（別台剛促轉 new5），main 下一次讀到 new5 → 不覆寫，改切 new5
ALIAS_INIT=u-new5 UNKNOWN_TIMES=0 TIP_SEQ="old1 old1 new5" EXPECT="FINAL_ALIAS=u-new5 TIP=new5" run_case "網域已是更新版：不覆寫、收斂到最新"
# 3 查不到網域指向兩次 → 不促轉、重試，之後正常
ALIAS_INIT=u-old0 UNKNOWN_TIMES=2 TIP_SEQ="old1" EXPECT="FINAL_ALIAS=u-old1 TIP=old1" run_case "查不到網域指向：先不切、重試後完成"
# 4 切完之後 main 前進到 new7 → 再對一次，最後停在 new7
ALIAS_INIT=u-old0 UNKNOWN_TIMES=0 TIP_SEQ="old1 old1 new7" ADVANCE_AFTER_FIRST_SET=1 EXPECT="FINAL_ALIAS=u-new7 TIP=new7" run_case "切完 main 又前進：再切到最新"
unset ADVANCE_AFTER_FIRST_SET
# 5 網域指向更新的建置、main 卻一直沒前進（有人手動切了別的建置）→ 不可硬蓋，停下報錯，網域原封不動
out=$(ALIAS_INIT=u-new9 UNKNOWN_TIMES=0 TIP_SEQ="old1" EXPECT="x" run_case "內部" 2>&1)
if [[ "$out" == *"FAIL"* ]]; then P=$((P+1)); echo "  PASS  網域被手動切到更新的建置：不覆寫、停下報錯"; else F=$((F+1)); echo "  FAIL  網域被手動切到更新的建置竟然成功促轉"; fi

echo; echo "PASS=${P} FAIL=${F}"
[[ $F -eq 0 ]]
