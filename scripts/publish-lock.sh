#!/bin/bash
# 官網發布鎖（2026-09-27 立，江江要求「CC 跟 CX 都可以各自部署，沒有衝突」）
# 由 publish.sh 與 merge-publish.sh 以 source 引入，不單獨執行。
#
# 為什麼：兩支腳本都會在主 clone 上 commit、rebase、push，同一台機器同時跑兩個就會互踩工作區。
# 舊版鎖放在 git common dir、搶不到就直接退出要人工重跑，持有者被強制停掉時鎖會永久殘留。
# 新版：
#   ① 鎖放在 ~/.cache（同一台機器所有 clone、worktree 共用一把；不在 iCloud，不會跨機同步）
#   ② 搶不到就排隊，每 5 秒重試，最多等 PUBLISH_LOCK_WAIT 秒（預設 20 分鐘），每分鐘印一次前面是誰
#   ③ 持有者程序確定不在了（PID 查無，或 PID 被別的程序重用：開始時間對不上）才接手；
#      接手要先拿到 recover 小鎖、再讀一次確認還是同一個持有者，用改名一次搬走，不會搬到別人剛建的新鎖
#   ④ 釋放時核對 token，只放自己的鎖
#   ⑤ merge-publish 持鎖後呼叫 publish.sh，publish.sh 看到 PUBLISH_LOCK_HELD 與鎖內 token 相同就沿用
# 跨機（桌機、筆電同時發布）不靠這把鎖，靠 publish.sh 的「永遠促轉 main 最新」收斂。

PUBLISH_LOCK_DIR="${PUBLISH_LOCK_DIR:-${HOME}/.cache/ai-km-jiang/publish.lock}"
PUBLISH_LOCK_WAIT="${PUBLISH_LOCK_WAIT:-1200}"
PUBLISH_LOCK_TOKEN=""

# 呼叫端開著 set -e／pipefail：鎖檔不存在時 sed 會回非零，一律吞掉，只回空字串
_pl_read() { sed -n "s/^${1}=//p" "${PUBLISH_LOCK_DIR}/owner" 2>/dev/null | head -1 || true; }

# 回 0＝持有者確定不在了；資料不齊（可能剛建好還沒寫 owner）一律當成還在
_pl_owner_dead() {
  local pid lstart now
  pid=$(_pl_read pid)
  lstart=$(_pl_read lstart)
  [[ -n "${pid}" && -n "${lstart}" ]] || return 1
  now=$(ps -p "${pid}" -o lstart= 2>/dev/null || true)
  [[ -z "${now}" || "${now}" != "${lstart}" ]]
}

publish_lock_acquire() {
  local what="${1:-發布}" start=${SECONDS} last=-999 stale_token moved
  if [[ -n "${PUBLISH_LOCK_HELD:-}" && "$(_pl_read token)" == "${PUBLISH_LOCK_HELD}" ]]; then
    echo "▶ 發布鎖：沿用上層已持有的鎖"
    return 0
  fi
  mkdir -p "$(dirname "${PUBLISH_LOCK_DIR}")"
  while ! mkdir "${PUBLISH_LOCK_DIR}" 2>/dev/null; do
    # recover 小鎖本身殘留超過 2 分鐘就清掉（接手流程只要幾毫秒）
    if [[ -d "${PUBLISH_LOCK_DIR}.recover" ]] && [[ -n "$(find "${PUBLISH_LOCK_DIR}.recover" -maxdepth 0 -mmin +2 2>/dev/null)" ]]; then
      rmdir "${PUBLISH_LOCK_DIR}.recover" 2>/dev/null || true
    fi
    if _pl_owner_dead; then
      stale_token=$(_pl_read token)
      if [[ -n "${stale_token}" ]] && mkdir "${PUBLISH_LOCK_DIR}.recover" 2>/dev/null; then
        if [[ "$(_pl_read token)" == "${stale_token}" ]] && _pl_owner_dead; then
          moved="${PUBLISH_LOCK_DIR}.stale.$$"
          if mv "${PUBLISH_LOCK_DIR}" "${moved}" 2>/dev/null; then
            echo "▶ 發布鎖：前一個持有者（$(sed -n 's/^what=//p' "${moved}/owner" 2>/dev/null)）已不在，接手殘留鎖"
            rm -f "${moved}/owner"
            rmdir "${moved}" 2>/dev/null || true
          fi
        fi
        rmdir "${PUBLISH_LOCK_DIR}.recover" 2>/dev/null || true
        continue
      fi
    fi
    if (( SECONDS - start > PUBLISH_LOCK_WAIT )); then
      echo "⛔ 排隊超過 ${PUBLISH_LOCK_WAIT} 秒仍拿不到發布鎖。目前持有者："
      sed 's/^/   /' "${PUBLISH_LOCK_DIR}/owner" 2>/dev/null || echo "   （鎖內沒有持有者資料，可能是異常中斷留下的）"
      echo "   確認那個程序真的不在了，才手動清：rm -f \"${PUBLISH_LOCK_DIR}/owner\" && rmdir \"${PUBLISH_LOCK_DIR}\""
      return 1
    fi
    if (( SECONDS - last >= 60 )); then
      echo "⏳ 排隊中（已等 $(( SECONDS - start )) 秒）：前面是「$(_pl_read what)」，$(_pl_read host) 的 PID $(_pl_read pid)，$(_pl_read started) 開始"
      last=${SECONDS}
    fi
    sleep 5
  done
  PUBLISH_LOCK_TOKEN="$$-$(date +%s)-${RANDOM}"
  # 一次 printf 寫完整份 owner，直接看它的結束碼；再核對六個欄位都在、token 是自己的，才改名生效。
  # 任何一步失敗（磁碟滿、權限、寫一半）：清掉自己剛建的鎖並回報失敗，不可假裝拿到鎖（Codex 第二、三輪必改）
  local write_rc=0
  printf 'pid=%s\nlstart=%s\nhost=%s\ntoken=%s\nwhat=%s\nstarted=%s\n' \
    "$$" "$(ps -p $$ -o lstart= 2>/dev/null)" "$(hostname -s 2>/dev/null)" "${PUBLISH_LOCK_TOKEN}" \
    "${what}" "$(TZ=Asia/Taipei date '+%F %T')" > "${PUBLISH_LOCK_DIR}/owner.tmp" 2>/dev/null || write_rc=$?
  if [[ "${write_rc}" -ne 0 ]] \
     || [[ "$(grep -cE '^(pid|lstart|host|token|what|started)=' "${PUBLISH_LOCK_DIR}/owner.tmp" 2>/dev/null || true)" != "6" ]] \
     || ! mv "${PUBLISH_LOCK_DIR}/owner.tmp" "${PUBLISH_LOCK_DIR}/owner" 2>/dev/null \
     || [[ "$(_pl_read token)" != "${PUBLISH_LOCK_TOKEN}" ]]; then
    rm -f "${PUBLISH_LOCK_DIR}/owner.tmp" "${PUBLISH_LOCK_DIR}/owner"
    rmdir "${PUBLISH_LOCK_DIR}" 2>/dev/null || true
    PUBLISH_LOCK_TOKEN=""
    echo "⛔ 發布鎖：寫不進持有者資料（${PUBLISH_LOCK_DIR}），已清掉並停止。先確認磁碟空間與權限。"
    return 1
  fi
  export PUBLISH_LOCK_HELD="${PUBLISH_LOCK_TOKEN}"
  echo "▶ 發布鎖：已取得（${what}）"
}

publish_lock_release() {
  [[ -n "${PUBLISH_LOCK_TOKEN}" ]] || return 0
  if [[ "$(_pl_read token)" == "${PUBLISH_LOCK_TOKEN}" ]]; then
    rm -f "${PUBLISH_LOCK_DIR}/owner"
    rmdir "${PUBLISH_LOCK_DIR}" 2>/dev/null || true
  fi
  PUBLISH_LOCK_TOKEN=""
}
