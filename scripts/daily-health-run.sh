#!/bin/bash
# 每日巡檢排程入口（2026-10-21 立，企劃 v3 第 4 件）：launchd 每天清晨在「專用發布桌」跑 daily-health-check.sh。
# 為什麼在發布桌：launchd 起的程序沒有 iCloud 權限（2026-09-04 實測），發布桌在 ~/Developer，讀得到。
# 產出：~/.cache/ai-km-jiang/daily-health/latest.json（給部署台同步進官網看板自動區塊）＋當日 log；有紅項跳 macOS 本機通知。
# 不自動修、不擋任何人的發布；跟部署搶工作區時用同一把發布鎖排隊。
export PATH="$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"
set -uo pipefail
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT" || exit 1
OUT_DIR="${DAILY_HEALTH_DIR:-$HOME/.cache/ai-km-jiang/daily-health}"
mkdir -p "$OUT_DIR"
TS=$(TZ=Asia/Taipei date +"%Y-%m-%d %H:%M")
LOG="$OUT_DIR/$(TZ=Asia/Taipei date +%Y-%m-%d).log"
PUBLISH_LOCK_WAIT="${PUBLISH_LOCK_WAIT:-1800}"
# shellcheck source=publish-lock.sh
source "$REPO_ROOT/scripts/publish-lock.sh"
if ! publish_lock_acquire "daily-health-check"; then
  printf '{"at":"%s","exit":3,"summary":"等發布鎖逾時，這輪沒跑","red":[]}\n' "$TS" > "$OUT_DIR/latest.json"; exit 3
fi
trap publish_lock_release EXIT
git pull -q --ff-only >/dev/null 2>&1 || echo "⚠️  git pull 沒成功，用本機現有版本跑" >> "$LOG"
bash scripts/daily-health-check.sh > "$LOG" 2>&1; RC=$?
RED=$(grep -E '^  ❌ ' "$LOG" | sed 's/^  ❌ //' | head -12)
python3 - "$OUT_DIR/latest.json" "$TS" "$RC" "$LOG" "$RED" <<'PY'
import json, sys
out, ts, rc, log, red = sys.argv[1:6]
summary = {"0": "全綠", "1": "有紅項", "2": "沒發現問題但有檢查沒跑完"}.get(rc, f"結束碼 {rc}")
json.dump({"at": ts, "exit": int(rc), "summary": summary, "red": [r for r in red.splitlines() if r.strip()], "log": log},
          open(out, "w", encoding="utf-8"), ensure_ascii=False)
PY
if [[ $RC -eq 1 ]]; then
  osascript -e "display notification \"$(printf '%s' "$RED" | head -1 | sed 's/"/'"'"'/g' | cut -c1-100)\" with title \"官網每日巡檢有紅項\"" >/dev/null 2>&1 || true
fi
exit $RC
