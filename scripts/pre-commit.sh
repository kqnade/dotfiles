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

tmp_dir="$(mktemp -d "${TMPDIR:-/tmp}/dotfiles-pre-commit.XXXXXX")"
readonly tmp_dir
trap 'rm -rf "$tmp_dir"' EXIT

cd "$DOTFILES_ROOT"
failures=0
while IFS= read -r -d '' staged_file; do
  git show ":${staged_file}" >"$tmp_dir/staged"
  if ! "$taplo_bin" format \
    --stdin-filepath "$staged_file" \
    - <"$tmp_dir/staged" >"$tmp_dir/formatted"; then
    printf 'error: Taplo could not format staged %s.\n' "$staged_file" >&2
    failures=$((failures + 1))
    continue
  fi
  if ! cmp -s "$tmp_dir/staged" "$tmp_dir/formatted"; then
    printf 'error: staged %s is not formatted by Taplo.\n' "$staged_file" >&2
    failures=$((failures + 1))
  fi
done < <(
  git diff --cached \
    --name-only \
    --diff-filter=ACMR \
    -z \
    -- \
    mise.toml \
    mise/config.toml \
    mise.lock
)

if ((failures > 0)); then
  printf "Run 'mise run format', stage the result, and commit again.\n" >&2
  exit 1
fi
