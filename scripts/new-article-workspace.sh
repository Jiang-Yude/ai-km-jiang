#!/bin/bash
# 開新桌子：為一篇文章建立獨立 worktree＋專屬分支（並行施工機制，2026-08-19 立）
# 用法：bash scripts/new-article-workspace.sh <slug>
#   在主 clone 或任一 worktree 內執行皆可；桌子開在 ~/Developer/ai-km-jiang-worktrees/<slug>
# 之後這篇文章的所有施工都在那個資料夾做，跟其他 session 物理隔離。
# 寫完要上線：回主 clone 跑 bash scripts/merge-publish.sh article/<slug> "commit 訊息"
set -euo pipefail

SLUG="${1:?用法：bash scripts/new-article-workspace.sh <slug>（例：my-new-article）}"
case "$SLUG" in
  *[!a-zA-Z0-9._-]*|.*)
    echo "⛔ slug 只收英數、點、底線、連字號，且不可以點開頭：$SLUG"
    exit 1
    ;;
esac

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WT_ROOT="$HOME/Developer/ai-km-jiang-worktrees"
BRANCH="article/$SLUG"
WT_DIR="$WT_ROOT/$SLUG"

cd "$REPO_ROOT"

if [[ -e "$WT_DIR" ]]; then
  echo "⛔ 桌子已存在：$WT_DIR"
  echo "   要繼續寫就直接進去；要重開先 git worktree remove（確認沒有未提交內容）。"
  exit 1
fi

mkdir -p "$WT_ROOT"
git fetch origin main

if git show-ref --verify --quiet "refs/heads/$BRANCH"; then
  git worktree add "$WT_DIR" "$BRANCH"
else
  git worktree add -b "$BRANCH" "$WT_DIR" origin/main
fi

# .vercel/project.json 不進 git（.gitignore 擋著），所以新桌子一定缺這個檔，
# 而 check-deploy-env.sh 沒有它就直接擋下發布。開桌時順手帶過去。
# 內容只有 projectId／orgId／projectName，沒有金鑰；沒有它反而會誘發手動 vercel link，
# 那才是真正危險的一步（綁錯專案會蓋掉別的站）。2026-08-19 首次上線實測踩到後補。
if [ -f "$REPO_ROOT/.vercel/project.json" ]; then
  mkdir -p "$WT_DIR/.vercel"
  cp "$REPO_ROOT/.vercel/project.json" "$WT_DIR/.vercel/project.json"
  echo "   （已帶上 .vercel/project.json，發布環境檢查才會過）"
fi


# ─── 登記簿（圖譜工程 v2 P2，2026-09-05）：開桌即登記，讓別的 session 看得到「誰在動哪些檔」 ───
# 第一版純警告：同 slug 已有人在做、或範圍跟別人重疊，只印警告不擋。工具不在這台就略過。
# search-aliases.js 是「預期共享熱點」（hotzones.json shared_hotspots），每篇都要 append，重疊只給低階提示。
# articles-data.js 自 2026-09-06 起是生成檔（來源＝articles/<slug>/article.json，在本桌自己的資料夾裡），
# 不再列入登記範圍：誰直接改它，寫入檢查會提醒「熱區未登記」，那正是要提醒的事。
KB="${HOME}/Library/Mobile Documents/iCloud~md~obsidian/Documents/江昱德 主知識庫"
COORD="${KB}/_agent/tools/agent-coordinator/coordinator.py"
if [[ -f "${COORD}" && -d "${AGENT_STATE_DIR:-${HOME}/Developer/agent-state}" ]]; then
  echo ""
  echo "▶ 登記簿：登記這張桌子的範圍…"
  python3 "${COORD}" claim \
    --task-key "site-${SLUG}" \
    --scope "site:articles/${SLUG}/**" \
    --scope "site:search-aliases.js" \
    --scope "site:images/og/${SLUG}.jpg" \
    --scope "site:images/articles/${SLUG}-*" \
    --intent "官網工作桌 ${SLUG}（new-article-workspace 自動登記）" \
    --branch "${BRANCH}" --worktree "${WT_DIR}" >/dev/null \
    || echo "   （登記失敗，不影響開桌；請手動 claim）"
  echo "   收工時記得 release：python3 \"${COORD}\" release --claim site-${SLUG}"
else
  echo "   （這台沒有登記簿工具或 clone，略過登記）"
fi
echo ""
echo "✅ 桌子開好：$WT_DIR"
echo "   分支：${BRANCH}（基於 origin/main 最新）"
echo "   注意：分支只 commit 來源檔（文章目錄含 article.json、配圖、search-aliases.js 自己那幾條）。"
echo "   文章資料寫在 articles/${SLUG}/article.json（範本 _templates/article.example.json），"
echo "   本機要看相關文章區塊就跑 node scripts/build-articles-data.mjs（產出的 articles-data.js 可不 commit）。"
echo "   生成檔（articles-data.js、site-index.json、article-keywords.js、en 資料）merge-publish 會在上線時統一重建。"
echo "   上線：cd 回主 clone，跑 bash scripts/merge-publish.sh $BRANCH \"commit 訊息\""
