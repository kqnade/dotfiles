#!/usr/bin/env bash

set -euo pipefail

command -v herdr >/dev/null 2>&1 || exit 0

for agent in claude codex opencode; do
  if command -v "$agent" >/dev/null 2>&1; then
    if [[ "$agent" == codex ]]; then
      mkdir -p "${CODEX_HOME:-$HOME/.codex}"
    fi
    herdr integration install "$agent" >/dev/null
  fi
done
