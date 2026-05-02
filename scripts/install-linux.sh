#!/usr/bin/env bash
# Bootstrap script for Linux. Auto-detects distribution and sudo availability,
# then delegates to one of three paths:
#
#   1. Arch (+ sudo)            → metapkgs/base via makepkg
#   2. Debian/Ubuntu (+ sudo)   → apt + Aptfile + supplementary installers
#   3. No sudo (any distro)     → Linuxbrew at $HOME + Brewfile
#
# Usage:
#   bash scripts/install-linux.sh                # auto-detect
#   FORCE_NOSUDO=1 bash scripts/install-linux.sh # force the Linuxbrew path
#
# This script is intentionally idempotent — re-running it should be a no-op
# when everything is already installed.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

log()  { printf '\033[1;36m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m!!\033[0m %s\n' "$*" >&2; }
die()  { printf '\033[1;31mxx\033[0m %s\n' "$*" >&2; exit 1; }

# ---------------------------------------------------------------------------
# Detection
# ---------------------------------------------------------------------------
detect_distro() {
  if [[ -r /etc/os-release ]]; then
    # shellcheck disable=SC1091
    . /etc/os-release
    echo "${ID:-unknown}"
  else
    echo "unknown"
  fi
}

has_sudo() {
  [[ "${FORCE_NOSUDO:-0}" == "1" ]] && return 1
  command -v sudo >/dev/null 2>&1 || return 1
  sudo -n true >/dev/null 2>&1 && return 0
  # Allow interactive sudo if a TTY is attached
  [[ -t 0 ]] && sudo -v >/dev/null 2>&1
}

# ---------------------------------------------------------------------------
# Path 1: Arch + sudo  → metapkgs/base
# ---------------------------------------------------------------------------
install_arch() {
  log "Detected Arch Linux. Building base-env metapackage."
  command -v makepkg >/dev/null 2>&1 || die "makepkg not found. Install base-devel first."
  ( cd metapkgs/base && makepkg -si --needed --noconfirm )
}

# ---------------------------------------------------------------------------
# Path 2: Debian/Ubuntu + sudo  → apt + supplementary
# ---------------------------------------------------------------------------
install_apt_packages() {
  local pkgs=()
  while IFS= read -r line; do
    line="${line%%#*}"
    line="$(echo "$line" | xargs)"
    [[ -z "$line" ]] && continue
    pkgs+=("$line")
  done < Aptfile

  log "Installing ${#pkgs[@]} apt packages..."
  sudo apt-get update -y
  sudo apt-get install -y --no-install-recommends "${pkgs[@]}"
}

install_supplementary_debian() {
  # Tools missing from / outdated in apt: chezmoi, mise, starship, sheldon,
  # ghq, gh, glab, eza, delta. We install them under $HOME/.local/bin to avoid
  # touching system paths beyond what apt already changed.
  local bin="$HOME/.local/bin"
  mkdir -p "$bin"

  if ! command -v chezmoi >/dev/null 2>&1; then
    log "Installing chezmoi → $bin"
    sh -c "$(curl -fsLS get.chezmoi.io)" -- -b "$bin"
  fi

  if ! command -v mise >/dev/null 2>&1; then
    log "Installing mise → $HOME/.local/bin"
    curl -fsSL https://mise.run | sh
  fi

  # Use mise as a uniform installer for the rest. Requires mise to be on PATH;
  # since we just installed it, source its activation here.
  export PATH="$HOME/.local/bin:$HOME/.local/share/mise/shims:$PATH"

  log "Installing remaining tools via mise (starship, sheldon, ghq, gh, glab, eza, delta)..."
  mise use -g \
    starship@latest \
    sheldon@latest \
    ghq@latest \
    gh@latest \
    glab@latest \
    eza@latest \
    delta@latest || warn "Some tools failed via mise — check 'mise doctor'."
}

install_debian() {
  log "Detected Debian/Ubuntu with sudo."
  install_apt_packages
  install_supplementary_debian
}

# ---------------------------------------------------------------------------
# Path 3: No sudo  → Linuxbrew + Brewfile
# ---------------------------------------------------------------------------
install_linuxbrew() {
  log "No sudo available — installing Linuxbrew under \$HOME."

  if ! command -v brew >/dev/null 2>&1; then
    # Linuxbrew official non-sudo install: clones brew into ~/.linuxbrew
    local prefix="$HOME/.linuxbrew"
    if [[ ! -x "$prefix/bin/brew" ]]; then
      log "Cloning Homebrew → $prefix"
      git clone --depth=1 https://github.com/Homebrew/brew "$prefix/Homebrew"
      mkdir -p "$prefix/bin"
      ln -sf "$prefix/Homebrew/bin/brew" "$prefix/bin/brew"
    fi
    eval "$("$prefix/bin/brew" shellenv)"
  fi

  log "Running brew bundle..."
  brew bundle --file=./Brewfile

  cat <<'EOF'

Linuxbrew is installed under $HOME/.linuxbrew. Make sure your shell sources it:

  # in $HOME/.zshrc (already handled by this dotfiles' dot_zshrc)
  if [[ -x $HOME/.linuxbrew/bin/brew ]]; then
    eval "$($HOME/.linuxbrew/bin/brew shellenv)"
  fi
EOF
}

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
main() {
  local distro
  distro="$(detect_distro)"
  log "Distribution: $distro"

  if ! has_sudo; then
    install_linuxbrew
    return
  fi

  case "$distro" in
    arch|manjaro|endeavouros)
      install_arch
      ;;
    ubuntu|debian|linuxmint|pop)
      install_debian
      ;;
    *)
      warn "Unrecognized distribution '$distro'. Falling back to Linuxbrew path."
      install_linuxbrew
      ;;
  esac
}

main "$@"
