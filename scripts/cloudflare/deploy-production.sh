#!/usr/bin/env bash
# Production build + Pages production deploy (branch main). Requires SAFE_DEPLOY_CF_PROMOTE=ai-km-jiang-cf-20261004 set in the same turn.
# Production deploy alone does not move jiangyude.com; DNS cutover is cutover.py.
set -euo pipefail
task_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd -P)
[[ "$(git -C "$task_root" branch --show-current)" == "main" ]] || { echo "production deploy only from main"; exit 2; }
[[ "${SAFE_DEPLOY_CF_PROMOTE:-}" == "ai-km-jiang-cf-20261004" ]] || { echo "STOP: production deploy needs SAFE_DEPLOY_CF_PROMOTE=ai-km-jiang-cf-20261004"; exit 2; }
task_safe="$HOME/Library/Mobile Documents/iCloud~md~obsidian/Documents/江昱德 主知識庫/_agent/tools/safe-deploy/safe-deploy.sh"
[[ -f "$task_safe" ]] || { echo "safe-deploy missing"; exit 2; }
[[ -z "$(git -C "$task_root" status --porcelain)" ]] || { echo "commit and synchronise the source before deployment"; exit 2; }
node "$task_root/scripts/cloudflare/build.mjs" --target=production
task_dir=$(node -e 'const fs=require("fs"),os=require("os"),path=require("path");const p=process.env.CF_BUILD_ROOT||path.join(os.tmpdir(),"ai-km-jiang-cf-build");const l=JSON.parse(fs.readFileSync(path.join(p,"latest.json")));if(l.target!=="production")process.exit(3);console.log(l.directory)')
SAFE_DEPLOY_CALLER=scripts/publish.sh \
  SAFE_DEPLOY_ALLOW_NON_GIT=1 SAFE_DEPLOY_SOURCE_REPO="$task_root" \
  SAFE_DEPLOY_CF_PROD_BRANCH=main SAFE_DEPLOY_CF_CANDIDATE_BRANCH=safe-candidate \
  SAFE_DEPLOY_WRANGLER_BIN="$task_root/scripts/cloudflare/wrangler-production.sh" \
  bash "$task_safe" --cf ai-km-jiang-cf-20261004 "$task_dir" / /articles /courses /skills /site-index.json /llms.txt
mkdir -p "$task_root/scripts/cloudflare/cutover-snapshots"
printf '{"commit":"%s","deployed_at":"%s"}\n' "$(git -C "$task_root" rev-parse HEAD)" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$task_root/scripts/cloudflare/cutover-snapshots/production-receipt.json"
echo "PRODUCTION_DEPLOYED $(git -C "$task_root" rev-parse --short HEAD); （jiangyude.com 已指向 C 網，2026-10-09 切換；本步只換 production 內容）"
