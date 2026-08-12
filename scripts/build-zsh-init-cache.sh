#!/usr/bin/env bash

set -euo pipefail

zsh_cache_dir="${XDG_CACHE_HOME:-$HOME/.cache}/zsh"
readonly zsh_cache_dir
zsh_cache_file="$zsh_cache_dir/generated-init.zsh"
readonly zsh_cache_file

mkdir -p "$zsh_cache_dir"

sheldon lock
zsh_cache_tmp="$(mktemp "$zsh_cache_dir/generated-init.zsh.XXXXXX")"
readonly zsh_cache_tmp
trap 'rm -f "$zsh_cache_tmp"' EXIT

{
  sheldon source
  starship init zsh
  zoxide init zsh --cmd cd
  atuin init zsh
} >"$zsh_cache_tmp"

mv "$zsh_cache_tmp" "$zsh_cache_file"
trap - EXIT
