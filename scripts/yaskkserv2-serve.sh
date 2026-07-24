#!/usr/bin/env bash

set -euo pipefail

readonly DOTFILES_ROOT="${HOME}/repos/github.com/kqnade/dotfiles"
readonly DICTIONARY="${HOME}/.skk/dictionary.yaskkserv2"
readonly LISTEN_ADDRESS="127.0.0.1"
readonly LISTEN_PORT="1178"
readonly MISE_BIN="${HOME}/.local/bin/mise"

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
  if [[ -x "$MISE_BIN" ]]; then
    yaskkserv2="$("$MISE_BIN" -C "$DOTFILES_ROOT" which yaskkserv2 2>/dev/null || true)"
  else
    yaskkserv2=""
  fi
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
