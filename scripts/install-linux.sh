#!/usr/bin/env bash
# Bootstrap script for Linux. Auto-detects the distribution and delegates to
# one of two paths (both require sudo):
#
#   1. Arch    → metapkgs/base via makepkg
#   2. Fedora  → dnf + Dnffile
#
# After system packages are installed, chezmoi and mise are dropped into
# ~/.local/bin so the user can run `chezmoi init --apply` and `mise install`
# to materialize the rest of the dev toolchain (which lives entirely in
# dot_config/mise/config.toml — including language runtimes like rust).
#
# Idempotent: re-running is a no-op when everything is already in place.
#
# Usage:
#   bash scripts/install-linux.sh

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

log()  { printf '\033[1;36m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m!!\033[0m %s\n' "$*" >&2; }
die()  { printf '\033[1;31mxx\033[0m %s\n' "$*" >&2; exit 1; }

detect_distro() {
  if [[ -r /etc/os-release ]]; then
    # shellcheck disable=SC1091
    . /etc/os-release
    echo "${ID:-unknown}"
  else
    echo "unknown"
  fi
}

require_sudo() {
  command -v sudo >/dev/null 2>&1 || die "sudo not found; this dotfiles setup requires sudo on Linux."
  sudo -v >/dev/null 2>&1 || die "sudo authentication failed."
}

# ---------------------------------------------------------------------------
# Arch  → metapkgs/base
# ---------------------------------------------------------------------------
install_arch() {
  log "Detected Arch Linux. Building base-env metapackage."
  command -v makepkg >/dev/null 2>&1 || die "makepkg not found. Install base-devel first."
  ( cd metapkgs/base && makepkg -si --needed --noconfirm )
}

# ---------------------------------------------------------------------------
# Fedora  → dnf + Dnffile
# ---------------------------------------------------------------------------
install_fedora() {
  log "Detected Fedora. Installing system packages via dnf."
  command -v dnf >/dev/null 2>&1 || die "dnf not found."

  local pkgs=()
  while IFS= read -r line; do
    line="${line%%#*}"
    line="$(echo "$line" | xargs)"
    [[ -z "$line" ]] && continue
    pkgs+=("$line")
  done < Dnffile

  log "Installing ${#pkgs[@]} dnf packages..."
  sudo dnf install -y "${pkgs[@]}"
}

# ---------------------------------------------------------------------------
# Common: chezmoi + mise into ~/.local/bin
# ---------------------------------------------------------------------------
install_chezmoi_and_mise() {
  local bin="$HOME/.local/bin"
  mkdir -p "$bin"

  if ! command -v chezmoi >/dev/null 2>&1 && [[ ! -x "$bin/chezmoi" ]]; then
    log "Installing chezmoi → $bin"
    sh -c "$(curl -fsLS get.chezmoi.io)" -- -b "$bin"
  fi

  if ! command -v mise >/dev/null 2>&1 && [[ ! -x "$bin/mise" ]]; then
    log "Installing mise → $bin"
    curl -fsSL https://mise.run | sh
  fi
}

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
main() {
  local distro
  distro="$(detect_distro)"
  log "Distribution: $distro"

  require_sudo

  case "$distro" in
    arch|manjaro|endeavouros)
      install_arch
      ;;
    fedora|rhel|centos|rocky|almalinux)
      install_fedora
      ;;
    *)
      die "Unsupported distribution '$distro'. Only Arch and Fedora are supported."
      ;;
  esac

  install_chezmoi_and_mise

  cat <<EOF

==> Bootstrap packages installed. Next steps:

    1. Initialize chezmoi (if not already done):
         export PATH="\$HOME/.local/bin:\$PATH"
         chezmoi init --source . --apply

    2. Install system packages declared in mise config:
         mise system install --yes

    3. Install dev tools (incl. rust for yaskkserv2) via mise:
         export GITHUB_TOKEN="\$(gh auth token 2>/dev/null | tr -d '[:space:]')"  # optional, avoids GitHub rate limits
         mise install

    4. Re-run \`chezmoi apply\` so post-install steps (yaskkserv2 build,
       UDEVGothic font fetch) pick up the freshly-installed mise tools.

EOF
}

main "$@"
