#!/usr/bin/env bash
set -euo pipefail
task_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd -P)
if [[ "${1:-}" == "pages" && "${2:-}" == "deploy" ]]; then
  task_args=("$@")
  [[ -n "${3:-}" && "${3:-}" != -* ]] || { echo "production artifact directory required"; exit 2; }
  task_args[2]=$(cd "$3" && pwd -P)
  task_project=''
  task_branch=''
  for ((task_i=3; task_i<${#task_args[@]}; task_i++)); do
    case "${task_args[$task_i]}" in
      --project-name=*) task_project=${task_args[$task_i]#*=} ;;
      --project-name) task_i=$((task_i+1)); task_project=${task_args[$task_i]:-} ;;
      --branch=*) task_branch=${task_args[$task_i]#*=} ;;
      --branch) task_i=$((task_i+1)); task_branch=${task_args[$task_i]:-} ;;
      --config|--config=*|--env|--env=*) echo "unsupported Pages config/environment override"; exit 2 ;;
    esac
  done
  [[ "$task_project" == "ai-km-jiang-cf-20261004" && ( "$task_branch" == "main" || "$task_branch" == "safe-candidate" ) ]] || { echo "production project/branch identity mismatch"; exit 2; }
  # Pages discovers wrangler.toml in cwd and rejects --config. Resolve the artifact first.
  cd "$task_root"
  exec wrangler "${task_args[@]}"
fi
exec wrangler "$@"
