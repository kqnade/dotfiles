#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
readonly SCRIPT_DIR
# shellcheck source=scripts/lib/runtime.sh
source "$SCRIPT_DIR/lib/runtime.sh"

DOTFILES_ROOT="$(dotfiles_resolve_root)"
readonly DOTFILES_ROOT
export DOTFILES_ROOT

MISE_BIN="$(dotfiles_mise_bin)"
readonly MISE_BIN

load_new_relic_license_key() {
  [[ -z "${NEW_RELIC_LICENSE_KEY:-}" ]] || return 0

  if [[ "${CI:-}" == true ]]; then
    dotfiles_log "Skipping 1Password telemetry key lookup in CI."
    return
  fi

  local op_bin
  op_bin="$(command -v op)" ||
    dotfiles_die "1Password CLI is required to load the New Relic key"

  local op_ref="${NEW_RELIC_LICENSE_KEY_OP_REF:-op://Personal/j465rncuz4fcf2rc7aogcosypi/credential}"
  NEW_RELIC_LICENSE_KEY="$("$op_bin" read "$op_ref")" ||
    dotfiles_die "failed to load the New Relic key from 1Password"
  [[ -n "$NEW_RELIC_LICENSE_KEY" ]] ||
    dotfiles_die "1Password returned an empty New Relic key"
  export NEW_RELIC_LICENSE_KEY
}

apply_managed_services() {
  case "$(uname -s)" in
    Darwin)
      "$MISE_BIN" -C "$DOTFILES_ROOT" \
        bootstrap macos launchd-agents apply --yes
      ;;
    Linux)
      if dotfiles_systemd_user_available; then
        "$MISE_BIN" -C "$DOTFILES_ROOT" \
          bootstrap linux systemd-units apply --yes
      fi
      ;;
  esac
}

load_new_relic_license_key
chezmoi init --source "$DOTFILES_ROOT"
chezmoi --source "$DOTFILES_ROOT" apply
bash "$SCRIPT_DIR/build-zsh-init-cache.sh"
apply_managed_services
