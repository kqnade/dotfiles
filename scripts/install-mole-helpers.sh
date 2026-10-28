#!/usr/bin/env bash

set -euo pipefail

readonly MOLE_INSTALL_ROOT="${MISE_TOOL_INSTALL_PATH:?}"
readonly MOLE_ENTRYPOINT="${MOLE_INSTALL_ROOT}/mole"

die() {
  printf 'error: %s\n' "$*" >&2
  exit 1
}

[[ "$(uname -s)" == Darwin ]] || die "Mole is only supported on macOS"
[[ -x "$MOLE_ENTRYPOINT" ]] || die "Mole entrypoint is missing"

mole_version="$(sed -n 's/^VERSION="\([^"]*\)"$/\1/p' "$MOLE_ENTRYPOINT" | head -n 1)"
[[ "$mole_version" == "1.65.0" ]] || die "unexpected Mole version: ${mole_version:-unknown}"

case "$(uname -m)" in
  arm64)
    asset_arch="arm64"
    analyze_checksum="7e6c87567081fcd93f9d52066f8bcbb9167d0a69d82aaa0e05cd614a8a0b9f99"
    status_checksum="723c2c2a33402a0953b25fa6430cc9d1750dfd27044159f8afaa139971cd10f8"
    ;;
  x86_64)
    asset_arch="amd64"
    analyze_checksum="baab53b59243abee09ae1b83e22dee43105e84cedcb164f69386a930be9caa22"
    status_checksum="be0238d08dff77078260e5fc3fe2460a335032ab8efd3c27084581279fa1bad5"
    ;;
  *)
    die "unsupported macOS architecture: $(uname -m)"
    ;;
esac

download_helper() {
  local name="$1"
  local expected_checksum="$2"
  local asset_name="${name}-darwin-${asset_arch}"
  local target="${MOLE_INSTALL_ROOT}/bin/${name}-go"
  local temporary="${target}.download"
  local actual_checksum

  curl -fsSL --retry 3 \
    "https://github.com/tw93/mole/releases/download/V${mole_version}/${asset_name}" \
    --output "$temporary"
  actual_checksum="$(shasum -a 256 "$temporary" | awk '{print $1}')"
  if [[ "$actual_checksum" != "$expected_checksum" ]]; then
    rm -f "$temporary"
    die "checksum mismatch for ${asset_name}"
  fi

  chmod 0755 "$temporary"
  xattr -c "$temporary" 2>/dev/null || true
  mv -f "$temporary" "$target"
}

download_helper analyze "$analyze_checksum"
download_helper status "$status_checksum"
ln -sfn mole "${MOLE_INSTALL_ROOT}/mo"
