#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
readonly SCRIPT_DIR
# shellcheck source=scripts/lib/runtime.sh
source "$SCRIPT_DIR/lib/runtime.sh"

DOTFILES_ROOT="$(dotfiles_resolve_root)"
readonly DOTFILES_ROOT
readonly OP_ENV="$DOTFILES_ROOT/.op.env"

if [[ -f "$OP_ENV" ]]; then
  command -v op >/dev/null 2>&1 || dotfiles_die "1Password CLI is not installed"
  exec op run --env-file="$OP_ENV" -- "$SCRIPT_DIR/codex_usage_exporter.py"
fi

exec "$SCRIPT_DIR/codex_usage_exporter.py"
