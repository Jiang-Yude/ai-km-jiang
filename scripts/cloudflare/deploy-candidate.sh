#!/usr/bin/env bash
set -euo pipefail
task_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd -P)
task_branch=$(git -C "$task_root" branch --show-current)
[[ "$task_branch" == "migration/cloudflare-20261004" ]] || { echo "wrong migration branch"; exit 2; }
task_safe="$HOME/Library/Mobile Documents/iCloud~md~obsidian/Documents/江昱德 主知識庫/_agent/tools/safe-deploy/safe-deploy.sh"
[[ -f "$task_safe" ]] || { echo "safe-deploy missing"; exit 2; }
[[ -z "$(git -C "$task_root" status --porcelain)" ]] || { echo "commit and synchronise the source before deployment"; exit 2; }
node "$task_root/scripts/cloudflare/build.mjs" --target=candidate
task_dir=$(node -e 'const fs=require("fs"),os=require("os"),path=require("path");const p=process.env.CF_BUILD_ROOT||path.join(os.tmpdir(),"ai-km-jiang-cf-build");console.log(JSON.parse(fs.readFileSync(path.join(p,"latest.json"))).directory)')
task_result=$(mktemp "${TMPDIR:-/tmp}/cf-candidate-result.XXXXXX")
env -u SAFE_DEPLOY_CF_PROMOTE SAFE_DEPLOY_CALLER=scripts/publish.sh \
  SAFE_DEPLOY_ALLOW_NON_GIT=1 SAFE_DEPLOY_SOURCE_REPO="$task_root" \
  SAFE_DEPLOY_CF_PROD_BRANCH=main SAFE_DEPLOY_CF_CANDIDATE_BRANCH=safe-candidate \
  SAFE_DEPLOY_WRANGLER_BIN="$task_root/scripts/cloudflare/wrangler-candidate.sh" \
  bash "$task_safe" --cf ai-km-jiang-cf-20261004 "$task_dir" / /articles /courses /skills /site-index.json /llms.txt | tee "$task_result"
node "$task_root/scripts/cloudflare/verify-candidate.mjs" --deployment-output="$task_result" --directory="$task_dir"
