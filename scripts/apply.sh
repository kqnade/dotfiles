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

chezmoi init --source "$DOTFILES_ROOT"
chezmoi --source "$DOTFILES_ROOT" apply
"$MISE_BIN" -C "$DOTFILES_ROOT" reshim
# shellcheck source=/dev/null
source "$HOME/.config/dotfiles/client-runtime.sh"
if [[ "$DOTFILES_CLAUDE_WORK_ENABLED" == true ]]; then
  "$MISE_BIN" trust "$DOTFILES_ROOT/mise.work.toml"
  "$MISE_BIN" -C "$DOTFILES_ROOT" -E work install --locked claude
fi
bash "$SCRIPT_DIR/remove-retired-agent-services.sh"
bash "$SCRIPT_DIR/build-zsh-init-cache.sh"
bash "$SCRIPT_DIR/build-skk-dictionary.sh"
apply_managed_services
