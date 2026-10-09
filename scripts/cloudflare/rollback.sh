#!/usr/bin/env bash
# One-command rollback of jiangyude.com apex to Vercel. Dry run unless: --execute --approval 退回
set -euo pipefail
task_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd -P)
exec python3 "$task_root/scripts/cloudflare/cutover.py" rollback "$@"
