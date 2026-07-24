#!/usr/bin/env bash

set -uo pipefail

readonly DOTFILES_ROOT="${HOME}/repos/github.com/kqnade/dotfiles"
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
  [[ -z "$(mise -C "$DOTFILES_ROOT" ls --current --missing --no-header 2>/dev/null)" ]]
}

dotfiles_ok() {
  [[ -z "$(chezmoi --source "$DOTFILES_ROOT" diff --exclude=externals)" ]]
}

font_ok() {
  case "$(uname -s)" in
    Darwin)
      compgen -G "${HOME}/Library/Fonts/UDEVGothic*.ttf" >/dev/null
      ;;
    Linux)
      fc-list 2>/dev/null | grep -qi udevgothic
      ;;
  esac
}

service_ok() {
  case "$(uname -s)" in
    Darwin)
      mise -C "$DOTFILES_ROOT" bootstrap macos launchd-agents status --missing >/dev/null
      ;;
    Linux)
      mise -C "$DOTFILES_ROOT" bootstrap linux systemd-units status --missing >/dev/null
      ;;
  esac
}

run_check "mise installation" mise doctor
run_check "tool pins installed" tools_ok
run_check "system packages" mise -C "$DOTFILES_ROOT" bootstrap packages status --missing
run_check "chezmoi state" dotfiles_ok
run_check "UDEV Gothic" font_ok
run_check "SKK dictionary" test -s "${HOME}/.skk/dictionary.yaskkserv2"
run_check "yaskkserv2 service" service_ok

exit "$failures"
