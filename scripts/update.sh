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

cd "$DOTFILES_ROOT"
"$MISE_BIN" upgrade --bump --local --yes
"$MISE_BIN" lock --platform macos-arm64,macos-x64,linux-x64 --yes

taplo_bin="$("$MISE_BIN" which taplo)"
"$taplo_bin" format mise.toml
formatted_lock="$(mktemp "${DOTFILES_ROOT}/.mise.lock.XXXXXX")"
trap 'rm -f "$formatted_lock"' EXIT
"$taplo_bin" format --stdin-filepath mise.lock - <mise.lock >"$formatted_lock"
mv -f "$formatted_lock" mise.lock
trap - EXIT

printf 'Updated tool pins and mise.lock. Review both files before committing.\n'
