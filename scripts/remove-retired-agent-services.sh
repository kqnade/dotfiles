#!/usr/bin/env bash

set -euo pipefail

case "$(uname -s)" in
  Darwin)
    for name in codex-usage-exporter ollama; do
      plist="$HOME/Library/LaunchAgents/dev.mise.${name}.plist"
      [[ -e "$plist" ]] || continue
      service="gui/$(id -u)/dev.mise.${name}"
      if launchctl print "$service" >/dev/null 2>&1; then
        launchctl bootout "$service"
      else
        result=$?
        # launchctl returns 113 when the service is not loaded.
        [[ "$result" == 113 ]] || exit "$result"
      fi
      rm -f "$plist"
    done
    ;;
  Linux)
    removed=false
    for name in codex-usage-exporter ollama; do
      unit="dev.mise.${name}.service"
      path="$HOME/.config/systemd/user/$unit"
      [[ -e "$path" ]] || continue
      systemctl --user show-environment >/dev/null
      systemctl --user disable --now "$unit"
      rm -f "$path"
      removed=true
    done
    if [[ "$removed" == true ]]; then
      systemctl --user daemon-reload
    fi
    ;;
esac
