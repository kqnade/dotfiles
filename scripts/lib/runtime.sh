#!/usr/bin/env bash

# Shared runtime helpers for the dotfiles bootstrap scripts.

dotfiles_die() {
  printf 'error: %s\n' "$*" >&2
  exit 1
}

dotfiles_log() {
  printf '==> %s\n' "$*"
}

dotfiles_resolve_root() {
  local candidate

  if [[ -n "${DOTFILES_ROOT:-}" ]]; then
    candidate="$DOTFILES_ROOT"
  else
    candidate="$(cd "$(dirname "${BASH_SOURCE[1]}")/.." && pwd -P)"
  fi

  [[ -f "$candidate/mise.toml" ]] ||
    dotfiles_die "dotfiles checkout not found at $candidate"
  (
    cd "$candidate" || exit
    pwd -P
  )
}

dotfiles_mise_bin() {
  if command -v mise >/dev/null 2>&1; then
    command -v mise
  elif [[ -x "${HOME}/.local/bin/mise" ]]; then
    printf '%s\n' "${HOME}/.local/bin/mise"
  else
    dotfiles_die "mise is not installed"
  fi
}

dotfiles_supported_platform() {
  case "$(uname -s):$(uname -m)" in
    Darwin:arm64 | Darwin:x86_64 | Linux:x86_64) return 0 ;;
    *) return 1 ;;
  esac
}

dotfiles_is_wsl() {
  [[ "$(uname -s)" == Linux ]] || return 1
  [[ -r /proc/sys/kernel/osrelease ]] || return 1
  grep -qi microsoft /proc/sys/kernel/osrelease
}

dotfiles_systemd_user_available() {
  [[ "$(uname -s)" == Linux ]] || return 1
  command -v systemctl >/dev/null 2>&1 || return 1
  systemctl --user show-environment >/dev/null 2>&1
}

dotfiles_port_open() {
  local host="${1:?host is required}"
  local port="${2:?port is required}"
  (
    exec 3<>"/dev/tcp/${host}/${port}"
    exec 3>&-
    exec 3<&-
  ) >/dev/null 2>&1
}

dotfiles_wait_for_port() {
  local host="${1:?host is required}"
  local port="${2:?port is required}"
  local attempts="${3:-30}"
  local attempt

  for ((attempt = 1; attempt <= attempts; attempt++)); do
    dotfiles_port_open "$host" "$port" && return 0
    sleep 1
  done
  return 1
}
