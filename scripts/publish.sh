#!/bin/bash
# 官網發布包裝器
# 用法：
#   git add -- 明確檔案 && bash scripts/publish.sh "commit 訊息"
#   bash scripts/publish.sh "commit 訊息" -- 明確檔案 [明確資料夾...]
# 流程：取發布鎖（搶不到就排隊）→ preflight → 明確範圍 → 秘密掃描 → commit → pull rebase → 再掃描
#      → atomic push →（Vercel Git 整合自動建置）→ 等本次 commit SHA 的 production READY
#      → 三網域促轉到 main 最新（main 已被別人推進就促轉那一版，永不切回舊版）→ 核對三網域實際指向
#      → 固定五站＋動態文章路徑驗收 → 擋板草稿 404 抽驗
# 2026-09-27 並行發布改版（江江：「CC 跟 CX 都可以各自部署，沒有衝突」；Codex 跨家審）：
#   同機靠 scripts/publish-lock.sh 排隊；跨機靠「永遠促轉 main 最新、促轉後再核對一次」收斂。
# 2026-07-06 立；2026-07-26 接入共用 safe-deploy；2026-08-08 改接 Git 整合自動部署
# （江江拍板＋Codex 跨家審查，計畫見主庫 _agent/tmp/2026-08-07 官網部署改造/）。
# 部署觸發＝push 到 main，不再從本機 CLI 推快照；回退用 Vercel instant rollback。
# 緊急修站也走這裡，不要手動 vercel。
set -eo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SAFE_DEPLOY_TOOL="${SAFE_DEPLOY_TOOL:-$HOME/Library/Mobile Documents/iCloud~md~obsidian/Documents/江昱德 主知識庫/_agent/tools/safe-deploy/safe-deploy.sh}"
EXPECTED_BRANCH="main"
MSG="${1:?用法：bash scripts/publish.sh \"commit 訊息\"}"
shift
PUBLISH_PATHS=()

if [[ "${1:-}" == "--" ]]; then
  shift
  PUBLISH_PATHS=("$@")
elif [[ "$#" -gt 0 ]]; then
  echo "⛔ commit 訊息後只能接 -- 與明確檔案／資料夾。"
  exit 1
fi

if [[ ! -f "$SAFE_DEPLOY_TOOL" ]]; then
  echo "⛔ 找不到共用部署工具：$SAFE_DEPLOY_TOOL"
  echo "   另一台機器請用 SAFE_DEPLOY_TOOL 指向該機的完整絕對路徑。"
  exit 1
fi

cd "$REPO_ROOT"

# 發布鎖：同一台機器同時只有一個發布在動工作區；由 merge-publish 呼叫時沿用它的鎖。
# shellcheck source=publish-lock.sh
source "$REPO_ROOT/scripts/publish-lock.sh"
publish_lock_acquire "publish.sh ${MSG}" || exit 1
trap publish_lock_release EXIT

echo "▶ 部署環境檢查…"
bash scripts/check-deploy-env.sh \
  || { echo "⛔ 部署環境未過，取消發佈"; exit 1; }

BRANCH=$(git symbolic-ref --quiet --short HEAD 2>/dev/null || true)
if [[ -z "$BRANCH" ]]; then
  echo "⛔ 目前是 detached HEAD；為避免 commit 留在無分支位置，先切回正式發布分支。"
  exit 2
fi
if [[ "$BRANCH" != "$EXPECTED_BRANCH" ]]; then
  echo "⛔ 官網 production 只允許從 ${EXPECTED_BRANCH} 分支發布；目前是 ${BRANCH}。"
  exit 2
fi
UPSTREAM=$(git rev-parse --abbrev-ref '@{u}' 2>/dev/null || true)
if [[ "$UPSTREAM" != "origin/$EXPECTED_BRANCH" ]]; then
  echo "⛔ ${EXPECTED_BRANCH} 的 upstream 必須是 origin/${EXPECTED_BRANCH}；目前是 ${UPSTREAM:-未設定}。"
  echo "   先確認 remote 後設定：git branch --set-upstream-to=origin/${EXPECTED_BRANCH} ${EXPECTED_BRANCH}"
  exit 2
fi

for path in "${PUBLISH_PATHS[@]}"; do
  case "$path" in
    ""|"."|/*|*..*|:*|!*|*[\*\?\[]*)
      echo "⛔ 發布路徑必須是 repo 內的明確相對檔案／資料夾，不收 .、..、絕對路徑或 pathspec：$path"
      exit 1
      ;;
  esac
done

# 確保 git 品質閘門存在後才綁定（pre-push）；不存在時不得靜默停用 hooks。
HOOKS_PATH="scripts/git-hooks"
if [[ ! -d "$HOOKS_PATH" || ! -x "$HOOKS_PATH/pre-push" ]]; then
  echo "⛔ Git 品質閘門缺失或不可執行：$HOOKS_PATH/pre-push"
  echo "   不修改 core.hooksPath、不 commit、不 push。"
  exit 2
fi
git config core.hooksPath "$HOOKS_PATH"

STAGED_BEFORE=$(git -c core.quotePath=false diff --cached --name-only)
if [[ "${#PUBLISH_PATHS[@]}" -gt 0 && -n "$STAGED_BEFORE" ]]; then
  echo "⛔ 明確路徑模式不接受既有 staged 內容；先自行處理 index 再跑。"
  exit 2
fi
if [[ "${#PUBLISH_PATHS[@]}" -eq 0 && -z "$STAGED_BEFORE" ]]; then
  echo "⛔ 沒有明確路徑，也沒有 staged 內容。"
  echo "   先 git add -- 明確檔案，或在訊息後加：-- path1 path2"
  exit 2
fi

# ─── 未推送 commit 檢查（2026-08-12 立，事故驅動）───
# 立因：本腳本結尾用 `HEAD:refs/heads/main` 推整條本機 commit 鏈（見下方 push 段），
# 只要有別人已 commit 但還沒 push 的東西夾在中間，本次發布會連帶把它送上線。
# 發布者通常只核對自己 `git add` 的檔案，看不到這一層。
# 2026-08-12 一天內出事兩次：早上被別人的髒工作區擋下發布，晚上不知情推出了別人的 commit。
# 掛牌是社交約定，擋不住 atomic push；這一關驗的是 git 的實際狀態，不是別人有沒有登記。
# 放在 preflight 之前＝早失敗，不做白工也不留殘局。
if ! git rev-parse --abbrev-ref --symbolic-full-name '@{u}' >/dev/null 2>&1; then
  echo "⛔ 目前分支沒有設定 upstream，無法判斷哪些 commit 尚未推送。"
  echo "   這一關不能靜默跳過（跳過等於整關失效）。"
  echo "   先設定：git branch --set-upstream-to=origin/main"
  exit 2
fi
UNPUSHED=$(git -c core.quotePath=false log --oneline '@{u}..HEAD')
if [[ -n "$UNPUSHED" ]]; then
  echo "⚠️  本機有尚未推送的 commit，本次發布會一併送上線："
  printf '%s\n' "$UNPUSHED" | sed -n '1,20p'
  [[ $(printf '%s\n' "$UNPUSHED" | wc -l) -gt 20 ]] && echo "   （還有更多，只列前 20 筆）"
  echo
  echo "   ⚠️ 上面若有不是你這輪產出的 commit，很可能是另一個 session 的，先停下確認。"
  echo "      確認過、也同意一起送出後，帶 CONFIRM_UNPUSHED=1 重跑本指令。"
  if [[ "${CONFIRM_UNPUSHED:-0}" != "1" ]]; then
    exit 2
  fi
  echo "   ✅ 已帶 CONFIRM_UNPUSHED=1，視為已確認，繼續。"
fi

echo "▶ Preflight…"
SAFE_DEPLOY_TOOL="$SAFE_DEPLOY_TOOL" bash scripts/preflight.sh \
  || { echo "⛔ preflight 未過，取消發佈"; exit 1; }

if [[ "${#PUBLISH_PATHS[@]}" -gt 0 ]]; then
  ALL_CHANGED=$(
    {
      git -c core.quotePath=false diff --name-only
      git -c core.quotePath=false ls-files --others --exclude-standard
    } | LC_ALL=C sort -u
  )
  SELECTED_CHANGED=$(
    {
      git -c core.quotePath=false diff --name-only -- "${PUBLISH_PATHS[@]}"
      git -c core.quotePath=false ls-files --others --exclude-standard -- "${PUBLISH_PATHS[@]}"
      git -c core.quotePath=false diff --name-only -- site-index.json
    } | LC_ALL=C sort -u
  )
  UNEXPECTED=$(comm -23 \
    <(printf '%s\n' "$ALL_CHANGED" | awk 'NF' | LC_ALL=C sort -u) \
    <(printf '%s\n' "$SELECTED_CHANGED" | awk 'NF' | LC_ALL=C sort -u))

  if [[ -n "$UNEXPECTED" ]]; then
    echo "⛔ 有未列入本次發布範圍的變更；commit 前停止："
    echo "   （可能是另一個 session 施工中。依 🌐 官網看板『防打架四鐵律』第 4 條："
    echo "     同一時段單一 session 施工，先到看板『🔧 施工中掛牌』登記，等對方收工撤牌再發布。）"
    printf '%s\n' "$UNEXPECTED" | sed -n '1,20p'
    exit 2
  fi

  git add -A -- "${PUBLISH_PATHS[@]}"
  if ! git diff --quiet -- site-index.json; then
    git add -- site-index.json
  fi
else
  UNSTAGED=$(
    {
      git -c core.quotePath=false diff --name-only | grep -v '^site-index\.json$' || true
      git -c core.quotePath=false ls-files --others --exclude-standard
    } | awk 'NF' | LC_ALL=C sort -u
  )
  if [[ -n "$UNSTAGED" ]]; then
    echo "⛔ staged-only 模式仍有未 staged 或未追蹤內容；commit 前停止："
    printf '%s\n' "$UNSTAGED" | sed -n '1,20p'
    exit 2
  fi
  if ! git diff --quiet -- site-index.json; then
    git add -- site-index.json
  fi
fi

if ! git diff --quiet || [[ -n "$(git -c core.quotePath=false ls-files --others --exclude-standard)" ]]; then
  echo "⛔ 準備 commit 時仍有未納入的變更；停止。"
  exit 2
fi
if git diff --cached --quiet; then
  echo "沒有變更可發布"
  exit 0
fi

echo ""
echo "▶ 本次要 commit 的明確範圍："
git -c core.quotePath=false diff --cached --name-status

echo "▶ Push 前秘密掃描…"
bash "$SAFE_DEPLOY_TOOL" --scan-only "$REPO_ROOT"

echo "▶ Commit…"
git commit -m "$MSG"

echo "▶ 同步遠端（pull --rebase）…"
git pull --rebase

echo "▶ Rebase 後、push 前再掃描…"
bash "$SAFE_DEPLOY_TOOL" --scan-only "$REPO_ROOT"

TAG="publish/$(TZ=Asia/Taipei date +%Y-%m-%d-%H%M%S)"
echo "▶ Tag ${TAG} + atomic push…"
git tag "$TAG"
git push --atomic origin \
  "HEAD:refs/heads/$EXPECTED_BRANCH" \
  "refs/tags/$TAG:refs/tags/$TAG"

# ─── 動態驗收路徑（2026-07-29 立，事故驅動）───
# 固定五站不含新文章路徑，所以「索引宣告存在、檔案被 .vercelignore 擋著沒上傳」的 404
# 不會被部署驗收抓到（2026-07-29 free-deploy-three-boundaries 就是這樣線上掛了 404）。
# 這裡從本次 commit 解析出真的會上線的文章路徑，動態加進驗收清單。
# 只驗「真的可能 404」的兩種，不是本次動到的所有文章
# （全站批次會動到 200+ 篇既有文章，那些不會突然 404，全驗只是拖慢部署）
EXTRA_VERIFY=()
_add_verify() {
  local _id="$1" _e
  [[ -n "$_id" ]] || return 0
  grep -qE "^${_id}/\$" .vercelignore 2>/dev/null && return 0   # 仍被擋著＝刻意排隊中，不該上線
  [[ -f "${_id}/index.html" ]] || return 0
  for _e in ${EXTRA_VERIFY[@]+"${EXTRA_VERIFY[@]}"}; do
    [[ "$_e" == "/${_id}/" ]] && return 0
  done
  EXTRA_VERIFY+=("/${_id}/")
}
# ① 本次新增的文章
while IFS= read -r _p; do
  case "$_p" in
    articles/*/index.html|en/articles/*/index.html) _add_verify "${_p%/index.html}" ;;
  esac
done < <(git show --name-only --diff-filter=A --pretty=format: HEAD 2>/dev/null | awk 'NF')
# ② 本次從 .vercelignore 解除擋板的文章（2026-07-29 那次 404 的真正樣態：檔案早就在，只是擋板沒拿掉）
while IFS= read -r _p; do
  _add_verify "${_p%/}"
done < <(git show HEAD -- .vercelignore 2>/dev/null | grep '^-articles/' | sed 's/^-//' | awk 'NF')
if [[ ${#EXTRA_VERIFY[@]} -gt 0 ]]; then
  echo "▶ 本次含新文章，驗收清單加入：${EXTRA_VERIFY[*]}"
fi

# ─── Git 整合自動部署＋別名促轉（2026-08-08 起；2026-09-27 並行發布改版）───
# push 已觸發 Vercel 從 GitHub 遠端建置（部署單位＝commit，不再從本機推快照）。
# 驗收三件套（Codex 跨家審查要求）：
#   ① 本次 commit SHA 的 production 建置 READY；三網域實際指向 main 最新 commit 的建置
#   ② 固定五站＋動態文章路徑 curl 200
#   ③ 抽驗一篇 .vercelignore 擋板草稿仍 404（防擋板在 git 部署下失效）
# 並行規則（2026-09-27）：
#   - 找建置用 vercel ls --meta githubCommitSha=<SHA> 精確查，不再猜「main 最新建置換新了沒」
#     （舊寫法兩台接連 push 時會等到別人的建置；而 vercel inspect 的 JSON 不含 SHA，無法核對）
#   - 永遠促轉 origin/main 最新那一版（一定包含本次）；促轉後再讀一次 main 並核對三網域，
#     main 在這段時間又前進，就再促轉新的那版，最多 8 輪；促轉前若網域已指向更新的建置就不覆寫。
# 註：網域專案層歸屬目前在「website」專案（2026-07-28 買網域時掛上的舊帳，
#     待江江在 Vercel 後台 Settings→Domains 搬到 ai-km-jiang；搬完後
#     production 建置會自動接管網域，本促轉段自動降級為保險絲，不衝突）。
PROJECT_NAME="ai-km-jiang"
DOMAINS=(jiangyude.com www.jiangyude.com ai-km-jiang.vercel.app)
PUBLISHED_SHA=$(git rev-parse HEAD)

# 印出某個 commit 的 production 建置「狀態 網址」；查不到印空字串
deploy_of_sha() {
  vercel ls "$PROJECT_NAME" --meta "githubCommitSha=$1" --format=json 2>/dev/null | python3 -c '
import json, sys
try:
    data = json.load(sys.stdin)
except Exception:
    sys.exit(0)
for d in data.get("deployments", []):
    if d.get("target") == "production" and (d.get("meta") or {}).get("githubCommitSha") == sys.argv[1]:
        print((d.get("state") or d.get("readyState") or "").upper(), d.get("url", ""))
        break
' "$1"
}

# 等某個 commit 的 production 建置 READY，成功印出建置網址
wait_ready() {
  local sha="$1" deadline=$((SECONDS + 600)) info state url
  while true; do
    info=$(deploy_of_sha "$sha" || true)   # 網路抖一下當成還沒好，繼續等
    state="${info%% *}"
    url="${info#* }"
    case "$state" in
      READY) echo "$url"; return 0 ;;
      ERROR|CANCELED)
        echo "⛔ ${sha:0:7} 的建置失敗（${state}）：https://${url}；正式網域未動。" >&2
        return 1 ;;
    esac
    if (( SECONDS > deadline )); then
      echo "⛔ 等 10 分鐘沒看到 ${sha:0:7} 的 production 建置 READY。內容以 git 為準（push 已完成）；" >&2
      echo "   部署層請開 Vercel 後台查；正式網域沒有被本次改動。" >&2
      return 1
    fi
    sleep 5
  done
}

remote_main() { git ls-remote origin refs/heads/main 2>/dev/null | cut -f1 || true; }

# 某個網域目前指向的建置網址
alias_target() {
  vercel inspect "https://$1" --format=json 2>/dev/null \
    | grep -Eo '"url"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | grep -Eo '[a-z0-9-]+\.vercel\.app' || true
}

# 某個建置的「建立時間（毫秒） 目標環境」；讀不到印空字串
deploy_info() {
  vercel inspect "https://$1" --format=json 2>/dev/null | python3 -c '
import json, sys
try:
    d = json.load(sys.stdin)
except Exception:
    sys.exit(0)
print(d.get("createdAt") or "", d.get("target") or "")
' || true
}

echo "▶ 等本次 commit ${PUBLISHED_SHA:0:7} 的 production 建置…"
OWN_URL=$(wait_ready "$PUBLISHED_SHA") || exit 1
echo "  ✅ 本次建置 READY：${OWN_URL}"

ROUND=0
while true; do
  ROUND=$((ROUND + 1))
  if (( ROUND > 8 )); then
    echo "⛔ 促轉 8 輪 main 仍在前進或網域一直被改動，先停下。"
    echo "   目前正式站指向：$(alias_target jiangyude.com)；origin/main：$(remote_main)"
    echo "   等其他發布結束後，把三網域手動對到 origin/main 那一版的建置（vercel ls ai-km-jiang --meta githubCommitSha=<SHA> 查網址）。"
    exit 1
  fi
  git fetch --quiet origin main || { echo "⛔ 讀不到 origin/main，無法決定促轉哪一版"; exit 1; }
  TIP=$(git rev-parse origin/main)
  if ! git merge-base --is-ancestor "$PUBLISHED_SHA" "$TIP"; then
    echo "⛔ 本次 commit ${PUBLISHED_SHA:0:7} 不在 origin/main 的歷史裡（遠端被改寫？），停止促轉，正式網域未動。"
    exit 1
  fi
  if [[ "$TIP" == "$PUBLISHED_SHA" ]]; then
    TIP_URL="$OWN_URL"
  else
    echo "▶ main 已前進到 ${TIP:0:7}（包含本次），改促轉最新那一版，避免把正式站切回舊版"
    TIP_URL=$(wait_ready "$TIP") || exit 1
  fi
  # 不蓋掉更新的版本（Codex 第二輪必改）：網域若已指向比 TIP 更晚建立的 production 建置，
  # 代表別台剛促轉了更新的 commit，本輪不覆寫，回頭重讀 main。
  # 誠實邊界：Vercel 促轉沒有「目前是某版才切」的原子操作、兩台機器之間也沒有共用鎖，
  # 檢查到切換之間仍有一兩秒空窗；兩台剛好同一秒切換時可能短暫切回，下一輪核對會再切回最新版。
  # 讀不到任何一項（網域指向、建立時間、目標環境）就不促轉，重試；不可在不知道現況時直接覆寫（Codex 第三輪必改）
  TIP_CREATED=$(deploy_info "$TIP_URL"); TIP_CREATED="${TIP_CREATED%% *}"
  NEWER_LIVE=""
  UNKNOWN=""
  [[ "$TIP_CREATED" =~ ^[0-9]+$ ]] || UNKNOWN="${TIP:0:7} 建置的建立時間"
  for _domain in "${DOMAINS[@]}"; do
    [[ -z "$UNKNOWN" ]] || break
    _cur=$(alias_target "$_domain")
    if [[ -z "$_cur" ]]; then UNKNOWN="${_domain} 目前指向"; break; fi
    [[ "$_cur" != "$TIP_URL" ]] || continue
    _info=$(deploy_info "$_cur")
    _cur_created="${_info%% *}"; _cur_target="${_info#* }"
    if [[ ! "$_cur_created" =~ ^[0-9]+$ || -z "$_cur_target" ]]; then UNKNOWN="${_domain} 目前建置（${_cur}）的資料"; break; fi
    if [[ "$_cur_target" == "production" && "$_cur_created" -gt "$TIP_CREATED" ]]; then
      NEWER_LIVE="${_domain}→${_cur}"
      break
    fi
  done
  if [[ -n "$UNKNOWN" ]]; then
    echo "  ↻ 讀不到${UNKNOWN}，先不促轉，5 秒後重試"
    sleep 5
    continue
  fi
  if [[ -n "$NEWER_LIVE" ]]; then
    echo "  ↻ ${NEWER_LIVE} 已是比 ${TIP:0:7} 更新的建置，不覆寫，重讀 main"
    sleep 5
    continue
  fi
  echo "▶ 三網域促轉到 ${TIP:0:7}：${TIP_URL}"
  for _domain in "${DOMAINS[@]}"; do
    if vercel alias set "https://$TIP_URL" "$_domain" >/dev/null 2>&1; then
      echo "  ✅ $_domain"
    else
      echo "⛔ $_domain 促轉失敗；正式站可能停在舊建置，手動：vercel alias set https://$TIP_URL $_domain"
      exit 1
    fi
  done
  MISMATCH=""
  for _domain in "${DOMAINS[@]}"; do
    _now=$(alias_target "$_domain")
    [[ "$_now" == "$TIP_URL" ]] || MISMATCH="${MISMATCH} ${_domain}→${_now:-讀不到}"
  done
  if [[ -z "$MISMATCH" && "$(remote_main)" == "$TIP" ]]; then
    echo "  ✅ 三網域都指向 ${TIP:0:7} 的建置"
    break
  fi
  echo "  ↻ 促轉後 main 又前進或網域指向不符（${MISMATCH:- main 已更新}），再對一次"
done

echo "▶ 正式站路徑驗收…"
VERIFY_FAIL=0
for _p in "/" "/offers.html" "/cases.html" "/skills.html" "/site-index.json" ${EXTRA_VERIFY[@]+"${EXTRA_VERIFY[@]}"}; do
  _code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 "https://jiangyude.com${_p}")
  if [[ "$_code" == "200" ]]; then
    echo "  ✅ ${_p} 200"
  else
    echo "  ❌ ${_p} ${_code}"
    VERIFY_FAIL=1
  fi
done

DRAFT_PATH=$(grep -E '^articles/.+/$' .vercelignore 2>/dev/null | head -1)
if [[ -n "$DRAFT_PATH" ]]; then
  _code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 "https://jiangyude.com/${DRAFT_PATH}")
  if [[ "$_code" == "404" ]]; then
    echo "  ✅ 擋板草稿仍 404（/${DRAFT_PATH}）"
  else
    echo "  ❌ 擋板草稿回 ${_code}，疑似擋板失效：/${DRAFT_PATH}"
    VERIFY_FAIL=1
  fi
fi

if [[ $VERIFY_FAIL -ne 0 ]]; then
  echo "⛔ 正式站驗收未全綠。回退：Vercel 後台 instant rollback 切回前一個 deployment，或 git revert 後再 push。"
  exit 1
fi

if [[ "$TIP" == "$PUBLISHED_SHA" ]]; then
  echo "🟢 發布完成：${TAG}，正式站就是本次 commit ${PUBLISHED_SHA:0:7}（回退用 Vercel instant rollback 或 git revert 再 push）"
else
  echo "🟢 發布完成：${TAG}，本次 commit ${PUBLISHED_SHA:0:7} 已包含在正式站的 ${TIP:0:7}（期間有較新的發布，一起上線）"
fi
