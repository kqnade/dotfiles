#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
readonly SCRIPT_DIR
# shellcheck source=scripts/lib/runtime.sh
source "$SCRIPT_DIR/lib/runtime.sh"

DOTFILES_ROOT="$(dotfiles_resolve_root)"
readonly DOTFILES_ROOT
export DOTFILES_ROOT

readonly DICTIONARY="${HOME}/.skk/dictionary.yaskkserv2"
readonly LISTEN_ADDRESS="127.0.0.1"
readonly LISTEN_PORT="1178"
MISE_BIN="$(dotfiles_mise_bin)"
readonly MISE_BIN

case "$(uname -s)" in
  Darwin)
    cache_dir="${HOME}/Library/Caches/yaskkserv2"
    ;;
  *)
    cache_dir="${XDG_CACHE_HOME:-${HOME}/.cache}/yaskkserv2"
    ;;
esac
mkdir -p "$cache_dir"

while true; do
  yaskkserv2="$("$MISE_BIN" -C "$DOTFILES_ROOT" which yaskkserv2 2>/dev/null || true)"
  if [[ -n "$yaskkserv2" ]] && [[ -s "$DICTIONARY" ]]; then
    break
  fi
  sleep 10
done

exec "$yaskkserv2" \
  --no-daemonize \
  "--listen-address=${LISTEN_ADDRESS}" \
  "--port=${LISTEN_PORT}" \
  --google-japanese-input=notfound \
  "--google-cache-filename=${cache_dir}/google.cache" \
  "$DICTIONARY"
