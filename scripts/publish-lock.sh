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
# 跨機（2026-11-07 加，江江：「筆電跟桌機都要能部署」「沒衝突」）：
#   本機鎖拿到後，再到 GitHub 搶 refs/deploy-lock/site。建立這個 ref 是伺服器端的原子動作，
#   兩台同時搶只有一台成功，另一台排隊。不靠 iCloud，因為同步有延遲，不能當鎖。
#   持有者當掉：同一台重跑直接接手（本機鎖已確認沒有別的程序）；別台超過 PUBLISH_REMOTE_LOCK_TTL 秒才接手。
#   問不到 GitHub 就停，不在確認不了的狀態下部署。測試或離線工具可設 PUBLISH_REMOTE_LOCK=off。

PUBLISH_LOCK_DIR="${PUBLISH_LOCK_DIR:-${HOME}/.cache/ai-km-jiang/publish.lock}"
PUBLISH_LOCK_WAIT="${PUBLISH_LOCK_WAIT:-1200}"
PUBLISH_LOCK_TOKEN=""
PUBLISH_REMOTE_LOCK_REF="refs/deploy-lock/site"
PUBLISH_REMOTE_LOCK_TTL="${PUBLISH_REMOTE_LOCK_TTL:-2700}"
PUBLISH_REMOTE_LOCK_SHA="${PUBLISH_REMOTE_LOCK_SHA:-}"

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

# 網路卡住 30 秒沒進度就算失敗，不會無限等待
_pl_git() { git -C "${REPO_ROOT:-.}" -c http.lowSpeedLimit=1 -c http.lowSpeedTime=30 "$@"; }

# 機器識別：用硬體編號的雜湊，不靠 hostname（可能改名或相同）；硬體編號不會上傳原文
_pl_machine_id() {
  if [[ -n "${PUBLISH_MACHINE_ID:-}" ]]; then printf '%s' "${PUBLISH_MACHINE_ID}"; return 0; fi
  local uuid
  uuid=$(ioreg -rd1 -c IOPlatformExpertDevice 2>/dev/null | awk -F'"' '/IOPlatformUUID/{print $4}' || true)
  [[ -n "${uuid}" ]] || return 1
  printf '%s' "${uuid}" | shasum -a 256 | cut -c1-16
}

# 回 0＝拿到；回 1＝停止（問不到 GitHub，或排隊逾時）
_pl_remote_acquire() {
  [[ "${PUBLISH_REMOTE_LOCK:-on}" != "off" ]] || return 0
  local what="$1" start=${SECONDS} last=-999 me my_id tree commit cur msg owner_host owner_id owner_epoch age expect push_err=""
  me="$(hostname -s 2>/dev/null || echo unknown)"
  # 認不出這台就停：退回 hostname 可能跟另一台同名，被誤認成同機而接手
  my_id="$(_pl_machine_id)" || my_id=""
  [[ -n "${my_id}" ]] || { echo "⛔ 跨機部署鎖：讀不到這台電腦的硬體編號，認不出是哪台，停止。"; return 1; }
  tree=$(_pl_git hash-object -w -t tree /dev/null) || { echo "⛔ 跨機部署鎖：這裡不是可用的 git 工作區，停止。"; return 1; }
  while true; do
    if (( SECONDS - start > PUBLISH_LOCK_WAIT )); then
      echo "⛔ 跨機部署鎖：超過 ${PUBLISH_LOCK_WAIT} 秒仍拿不到，沒有動任何東西，稍後重跑。${push_err:+最後的錯誤：${push_err}}"
      return 1
    fi
    if ! cur=$(_pl_git ls-remote origin "${PUBLISH_REMOTE_LOCK_REF}" 2>/dev/null); then
      echo "⛔ 跨機部署鎖：問不到 GitHub，確認不了另一台有沒有在部署，所以不部署。確認網路後重跑。"
      return 1
    fi
    cur="${cur%%[[:space:]]*}"
    expect=""
    if [[ -n "${cur}" ]]; then
      if ! _pl_git fetch -q origin "${PUBLISH_REMOTE_LOCK_REF}" 2>/dev/null; then
        echo "⛔ 跨機部署鎖：讀不到目前持有者，停止。"
        return 1
      fi
      msg=$(_pl_git log -1 --format=%B "${cur}" 2>/dev/null || true)
      owner_host=$(printf '%s\n' "${msg}" | sed -n 's/^host=//p' | head -1)
      owner_id=$(printf '%s\n' "${msg}" | sed -n 's/^id=//p' | head -1)
      owner_epoch=$(printf '%s\n' "${msg}" | sed -n 's/^epoch=//p' | head -1)
      age=$(( $(date +%s) - ${owner_epoch:-0} ))
      if [[ -n "${owner_id}" && "${owner_id}" == "${my_id}" ]]; then
        echo "▶ 跨機部署鎖：這台上次留下的鎖（本機已確認沒有別的程序），接手"
        expect="${cur}"
      elif (( age > PUBLISH_REMOTE_LOCK_TTL )); then
        echo "▶ 跨機部署鎖：${owner_host} 的鎖已超過 ${PUBLISH_REMOTE_LOCK_TTL} 秒，視為中斷，接手"
        expect="${cur}"
      else
        push_err="${owner_host} 仍在部署"
        if (( SECONDS - last >= 60 )); then
          echo "⏳ 另一台 ${owner_host} 正在部署（已持有 ${age} 秒），排隊等它結束…"
          last=${SECONDS}
        fi
        sleep "${PUBLISH_REMOTE_LOCK_POLL:-15}"
        continue
      fi
    fi
    commit=$(_pl_git -c user.name=deploy-lock -c user.email=deploy-lock@localhost commit-tree "${tree}" \
      -m "deploy lock" -m "host=${me}
id=${my_id}
epoch=$(date +%s)
what=${what}") || { echo "⛔ 跨機部署鎖：建立鎖內容失敗，停止。"; return 1; }
    if push_err=$(_pl_git push --no-verify -q --force-with-lease="${PUBLISH_REMOTE_LOCK_REF}:${expect}" origin "${commit}:${PUBLISH_REMOTE_LOCK_REF}" 2>&1); then
      export PUBLISH_REMOTE_LOCK_SHA="${commit}"
      echo "▶ 跨機部署鎖：已取得（${me}）"
      return 0
    fi
    # 被搶先、權限或網路問題：回到迴圈重讀，總期限在迴圈開頭檢查，錯誤會印出來
    sleep 2
  done
}

# 動正式站或推 main 前呼叫：確認鎖還是自己的。逾時被別台接手就停，不繼續部署。
publish_lock_verify() {
  [[ "${PUBLISH_REMOTE_LOCK:-on}" != "off" ]] || return 0
  local cur
  if ! cur=$(_pl_git ls-remote origin "${PUBLISH_REMOTE_LOCK_REF}" 2>/dev/null); then
    echo "⛔ 跨機部署鎖：問不到 GitHub，確認不了鎖還在不在，停止。"
    return 1
  fi
  cur="${cur%%[[:space:]]*}"
  if [[ -z "${PUBLISH_REMOTE_LOCK_SHA:-}" || "${cur}" != "${PUBLISH_REMOTE_LOCK_SHA}" ]]; then
    echo "⛔ 跨機部署鎖：這次部署已經不持有鎖（可能逾時被另一台接手），停止，不動正式站。"
    return 1
  fi
}

_pl_remote_release() {
  [[ -n "${PUBLISH_REMOTE_LOCK_SHA}" ]] || return 0
  _pl_git push --no-verify -q --force-with-lease="${PUBLISH_REMOTE_LOCK_REF}:${PUBLISH_REMOTE_LOCK_SHA}" origin ":${PUBLISH_REMOTE_LOCK_REF}" 2>/dev/null \
    || echo "⚠️ 跨機部署鎖沒放掉（網路問題）。這台下次會自動接手，別台 ${PUBLISH_REMOTE_LOCK_TTL} 秒後接手。"
  PUBLISH_REMOTE_LOCK_SHA=""
}

publish_lock_acquire() {
  local what="${1:-發布}" start=${SECONDS} last=-999 stale_token moved
  if [[ -n "${PUBLISH_LOCK_HELD:-}" && "$(_pl_read token)" == "${PUBLISH_LOCK_HELD}" ]]; then
    echo "▶ 發布鎖：沿用上層已持有的鎖"
    # 上層是還沒有跨機鎖的舊版腳本（只會發生在版本交接那一次）：這裡補拿，也由這裡負責放掉
    if [[ "${PUBLISH_REMOTE_LOCK:-on}" != "off" && -z "${PUBLISH_REMOTE_LOCK_SHA:-}" ]]; then
      _pl_remote_acquire "${what}" || return 1
      PL_REMOTE_OWNED=1
    fi
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
  PL_REMOTE_OWNED=1
  if ! _pl_remote_acquire "${what}"; then
    publish_lock_release
    return 1
  fi
}

publish_lock_release() {
  if [[ -n "${PL_REMOTE_OWNED:-}" ]]; then
    _pl_remote_release
    PL_REMOTE_OWNED=""
  fi
  [[ -n "${PUBLISH_LOCK_TOKEN}" ]] || return 0
  if [[ "$(_pl_read token)" == "${PUBLISH_LOCK_TOKEN}" ]]; then
    rm -f "${PUBLISH_LOCK_DIR}/owner"
    rmdir "${PUBLISH_LOCK_DIR}" 2>/dev/null || true
  fi
  PUBLISH_LOCK_TOKEN=""
}
