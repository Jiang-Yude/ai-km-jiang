#!/bin/bash
# 官網發布包裝器
# 用法：
#   git add -- 明確檔案 && bash scripts/publish.sh "commit 訊息"
#   bash scripts/publish.sh "commit 訊息" -- 明確檔案 [明確資料夾...]
# 流程：preflight → 明確範圍 → 秘密掃描 → commit → pull rebase → 再掃描
#      → atomic push →（Vercel Git 整合自動建置）→ 等本次 commit 的 production READY
#      → 固定五站＋動態文章路徑驗收 → 擋板草稿 404 抽驗
# 2026-07-06 立；2026-07-26 接入共用 safe-deploy；2026-08-08 改接 Git 整合自動部署
# （江江拍板＋Codex 跨家審查，計畫見主庫 _agent/tmp/2026-08-07 官網部署改造/）。
# 部署觸發＝push 到 main，不再從本機 CLI 推快照；回退用 Vercel instant rollback。
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

echo "▶ 部署環境檢查…"
bash scripts/check-deploy-env.sh \
  || { echo "⛔ 部署環境未過，取消發佈"; exit 1; }

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
    echo "   （可能是另一個 session 施工中。依 🌐 官網看板『防打架四鐵律』第 4 條："
    echo "     同一時段單一 session 施工，先到看板『🔧 施工中掛牌』登記，等對方收工撤牌再發布。）"
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

# ─── 動態驗收路徑（2026-07-29 立，事故驅動）───
# 固定五站不含新文章路徑，所以「索引宣告存在、檔案被 .vercelignore 擋著沒上傳」的 404
# 不會被部署驗收抓到（2026-07-29 free-deploy-three-boundaries 就是這樣線上掛了 404）。
# 這裡從本次 commit 解析出真的會上線的文章路徑，動態加進驗收清單。
# 只驗「真的可能 404」的兩種，不是本次動到的所有文章
# （全站批次會動到 200+ 篇既有文章，那些不會突然 404，全驗只是拖慢部署）
EXTRA_VERIFY=()
_add_verify() {
  local _id="$1" _e
  [[ -n "$_id" ]] || return 0
  grep -qE "^${_id}/\$" .vercelignore 2>/dev/null && return 0   # 仍被擋著＝刻意排隊中，不該上線
  [[ -f "${_id}/index.html" ]] || return 0
  for _e in ${EXTRA_VERIFY[@]+"${EXTRA_VERIFY[@]}"}; do
    [[ "$_e" == "/${_id}/" ]] && return 0
  done
  EXTRA_VERIFY+=("/${_id}/")
}
# ① 本次新增的文章
while IFS= read -r _p; do
  case "$_p" in
    articles/*/index.html|en/articles/*/index.html) _add_verify "${_p%/index.html}" ;;
  esac
done < <(git show --name-only --diff-filter=A --pretty=format: HEAD 2>/dev/null | awk 'NF')
# ② 本次從 .vercelignore 解除擋板的文章（2026-07-29 那次 404 的真正樣態：檔案早就在，只是擋板沒拿掉）
while IFS= read -r _p; do
  _add_verify "${_p%/}"
done < <(git show HEAD -- .vercelignore 2>/dev/null | grep '^-articles/' | sed 's/^-//' | awk 'NF')
if [[ ${#EXTRA_VERIFY[@]} -gt 0 ]]; then
  echo "▶ 本次含新文章，驗收清單加入：${EXTRA_VERIFY[*]}"
fi

# ─── Git 整合自動部署驗收（2026-08-08 起）───
# push 已觸發 Vercel 從 GitHub 遠端建置，這裡只做驗收，不再從本機推快照。
# 驗收三件套（Codex 跨家審查要求）：
#   ① 本次 commit SHA 的 production deployment 綁上 jiangyude.com
#   ② 固定五站＋動態文章路徑 curl 200
#   ③ 抽驗一篇 .vercelignore 擋板草稿仍 404（防擋板在 git 部署下失效）
SHA=$(git rev-parse HEAD)
echo "▶ 等待 Vercel Git 自動建置本次 commit（${SHA:0:7}）綁上 jiangyude.com…"
DEADLINE=$((SECONDS + 600))
while true; do
  INSPECT=$(vercel inspect jiangyude.com 2>&1 || true)
  if grep -q "$SHA" <<<"$INSPECT" && grep -qi "READY" <<<"$INSPECT"; then
    echo "  ✅ production deployment READY，含本次 commit SHA"
    break
  fi
  if (( SECONDS > DEADLINE )); then
    echo "⛔ 等 10 分鐘沒看到本次 commit 的 production 綁上 jiangyude.com。"
    echo "   內容以 git 為準（push 已完成）；部署層請開 Vercel 後台查建置狀態，回退用 instant rollback。"
    exit 1
  fi
  sleep 10
done

echo "▶ 正式站路徑驗收…"
VERIFY_FAIL=0
for _p in "/" "/offers.html" "/cases.html" "/skills.html" "/site-index.json" ${EXTRA_VERIFY[@]+"${EXTRA_VERIFY[@]}"}; do
  _code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 "https://jiangyude.com${_p}")
  if [[ "$_code" == "200" ]]; then
    echo "  ✅ ${_p} 200"
  else
    echo "  ❌ ${_p} ${_code}"
    VERIFY_FAIL=1
  fi
done

DRAFT_PATH=$(grep -E '^articles/.+/$' .vercelignore 2>/dev/null | head -1)
if [[ -n "$DRAFT_PATH" ]]; then
  _code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 "https://jiangyude.com/${DRAFT_PATH}")
  if [[ "$_code" == "404" ]]; then
    echo "  ✅ 擋板草稿仍 404（/${DRAFT_PATH}）"
  else
    echo "  ❌ 擋板草稿回 ${_code}，疑似擋板失效：/${DRAFT_PATH}"
    VERIFY_FAIL=1
  fi
fi

if [[ $VERIFY_FAIL -ne 0 ]]; then
  echo "⛔ 正式站驗收未全綠。回退：Vercel 後台 instant rollback 切回前一個 deployment，或 git revert 後再 push。"
  exit 1
fi

echo "🟢 發布完成：${TAG}（部署由 GitHub push 自動觸發；回退用 Vercel instant rollback 或 git revert 再 push）"
