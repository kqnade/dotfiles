#!/usr/bin/env bash

set -euo pipefail

# Fedora 45 replaced openssl-devel with OpenSSL 4 and moved the OpenSSL 3
# headers to openssl3-devel. That package does not exist on Fedora 44, where
# openssl-devel is still OpenSSL 3. mise package entries cannot vary by
# release, so the pre-tools hook selects one here. Arch and macOS exit before
# dnf runs.

die() {
  printf '%s\n' "$*" >&2
  exit 1
}

run_as_root() {
  if ((EUID == 0)); then
    "$@"
  else
    sudo "$@"
  fi
}

os_release_file="${DOTFILES_OS_RELEASE:-/etc/os-release}"
[[ -r "$os_release_file" ]] || exit 0
# shellcheck disable=SC1090
source "$os_release_file"
[[ "${ID:-}" == "fedora" ]] || exit 0

# First Fedora release whose openssl-devel is OpenSSL 4.
openssl3_release=45
package="openssl-devel"
if [[ "${VERSION_ID:-}" =~ ^[0-9]+$ ]]; then
  if ((10#$VERSION_ID >= openssl3_release)); then
    package="openssl3-devel"
  fi
else
  openssl_line="$(openssl version 2>/dev/null || true)"
  major="${openssl_line#OpenSSL }"
  major="${major%%.*}"
  if [[ ! "$major" =~ ^[0-9]+$ ]]; then
    die "cannot select Fedora OpenSSL headers without a numeric VERSION_ID or an OpenSSL version"
  fi
  if ((10#$major >= 4)); then
    package="openssl3-devel"
  fi
fi

# openssl3-devel conflicts with the OpenSSL 4 openssl-devel package.
if [[ "$package" == "openssl3-devel" ]] && rpm -q openssl-devel >/dev/null 2>&1; then
  run_as_root dnf swap -y openssl-devel openssl3-devel
else
  run_as_root dnf install -y "$package"
fi
