# 这个文件在 Bash 启动时被 `source`，用于给 `openclaw` 提供一个“同名轻包装”。
#
# 目标是：
# - 你仍然直接输入 `openclaw models auth login --provider openai-codex`
# - 不改变原有命令习惯
# - 只在这一个目标命令上，自动注入 `NODE_OPTIONS=--import=...`
# - 其他 `openclaw` 命令默认保持原样
#
# 这样做可以把修复逻辑稳定地留在 `~/.openclaw/local-overrides/`，
# 又不需要修改全局安装的 `openclaw` 包内容。

# 防止同一 shell 会话里被重复 `source` 多次。
if [[ -n "${__OPENCLAW_OPENAI_CODEX_AUTH_PROXY_INIT_LOADED:-}" ]]; then
  return 0
fi
__OPENCLAW_OPENAI_CODEX_AUTH_PROXY_INIT_LOADED=1

# 记录当前目录，便于后续构造 preload 文件路径。
__openclaw_openai_codex_auth_proxy_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# 根据当前脚本位置反推出 `OPENCLAW_HOME`。
# 当前文件应位于：
# `<OPENCLAW_HOME>/local-overrides/openai-codex-auth-proxy/bash-init.bash`
__openclaw_openai_codex_auth_proxy_home="$(cd "${__openclaw_openai_codex_auth_proxy_dir}/../.." && pwd)"

# 这是正式交付的 preload 文件路径。
__openclaw_openai_codex_auth_proxy_preload_path="${__openclaw_openai_codex_auth_proxy_dir}/env-proxy-preload.mjs"

# 正式日志路径。shell 包装层和 preload 层都往同一份日志里写，便于串联一次请求的全过程。
__openclaw_openai_codex_auth_proxy_log_path="${__openclaw_openai_codex_auth_proxy_home}/logs/local-overrides/openai-codex-auth-proxy.log"

_openclaw_openai_codex_auth_proxy_log() {
  local event="$1"
  shift || true

  mkdir -p "$(dirname "${__openclaw_openai_codex_auth_proxy_log_path}")" 2>/dev/null || true

  # 这里直接写 JSON Lines，后续按时间 grep 或 jq 都方便。
  printf '{"time":"%s","source":"bash-init","event":"%s","pid":%s,"args":"%s"}\n' \
    "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" \
    "${event}" \
    "$$" \
    "$*" >> "${__openclaw_openai_codex_auth_proxy_log_path}" 2>/dev/null || true
}

_openclaw_openai_codex_auth_proxy_resolve_real_bin() {
  # `type -P` 会优先返回 PATH 里真实可执行文件路径，不会把 shell function 当成结果。
  type -P openclaw 2>/dev/null || true
}

# 在定义函数前先解析真实二进制，避免之后被同名函数遮蔽。
__OPENCLAW_OPENAI_CODEX_AUTH_PROXY_REAL_BIN="$(_openclaw_openai_codex_auth_proxy_resolve_real_bin)"

_openclaw_openai_codex_auth_proxy_matches_target() {
  # 只匹配这一个目标命令：
  # `openclaw models auth login --provider openai-codex`
  #
  # 这里采取“宽匹配子命令 + 严格匹配 provider”的方式：
  # - 参数里必须出现 `models`、`auth`、`login`
  # - provider 必须显式是 `openai-codex`
  local has_models=0
  local has_auth=0
  local has_login=0
  local provider=""
  local index=1
  local args=("$@")

  for arg in "${args[@]}"; do
    case "${arg}" in
      models)
        has_models=1
        ;;
      auth)
        has_auth=1
        ;;
      login)
        has_login=1
        ;;
      --provider=openai-codex)
        provider="openai-codex"
        ;;
      --provider=*)
        provider="${arg#--provider=}"
        ;;
      --provider)
        if (( index < ${#args[@]} )); then
          provider="${args[$index]}"
        fi
        ;;
    esac
    ((index++))
  done

  [[ "${has_models}" -eq 1 && "${has_auth}" -eq 1 && "${has_login}" -eq 1 && "${provider}" == "openai-codex" ]]
}

_openclaw_openai_codex_auth_proxy_build_node_options() {
  # 在不破坏已有 `NODE_OPTIONS` 的前提下，追加本次需要的 `--import=...`。
  # 如果当前值里已经包含同一个 import，则直接复用，避免重复注入。
  local import_flag="--import=${__openclaw_openai_codex_auth_proxy_preload_path}"
  local current="${NODE_OPTIONS:-}"

  if [[ " ${current} " == *" ${import_flag} "* ]]; then
    printf '%s' "${current}"
    return 0
  fi

  if [[ -n "${current}" ]]; then
    printf '%s %s' "${current}" "${import_flag}"
  else
    printf '%s' "${import_flag}"
  fi
}

openclaw() {
  # 这个函数是同名轻包装：
  # - 非目标命令：直接透传到真实 `openclaw`
  # - 目标登录命令：临时注入 preload，再执行真实 `openclaw`
  local real_bin="${__OPENCLAW_OPENAI_CODEX_AUTH_PROXY_REAL_BIN}"

  if [[ -z "${real_bin}" || ! -x "${real_bin}" ]]; then
    _openclaw_openai_codex_auth_proxy_log "real_bin_missing" "$*"
    printf 'openclaw wrapper error: real binary not found\n' >&2
    return 127
  fi

  # 提供一个紧急逃生开关。设置后可完全绕过包装层。
  if [[ "${OPENCLAW_PROXY_PRELOAD_DISABLE:-}" == "1" ]]; then
    command "${real_bin}" "$@"
    return $?
  fi

  if _openclaw_openai_codex_auth_proxy_matches_target "$@"; then
    local node_options
    node_options="$(_openclaw_openai_codex_auth_proxy_build_node_options)"

    _openclaw_openai_codex_auth_proxy_log "inject_preload" "$*"

    NODE_OPTIONS="${node_options}" \
    OPENCLAW_PROXY_PRELOAD_LOG_PATH="${__openclaw_openai_codex_auth_proxy_log_path}" \
    command "${real_bin}" "$@"
    return $?
  fi

  command "${real_bin}" "$@"
}
