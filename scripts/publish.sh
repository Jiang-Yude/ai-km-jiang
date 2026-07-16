#!/bin/bash
# ─── 官網一鍵發佈 ───
# 用法：bash scripts/publish.sh "commit 訊息"
# 流程：preflight 全綠 → 列出要上線的檔 → commit → 打 tag → push → vercel --prod → 線上驗證
# 2026-07-06 立。緊急修站也走這裡，不要手動 vercel。
set -euo pipefail
cd "$(dirname "$0")/.."

MSG="${1:?用法：bash scripts/publish.sh \"commit 訊息\"}"

# 確保 git 品質閘門綁定（pre-push）
git config core.hooksPath scripts/git-hooks

echo "▶ Preflight…"
bash scripts/preflight.sh || { echo "⛔ preflight 未過，取消發佈"; exit 1; }

echo ""
echo "▶ 本次要上線的變更："
git status --short
N=$(git status --short | wc -l | tr -d ' ')
[ "$N" -eq 0 ] && { echo "沒有變更可發佈"; exit 0; }

TAG="publish/$(TZ=Asia/Taipei date +%Y-%m-%d-%H%M)"
echo ""
echo "▶ Commit + tag ${TAG} + push…"
git add -A
git commit -m "${MSG}

Co-Authored-By: Claude (publish.sh) <noreply@anthropic.com>"
git tag "$TAG"
git push origin HEAD --tags

echo "▶ Vercel 部署…"
vercel --prod --yes 2>&1 | grep -E "Aliased|Error" || true

echo "▶ 線上驗證…"
FAIL=0
for u in "https://ai-km-jiang.vercel.app/" \
         "https://ai-km-jiang.vercel.app/courses.html" \
         "https://ai-km-jiang.vercel.app/knowledge-architecture.html" \
         "https://ai-km-jiang.vercel.app/articles.html" \
         "https://ai-km-jiang.vercel.app/site-index.json"; do
  CODE=$(curl -s -o /dev/null -w '%{http_code}' "$u")
  [ "$CODE" = "200" ] && echo "  ✅ $CODE $u" || { echo "  ❌ $CODE $u"; FAIL=1; }
done
[ $FAIL -eq 0 ] && echo "🟢 發佈完成：${TAG}（回滾：git revert 或 Vercel 歷史部署）" || echo "🔴 線上驗證有問題，快查！"
exit $FAIL
