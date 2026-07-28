#!/bin/bash
# 官網發布包裝器
# 用法：
#   git add -- 明確檔案 && bash scripts/publish.sh "commit 訊息"
#   bash scripts/publish.sh "commit 訊息" -- 明確檔案 [明確資料夾...]
# 流程：preflight → 明確範圍 → 秘密掃描 → commit → pull rebase → 再掃描
#      → atomic push → safe-deploy 候選五站 HTTP 可達性 → 指定別名切換 → 正式五站 HTTP 可達性
# 2026-07-06 立；2026-07-26 依江江拍板 4B 接入共用 safe-deploy。
# 緊急修站也走這裡，不要手動 vercel。
set -eo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SAFE_DEPLOY_TOOL="${SAFE_DEPLOY_TOOL:-/Users/jiangyude2/Library/Mobile Documents/iCloud~md~obsidian/Documents/江昱德 主知識庫/_agent/tools/safe-deploy/safe-deploy.sh}"
EXPECTED_BRANCH="main"
MSG="${1:?用法：bash scripts/publish.sh \"commit 訊息\"}"
shift
PUBLISH_PATHS=()

if [[ "${1:-}" == "--" ]]; then
  shift
  PUBLISH_PATHS=("$@")
elif [[ "$#" -gt 0 ]]; then
  echo "⛔ commit 訊息後只能接 -- 與明確檔案／資料夾。"
  exit 1
fi

if [[ ! -f "$SAFE_DEPLOY_TOOL" ]]; then
  echo "⛔ 找不到共用部署工具：$SAFE_DEPLOY_TOOL"
  echo "   另一台機器請用 SAFE_DEPLOY_TOOL 指向該機的完整絕對路徑。"
  exit 1
fi

cd "$REPO_ROOT"

BRANCH=$(git symbolic-ref --quiet --short HEAD 2>/dev/null || true)
if [[ -z "$BRANCH" ]]; then
  echo "⛔ 目前是 detached HEAD；為避免 commit 留在無分支位置，先切回正式發布分支。"
  exit 2
fi
if [[ "$BRANCH" != "$EXPECTED_BRANCH" ]]; then
  echo "⛔ 官網 production 只允許從 ${EXPECTED_BRANCH} 分支發布；目前是 ${BRANCH}。"
  exit 2
fi
UPSTREAM=$(git rev-parse --abbrev-ref '@{u}' 2>/dev/null || true)
if [[ "$UPSTREAM" != "origin/$EXPECTED_BRANCH" ]]; then
  echo "⛔ ${EXPECTED_BRANCH} 的 upstream 必須是 origin/${EXPECTED_BRANCH}；目前是 ${UPSTREAM:-未設定}。"
  echo "   先確認 remote 後設定：git branch --set-upstream-to=origin/${EXPECTED_BRANCH} ${EXPECTED_BRANCH}"
  exit 2
fi

for path in "${PUBLISH_PATHS[@]}"; do
  case "$path" in
    ""|"."|/*|*..*|:*|!*|*[\*\?\[]*)
      echo "⛔ 發布路徑必須是 repo 內的明確相對檔案／資料夾，不收 .、..、絕對路徑或 pathspec：$path"
      exit 1
      ;;
  esac
done

# 確保 git 品質閘門存在後才綁定（pre-push）；不存在時不得靜默停用 hooks。
HOOKS_PATH="scripts/git-hooks"
if [[ ! -d "$HOOKS_PATH" || ! -x "$HOOKS_PATH/pre-push" ]]; then
  echo "⛔ Git 品質閘門缺失或不可執行：$HOOKS_PATH/pre-push"
  echo "   不修改 core.hooksPath、不 commit、不 push。"
  exit 2
fi
git config core.hooksPath "$HOOKS_PATH"

STAGED_BEFORE=$(git -c core.quotePath=false diff --cached --name-only)
if [[ "${#PUBLISH_PATHS[@]}" -gt 0 && -n "$STAGED_BEFORE" ]]; then
  echo "⛔ 明確路徑模式不接受既有 staged 內容；先自行處理 index 再跑。"
  exit 2
fi
if [[ "${#PUBLISH_PATHS[@]}" -eq 0 && -z "$STAGED_BEFORE" ]]; then
  echo "⛔ 沒有明確路徑，也沒有 staged 內容。"
  echo "   先 git add -- 明確檔案，或在訊息後加：-- path1 path2"
  exit 2
fi

echo "▶ Preflight…"
SAFE_DEPLOY_TOOL="$SAFE_DEPLOY_TOOL" bash scripts/preflight.sh \
  || { echo "⛔ preflight 未過，取消發佈"; exit 1; }

if [[ "${#PUBLISH_PATHS[@]}" -gt 0 ]]; then
  ALL_CHANGED=$(
    {
      git -c core.quotePath=false diff --name-only
      git -c core.quotePath=false ls-files --others --exclude-standard
    } | LC_ALL=C sort -u
  )
  SELECTED_CHANGED=$(
    {
      git -c core.quotePath=false diff --name-only -- "${PUBLISH_PATHS[@]}"
      git -c core.quotePath=false ls-files --others --exclude-standard -- "${PUBLISH_PATHS[@]}"
      git -c core.quotePath=false diff --name-only -- site-index.json
    } | LC_ALL=C sort -u
  )
  UNEXPECTED=$(comm -23 \
    <(printf '%s\n' "$ALL_CHANGED" | awk 'NF' | LC_ALL=C sort -u) \
    <(printf '%s\n' "$SELECTED_CHANGED" | awk 'NF' | LC_ALL=C sort -u))

  if [[ -n "$UNEXPECTED" ]]; then
    echo "⛔ 有未列入本次發布範圍的變更；commit 前停止："
    printf '%s\n' "$UNEXPECTED" | sed -n '1,20p'
    exit 2
  fi

  git add -A -- "${PUBLISH_PATHS[@]}"
  if ! git diff --quiet -- site-index.json; then
    git add -- site-index.json
  fi
else
  UNSTAGED=$(
    {
      git -c core.quotePath=false diff --name-only | grep -v '^site-index\.json$' || true
      git -c core.quotePath=false ls-files --others --exclude-standard
    } | awk 'NF' | LC_ALL=C sort -u
  )
  if [[ -n "$UNSTAGED" ]]; then
    echo "⛔ staged-only 模式仍有未 staged 或未追蹤內容；commit 前停止："
    printf '%s\n' "$UNSTAGED" | sed -n '1,20p'
    exit 2
  fi
  if ! git diff --quiet -- site-index.json; then
    git add -- site-index.json
  fi
fi

if ! git diff --quiet || [[ -n "$(git -c core.quotePath=false ls-files --others --exclude-standard)" ]]; then
  echo "⛔ 準備 commit 時仍有未納入的變更；停止。"
  exit 2
fi
if git diff --cached --quiet; then
  echo "沒有變更可發布"
  exit 0
fi

echo ""
echo "▶ 本次要 commit 的明確範圍："
git -c core.quotePath=false diff --cached --name-status

echo "▶ Push 前秘密掃描…"
bash "$SAFE_DEPLOY_TOOL" --scan-only "$REPO_ROOT"

echo "▶ Commit…"
git commit -m "$MSG"

echo "▶ 同步遠端（pull --rebase）…"
git pull --rebase

echo "▶ Rebase 後、push 前再掃描…"
bash "$SAFE_DEPLOY_TOOL" --scan-only "$REPO_ROOT"

TAG="publish/$(TZ=Asia/Taipei date +%Y-%m-%d-%H%M%S)"
echo "▶ Tag ${TAG} + atomic push…"
git tag "$TAG"
git push --atomic origin \
  "HEAD:refs/heads/$EXPECTED_BRANCH" \
  "refs/tags/$TAG:refs/tags/$TAG"

echo "▶ 共用安全部署：候選五站 HTTP 可達性全綠才切指定正式別名…"
SAFE_DEPLOY_CALLER="scripts/publish.sh" \
  bash "$SAFE_DEPLOY_TOOL" "$REPO_ROOT" "ai-km-jiang.vercel.app" \
    "/" \
    "/courses.html" \
    "/knowledge-architecture.html" \
    "/articles.html" \
    "/site-index.json"

echo "🟢 發布完成：${TAG}（部署失敗會保留 commit/tag，但不採用壞版；正式切換失敗會把指定別名指回舊 deployment）"
