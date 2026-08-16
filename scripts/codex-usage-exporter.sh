#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
readonly SCRIPT_DIR
# shellcheck source=scripts/lib/runtime.sh
source "$SCRIPT_DIR/lib/runtime.sh"

DOTFILES_ROOT="$(dotfiles_resolve_root)"
readonly DOTFILES_ROOT
readonly OP_ENV="${CODEX_USAGE_OP_ENV:-$DOTFILES_ROOT/.op.env}"
readonly EXPORTER="${CODEX_USAGE_EXPORTER:-$SCRIPT_DIR/codex_usage_exporter.py}"
readonly CACHE_DIR="${XDG_RUNTIME_DIR:-${TMPDIR:-/tmp}/codex-usage-exporter-${UID}}/codex-usage-exporter"
readonly CACHE_ENV="$CACHE_DIR/op.env"

if [[ -f "$OP_ENV" ]]; then
  source_checksum="$(cksum <"$OP_ENV")"
  readonly source_checksum
  if [[ -f "$CACHE_ENV" ]] &&
    IFS= read -r cache_header <"$CACHE_ENV" &&
    [[ "$cache_header" == "# source-checksum=$source_checksum" ]]; then
    # shellcheck disable=SC1090
    source "$CACHE_ENV"
    exec "$EXPORTER"
  fi

  if command -v op >/dev/null 2>&1; then
    OP_BIN="$(command -v op)"
  elif [[ -x "${HOME}/.local/bin/op" ]]; then
    OP_BIN="${HOME}/.local/bin/op"
  elif [[ -x "${HOME}/.local/share/mise/shims/op" ]]; then
    OP_BIN="${HOME}/.local/share/mise/shims/op"
  else
    dotfiles_die "1Password CLI is not installed"
  fi

  if dotfiles_is_wsl && [[ "$OP_BIN" == "${HOME}/.local/bin/op" ]]; then
    if [[ -n "${CODEX_USAGE_OP_EXE:-}" ]]; then
      OP_BIN="$CODEX_USAGE_OP_EXE"
    elif [[ -x /mnt/c/Windows/System32/where.exe ]]; then
      IFS= read -r OP_BIN < <(
        /mnt/c/Windows/System32/where.exe op.exe | tr -d '\r'
      )
    fi
    if [[ ! -x "$OP_BIN" ]] && [[ -x /usr/bin/wslpath ]]; then
      OP_BIN="$(/usr/bin/wslpath -u "$OP_BIN")"
    fi
    [[ -x "$OP_BIN" ]] || dotfiles_die "Windows 1Password CLI is not installed"
  fi
  readonly OP_BIN

  mkdir -p "$CACHE_DIR"
  chmod 700 "$CACHE_DIR"
  temporary_cache="$(mktemp "$CACHE_ENV.tmp.XXXXXX")"
  readonly temporary_cache
  trap 'rm -f "$temporary_cache"' EXIT
  chmod 600 "$temporary_cache"
  printf '# source-checksum=%s\n' "$source_checksum" >"$temporary_cache"
  while IFS='=' read -r name value || [[ -n "$name" ]]; do
    [[ -z "$name" ]] && continue
    [[ "$name" == \#* ]] && continue
    [[ "$name" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]] ||
      dotfiles_die "invalid variable name in $OP_ENV: $name"
    if [[ "$value" == op://* ]]; then
      value="$("$OP_BIN" read "$value")" ||
        dotfiles_die "failed to read $name from 1Password"
    fi
    printf 'export %s=%q\n' "$name" "$value" >>"$temporary_cache"
  done <"$OP_ENV"
  mv "$temporary_cache" "$CACHE_ENV"
  trap - EXIT
  # shellcheck disable=SC1090
  source "$CACHE_ENV"
  exec "$EXPORTER"
fi

exec "$EXPORTER"
