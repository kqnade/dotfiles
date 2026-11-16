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
taplo_bin="$("$MISE_BIN" -C "$DOTFILES_ROOT" which taplo)"
readonly taplo_bin

cd "$DOTFILES_ROOT"
"$taplo_bin" format mise.toml mise.work.toml mise/config.toml

for lockfile in mise.lock mise.work.lock; do
  formatted_lock="$(mktemp "${DOTFILES_ROOT}/.mise.lock.XXXXXX")"
  trap 'rm -f "$formatted_lock"' EXIT
  "$taplo_bin" format --stdin-filepath mise.lock - <"$lockfile" >"$formatted_lock"
  mv -f "$formatted_lock" "$lockfile"
done
trap - EXIT

printf 'Formatted mise manifests and lockfiles.\n'
