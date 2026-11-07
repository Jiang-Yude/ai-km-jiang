# 部署用的工具路徑（2026-11-07 立）。由 check-deploy-env.sh、publish.sh、merge-publish.sh 以 source 引入。
# 立因：Mac mini 的 AI 對話 shell 沒載入終端機設定，找不到 wrangler，部署直接失敗；終端機卻正常。
# 做法：把常見安裝位置加到 PATH 前面。兩台電腦裝法不同（筆電在 nvm，桌機在 ~/.npm-global），都涵蓋。
_dp_major="$(cat "$(dirname "${BASH_SOURCE[0]}")/../.nvmrc" 2>/dev/null || echo 22)"
_dp_node="$(ls -d "${HOME}/.nvm/versions/node/v${_dp_major}."*/bin 2>/dev/null | sort -V | tail -1 || true)"
for _dp_dir in /usr/local/bin /opt/homebrew/bin "${HOME}/.npm-global/bin" "${_dp_node}"; do
  if [[ -n "${_dp_dir}" && -d "${_dp_dir}" ]]; then
    case ":${PATH}:" in
      *":${_dp_dir}:"*) PATH="${_dp_dir}:${PATH//${_dp_dir}:/}" ;;
      *) PATH="${_dp_dir}:${PATH}" ;;
    esac
  fi
done
export PATH
unset _dp_major _dp_node _dp_dir
