#!/usr/bin/env bash
# Bootstrap script for Linux. Auto-detects distribution and sudo availability,
# then delegates to one of four paths:
#
#   1. Arch (+ sudo)             → metapkgs/base via makepkg
#   2. Debian/Ubuntu (+ sudo)    → apt + Aptfile + supplementary installers
#   3. Debian/Ubuntu (no sudo)   → sideapt + Aptfile + supplementary installers
#   4. Other distro (no sudo)    → pixi (conda-forge) under $HOME, fallback
#
# Usage:
#   bash scripts/install-linux.sh                # auto-detect
#   FORCE_NOSUDO=1 bash scripts/install-linux.sh # force the no-sudo path
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
# Path 3: Debian/Ubuntu without sudo  → sideapt + Aptfile + supplementary
# ---------------------------------------------------------------------------
# sideapt fetches the same .deb packages we would `apt-get install` and
# extracts them into $HOME/.sideapt/usr. Combined with `install_supplementary_debian`
# (which already targets $HOME/.local/bin and never invokes sudo), this gives
# us the same toolchain as the sudo path without root.

install_apt_packages_via_sideapt() {
  local pkgs=()
  while IFS= read -r line; do
    line="${line%%#*}"
    line="$(echo "$line" | xargs)"
    [[ -z "$line" ]] && continue
    pkgs+=("$line")
  done < Aptfile

  log "Installing ${#pkgs[@]} packages via sideapt..."
  sideapt install "${pkgs[@]}" \
    || warn "sideapt install reported failures — packages requiring maintainer scripts/setuid/systemd may be unusable."
}

install_debian_nosudo() {
  log "Detected Debian/Ubuntu without sudo — using sideapt."
  install_sideapt
  command -v sideapt >/dev/null 2>&1 \
    || die "sideapt is not on PATH after install — cannot continue."
  install_apt_packages_via_sideapt
  install_supplementary_debian

  cat <<EOF

==> Done. sideapt extracted apt packages under \$HOME/.sideapt/usr.
    Supplementary tools live in \$HOME/.local/bin (and mise's shims).
    Both are wired in dot_zshrc / dot_bashrc via 'eval "\$(sideapt env)"'.

    Activate the new env in the current shell (or open a new shell) before
    continuing:

      eval "\$(\$HOME/.local/bin/sideapt env)"
      export PATH="\$HOME/.local/bin:\$PATH"
      chezmoi init --source . --apply

    Then, with a GitHub token to avoid anonymous rate limits on mise:

      export GITHUB_TOKEN=<your-token>   # or: gh auth token
      mise install
EOF
}

# ---------------------------------------------------------------------------
# Path 4: No sudo, non-Debian  → pixi (conda-forge) fallback under $HOME
# ---------------------------------------------------------------------------
# Build/extract is throw-away (PIXI_CACHE_DIR=/tmp/${USER}-pixi-cache); all
# permanent artifacts live under $HOME/.pixi. Mirrors Brewfile's tool list,
# minus pass (not in conda-forge) which is installed from source separately.

install_pixi() {
  log "No sudo available on a non-Debian host — installing via pixi (cache in /tmp, prefix in \$HOME/.pixi)."

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

==> Done. pixi is installed under $PIXI_HOME (build cache: $PIXI_CACHE_DIR).

    \$HOME/.pixi/bin is NOT on PATH in the current shell yet. Next steps:

      export PATH="\$HOME/.pixi/bin:\$HOME/.local/bin:\$PATH"
      chezmoi init --source . --apply
      mise install

    After 'chezmoi apply' lays down ~/.bashrc / ~/.zshrc, open a new shell
    to pick up the PATH automatically.
EOF
}

# sideapt: non-root apt wrapper. Clones the repo, builds the bash wrapper
# into $HOME/.local/bin, and initializes the private apt index under
# $HOME/.sideapt. Only meaningful on Debian/Ubuntu hosts.
install_sideapt() {
  command -v apt-get  >/dev/null 2>&1 || return 0
  command -v dpkg-deb >/dev/null 2>&1 || return 0
  command -v git      >/dev/null 2>&1 || { warn "sideapt needs git; skipping."; return 0; }
  command -v make     >/dev/null 2>&1 || { warn "sideapt needs make; skipping."; return 0; }

  local repo_dir="$HOME/ghq/github.com/kqnade/sideapt"
  local bin="$HOME/.local/bin"
  mkdir -p "$bin"

  if [[ ! -d "$repo_dir/.git" ]]; then
    log "Cloning sideapt → $repo_dir"
    mkdir -p "$(dirname "$repo_dir")"
    if ! git clone --depth=1 https://github.com/kqnade/sideapt "$repo_dir"; then
      warn "sideapt clone failed; skipping."
      return 0
    fi
  else
    log "Updating sideapt repo (git pull)..."
    git -C "$repo_dir" pull --ff-only --quiet || warn "sideapt git pull failed; using current checkout."
  fi

  if [[ ! -x "$bin/sideapt" ]] || [[ "$repo_dir/bin/sideapt" -nt "$bin/sideapt" ]]; then
    log "Installing sideapt → $bin/sideapt"
    make -C "$repo_dir" install PREFIX="$HOME/.local" >/dev/null \
      || { warn "sideapt make install failed."; return 0; }
  fi

  export PATH="$bin:$PATH"
  if [[ ! -d "$HOME/.sideapt/apt" ]]; then
    log "Initializing sideapt (~/.sideapt) and fetching index..."
    sideapt init   || warn "sideapt init failed"
    sideapt update || warn "sideapt update failed (apt may be too old; system index will be used)"
  fi

  # Activate sideapt env so subsequent install steps (and tools chezmoi
  # invokes from run_onchange scripts) can find gcc/cargo/unzip/etc.
  eval "$(sideapt env 2>/dev/null)" || true
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
mise      = "*"
sheldon   = "*"
starship  = "*"
zsh       = "*"
git       = "*"
git-lfs   = "*"
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
mise              = "mise"
sheldon           = "sheldon"
starship          = "starship"
zsh               = "zsh"
git               = "git"
"git-lfs"         = "git-lfs"
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
    case "$distro" in
      ubuntu|debian|linuxmint|pop)
        install_debian_nosudo
        ;;
      *)
        warn "No sudo on '$distro' — falling back to pixi."
        install_pixi
        ;;
    esac
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
