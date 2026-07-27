#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
readonly SCRIPT_DIR
# shellcheck source=scripts/lib/runtime.sh
source "$SCRIPT_DIR/lib/runtime.sh"

DOTFILES_ROOT="$(dotfiles_resolve_root)"
readonly DOTFILES_ROOT
export DOTFILES_ROOT

dotfiles_supported_platform ||
  dotfiles_die "unsupported platform $(uname -s)/$(uname -m)"

bash "$SCRIPT_DIR/apply.sh"
bash "$SCRIPT_DIR/install-font.sh"
bash "$SCRIPT_DIR/build-skk-dictionary.sh"
bash "$SCRIPT_DIR/configure-herdr.sh"

if [[ "${DOTFILES_SKIP_SERVICE_HEALTH:-0}" != 1 ]]; then
  dotfiles_log "Waiting for yaskkserv2 on 127.0.0.1:1178."
  dotfiles_wait_for_port 127.0.0.1 1178 30 ||
    dotfiles_die "yaskkserv2 did not start on 127.0.0.1:1178"
fi
