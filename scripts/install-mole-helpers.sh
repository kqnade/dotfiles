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
[[ "$mole_version" == "1.49.2" ]] || die "unexpected Mole version: ${mole_version:-unknown}"

case "$(uname -m)" in
  arm64)
    asset_arch="arm64"
    analyze_checksum="d054a82989fa99558c44fdd12b7db873167b390b21982afbafc7e67e8eebf061"
    status_checksum="8b223c4037028962f4e971938a174a3c7e3f59ac75afedda75b2525498663318"
    ;;
  x86_64)
    asset_arch="amd64"
    analyze_checksum="8317534fac35e20b3d9b5bf6b6a92d39166802f39744f81d9eb6e28fbb03ebe5"
    status_checksum="a8778c0b03f37d612f6036cab50e662e0d3e3569de565a4e7c30a9846f69e91a"
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
