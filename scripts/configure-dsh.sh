#!/usr/bin/env bash

set -euo pipefail

for role in personal work; do
  profile_home="$HOME/.dsh/$role"
  if [[ ! -f "$profile_home/profiles/tui/package.json" ]]; then
    echo "Harness $role manifest is missing; apply the managed dotfiles first." >&2
    exit 1
  fi
  DSH_HOME="$profile_home" dsh plugin --profile tui install
done
