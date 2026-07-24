#!/usr/bin/env bash

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
readonly SCRIPT_DIR
# shellcheck source=scripts/lib/runtime.sh
source "$SCRIPT_DIR/lib/runtime.sh"

DOTFILES_ROOT="$(dotfiles_resolve_root)"
readonly DOTFILES_ROOT
export DOTFILES_ROOT

MISE_BIN="$(dotfiles_mise_bin)"
readonly MISE_BIN
failures=0

check() {
  local label="$1"
  shift
  printf '%-12s %s\n' "[$label]" "$*"
}

run_check() {
  local label="$1"
  shift
  if "$@"; then
    check "ok" "$label"
  else
    check "failed" "$label"
    failures=$((failures + 1))
  fi
}

tools_ok() {
  [[ -z "$("$MISE_BIN" -C "$DOTFILES_ROOT" ls --current --missing --no-header 2>/dev/null)" ]]
}

dotfiles_ok() {
  [[ -z "$(chezmoi --source "$DOTFILES_ROOT" diff --exclude=externals)" ]]
}

font_ok() {
  case "$(uname -s)" in
    Darwin)
      find "${HOME}/Library/Fonts" \
        -maxdepth 1 -type f -name 'UDEVGothic*.ttf' -print -quit |
        grep -q .
      ;;
    Linux)
      fc-list 2>/dev/null | grep -qi udevgothic
      ;;
  esac
}

service_ok() {
  case "$(uname -s)" in
    Darwin)
      "$MISE_BIN" -C "$DOTFILES_ROOT" \
        bootstrap macos launchd-agents status --missing >/dev/null
      ;;
    Linux)
      dotfiles_systemd_user_available &&
        "$MISE_BIN" -C "$DOTFILES_ROOT" \
          bootstrap linux systemd-units status --missing >/dev/null
      ;;
  esac
}

wsl_proxies_ok() {
  local command_name
  for command_name in op ssh ssh-add; do
    [[ -x "${HOME}/.local/bin/${command_name}" ]] || return 1
    command -v "${command_name}.exe" >/dev/null 2>&1 || return 1
  done
}

run_check "supported platform" dotfiles_supported_platform
run_check "mise installation" "$MISE_BIN" doctor
run_check "tool pins installed" tools_ok
run_check "system packages" "$MISE_BIN" -C "$DOTFILES_ROOT" \
  bootstrap packages status --missing
run_check "chezmoi state" dotfiles_ok
run_check "UDEV Gothic" font_ok
run_check "SKK dictionary" test -s "${HOME}/.skk/dictionary.yaskkserv2"
run_check "yaskkserv2 service" service_ok
run_check "yaskkserv2 port" dotfiles_port_open 127.0.0.1 1178
if dotfiles_is_wsl; then
  run_check "WSL proxies" wsl_proxies_ok
fi

exit "$failures"
