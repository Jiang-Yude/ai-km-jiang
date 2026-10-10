#!/bin/bash
# 發布鎖模擬測試（2026-09-27）：全程用暫存資料夾當鎖，不碰真的發布
# 用法：bash test-publish-lock.sh <publish-lock.sh 絕對路徑>
set -uo pipefail
LIB="${1:?給 publish-lock.sh 絕對路徑}"
W=$(mktemp -d "${TMPDIR:-/tmp}/publock.XXXXXX")
export PUBLISH_LOCK_DIR="${W}/publish.lock"
P=0; F=0
ok(){ P=$((P+1)); echo "  PASS  $1"; }
ng(){ F=$((F+1)); echo "  FAIL  $1"; }

# 在 set -euo pipefail 的子程序裡持鎖 N 秒
holder() { bash -c 'set -euo pipefail; source "$0"; publish_lock_acquire "holder-$1"; trap publish_lock_release EXIT; sleep "$2"' "$LIB" "$1" "$2"; }

# 1 兩邊同時搶：第二個要排隊，等第一個放掉才拿到
holder A 6 > "${W}/a.log" 2>&1 &
sleep 1
s=${SECONDS}; out=$(PUBLISH_LOCK_WAIT=30 bash -c 'set -euo pipefail; source "$0"; publish_lock_acquire B; publish_lock_release' "$LIB" 2>&1); rc=$?
waited=$(( SECONDS - s )); wait
if [[ $rc -eq 0 && $waited -ge 3 && "$out" == *"已取得（B）"* ]]; then ok "同時搶：後到的排隊 ${waited} 秒後拿到"; else ng "同時搶（rc=${rc}，等 ${waited} 秒）：${out}"; fi
[[ ! -d "$PUBLISH_LOCK_DIR" ]] && ok "兩邊都放掉後鎖已清空" || ng "鎖沒清乾淨"

# 2 持有者已死（PID 查無）：要接手
mkdir -p "$PUBLISH_LOCK_DIR"; printf 'pid=999999\nlstart=Mon Jan  1 00:00:00 2024\nhost=x\ntoken=dead-1\nwhat=已死的發布\nstarted=2024\n' > "${PUBLISH_LOCK_DIR}/owner"
out=$(PUBLISH_LOCK_WAIT=10 bash -c 'set -euo pipefail; source "$0"; publish_lock_acquire C; publish_lock_release' "$LIB" 2>&1); rc=$?
[[ $rc -eq 0 && "$out" == *"已不在，接手殘留鎖"* ]] && ok "持有者已死：接手殘留鎖" || ng "持有者已死（rc=${rc}）：${out}"

# 3 PID 被重用（PID 活著但開始時間對不上）：要接手
sleep 30 & LIVE=$!
mkdir -p "$PUBLISH_LOCK_DIR"; printf 'pid=%s\nlstart=Mon Jan  1 00:00:00 2024\nhost=x\ntoken=reuse-1\nwhat=PID被重用\nstarted=2024\n' "$LIVE" > "${PUBLISH_LOCK_DIR}/owner"
out=$(PUBLISH_LOCK_WAIT=10 bash -c 'set -euo pipefail; source "$0"; publish_lock_acquire D; publish_lock_release' "$LIB" 2>&1); rc=$?
[[ $rc -eq 0 && "$out" == *"接手殘留鎖"* ]] && ok "PID 被重用：接手殘留鎖" || ng "PID 被重用（rc=${rc}）：${out}"

# 4 持有者還活著（PID 與開始時間都對）：不可接手，排隊到逾時
mkdir -p "$PUBLISH_LOCK_DIR"; printf 'pid=%s\nlstart=%s\nhost=x\ntoken=live-1\nwhat=活著的發布\nstarted=now\n' "$LIVE" "$(ps -p "$LIVE" -o lstart=)" > "${PUBLISH_LOCK_DIR}/owner"
out=$(PUBLISH_LOCK_WAIT=6 bash -c 'set -euo pipefail; source "$0"; publish_lock_acquire E' "$LIB" 2>&1); rc=$?
if [[ $rc -ne 0 && "$out" == *"排隊超過"* && "$(sed -n 's/^token=//p' "${PUBLISH_LOCK_DIR}/owner")" == "live-1" ]]; then ok "持有者活著：不接手，逾時退出，鎖原封不動"; else ng "持有者活著（rc=${rc}）：${out}"; fi
kill "$LIVE" 2>/dev/null; wait "$LIVE" 2>/dev/null
rm -f "${PUBLISH_LOCK_DIR}/owner"; rmdir "$PUBLISH_LOCK_DIR"

# 5 鎖資料夾剛建、還沒寫 owner：當成還在，不可接手
mkdir -p "$PUBLISH_LOCK_DIR"
out=$(PUBLISH_LOCK_WAIT=6 bash -c 'set -euo pipefail; source "$0"; publish_lock_acquire G' "$LIB" 2>&1); rc=$?
[[ $rc -ne 0 && -d "$PUBLISH_LOCK_DIR" ]] && ok "沒有 owner 的鎖：當成還在，不接手" || ng "沒有 owner 的鎖（rc=${rc}）：${out}"
rmdir "$PUBLISH_LOCK_DIR"

# 6 上層持鎖、子程序沿用；子程序結束不可放掉上層的鎖
out=$(bash -c 'set -euo pipefail; source "$0"; publish_lock_acquire parent; trap publish_lock_release EXIT
  child=$(bash -c "set -euo pipefail; source \"$0\"; publish_lock_acquire child; trap publish_lock_release EXIT" "$0" 2>&1)
  echo "$child"; [[ -d "$PUBLISH_LOCK_DIR" ]] && echo "PARENT_STILL_HOLDS"' "$LIB" 2>&1); rc=$?
[[ $rc -eq 0 && "$out" == *"沿用上層"* && "$out" == *"PARENT_STILL_HOLDS"* ]] && ok "子程序沿用上層的鎖、結束時不放掉上層的鎖" || ng "沿用（rc=${rc}）：${out}"
[[ ! -d "$PUBLISH_LOCK_DIR" ]] && ok "上層結束後鎖已清空" || ng "上層結束後鎖殘留"

# 7 只放自己的鎖：token 對不上不可刪
mkdir -p "$PUBLISH_LOCK_DIR"; printf 'token=someone-else\n' > "${PUBLISH_LOCK_DIR}/owner"
bash -c 'set -euo pipefail; source "$0"; PUBLISH_LOCK_TOKEN=mine; publish_lock_release' "$LIB"
[[ -f "${PUBLISH_LOCK_DIR}/owner" ]] && ok "token 對不上不刪別人的鎖" || ng "刪到別人的鎖"
rm -f "${PUBLISH_LOCK_DIR}/owner"; rmdir "$PUBLISH_LOCK_DIR"

# 8 鎖檔寫不進去（新建的鎖資料夾沒有寫入權限）：要清掉自己的鎖並回報失敗
out=$(umask 0277; PUBLISH_LOCK_WAIT=5 bash -c 'set -euo pipefail; source "$0"; publish_lock_acquire H' "$LIB" 2>&1); rc=$?
chmod 700 "$PUBLISH_LOCK_DIR" 2>/dev/null || true
[[ $rc -ne 0 && "$out" == *"寫不進持有者資料"* && ! -d "$PUBLISH_LOCK_DIR" ]] && ok "鎖檔寫不進去：清掉並回報失敗" || { ng "鎖檔寫不進去（rc=${rc}）：${out}"; rmdir "$PUBLISH_LOCK_DIR" 2>/dev/null || true; }

echo; echo "PASS=${P} FAIL=${F}"
[[ $F -eq 0 ]]
