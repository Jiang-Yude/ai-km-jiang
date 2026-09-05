#!/bin/bash
# agent-claim-check.sh：第三道出口（圖譜工程 v2 P2，2026-09-05 江江拍板 1B 2A 3A 4B 5A 6A 7C）
# 用法：bash scripts/agent-claim-check.sh <branch> <file> [<file> ...]
#   merge-publish.sh 在 squash merge＋重建生成檔之後、交給 publish.sh 之前呼叫，
#   把本次實際要上線的檔案清單拿去跟登記簿（~/Developer/agent-state）裡這個分支的登記單比對。
# 第一版純警告不擋（Q5A，兩週後 P6 復盤再決定要不要開 --strict）。
# 登記簿工具不在這台機器上 → 印一行說明後放行（fail open），不能因為工具沒裝就擋住上線。
# 生成檔不算越界：merge-publish 自己重建的六個檔（site-index.json、article-keywords.js、en/articles-data.js、sitemap.xml、llms.txt、llms-full.txt）。
# en/ 底下其他檔是英文來源檔，不在白名單（Codex P2 審：en/* 過寬）。
set -uo pipefail

BRANCH="${1:?用法：bash scripts/agent-claim-check.sh <branch> <file>...}"
shift

KB="${HOME}/Library/Mobile Documents/iCloud~md~obsidian/Documents/江昱德 主知識庫"
TOOL="${KB}/_agent/tools/agent-coordinator/coordinator.py"
STATE="${AGENT_STATE_DIR:-${HOME}/Developer/agent-state}"

if [[ ! -f "${TOOL}" ]]; then
  echo "▸ agent-claim-check：這台沒有登記簿工具（${TOOL}），略過範圍比對。"
  exit 0
fi
if [[ ! -d "${STATE}" ]]; then
  echo "▸ agent-claim-check：這台沒有登記簿 clone（${STATE}），略過範圍比對。先 git clone Jiang-Yude/agent-state 到那裡。"
  exit 0
fi

# 濾掉生成檔
FILTERED=()
for f in "$@"; do
  case "${f}" in
    site-index.json|article-keywords.js|en/articles-data.js|sitemap.xml|llms.txt|llms-full.txt) ;;
    *) FILTERED+=("${f}") ;;
  esac
done

if [[ ${#FILTERED[@]} -eq 0 ]]; then
  echo "▸ agent-claim-check：本次只有生成檔，無需比對。"
  exit 0
fi

echo "▶ agent-claim-check：比對 ${#FILTERED[@]} 個檔案 vs 分支 ${BRANCH} 的登記單…"
if ! python3 "${TOOL}" check-files --branch "${BRANCH}" --root site "${FILTERED[@]}" >/dev/null; then
  echo "⚠️ agent-claim-check：範圍比對工具執行失敗，本次**未完成檢查**（純警告期放行；strict 期要改成擋）。"
fi
# 純警告：不論結果一律 0（警告已由 coordinator 印到 stderr）
exit 0
