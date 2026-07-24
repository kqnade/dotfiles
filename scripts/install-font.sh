#!/usr/bin/env bash

set -euo pipefail

readonly FONT_VERSION="2.2.0"
readonly FONT_SHA256="45faeef7b5d8bc591bcc5887a2ca0c5fb9028066f18a5a52cd6f10b7d655ba37"
readonly FONT_URL="https://github.com/yuru7/udev-gothic/releases/download/v${FONT_VERSION}/UDEVGothic_NF_v${FONT_VERSION}.zip"

font_exists() {
  find "$font_dir" \
    -maxdepth 1 -type f -name 'UDEVGothic*.ttf' -print -quit 2>/dev/null |
    grep -q .
}

case "$(uname -s)" in
  Darwin)
    font_dir="${HOME}/Library/Fonts"
    ;;
  Linux)
    font_dir="${HOME}/.local/share/fonts"
    ;;
  *)
    exit 0
    ;;
esac

marker="${font_dir}/.udev-gothic-nf-version"
if [[ -f "$marker" ]] &&
  [[ "$(<"$marker")" == "$FONT_VERSION" ]] &&
  font_exists; then
  printf 'UDEV Gothic NF %s is already installed.\n' "$FONT_VERSION"
  exit 0
fi

tmp_dir="$(mktemp -d)"
staged_fonts=()
cleanup() {
  local staged_font
  rm -rf "$tmp_dir"
  for staged_font in "${staged_fonts[@]}"; do
    rm -f "$staged_font"
  done
  rm -f "${marker}.new"
}
trap cleanup EXIT

curl -fsSL "$FONT_URL" -o "$tmp_dir/font.zip"
if command -v sha256sum >/dev/null 2>&1; then
  printf '%s  %s\n' "$FONT_SHA256" "$tmp_dir/font.zip" | sha256sum -c -
else
  printf '%s  %s\n' "$FONT_SHA256" "$tmp_dir/font.zip" | shasum -a 256 -c -
fi
unzip -q "$tmp_dir/font.zip" -d "$tmp_dir/font"

font_sources=()
while IFS= read -r -d '' font_source; do
  font_sources+=("$font_source")
done < <(find "$tmp_dir/font" -type f -name 'UDEVGothic*.ttf' -print0)
((${#font_sources[@]} > 0)) || {
  printf 'No UDEV Gothic font files were found in the release archive.\n' >&2
  exit 1
}

mkdir -p "$font_dir"
for font_source in "${font_sources[@]}"; do
  font_name="${font_source##*/}"
  staged_font="${font_dir}/.${font_name}.new"
  cp "$font_source" "$staged_font"
  chmod 0644 "$staged_font"
  staged_fonts+=("$staged_font")
done

find "$font_dir" -maxdepth 1 -type f -name 'UDEVGothic*.ttf' -delete
for staged_font in "${staged_fonts[@]}"; do
  font_name="${staged_font##*/.}"
  mv -f "$staged_font" "${font_dir}/${font_name%.new}"
done

marker_tmp="${marker}.new"
printf '%s\n' "$FONT_VERSION" >"$marker_tmp"
mv -f "$marker_tmp" "$marker"

if [[ "$(uname -s)" == Linux ]]; then
  fc-cache -f "$font_dir" >/dev/null
fi

printf 'Installed UDEV Gothic NF %s into %s.\n' "$FONT_VERSION" "$font_dir"
