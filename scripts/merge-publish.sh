#!/bin/bash
# 合併上線：並行施工機制的唯一上線入口（2026-08-19 立，江江拍板；Codex 跨家審三修正已內建）
# 用法：在「主 clone」（main 分支所在的那份）跑：
#   bash scripts/merge-publish.sh article/<slug> "commit 訊息"
# 流程：取鎖 → main 乾淨檢查 → pull rebase → squash merge 分支 → 重建全部生成檔
#      → 壓成單一 staged 變更交 publish.sh（preflight、秘密掃描、commit、push、等建置、路徑驗收）
#      → 用本次 commit SHA 核對線上建置 → 放鎖
# Codex 三修正：①分支禁 commit 生成檔，生成檔只在本步重建 ②merge＋重建壓單一 commit，
#              不讓 Vercel 部署到「文章已進、索引未更新」的中間態 ③驗收核對 commit SHA。
set -euo pipefail

BRANCH="${1:?用法：bash scripts/merge-publish.sh <branch> \"commit 訊息\"}"
MSG="${2:?缺 commit 訊息}"

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

# 必須在主 clone 的 main 上跑（worktree 裡 main 沒 checkout，publish.sh 也會擋）
CUR_BRANCH=$(git symbolic-ref --quiet --short HEAD || true)
if [[ "$CUR_BRANCH" != "main" ]]; then
  echo "⛔ merge-publish 只能在主 clone 的 main 分支上跑；目前是 ${CUR_BRANCH:-detached}。"
  exit 2
fi

GIT_COMMON_DIR="$(git rev-parse --git-common-dir)"
LOCK="$GIT_COMMON_DIR/merge-publish.lock"
if ! mkdir "$LOCK" 2>/dev/null; then
  echo "⛔ 另一個 merge-publish 正在進行（鎖：$LOCK）。"
  echo "   合併排隊是本機制唯一的排隊點，等它跑完（含線上驗收約 5-10 分鐘）再重跑。"
  echo "   確認沒有別的 merge-publish 在跑卻留著鎖，才手動 rmdir 該資料夾。"
  exit 1
fi
cleanup() { rmdir "$LOCK" 2>/dev/null || true; }
trap cleanup EXIT

# main 工作區必須乾淨（有別人的舊制在途工作就停，不蓋）
if [[ -n "$(git -c core.quotePath=false status --porcelain)" ]]; then
  echo "⛔ main 工作區不乾淨，先處理（可能是舊制在途工作，依防打架鐵律 1 不碰別人的東西）："
  git -c core.quotePath=false status --porcelain
  exit 1
fi

if ! git show-ref --verify --quiet "refs/heads/$BRANCH" \
   && ! git show-ref --verify --quiet "refs/remotes/origin/$BRANCH"; then
  echo "⛔ 找不到分支：$BRANCH（本地與 origin 都沒有）。"
  exit 1
fi

echo "▶ 同步 main…"
git fetch origin
git pull --rebase

echo "▶ squash merge $BRANCH …"
if ! git merge --squash "$BRANCH"; then
  echo ""
  echo "⛔ merge 有衝突。處理原則："
  echo "   - articles-data.js 兩篇同時 append（both-added）：兩筆都保留，再 git add。"
  echo "   - 生成檔（site-index.json、article-keywords.js、en/articles-data.js、sitemap.xml、"
  echo "     llms.txt、llms-full.txt）出現衝突＝該分支違規 commit 了生成檔："
  echo "     直接 git checkout --ours 收下 main 版，反正下一步會全部重建。"
  echo "   - 其他衝突逐一人工判斷；解完 git add 後重跑本指令會擋（已有 staged），"
  echo "     改為手動：解衝突 → 重建生成檔 → git add → bash scripts/publish.sh \"訊息\""
  echo "   要放棄本次合併：git reset --merge"
  exit 1
fi

echo "▶ 重建全部生成檔…"
node scripts/build-site-index.mjs
node scripts/build-article-keywords.mjs
node scripts/build-en-articles-data.mjs

git add -A
if git diff --cached --quiet; then
  echo "⛔ 合併後沒有任何變更（分支可能已經上線過）。"
  exit 1
fi

echo "▶ 交給 publish.sh（preflight、秘密掃描、commit、push、等建置、路徑驗收）…"
bash scripts/publish.sh "$MSG"

# ─── SHA 精確驗收：確認線上建置就是本次 commit，不是別人的 ───
EXPECT_SHA=$(git rev-parse HEAD)
GIT_MAIN_URL="https://ai-km-jiang-git-main-jiang-coach.vercel.app"
DEPLOY_JSON=$(vercel inspect "$GIT_MAIN_URL" --format=json 2>/dev/null || true)
if [[ -n "$DEPLOY_JSON" ]] && grep -q "$EXPECT_SHA" <<<"$DEPLOY_JSON"; then
  echo "✅ SHA 驗收通過：線上建置對應本次 commit $EXPECT_SHA"
else
  echo "⚠️ SHA 驗收無法確認（vercel inspect 沒回傳或未含 $EXPECT_SHA）。"
  echo "   不代表失敗，但要人工到 Vercel 後台核對最新 production 建置的 commit。"
  echo "   在核對完成前，本次發布只能標「已 push、驗收待確認」。"
  exit 3
fi

echo ""
echo "✅ merge-publish 完成。收尾建議："
echo "   桌子可以收：git worktree remove \"\$HOME/Developer/ai-km-jiang-worktrees/<slug>\""
echo "   分支可以刪：git branch -d $BRANCH（已合併，-d 安全）"
