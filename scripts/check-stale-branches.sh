#!/bin/bash
# 未上線分支盤點（2026-08-31 立，事故驅動）
#
# 立因：2026-08-19 修好「hero 封面圖可被讀者拖走」的 commit 0a56363 停在分支
# infra/hero-image-no-drag，從沒 merge、沒部署，main 上的問題原封不動十二天，
# 江江 8/31 在課程頁第二次抓到同一個問題。
#
# 為什麼會被埋掉：那張卡當初留在官網看板的「🔧 施工中掛牌」區，
# 掛牌區是給人看「現在誰在動 repo」、會一直往下長，不是待辦佇列；
# 日記的「待追的事」也沒有任何引擎會回頭讀。
# 「修好了」跟「上線了」中間沒有任何東西在看，這支就是補那個缺口。
#
# 它不擋任何人的發布（跟 daily-health-check 其他項一樣是巡檢），
# 只負責把「有 commit 但沒進 main」的分支撈出來，讓人決定要上線還是要刪。
#
# 分兩層報，不是每天把存量整包重印（2026-08-31 Codex 跨家審指出會告警疲勞、
# 讓巡檢長期紅字，反而蓋掉其他真紅項）：
#   - 「本週新跨線」（剛滿門檻、還沒被看過的）：列明細，會讓巡檢紅字，要當天處理掉。
#   - 「存量」（早就超過門檻的）：平日只報一行總數不紅字；每週一列完整清單。
# 用法：bash scripts/check-stale-branches.sh [天數門檻，預設 7] [--full 強制列完整清單]
#   exit 0＝沒有新跨線的分支；exit 1＝有新跨線，要當天給下落；exit 2＝這一項沒跑完（不在 repo 裡）

set -uo pipefail
export LC_ALL=zh_TW.UTF-8
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

THRESHOLD_DAYS="${1:-7}"
FULL=0
[ "${2:-}" = "--full" ] && FULL=1
# 每週一列完整清單（date +%u：1=週一）
[ "$(TZ=Asia/Taipei date +%u)" = "1" ] && FULL=1
NOW=$(date +%s)
FOUND=0

# 先確認真的在 repo 裡。少了這道，git 全部失敗時下面會一條分支都撈不到，
# 印出「沒有超過 N 天的未合併分支」＝假全綠（2026-08-31 測試時實際踩到）。
if ! git rev-parse --git-dir >/dev/null 2>&1; then
  echo "  ⚠️  這裡不是 git repo（REPO_ROOT=${REPO_ROOT}），這一項沒跑完，不算全綠"
  exit 2
fi

git fetch -q origin 2>/dev/null || echo "  ⚠️  fetch 失敗，以本機已知狀態判斷"

# 本機與遠端分支一起看：本機分支沒 push 換機就拿不到，遠端分支沒 merge 就是沒上線
BRANCHES=$( { git for-each-ref --format='%(refname:short)' refs/heads/;
              git for-each-ref --format='%(refname:short)' refs/remotes/origin/; } \
            | grep -v -E '^(main|origin/main|origin/HEAD)$' | sort -u )

NEW=()      # 剛跨過門檻（門檻 ~ 門檻+1 天），還沒被報過
BACKLOG=()  # 存量，早就超過門檻
for b in $BRANCHES; do
  # 已經合併進 main 的略過
  if git merge-base --is-ancestor "$b" origin/main 2>/dev/null; then continue; fi
  ts=$(git log -1 --format=%ct "$b" 2>/dev/null) || continue
  age=$(( (NOW - ts) / 86400 ))
  [ "$age" -lt "$THRESHOLD_DAYS" ] && continue
  pushed="未 push（換機拿不到）"
  git show-ref -q --verify "refs/remotes/origin/${b#origin/}" 2>/dev/null && pushed="已 push"
  subj=$(git log -1 --format=%s "$b")
  # 用 bash 字元切片，不用 cut -c（macOS 的 cut 是切位元組，中文會被切一半變亂碼）
  [ "${#subj}" -gt 28 ] && subj="${subj:0:28}…"
  line="$(printf '    - %-42s %3s 天前  %s  %s' "$b" "$age" "$pushed" "$subj")"
  if [ "$age" -lt $(( THRESHOLD_DAYS + 1 )) ]; then
    NEW+=("$line"); FOUND=1
  else
    BACKLOG+=("$line")
  fi
done

if [ "${#NEW[@]}" -gt 0 ]; then
  echo "  ${#NEW[@]} 條分支本週剛滿 ${THRESHOLD_DAYS} 天還沒進 main，今天要給下落："
  printf '%s\n' "${NEW[@]}"
  echo "    上線走 merge-publish.sh，不上線就刪分支；等江江拍板的卡片放「🚀 待部署」，不是「🔧 施工中掛牌」區。"
fi

if [ "${#BACKLOG[@]}" -gt 0 ]; then
  if [ "$FULL" -eq 1 ]; then
    echo "  存量：另有 ${#BACKLOG[@]} 條早就超過 ${THRESHOLD_DAYS} 天（每週一列完整清單）："
    printf '%s\n' "${BACKLOG[@]}"
    echo "    存量不算紅項，但每條都要有下落，別讓它一直長。"
  else
    echo "  存量：另有 ${#BACKLOG[@]} 條早就超過 ${THRESHOLD_DAYS} 天（不算紅項；每週一列完整清單，或跑 --full）"
  fi
fi

if [ "$FOUND" -eq 0 ]; then
  [ "${#BACKLOG[@]}" -eq 0 ] && echo "  沒有超過 ${THRESHOLD_DAYS} 天的未合併分支"
  exit 0
fi
exit 1
