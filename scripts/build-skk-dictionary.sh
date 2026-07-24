#!/usr/bin/env bash

set -euo pipefail

readonly DOTFILES_ROOT="${HOME}/repos/github.com/kqnade/dotfiles"
readonly SKK_DIR="${HOME}/.skk"
readonly DICTIONARY="${SKK_DIR}/dictionary.yaskkserv2"

make_dictionary="$(mise -C "$DOTFILES_ROOT" which yaskkserv2_make_dictionary)"
sources=()
for name in L geo propernoun assoc JIS3_4 law; do
  source_file="${SKK_DIR}/SKK-JISYO.${name}"
  [[ -f "$source_file" ]] && sources+=("$source_file")
done

if ((${#sources[@]} == 0)); then
  printf 'No SKK dictionary sources found in %s.\n' "$SKK_DIR" >&2
  exit 1
fi

needs_rebuild=false
if [[ ! -f "$DICTIONARY" ]]; then
  needs_rebuild=true
else
  for source_file in "${sources[@]}"; do
    if [[ "$source_file" -nt "$DICTIONARY" ]]; then
      needs_rebuild=true
      break
    fi
  done
fi

if [[ "$needs_rebuild" == true ]]; then
  printf 'Building yaskkserv2 dictionary from %d sources.\n' "${#sources[@]}"
  "$make_dictionary" --dictionary-filename="$DICTIONARY" "${sources[@]}"
else
  printf 'yaskkserv2 dictionary is current.\n'
fi
