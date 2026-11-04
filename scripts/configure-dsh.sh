#!/usr/bin/env bash

set -euo pipefail

runtime_config="$HOME/.config/dotfiles/client-runtime.sh"
unset DOTFILES_DSH_WORK_ENABLED
if [[ ! -r "$runtime_config" ]]; then
  echo 'Harness runtime configuration is missing; apply the managed dotfiles first.' >&2
  exit 1
fi
# shellcheck source=/dev/null
source "$runtime_config"
roles=(personal)
case "${DOTFILES_DSH_WORK_ENABLED:-}" in
  true)
    if [[ "$(uname -s)" != Darwin ]]; then
      echo 'Work Harness requires Darwin.' >&2
      exit 1
    fi
    roles+=(work)
    ;;
  false) ;;
  *)
    echo 'Harness runtime configuration must set DOTFILES_DSH_WORK_ENABLED to true or false.' >&2
    exit 1
    ;;
esac

for role in "${roles[@]}"; do
  profile_home="$HOME/.dsh/$role"
  for surface in tui web; do
    if [[ ! -f "$profile_home/profiles/$surface/package.json" ]]; then
      echo "Harness $role $surface manifest is missing; apply the managed dotfiles first." >&2
      exit 1
    fi
  done
done

for role in "${roles[@]}"; do
  for surface in tui web; do
    DSH_HOME="$HOME/.dsh/$role" dsh plugin --profile "$surface" install
  done
done
