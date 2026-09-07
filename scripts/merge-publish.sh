#!/bin/bash
# 合併上線：並行施工機制的唯一上線入口（2026-08-19 立，江江拍板；Codex 跨家審三修正已內建）
# 用法：在「主 clone」（main 分支所在的那份）跑：
#   bash scripts/merge-publish.sh article/<slug> "commit 訊息"
# 流程：取鎖 → main 乾淨檢查 → pull rebase → squash merge 分支 → 重建全部生成檔
#      → 壓成單一 staged 變更交 publish.sh（preflight、秘密掃描、commit、push、等建置、路徑驗收）
#      → 用本次 commit SHA 核對線上建置 → 放鎖
# 2026-09-06：articles-data.js 改為生成檔（來源＝一篇一檔 article.json）；它與其餘三個重建檔的衝突自動收 main 版再重建。
# Codex 三修正：①分支禁 commit 生成檔，生成檔只在本步重建 ②merge＋重建壓單一 commit，
#              不讓 Vercel 部署到「文章已進、索引未更新」的中間態 ③驗收核對 commit SHA。
set -euo pipefail

BRANCH="${1:?用法：bash scripts/merge-publish.sh <branch> \"commit 訊息\"}"
MSG="${2:?缺 commit 訊息}"

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

# 必須在「checkout 了 main 的地方」跑。主 clone 常被別的 session 切到 feature 分支，
# 那時就在 ~/Developer/ai-km-jiang-worktrees/ 另開一張 main 桌子來發布，一樣合法：
#   git worktree add <路徑>/main-desk main
# （2026-08-19 首次上線實測：主 clone 當時在 feature/offers-mika-visuals，走 main 桌子順利發布。）
CUR_BRANCH=$(git symbolic-ref --quiet --short HEAD || true)
if [[ "$CUR_BRANCH" != "main" ]]; then
  echo "⛔ merge-publish 要在 checkout 了 main 的工作區跑；目前是 ${CUR_BRANCH:-detached}。"
  echo "   主 clone 被別人佔用時，另開一張 main 桌子："
  echo "   git worktree add \"\$HOME/Developer/ai-km-jiang-worktrees/main-desk\" main"
  exit 2
fi

# 同上：main 桌子也需要 .vercel/project.json，缺了 check-deploy-env.sh 會擋。
if [[ ! -f "$REPO_ROOT/.vercel/project.json" ]]; then
  for _src in "$HOME/Documents/repo-workspace/ai-km-jiang/.vercel/project.json"; do
    if [[ -f "$_src" ]]; then
      mkdir -p "$REPO_ROOT/.vercel"
      cp "$_src" "$REPO_ROOT/.vercel/project.json"
      echo "▶ 已從主 clone 帶入 .vercel/project.json（發布環境檢查需要）"
      break
    fi
  done
fi

GIT_COMMON_DIR="$(git rev-parse --git-common-dir)"
LOCK="$GIT_COMMON_DIR/merge-publish.lock"
if ! mkdir "$LOCK" 2>/dev/null; then
  echo "⛔ 另一個 merge-publish 正在進行（鎖：${LOCK}）。"
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
  echo "⛔ 找不到分支：${BRANCH}（本地與 origin 都沒有）。"
  exit 1
fi

echo "▶ 同步 main…"
git fetch origin
git pull --rebase

# 本步「重建全部生成檔」會整個重寫的檔：衝突時直接收下 main 版再重建即可，不必人工合併。
# articles-data.js 自 2026-09-06 起也是生成檔（一篇一檔 article.json 合併而成，見 build-articles-data.mjs），
# 過去「兩篇同時 append 撞 both-added」的那類衝突從此在這裡自動收掉。
# sitemap.xml、llms.txt、llms-full.txt 仍是手維護檔，不在此列，衝突照舊人工判斷。
REGENERATED=(articles-data.js site-index.json article-keywords.js en/articles-data.js)

# 漂移偵測的基準版（Codex R2 條件 1）：squash 之後 merge-base 會變成 main 自己，
# 所以在這裡先算「main 與分支的分叉點」，連同 main HEAD 一起交給生成器。
# 分支從分叉點之後對生成檔的任何非來源改動都會被抓到；main 在這期間更新過的舊筆不會被誤判。
FORK_POINT="$(git merge-base HEAD "$BRANCH" 2>/dev/null || true)"
export ARTICLES_DATA_BASELINES="${FORK_POINT} $(git rev-parse HEAD)"

echo "▶ squash merge $BRANCH …"
if ! git merge --squash "$BRANCH"; then
  CONFLICTS=()
  while IFS= read -r -d '' f; do CONFLICTS+=("${f}"); done < <(git -c core.quotePath=false diff --name-only --diff-filter=U -z)
  MANUAL=()
  for f in "${CONFLICTS[@]}"; do
    is_gen=0
    for g in "${REGENERATED[@]}"; do [[ "${f}" == "${g}" ]] && is_gen=1; done
    if [[ "${f}" == "articles-data.js" ]]; then
      # 這一個收「分支版」不收 main 版：分支若是舊習慣直接在 articles-data.js 加了一筆、沒建 article.json，
      # 收 main 版會讓那一筆在重建前就消失，生成器的漂移偵測看不到、文章就無聲掉出索引。
      # 收分支版則交給下一步的生成器判：那一筆來源沒有→停下要求 --adopt；有 article.json→正常重建。
      git checkout --theirs -- "${f}" && git add -- "${f}"
      echo "   ↻ articles-data.js 衝突先收分支版：${f}（下一步生成器會比對來源，有手改會停下）"
    elif [[ ${is_gen} -eq 1 ]]; then
      git checkout --ours -- "${f}" && git add -- "${f}"
      echo "   ↻ 生成檔衝突自動收下 main 版：${f}（下一步會整個重建）"
    else
      MANUAL+=("${f}")
    fi
  done
  if [[ ${#MANUAL[@]} -gt 0 ]]; then
    echo ""
    echo "⛔ merge 有生成檔以外的衝突，需要人工判斷："
    printf '   - %s\n' "${MANUAL[@]}"
    echo "   處理原則："
    echo "   - 文章資料改在 articles/<id>/article.json（一篇一檔），兩桌各動各的檔，理論上不會撞；"
    echo "     若撞的是同一篇的 article.json，表示兩桌在改同一篇，先對一下登記簿。"
    echo "   - 解完 git add 後重跑本指令會擋（已有 staged），改為手動（基準版要自己帶，腳本退出後環境變數就沒了）："
    echo "     解衝突 → ARTICLES_DATA_BASELINES=\"${FORK_POINT} $(git rev-parse HEAD)\" node scripts/build-articles-data.mjs"
    echo "     → 重建其餘生成檔 → git add → bash scripts/publish.sh \"訊息\""
    echo "   要放棄本次合併：git reset --merge"
    exit 1
  fi
  echo "   衝突只有生成檔，已全部自動處理，繼續。"
fi

echo "▶ 重建全部生成檔…"
# 順序有意義：articles-data.js 先，site-index 與 article-keywords 都讀它。
# 這一步若停下（exit 2）＝有人直接手改了 articles-data.js 而沒動 article.json：
# 到該分支跑 node scripts/build-articles-data.mjs --adopt 把手改回寫成來源檔，再重跑本指令。
node scripts/build-articles-data.mjs
node scripts/build-site-index.mjs
node scripts/build-article-keywords.mjs
node scripts/build-en-articles-data.mjs

git add -A
if git diff --cached --quiet; then
  echo "⛔ 合併後沒有任何變更（分支可能已經上線過）。"
  exit 1
fi

# ─── 第三道出口（圖譜工程 v2 P2，2026-09-05）：實際要上線的檔案 vs 登記單範圍，純警告 ───
claim_files=()
while IFS= read -r -d '' f; do claim_files+=("${f}"); done < <(git -c core.quotePath=false diff --cached --name-only -z)
bash scripts/agent-claim-check.sh "${BRANCH}" "${claim_files[@]}" || true

echo "▶ 交給 publish.sh（preflight、秘密掃描、commit、push、等建置、路徑驗收）…"
bash scripts/publish.sh "$MSG"

# ─── SHA 精確驗收：確認線上建置就是本次 commit，不是別人的 ───
EXPECT_SHA=$(git rev-parse HEAD)
GIT_MAIN_URL="https://ai-km-jiang-git-main-jiang-coach.vercel.app"
DEPLOY_JSON=$(vercel inspect "$GIT_MAIN_URL" --format=json 2>/dev/null || true)
if [[ -n "$DEPLOY_JSON" ]] && grep -q "$EXPECT_SHA" <<<"$DEPLOY_JSON"; then
  echo "✅ SHA 驗收通過：線上建置對應本次 commit $EXPECT_SHA"
else
  echo "⚠️ SHA 驗收無法確認（vercel inspect 沒回傳或未含 ${EXPECT_SHA}）。"
  echo "   不代表失敗，但要人工到 Vercel 後台核對最新 production 建置的 commit。"
  echo "   在核對完成前，本次發布只能標「已 push、驗收待確認」。"
  exit 3
fi

echo ""
echo "✅ merge-publish 完成。收尾建議："
echo "   桌子可以收：git worktree remove \"\$HOME/Developer/ai-km-jiang-worktrees/<slug>\""
echo "   分支可以刪：git branch -d ${BRANCH}（已合併，-d 安全）"
