#!/usr/bin/env bash

set -euo pipefail

readonly DOTFILES_ROOT="${HOME}/repos/github.com/kqnade/dotfiles"

bash "$DOTFILES_ROOT/scripts/apply.sh"
bash "$DOTFILES_ROOT/scripts/install-font.sh"
bash "$DOTFILES_ROOT/scripts/build-skk-dictionary.sh"
bash "$DOTFILES_ROOT/scripts/configure-herdr.sh"

case "$(uname -s)" in
  Darwin)
    mise -C "$DOTFILES_ROOT" bootstrap macos launchd-agents apply --yes
    ;;
  Linux)
    if systemctl --user show-environment >/dev/null 2>&1; then
      mise -C "$DOTFILES_ROOT" bootstrap linux systemd-units apply --yes
    else
      printf 'systemd user manager is unavailable; yaskkserv2 was not started.\n' >&2
      exit 1
    fi
    ;;
esac
