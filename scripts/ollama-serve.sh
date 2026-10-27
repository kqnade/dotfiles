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
ollama="$("$MISE_BIN" -C "$DOTFILES_ROOT" which ollama)"
export OLLAMA_HOST=127.0.0.1:11434
export OLLAMA_CONTEXT_LENGTH=131072
exec "$ollama" serve
