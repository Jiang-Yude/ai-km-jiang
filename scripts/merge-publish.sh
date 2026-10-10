#!/bin/bash
# 合併上線：並行施工機制的唯一上線入口（2026-08-19 立，江江拍板；Codex 跨家審三修正已內建）
# 用法：在「主 clone」（main 分支所在的那份）跑：
#   bash scripts/merge-publish.sh article/<slug> "commit 訊息"
# 2026-10-09 修正（事故驅動，七個錯）：分支三態解析（本地／origin／都沒有→exit 1）、merge 無衝突卻失敗→exit 1 不假成功、
#   分支夾帶生成檔用 git 歷史判手改（check-branch-generated.mjs）後一律還原 main 版重建、sitemap 文章段改生成（build-sitemap.mjs）、
#   等 index.lock。驗收跟隨 Pages 308 與 deploy-production 收尾訊息由 main 793ce02 另修。排隊多篇用 scripts/publish-queue.py。
# 結束碼（2026-10-09 立，給便宜模型與佇列工具判讀）：0＝上線且驗收通過；2＝用法錯；
#   10＝被閘門擋下（鎖、工作區不乾淨、找不到分支、無變更、preflight／環境）修好重跑即可；
#   20＝需要人或強模型判斷（內容衝突、分支手寫生成檔、本地與 origin 分歧）絕不自動合併；
#   publish.sh 階段的失敗沿用它的結束碼（push 後失敗由 publish-queue.py 判成 30）。
# 流程：取鎖（搶不到就排隊）→ main 乾淨檢查 → pull rebase → squash merge 分支 → 重建全部生成檔
#      → 壓成單一 staged 變更交 publish.sh（preflight、秘密掃描、commit、push、等本次 SHA 的建置、
#        促轉 main 最新、三網域與路徑驗收）→ 放鎖
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

# 發布鎖（2026-09-27 改）：搶不到就排隊，不再直接退出；持有者被強制停掉留下的鎖會安全接手。
# 規則見 scripts/publish-lock.sh；publish.sh 會沿用這把鎖，不會自己卡自己。
# shellcheck source=publish-lock.sh
source "$REPO_ROOT/scripts/publish-lock.sh"
publish_lock_acquire "merge-publish ${BRANCH}" || exit 10
# 2026-10-09（Codex R2 第 4 條）：squash 開始後、publish.sh 成功前，任何非零退出都把 main 工作區還原乾淨，
# 否則重跑會被「工作區不乾淨」擋住。squash 進來的內容都還在分支上，還原不會丟東西。
SQUASH_STARTED=0
PUBLISH_DONE=0
_mp_cleanup() {
  local rc=$?
  if (( rc != 0 && SQUASH_STARTED == 1 && PUBLISH_DONE == 0 )); then
    git reset --merge >/dev/null 2>&1 || git reset --hard -q >/dev/null 2>&1 || true
    if [[ -z "$(git -c core.quotePath=false status --porcelain)" ]]; then
      echo "▶ 失敗退出（exit ${rc}）：main 工作區已還原乾淨，分支內容未動，修好後可直接重跑。"
    else
      echo "⚠️ 失敗退出（exit ${rc}）且還原後工作區仍不乾淨，先 git status 看。"
    fi
  fi
  publish_lock_release
  exit "$rc"
}
trap _mp_cleanup EXIT

# 過渡期：舊版 merge-publish 的鎖放在 git common dir。改版前就開跑的 session 可能還拿著它，等它放掉再動。
LEGACY_LOCK="$(git rev-parse --git-common-dir)/merge-publish.lock"
_legacy_start=${SECONDS}
while [[ -d "${LEGACY_LOCK}" ]]; do
  if (( SECONDS - _legacy_start > 900 )); then
    echo "⛔ 舊版鎖 ${LEGACY_LOCK} 存在超過 15 分鐘。確認沒有舊版 merge-publish 在跑，才手動 rmdir 它。"
    exit 10
  fi
  echo "⏳ 有改版前開跑的 merge-publish 還在進行（舊版鎖），等它結束…"
  sleep 10
done

# main 工作區必須乾淨（有別人的舊制在途工作就停，不蓋）
if [[ -n "$(git -c core.quotePath=false status --porcelain)" ]]; then
  echo "⛔ main 工作區不乾淨，先處理（可能是舊制在途工作，依防打架鐵律 1 不碰別人的東西）："
  git -c core.quotePath=false status --porcelain
  exit 10
fi

# 別的 git 程序正在動這個工作區（例：另一個 session 在主 clone 跑 git pull）：等它放手再動，等不到就停。
# 2026-10-09 補：主 clone 被別人同時 pull 是常態；發布鎖只管 merge-publish／publish.sh 自己，管不到裸 git。
_idx_lock="$(git rev-parse --git-dir)/index.lock"
_idx_wait=0
while [[ -e "${_idx_lock}" ]]; do
  if (( _idx_wait >= 60 )); then
    echo "⛔ ${_idx_lock} 存在超過 60 秒：有別的 git 程序在動這個工作區（或異常中斷殘留）。確認沒人在跑 git 再重跑。"
    exit 10
  fi
  (( _idx_wait == 0 )) && echo "⏳ 另一個 git 程序正在動這個工作區（index.lock），等它結束…"
  sleep 5; _idx_wait=$((_idx_wait + 5))
done

echo "▶ 同步 main…"
git fetch origin
git pull --rebase

# 分支解析（2026-10-09 改，事故驅動）：分支只存在「獨立 clone」時，舊版 `git merge --squash article/x`
# 印 `not something we can merge`，接著 CONFLICTS 陣列在 bash 3.2 下 unbound，卻 exit 0（假成功）。
# 現在三態明確：①本地有分支→用本地 ②本地沒有、origin 有→用 origin/<branch>（別台或獨立 clone push 上來的）
# ③都沒有→exit 1，告訴人去那個 clone 先 push。先 fetch 過了，origin 的是最新。
if git show-ref --verify --quiet "refs/heads/$BRANCH"; then
  MERGE_REF="$BRANCH"
  if git show-ref --verify --quiet "refs/remotes/origin/$BRANCH" \
     && [[ "$(git rev-parse "$BRANCH")" != "$(git rev-parse "origin/$BRANCH")" ]]; then
    if git merge-base --is-ancestor "$BRANCH" "origin/$BRANCH"; then
      echo "⚠️  本地 ${BRANCH} 落後 origin/${BRANCH}（別台 push 了更新的），改用 origin/${BRANCH}。"
      MERGE_REF="origin/$BRANCH"
    elif git merge-base --is-ancestor "origin/$BRANCH" "$BRANCH"; then
      echo "▶ 本地 ${BRANCH} 比 origin 新（還沒 push），用本地版；別台拿不到這版，記得 push。"
    else
      # Codex 跨家審（2026-10-09 R1 第 6 條）：兩邊分歧時不猜用哪邊，停下讓人合併，避免漏掉另一台的修改。
      echo "⛔ 本地 ${BRANCH} 與 origin/${BRANCH} 分歧（各自有對方沒有的 commit），不猜。到施工桌 git pull origin ${BRANCH} 合併後 push，再重跑。"
      exit 20
    fi
  fi
elif git show-ref --verify --quiet "refs/remotes/origin/$BRANCH"; then
  MERGE_REF="origin/$BRANCH"
  echo "▶ 本地沒有 ${BRANCH}，用 origin/${BRANCH}（遠端分支）。"
else
  echo "⛔ 找不到分支：${BRANCH}（本地與 origin 都沒有）。"
  echo "   分支若在獨立 clone 或筆電上：到那邊 git push -u origin ${BRANCH}，再回來重跑。"
  exit 10
fi

# 本步「重建全部生成檔」會整個重寫的檔：衝突時直接收下 main 版再重建即可，不必人工合併。
# articles-data.js 自 2026-09-06 起也是生成檔（一篇一檔 article.json 合併而成，見 build-articles-data.mjs），
# 過去「兩篇同時 append 撞 both-added」的那類衝突從此在這裡自動收掉。
# sitemap.xml 自 2026-10-09 起文章段也是生成的（build-sitemap.mjs，只補文章、不重排不刪）；
# llms.txt、llms-full.txt 仍是手維護檔，不在此列，衝突照舊人工判斷。
REGENERATED=(articles-data.js site-index.json article-keywords.js en/articles-data.js sitemap.xml)

# 漂移偵測的基準版（Codex R2 條件 1）：squash 之後 merge-base 會變成 main 自己，
# 所以在這裡先算「main 與分支的分叉點」，連同 main HEAD 一起交給生成器。
# 分支從分叉點之後對生成檔的任何非來源改動都會被抓到；main 在這期間更新過的舊筆不會被誤判。
FORK_POINT="$(git merge-base HEAD "$MERGE_REF" 2>/dev/null || true)"
if [[ -z "$FORK_POINT" ]]; then
  echo "⛔ 算不出 main 與 ${MERGE_REF} 的分叉點（分支可能已 squash 上線過一次，見踩坑清單第十條）。"
  exit 20
fi
export ARTICLES_DATA_BASELINES="${FORK_POINT} $(git rev-parse HEAD)"

# ─── 分支夾帶生成檔的判定（2026-10-09 立，事故驅動）───
# 分支在 commit 當下已有 pre-commit 擋生成檔；這裡是第二道，順便處理擋之前就 commit 的舊分支。
# 看 git 歷史而不是檔案內容：分支改了 articles-data.js 某筆、卻沒改那篇的 article.json ＝ 手改 → 停下要 --adopt；
# 來源也改了 ＝ 桌上重建後過期的產物 → 可以安全丟掉分支版，由 main 版重建（生成器看到的就是基準版，不會誤判漂移）。
BRANCH_GEN=()
# 檢查器優先取分支版（分支可能正在升級檢查器本身，或 main 還沒有它），取不到才用 main 的。只讀 git，不靠工作區。
_chk="$(mktemp "${TMPDIR:-/tmp}/check-branch-generated.XXXXXX").mjs"
if ! git show "${MERGE_REF}:scripts/check-branch-generated.mjs" > "$_chk" 2>/dev/null; then
  if [[ -f scripts/check-branch-generated.mjs ]]; then cp scripts/check-branch-generated.mjs "$_chk"; else
    echo "⛔ 找不到 scripts/check-branch-generated.mjs（main 與分支都沒有），無法判定分支有沒有夾帶生成檔。"; exit 10; fi
fi
_gen_out=$(node "$_chk" "$FORK_POINT" "$MERGE_REF"); _gen_rc=$?
rm -f "$_chk"
if (( _gen_rc == 1 )); then
  echo "⛔ 分支 ${BRANCH} 直接手寫了生成檔（見上方）。到該分支跑 node scripts/build-articles-data.mjs --adopt 後重跑。"
  exit 20
elif (( _gen_rc != 0 )); then
  echo "⛔ 分支生成檔檢查器本身失敗（exit ${_gen_rc}），不是分支的問題；看上方錯誤，修好檢查器再跑。"
  exit 10
fi
while IFS= read -r _g; do [[ -n "$_g" ]] && BRANCH_GEN+=("$_g"); done <<< "$_gen_out"
if [[ ${#BRANCH_GEN[@]} -gt 0 ]]; then
  echo "▶ 分支夾帶生成檔 ${#BRANCH_GEN[@]} 個（${BRANCH_GEN[*]}）：merge 後一律還原成 main 版再重建，不收分支版。"
fi

echo "▶ squash merge $MERGE_REF …"
SQUASH_STARTED=1
if ! git merge --squash "$MERGE_REF"; then
  CONFLICTS=()
  while IFS= read -r -d '' f; do CONFLICTS+=("${f}"); done < <(git -c core.quotePath=false diff --name-only --diff-filter=U -z)
  if [[ ${#CONFLICTS[@]} -eq 0 ]]; then
    # merge 失敗卻沒有衝突檔＝不是衝突，是 merge 本身失敗（ref 解析不到、工作區異常）。舊版這裡會假成功 exit 0。
    echo "⛔ git merge --squash ${MERGE_REF} 失敗，且沒有衝突檔：不是衝突，是 merge 本身沒成立。看上方 git 訊息。"
    git reset --merge >/dev/null 2>&1 || true
    exit 10
  fi
  MANUAL=()
  for f in ${CONFLICTS[@]+"${CONFLICTS[@]}"}; do
    is_gen=0
    for g in "${REGENERATED[@]}"; do [[ "${f}" == "${g}" ]] && is_gen=1; done
    if [[ ${is_gen} -eq 1 ]]; then
      # 2026-10-09 改：articles-data.js 不再「收分支版交生成器判」，手改與否已由上面 check-branch-generated.mjs 用 git 歷史判過。
      git checkout --ours -- "${f}" && git add -- "${f}"
      echo "   ↻ 生成檔衝突自動收下 main 版：${f}（下一步會整個重建）"
      if [[ "${f}" == "sitemap.xml" ]]; then
        # 分支若也改了非文章段（課程頁、根目錄頁），收 main 版會丟掉那些；列出來讓人補，不靜默。
        _nonart=$(git diff "${FORK_POINT}" "${MERGE_REF}" -- sitemap.xml | grep -E '^[+-].*<loc>' | grep -vE '/(articles|ai-trends)/' || true)
        if [[ -n "${_nonart}" ]]; then
          echo "   ⚠️ sitemap.xml 分支版還改了非文章段，收 main 版後這些會不見，請在 main 補回或另開分支："
          printf '%s\n' "${_nonart}" | sed 's/^/      /'
        fi
      fi
    else
      MANUAL+=("${f}")
    fi
  done
  if [[ ${#MANUAL[@]} -gt 0 ]]; then
    echo ""
    echo "⛔ merge 有生成檔以外的衝突，需要人工判斷："
    printf '   - %s\n' "${MANUAL[@]}"
    echo "   處理原則（踩坑清單第十七條）：主 clone 不留半套 squash，已自動 git reset --merge 還原乾淨；"
    echo "   - 回施工桌：git merge origin/main 解衝突（文章資料在 articles/<id>/article.json，撞同一篇表示兩桌改同一篇，先對登記簿）"
    echo "     → commit → 回來重跑本指令（用 && 串，不要用 ;）。"
    echo "   - 這一步需要人或強模型判斷哪一版對，本腳本不自動合併。"
    git reset --merge >/dev/null 2>&1 || echo "   ⚠️ git reset --merge 失敗，主 clone 可能還留著衝突檔，先手動 git status 看。"
    exit 20
  fi
  echo "   衝突只有生成檔，已全部自動處理，繼續。"
fi

# 分支夾帶的生成檔（沒撞衝突、squash 直接帶進來的那些）：還原成 main 版，下一步整個重建。
# sitemap.xml 例外（Codex R1 第 3 條）：它只有「文章段」是生成的，分支可能合法改了課程頁等非文章段，
# 所以沒撞衝突就保留 squash 進來的版本，只讓 build-sitemap 補文章；有撞衝突才在上面收 main 版並警告。
for _g in ${BRANCH_GEN[@]+"${BRANCH_GEN[@]}"}; do
  [[ "${_g}" == "sitemap.xml" ]] && continue
  if ! git diff --cached --quiet -- "${_g}"; then
    git checkout HEAD -- "${_g}" && git add -- "${_g}"
    echo "   ↻ 還原分支帶來的生成檔為 main 版：${_g}"
  fi
done

echo "▶ 重建全部生成檔…"
# 順序有意義：articles-data.js 先，site-index 與 article-keywords 都讀它；sitemap 最後（只補文章段）。
# 這一步若停下（exit 2）＝main 自己的 articles-data.js 被直接手改過（分支那側已在上面判過）：
# 看生成器印出的那幾筆，決定 --adopt 回寫或 --force 重建。
node scripts/build-articles-data.mjs
node scripts/build-site-index.mjs
node scripts/build-article-keywords.mjs
node scripts/build-en-articles-data.mjs
node scripts/build-sitemap.mjs

git add -A
if git diff --cached --quiet; then
  echo "⛔ 合併後沒有任何變更（分支可能已經上線過）。"
  exit 10
fi

# ─── 第三道出口（圖譜工程 v2 P2，2026-09-05）：實際要上線的檔案 vs 登記單範圍，純警告 ───
claim_files=()
while IFS= read -r -d '' f; do claim_files+=("${f}"); done < <(git -c core.quotePath=false diff --cached --name-only -z)
bash scripts/agent-claim-check.sh "${BRANCH}" "${claim_files[@]}" || true

echo "▶ 交給 publish.sh（preflight、秘密掃描、commit、push、等本次 SHA 的建置、促轉 main 最新、三網域與路徑驗收）…"
bash scripts/publish.sh "$MSG"
PUBLISH_DONE=1
# SHA 精確驗收已移進 publish.sh（2026-09-27）：舊寫法在 vercel inspect 的 JSON 裡找 SHA，
# 但該 JSON 根本不含 commit SHA，每次都 exit 3「驗收待確認」。publish.sh 改用
# vercel ls --meta githubCommitSha=<SHA> 精確找本次建置，並核對三個網域實際指向的建置。

echo ""
echo "✅ merge-publish 完成。收尾建議："
echo "   桌子可以收：git worktree remove \"\$HOME/Developer/ai-km-jiang-worktrees/<slug>\""
echo "   分支可以刪：git branch -d ${BRANCH}（已合併，-d 安全）"
