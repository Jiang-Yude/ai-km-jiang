# 課後頁放行證據的位置，只在這裡決定（2026-11-07 切換，兩台電腦都同步得到新位置）。
# 退回做法：把 NEW 那行改成舊位置，或部署時自己指定 SAFE_DEPLOY_POSTCLASS_EVIDENCE_DIR。
# 檢查規則不在這裡，一樣由課後關卡檢查器驗雜湊與異家審查；這裡只決定去哪個資料夾讀。
_POSTCLASS_VAULT="$HOME/Library/Mobile Documents/iCloud~md~obsidian/Documents/江昱德 主知識庫"
_POSTCLASS_NEW="${_POSTCLASS_VAULT}/_agent/tools/site-publish-queue/postclass-evidence"
_POSTCLASS_OLD="${_POSTCLASS_VAULT}/_agent/tmp/2026-10-06 歷史課後頁放行"
if [[ -z "${SAFE_DEPLOY_POSTCLASS_EVIDENCE_DIR:-}" ]]; then
  if [[ -d "$_POSTCLASS_NEW" ]]; then
    export SAFE_DEPLOY_POSTCLASS_EVIDENCE_DIR="$_POSTCLASS_NEW"
  else
    export SAFE_DEPLOY_POSTCLASS_EVIDENCE_DIR="$_POSTCLASS_OLD"
  fi
fi
