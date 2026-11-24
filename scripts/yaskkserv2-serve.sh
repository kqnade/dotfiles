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

# A bounded wait exits non-zero so launchd and systemd record the failure and
# apply their restart policy. An infinite poll stays running and logs nothing.
wait_attempts="${YASKKSERV2_WAIT_ATTEMPTS:-6}"
wait_interval="${YASKKSERV2_WAIT_INTERVAL_SECONDS:-10}"
[[ "$wait_attempts" =~ ^[1-9][0-9]*$ ]] ||
  dotfiles_die "YASKKSERV2_WAIT_ATTEMPTS must be a positive integer"
[[ "$wait_interval" =~ ^[0-9]+$ ]] ||
  dotfiles_die "YASKKSERV2_WAIT_INTERVAL_SECONDS must be a non-negative integer"
readonly wait_attempts wait_interval

case "$(uname -s)" in
  Darwin)
    cache_dir="${HOME}/Library/Caches/yaskkserv2"
    ;;
  *)
    cache_dir="${XDG_CACHE_HOME:-${HOME}/.cache}/yaskkserv2"
    ;;
esac
mkdir -p "$cache_dir"

stdout_file="$(mktemp)"
stderr_file="$(mktemp)"
cleanup_mise_output() {
  rm -f "$stdout_file" "$stderr_file"
}
trap cleanup_mise_output EXIT

yaskkserv2=""
attempt=1
while true; do
  mise_error=""
  yaskkserv2=""
  if "$MISE_BIN" -C "$DOTFILES_ROOT" which yaskkserv2 >"$stdout_file" 2>"$stderr_file"; then
    yaskkserv2="$(<"$stdout_file")"
  else
    mise_error="$(<"$stderr_file")"
    if [[ -z "$mise_error" ]]; then
      mise_error="mise exited with a non-zero status"
    fi
  fi

  if [[ -n "$yaskkserv2" && -s "$DICTIONARY" ]]; then
    break
  fi

  if [[ -n "$mise_error" ]]; then
    printf 'yaskkserv2: waiting because mise failed: %s\n' "${mise_error%%$'\n'*}" >&2
  elif [[ -z "$yaskkserv2" ]]; then
    printf 'yaskkserv2: waiting because the binary is not available\n' >&2
  fi
  if [[ ! -s "$DICTIONARY" ]]; then
    printf 'yaskkserv2: waiting because the dictionary is missing or empty: %s\n' "$DICTIONARY" >&2
  fi

  if ((attempt >= wait_attempts)); then
    printf 'yaskkserv2: prerequisites were not ready within %s attempts\n' "$wait_attempts" >&2
    exit 1
  fi
  sleep "$wait_interval"
  attempt=$((attempt + 1))
done

cleanup_mise_output
trap - EXIT

exec "$yaskkserv2" \
  --no-daemonize \
  "--listen-address=${LISTEN_ADDRESS}" \
  "--port=${LISTEN_PORT}" \
  --google-japanese-input=notfound \
  "--google-cache-filename=${cache_dir}/google.cache" \
  "$DICTIONARY"
