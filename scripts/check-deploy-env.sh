#!/bin/bash
# ─── 官網部署環境檢查 ───
# 用法：bash scripts/check-deploy-env.sh
# 目的：新電腦先確認 Node / Vercel / git / 安全部署工具齊全，避免上課現場才重建環境。
set -uo pipefail

cd "$(dirname "$0")/.."
FAIL=0
WARN=0
EXPECTED_NODE_MAJOR="${EXPECTED_NODE_MAJOR:-22}"
SAFE_DEPLOY_TOOL="${SAFE_DEPLOY_TOOL:-$HOME/Library/Mobile Documents/iCloud~md~obsidian/Documents/江昱德 主知識庫/_agent/tools/safe-deploy/safe-deploy.sh}"
EXPECTED_GIT_EMAIL="${EXPECTED_GIT_EMAIL:-130630081+Jiang-Yude@users.noreply.github.com}"

ok(){ echo "  ✅ $1"; }
bad(){ echo "  ❌ $1"; FAIL=1; }
warn(){ echo "  ⚠️  $1"; WARN=1; }
need_cmd(){ command -v "$1" >/dev/null 2>&1 || bad "缺少指令：$1"; }

echo "═══ 部署環境檢查：ai-km-jiang ═══"

need_cmd git
need_cmd node
need_cmd npm
need_cmd vercel
need_cmd python3

if command -v node >/dev/null 2>&1; then
  NODE_VERSION=$(node -v 2>/dev/null || true)
  NODE_MAJOR=$(printf '%s' "$NODE_VERSION" | sed -E 's/^v([0-9]+).*/\1/')
  if [[ "$NODE_MAJOR" == "$EXPECTED_NODE_MAJOR" ]]; then
    ok "Node ${NODE_VERSION}（符合 .nvmrc / 期待 major ${EXPECTED_NODE_MAJOR}）"
  else
    bad "Node 版本為 ${NODE_VERSION:-未知}，本專案期待 major ${EXPECTED_NODE_MAJOR}；新機請先跑 nvm install && nvm use"
  fi
fi

if [[ -f .nvmrc ]]; then
  NVMRC=$(tr -d '[:space:]' < .nvmrc)
  [[ "$NVMRC" == "$EXPECTED_NODE_MAJOR" ]] && ok ".nvmrc 固定 Node $NVMRC" || warn ".nvmrc=$NVMRC，和 EXPECTED_NODE_MAJOR=$EXPECTED_NODE_MAJOR 不同"
else
  warn "缺少 .nvmrc；新機可能使用錯 Node 版本"
fi

if [[ -f package.json ]]; then
  if [[ -f package-lock.json || -f pnpm-lock.yaml || -f yarn.lock ]]; then
    ok "有 package.json 且 lockfile 存在"
  else
    bad "有 package.json 但沒有 lockfile；新機 install 可能不可重現"
  fi
else
  ok "本 repo 目前是靜態站，沒有 package.json；發布不需要 npm install / node_modules"
fi

BRANCH=$(git symbolic-ref --quiet --short HEAD 2>/dev/null || true)
[[ "$BRANCH" == "main" ]] && ok "目前分支 main" || bad "目前分支不是 main：${BRANCH:-detached HEAD}"

UPSTREAM=$(git rev-parse --abbrev-ref '@{u}' 2>/dev/null || true)
[[ "$UPSTREAM" == "origin/main" ]] && ok "upstream=origin/main" || bad "main upstream 不是 origin/main：${UPSTREAM:-未設定}"

REMOTE=$(git remote get-url origin 2>/dev/null || true)
[[ -n "$REMOTE" ]] && ok "origin remote 已設定：$REMOTE" || bad "缺少 origin remote"

GIT_EMAIL=$(git config user.email || true)
if [[ -z "$GIT_EMAIL" ]]; then
  bad "git user.email 未設定；建議：git config user.email '$EXPECTED_GIT_EMAIL'"
elif [[ "$GIT_EMAIL" == *".local" || "$GIT_EMAIL" == *"@Mac"* ]]; then
  bad "git user.email 看起來是本機 hostname：$GIT_EMAIL；Vercel/GitHub 可能拒絕，請改成 $EXPECTED_GIT_EMAIL"
else
  ok "git user.email=$GIT_EMAIL"
fi

if [[ -d scripts/git-hooks && -x scripts/git-hooks/pre-push ]]; then
  ok "Git pre-push 品質閘門存在且可執行"
else
  bad "缺少 scripts/git-hooks/pre-push 或不可執行"
fi

HOOKS_PATH=$(git config core.hooksPath || true)
if [[ "$HOOKS_PATH" == "scripts/git-hooks" ]]; then
  ok "core.hooksPath=scripts/git-hooks"
else
  warn "core.hooksPath 目前是 ${HOOKS_PATH:-未設定}；publish.sh 會自動設定，但新機可先跑：git config core.hooksPath scripts/git-hooks"
fi

if [[ -f "$SAFE_DEPLOY_TOOL" ]]; then
  ok "SAFE_DEPLOY_TOOL 可讀：$SAFE_DEPLOY_TOOL"
else
  bad "找不到 SAFE_DEPLOY_TOOL：$SAFE_DEPLOY_TOOL；新機需複製安全部署工具或 export SAFE_DEPLOY_TOOL=/path/to/safe-deploy.sh"
fi

if command -v vercel >/dev/null 2>&1; then
  VERCEL_VERSION=$(vercel --version 2>/dev/null | head -1 || true)
  ok "Vercel CLI ${VERCEL_VERSION:-可執行}"
  if vercel whoami >/dev/null 2>&1; then
    ok "Vercel CLI 已登入"
  else
    bad "Vercel CLI 尚未登入；請先 vercel login，並確認可存取 Jiang_coach/ai-km-jiang"
  fi
fi

if [[ -d .vercel && -f .vercel/project.json ]]; then
  ok ".vercel/project.json 存在（已 link 專案）"
else
  bad "缺少 .vercel/project.json；新機請在 repo 根目錄跑 vercel link，選 Jiang_coach / ai-km-jiang"
fi

echo ""
if [[ $FAIL -eq 0 ]]; then
  [[ $WARN -eq 0 ]] && echo "🟢 DEPLOY ENV PASS" || echo "🟢 DEPLOY ENV PASS（有提醒，見上方 ⚠️）"
  exit 0
else
  echo "🔴 DEPLOY ENV FAIL：修完再跑；不要只 git push，發布統一走 bash scripts/publish.sh \"訊息\" -- path..."
  exit 1
fi
