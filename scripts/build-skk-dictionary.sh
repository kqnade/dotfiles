#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
readonly SCRIPT_DIR
# shellcheck source=scripts/lib/runtime.sh
source "$SCRIPT_DIR/lib/runtime.sh"

DOTFILES_ROOT="$(dotfiles_resolve_root)"
readonly DOTFILES_ROOT
export DOTFILES_ROOT

readonly SKK_DIR="${HOME}/.skk"
readonly DICTIONARY="${SKK_DIR}/dictionary.yaskkserv2"

MISE_BIN="$(dotfiles_mise_bin)"
readonly MISE_BIN
make_dictionary="$("$MISE_BIN" -C "$DOTFILES_ROOT" which yaskkserv2_make_dictionary)"
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
  mkdir -p "$SKK_DIR"
  dictionary_tmp_dir="$(mktemp -d "${SKK_DIR}/.dictionary.yaskkserv2.XXXXXX")"
  temporary_dictionary="${dictionary_tmp_dir}/dictionary.yaskkserv2"
  trap 'rm -rf "$dictionary_tmp_dir"' EXIT
  printf 'Building yaskkserv2 dictionary from %d sources.\n' "${#sources[@]}"
  "$make_dictionary" \
    --dictionary-filename="$temporary_dictionary" \
    "${sources[@]}"
  [[ -s "$temporary_dictionary" ]] ||
    dotfiles_die "yaskkserv2 generated an empty dictionary"
  mv -f "$temporary_dictionary" "$DICTIONARY"
  rmdir "$dictionary_tmp_dir"
  trap - EXIT
else
  printf 'yaskkserv2 dictionary is current.\n'
fi
