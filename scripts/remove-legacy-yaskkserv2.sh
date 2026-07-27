#!/usr/bin/env bash

set -euo pipefail

case "$(uname -s)" in
  Darwin)
    domain="gui/$(id -u)"
    launchctl bootout "${domain}/com.user.yaskkserv2" >/dev/null 2>&1 || true
    legacy_plist="${HOME}/Library/LaunchAgents/com.user.yaskkserv2.plist"
    [[ ! -e "$legacy_plist" ]] || rm -f "$legacy_plist"
    ;;
  Linux)
    if systemctl --user show-environment >/dev/null 2>&1; then
      systemctl --user disable --now yaskkserv2.service >/dev/null 2>&1 || true
    fi
    legacy_unit="${HOME}/.config/systemd/user/yaskkserv2.service"
    if [[ -e "$legacy_unit" ]]; then
      rm -f "$legacy_unit"
      systemctl --user daemon-reload >/dev/null 2>&1 || true
    fi
    ;;
esac
