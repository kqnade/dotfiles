#!/usr/bin/env bash

set -euo pipefail

[[ "$(uname -s)" == Darwin ]] || exit 0

screenshot_dir="${HOME}/Downloads/Screenshots"
mkdir -p "$screenshot_dir"
defaults write com.apple.screencapture location -string "$screenshot_dir"

finder_plist="${HOME}/Library/Preferences/com.apple.finder.plist"
if [[ -f "$finder_plist" ]]; then
  /usr/libexec/PlistBuddy \
    -c "Set :FK_DefaultIconViewSettings:arrangeBy name" \
    "$finder_plist" 2>/dev/null || true
fi

chflags nohidden "${HOME}/Library"

killall Dock 2>/dev/null || true
killall Finder 2>/dev/null || true
killall SystemUIServer 2>/dev/null || true
