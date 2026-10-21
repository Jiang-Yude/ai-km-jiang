#!/bin/bash
# 建置預演（2026-10-21 立，事故驅動）：用正式部署同一支 build.mjs 對「目前 index＋工作區」完整打包一次，
# 輸出到暫存夾、跑完丟掉，不上傳。publish.sh 在 commit 前、rebase 後各跑一次；publish-queue.py 在某筆失敗後
# 拿它檢查「main 本身能不能打包」，分辨是該筆的問題還是 main 已經壞了。
# 立因：build.mjs 的檢查（凍結舊簡報雜湊、API 轉換、Pages 檔案上限、課後頁檢查器）原本只在 push 之後才跑，
# 10:04 官網改版改到凍結簡報，壞改動先進 main，之後每次部署都卡在同一處，擋到 12:24。
# 用法：bash scripts/cloudflare/rehearse-build.sh "<說明>"；exit 0 通過、非 0 打包不過。
set -uo pipefail
cd "$(dirname "$0")/../.."
LABEL="${1:-預演}"
_root=$(mktemp -d "${TMPDIR:-/tmp}/ai-km-jiang-rehearsal.XXXXXX")
echo "▶ 建置預演（${LABEL}，用 build.mjs 完整打包一次，不部署）…"
_rc=0
CF_BUILD_ROOT="$_root" \
  SAFE_DEPLOY_POSTCLASS_EVIDENCE_DIR="${SAFE_DEPLOY_POSTCLASS_EVIDENCE_DIR:-$HOME/Library/Mobile Documents/iCloud~md~obsidian/Documents/江昱德 主知識庫/_agent/tmp/2026-10-06 歷史課後頁放行}" \
  node scripts/cloudflare/build.mjs --target=production > "$_root/rehearsal.log" 2>&1 || _rc=$?
if (( _rc != 0 )); then
  grep -E 'Error|❌|⛔' "$_root/rehearsal.log" | head -8 || true
  echo "   （預演 log 末段）"; tail -12 "$_root/rehearsal.log" | sed 's/^/   /'
fi
python3 -c 'import shutil,sys; shutil.rmtree(sys.argv[1], ignore_errors=True)' "$_root"
if (( _rc != 0 )); then
  echo "⛔ 建置預演失敗（exit ${_rc}）：這版內容打包不過。"
  exit 1
fi
echo "  ✅ 建置預演通過"
