#!/usr/bin/env bash

set -euo pipefail

readonly DOTFILES_ROOT="${HOME}/repos/github.com/kqnade/dotfiles"

[[ -d "$DOTFILES_ROOT" ]] || {
  printf 'dotfiles checkout not found: %s\n' "$DOTFILES_ROOT" >&2
  exit 1
}

chezmoi init --source "$DOTFILES_ROOT"
chezmoi --source "$DOTFILES_ROOT" apply
