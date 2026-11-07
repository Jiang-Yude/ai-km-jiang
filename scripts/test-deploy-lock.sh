#!/bin/bash
# 跨機部署鎖測試（2026-11-07）：全程用暫存的假 GitHub，不碰真的 repo。
# 用法：bash scripts/test-deploy-lock.sh
set -uo pipefail
LIB="$(cd "$(dirname "$0")" && pwd)/publish-lock.sh"
W=$(mktemp -d "${TMPDIR:-/tmp}/deploylock.XXXXXX")
git init -q --bare "${W}/origin.git"
git clone -q "${W}/origin.git" "${W}/a" 2>/dev/null
git clone -q "${W}/origin.git" "${W}/b" 2>/dev/null
P=0; F=0
ok(){ P=$((P+1)); echo "  PASS  $1"; }
ng(){ F=$((F+1)); echo "  FAIL  $1"; }
REF=refs/deploy-lock/site
# 參數：clone 名、假 hostname、持鎖秒數、排隊上限
holder(){ PUBLISH_MACHINE_ID="id-$2" PATH="${W}/bin-$2:${PATH}" REPO_ROOT="${W}/$1" PUBLISH_LOCK_DIR="${W}/lock-$2" PUBLISH_REMOTE_LOCK_POLL=1 PUBLISH_LOCK_WAIT="${4:-30}" \
  bash -c 'set -euo pipefail; source "$0"; publish_lock_acquire "$1" || exit 7; trap publish_lock_release EXIT; sleep "$2"' "$LIB" "$2" "$3"; }
for h in mini laptop; do mkdir -p "${W}/bin-${h}"; printf '#!/bin/sh\necho %s\n' "${h}" > "${W}/bin-${h}/hostname"; chmod +x "${W}/bin-${h}/hostname"; done

# 1 兩台同時搶：只有一台先拿到，另一台排隊，鎖最後清空
holder a mini 5 > "${W}/1a.log" 2>&1 & A=$!
holder b laptop 5 > "${W}/1b.log" 2>&1 & B=$!
s=${SECONDS}; wait ${A}; ra=$?; wait ${B}; rb=$?; t=$((SECONDS-s))
[[ ${ra} -eq 0 && ${rb} -eq 0 && ${t} -ge 9 ]] && ok "兩台同時搶：排隊依序跑完（${t} 秒）" || ng "同時搶（ra=${ra} rb=${rb} t=${t}）"
[[ -z "$(git -C "${W}/a" ls-remote origin ${REF})" ]] && ok "跑完鎖已清空" || ng "鎖沒清空"

# 2 別台持鎖、排隊逾時：不動作、回失敗
holder a mini 8 > "${W}/2a.log" 2>&1 & A=$!
sleep 2
holder b laptop 0 3 > "${W}/2b.log" 2>&1; rb=$?
wait ${A}
[[ ${rb} -eq 7 ]] && grep -q "沒有動任何東西" "${W}/2b.log" && ok "排隊逾時：停下不部署" || ng "排隊逾時（rb=${rb}）"

# 3 這台上次中斷留下的鎖：重跑直接接手
(cd "${W}/a"; T=$(git hash-object -w -t tree /dev/null); C=$(git -c user.name=x -c user.email=x@x commit-tree "${T}" -m l -m "host=mini
id=id-mini
epoch=$(date +%s)
what=x"); git push -q origin "${C}:${REF}")
holder a mini 0 > "${W}/3.log" 2>&1; r=$?
[[ ${r} -eq 0 ]] && grep -q "這台上次留下的鎖" "${W}/3.log" && ok "同機殘留鎖：接手" || ng "同機殘留鎖（r=${r}）"

# 4 別台的鎖逾期才接手；沒逾期不接手（案例 2 已驗）
(cd "${W}/a"; T=$(git hash-object -w -t tree /dev/null); C=$(git -c user.name=x -c user.email=x@x commit-tree "${T}" -m l -m "host=mini
id=id-mini
epoch=$(( $(date +%s) - 9999 ))
what=x"); git push -q origin "${C}:${REF}")
holder b laptop 0 > "${W}/4.log" 2>&1; r=$?
[[ ${r} -eq 0 ]] && grep -q "視為中斷" "${W}/4.log" && ok "別台逾期鎖：接手" || ng "別台逾期鎖（r=${r}）"

# 5 問不到 GitHub：不部署
git -C "${W}/b" remote set-url origin "${W}/not-there.git"
holder b laptop 0 > "${W}/5.log" 2>&1; r=$?
[[ ${r} -eq 7 ]] && grep -q "問不到 GitHub" "${W}/5.log" && ok "問不到 GitHub：停下不部署" || ng "問不到 GitHub（r=${r}）"
[[ ! -d "${W}/lock-laptop" ]] && ok "失敗時本機鎖也放掉" || ng "本機鎖沒放"

# 6 兩台 hostname 相同但機器不同：不可當成同機接手
git -C "${W}/b" remote set-url origin "${W}/origin.git"
(cd "${W}/a"; T=$(git hash-object -w -t tree /dev/null); C=$(git -c user.name=x -c user.email=x@x commit-tree "${T}" -m l -m "host=laptop
id=id-other
epoch=$(date +%s)
what=x"); git push -q origin "${C}:${REF}")
holder b laptop 0 2 > "${W}/6.log" 2>&1; r=$?
[[ ${r} -eq 7 ]] && ok "同名不同機：不接手" || ng "同名不同機（r=${r}）"

# 7 鎖被別台接手後，舊持有者驗證要失敗；持有時要通過
git -C "${W}/a" push -q origin ":${REF}"
out=$(PUBLISH_MACHINE_ID=id-mini REPO_ROOT="${W}/a" PUBLISH_LOCK_DIR="${W}/lock-v" bash -c 'set -euo pipefail; source "$0"; publish_lock_acquire v >/dev/null; trap publish_lock_release EXIT; publish_lock_verify && echo first-ok; T=$(git -C "$REPO_ROOT" hash-object -w -t tree /dev/null); C=$(git -C "$REPO_ROOT" -c user.name=x -c user.email=x@x commit-tree "$T" -m stolen); git -C "$REPO_ROOT" push -q -f origin "$C:refs/deploy-lock/site"; publish_lock_verify || echo second-blocked' "${LIB}" 2>&1)
[[ "${out}" == *first-ok* && "${out}" == *second-blocked* ]] && ok "鎖被接手：舊持有者停下" || ng "鎖被接手（${out}）"

# 7b 版本交接：上層舊版只有本機鎖，下層新版要補拿跨機鎖、驗得過、結束時放掉；真正的巢狀不可提早放掉
git -C "${W}/a" push -q origin ":${REF}"
out=$(PUBLISH_MACHINE_ID=id-mini REPO_ROOT="${W}/a" PUBLISH_LOCK_DIR="${W}/lock-h" bash -c 'set -euo pipefail; source "$0"; PUBLISH_REMOTE_LOCK=off publish_lock_acquire old >/dev/null; L="$0"; bash -c "set -euo pipefail; source \"\$0\"; publish_lock_acquire new >/dev/null; trap publish_lock_release EXIT; publish_lock_verify && echo verify-ok" "$L"; publish_lock_release' "${LIB}" 2>&1)
[[ "${out}" == *verify-ok* && -z "$(git -C "${W}/a" ls-remote origin ${REF})" ]] && ok "版本交接：補拿鎖並放掉" || ng "版本交接（${out}）"
out=$(PUBLISH_MACHINE_ID=id-mini REPO_ROOT="${W}/a" PUBLISH_LOCK_DIR="${W}/lock-n" bash -c 'set -euo pipefail; source "$0"; publish_lock_acquire top >/dev/null; trap publish_lock_release EXIT; L="$0"; bash -c "set -euo pipefail; source \"\$0\"; publish_lock_acquire inner >/dev/null; trap publish_lock_release EXIT" "$L"; publish_lock_verify && echo still-held' "${LIB}" 2>&1)
[[ "${out}" == *still-held* && -z "$(git -C "${W}/a" ls-remote origin ${REF})" ]] && ok "巢狀呼叫：內層不放鎖，外層結束才放" || ng "巢狀（${out}）"

# 8 遠端拒絕更新：有總期限、印錯誤、不卡死
git -C "${W}/a" push -q origin ":${REF}" 2>/dev/null
cat > "${W}/origin.git/hooks/update" <<'HOOK'
#!/bin/sh
exit 1
HOOK
chmod +x "${W}/origin.git/hooks/update"
s=${SECONDS}; holder b laptop 0 3 > "${W}/8.log" 2>&1; r=$?; t=$((SECONDS-s))
[[ ${r} -eq 7 && ${t} -le 15 ]] && grep -q "最後的錯誤" "${W}/8.log" && ok "遠端拒絕：${t} 秒後停下並印錯誤" || ng "遠端拒絕（r=${r} t=${t}）"

echo "PASS=${P} FAIL=${F}"
[[ ${F} -eq 0 ]]
