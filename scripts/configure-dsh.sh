#!/usr/bin/env bash

set -euo pipefail

for role in personal work; do
  profile_home="$HOME/.dsh/$role"
  for surface in tui web; do
    if [[ ! -f "$profile_home/profiles/$surface/package.json" ]]; then
      echo "Harness $role $surface manifest is missing; apply the managed dotfiles first." >&2
      exit 1
    fi
    DSH_HOME="$profile_home" dsh plugin --profile "$surface" install
  done
done
