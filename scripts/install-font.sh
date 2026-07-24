#!/usr/bin/env bash

set -euo pipefail

readonly FONT_VERSION="2.2.0"
readonly FONT_SHA256="45faeef7b5d8bc591bcc5887a2ca0c5fb9028066f18a5a52cd6f10b7d655ba37"
readonly FONT_URL="https://github.com/yuru7/udev-gothic/releases/download/v${FONT_VERSION}/UDEVGothic_NF_v${FONT_VERSION}.zip"

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
if [[ -f "$marker" ]] && [[ "$(<"$marker")" == "$FONT_VERSION" ]]; then
  printf 'UDEV Gothic NF %s is already installed.\n' "$FONT_VERSION"
  exit 0
fi

tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"' EXIT

curl -fsSL "$FONT_URL" -o "$tmp_dir/font.zip"
if command -v sha256sum >/dev/null 2>&1; then
  printf '%s  %s\n' "$FONT_SHA256" "$tmp_dir/font.zip" | sha256sum -c -
else
  printf '%s  %s\n' "$FONT_SHA256" "$tmp_dir/font.zip" | shasum -a 256 -c -
fi
unzip -q "$tmp_dir/font.zip" -d "$tmp_dir/font"

mkdir -p "$font_dir"
find "$font_dir" -maxdepth 1 -type f -name 'UDEVGothic*.ttf' -delete
find "$tmp_dir/font" -type f -name 'UDEVGothic*.ttf' -exec cp {} "$font_dir/" \;
printf '%s\n' "$FONT_VERSION" >"$marker"

if [[ "$(uname -s)" == Linux ]]; then
  fc-cache -f "$font_dir" >/dev/null
fi

printf 'Installed UDEV Gothic NF %s into %s.\n' "$FONT_VERSION" "$font_dir"
