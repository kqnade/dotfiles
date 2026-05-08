#!/usr/bin/env bash
# Bootstrap script for Linux. Auto-detects distribution and sudo availability,
# then delegates to one of three paths:
#
#   1. Arch (+ sudo)            → metapkgs/base via makepkg
#   2. Debian/Ubuntu (+ sudo)   → apt + Aptfile + supplementary installers
#   3. No sudo (any distro)     → pixi (conda-forge) under $HOME, build cache in /tmp
#
# Usage:
#   bash scripts/install-linux.sh                # auto-detect
#   FORCE_NOSUDO=1 bash scripts/install-linux.sh # force the pixi path
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
# Path 3: No sudo  → pixi (conda-forge) under $HOME, build cache in /tmp
# ---------------------------------------------------------------------------
# Build/extract is throw-away (PIXI_CACHE_DIR=/tmp/${USER}-pixi-cache); all
# permanent artifacts live under $HOME/.pixi. Mirrors Brewfile's tool list,
# minus pass (not in conda-forge) which is installed from source separately.

install_pixi() {
  log "No sudo available — installing via pixi (cache in /tmp, prefix in \$HOME/.pixi)."

  : "${PIXI_HOME:=$HOME/.pixi}"
  : "${PIXI_CACHE_DIR:=/tmp/${USER:-$(id -un)}-pixi-cache}"
  export PIXI_HOME PIXI_CACHE_DIR
  mkdir -p "$PIXI_CACHE_DIR"

  if ! command -v pixi >/dev/null 2>&1 && [[ ! -x "$PIXI_HOME/bin/pixi" ]]; then
    log "Installing pixi → $PIXI_HOME"
    curl -fsSL https://pixi.sh/install.sh | env PIXI_HOME="$PIXI_HOME" PIXI_NO_PATH_UPDATE=1 bash
  fi
  export PATH="$PIXI_HOME/bin:$PATH"

  write_pixi_global_manifest "$PIXI_HOME/manifests/pixi-global.toml"

  log "Syncing pixi global environments (this may take a few minutes the first time)..."
  pixi global sync || warn "pixi global sync had failures — re-run after fixing 'pixi global list'."

  install_pass_from_source

  cat <<EOF

pixi is installed under $PIXI_HOME (build cache: $PIXI_CACHE_DIR).
Add to PATH (already wired in dot_zshrc / dot_bashrc):
  export PATH="\$HOME/.pixi/bin:\$PATH"
EOF
}

write_pixi_global_manifest() {
  local manifest="$1"
  mkdir -p "$(dirname "$manifest")"
  cat > "$manifest" <<'TOML'
# Generated by scripts/install-linux.sh — edits will be overwritten on re-run.
version = 1

[envs.cli-tools]
channels = ["conda-forge"]

[envs.cli-tools.dependencies]
chezmoi   = "*"
sheldon   = "*"
starship  = "*"
go-ghq    = "*"
gh        = "*"
glab      = "*"
git-delta = "*"
eza       = "*"
ripgrep   = "*"
fd-find   = "*"
bat       = "*"
fzf       = "*"
nvim      = "*"
vim       = "*"
gnupg     = "*"
pinentry  = "*"
gomi      = "*"
rust      = "*"

# NOTE: conda-forge `neovim` is the Python client (pynvim); the editor lives
# in `nvim`. `fzf-tmux` is intentionally NOT exposed — conda-forge `fzf`
# does not ship that binary, and listing a missing exposable aborts the
# whole env's expose step.
[envs.cli-tools.exposed]
chezmoi           = "chezmoi"
sheldon           = "sheldon"
starship          = "starship"
ghq               = "ghq"
gh                = "gh"
glab              = "glab"
delta             = "delta"
eza               = "eza"
rg                = "rg"
fd                = "fd"
bat               = "bat"
fzf               = "fzf"
nvim              = "nvim"
vim               = "vim"
gpg               = "gpg"
"gpg-agent"       = "gpg-agent"
gpgconf           = "gpgconf"
gpgsm             = "gpgsm"
pinentry          = "pinentry"
"pinentry-curses" = "pinentry-curses"
gomi              = "gomi"
cargo             = "cargo"
rustc             = "rustc"
TOML
}

# password-store (pass) is not packaged on conda-forge. It's a self-contained
# bash script — its Makefile just installs scripts under PREFIX, no compile.
install_pass_from_source() {
  command -v pass >/dev/null 2>&1 && return 0
  if ! command -v make >/dev/null 2>&1 || ! command -v git >/dev/null 2>&1; then
    warn "pass requires git + make on PATH; skipping (install them via system package manager)."
    return 0
  fi
  log "Installing pass (passwordstore.org) from source → \$HOME/.local"
  local tmp
  tmp="$(mktemp -d)"
  if git clone --depth=1 https://git.zx2c4.com/password-store "$tmp/password-store" \
     && make -C "$tmp/password-store" install PREFIX="$HOME/.local" >/dev/null; then
    log "pass installed."
  else
    warn "pass install failed."
  fi
  rm -rf "$tmp"
}

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
main() {
  local distro
  distro="$(detect_distro)"
  log "Distribution: $distro"

  if ! has_sudo; then
    install_pixi
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
      warn "Unrecognized distribution '$distro'. Falling back to pixi path."
      install_pixi
      ;;
  esac
}

main "$@"
