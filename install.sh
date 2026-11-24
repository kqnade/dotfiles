#!/usr/bin/env bash

set -euo pipefail

# Renovate keeps this pin on the latest stable mise release. The platform
# versions exist so each asset checksum updates with that same release, and
# they must stay equal to MISE_MIN_VERSION and mise.toml min_version.
readonly MISE_MIN_VERSION="2026.11.13"
readonly MISE_LINUX_X64_VERSION="2026.11.13"
readonly MISE_LINUX_X64_SHA256="9c8cc9e10886fe1b1ae2ff625f34905f3bd94e47ee5c9b0d3d597e6629d43d20"
readonly MISE_MACOS_ARM64_VERSION="2026.11.13"
readonly MISE_MACOS_ARM64_SHA256="973eb467ec9671f73a96a4c6c39f175703dde49523a5532157e659afcc5f2eca"
readonly MISE_MACOS_X64_VERSION="2026.11.13"
readonly MISE_MACOS_X64_SHA256="7e0b50348e00ad9a3ed9efe30012dd6e5f7fb29b4debac8edd93cc3efedded2d"
readonly REPO_URL="${DOTFILES_REPO_URL:-https://github.com/kqnade/dotfiles.git}"
readonly REPO_REF="${DOTFILES_REPO_REF:-}"
readonly REPO_DIR="${DOTFILES_REPO_DIR:-${HOME}/repos/github.com/kqnade/dotfiles}"
readonly MISE_BIN="${DOTFILES_MISE_BIN:-${HOME}/.local/bin/mise}"
readonly BOOTSTRAP_SKIP="${DOTFILES_BOOTSTRAP_SKIP:-}"
# One poll per second. 1800 leaves half an hour for the macOS installer.
readonly CLT_POLL_LIMIT="${DOTFILES_CLT_POLL_LIMIT:-1800}"

log() {
  printf '\033[1;36m==>\033[0m %s\n' "$*"
}

die() {
  printf '\033[1;31merror:\033[0m %s\n' "$*" >&2
  exit 1
}

ensure_macos_prerequisites() {
  local attempts=0

  if ! xcode-select -p >/dev/null 2>&1; then
    log "Xcode Command Line Tools are required; opening the installer."
    xcode-select --install 2>/dev/null || true
    if [[ -t 0 ]]; then
      printf 'Complete the macOS installer, then press Enter to continue: '
      read -r _ ||
        die "Xcode Command Line Tools are not available yet. Re-run install.sh after installation."
      xcode-select -p >/dev/null 2>&1 ||
        die "Xcode Command Line Tools are not available yet. Re-run install.sh after installation."
    else
      # curl | bash leaves the script on stdin, so do not read from it.
      log "Waiting for Xcode Command Line Tools to finish installing."
      until xcode-select -p >/dev/null 2>&1; do
        attempts=$((attempts + 1))
        if ((attempts >= CLT_POLL_LIMIT)); then
          die "Xcode Command Line Tools are not available yet. Re-run install.sh after installation."
        fi
        sleep 1
      done
    fi
  fi

  [[ -x /usr/bin/curl ]] || die "macOS curl is unavailable."
  [[ -x /usr/bin/git ]] || die "macOS Git is unavailable."
}

linux_distro() {
  [[ -r /etc/os-release ]] || die "/etc/os-release is unavailable."
  # shellcheck disable=SC1091
  source /etc/os-release
  printf '%s\n' "${ID:-unknown}"
}

ensure_linux_elevation() {
  ((EUID == 0)) && return
  command -v sudo >/dev/null 2>&1 ||
    die "sudo is required to install system packages."
  sudo -v || die "sudo authorization is required to install system packages."
}

run_as_root() {
  if ((EUID == 0)); then
    "$@"
  else
    sudo "$@"
  fi
}

ensure_linux_prerequisites() {
  local distro
  distro="$(linux_distro)"

  case "$distro" in
    fedora | arch) ;;
    *)
      die "Unsupported Linux distribution '$distro'. Use Fedora or Arch Linux, including under WSL."
      ;;
  esac

  ensure_linux_elevation

  if command -v curl >/dev/null 2>&1 && command -v git >/dev/null 2>&1; then
    return
  fi

  case "$distro" in
    fedora)
      run_as_root dnf install -y curl git ca-certificates
      ;;
    arch)
      run_as_root pacman -Syu --needed --noconfirm curl git ca-certificates
      ;;
  esac
}

ensure_platform_prerequisites() {
  case "$(uname -s)" in
    Darwin)
      case "$(uname -m)" in
        arm64 | x86_64) ;;
        *) die "Unsupported macOS architecture '$(uname -m)'." ;;
      esac
      ensure_macos_prerequisites
      ;;
    Linux)
      [[ "$(uname -m)" == x86_64 ]] || die "Linux support requires x86_64."
      ensure_linux_prerequisites
      ;;
    *)
      die "Unsupported platform. Supported targets are macOS, Fedora, Arch Linux, and WSL."
      ;;
  esac
}

configure_wsl_mise() {
  [[ "$(uname -s)" == Linux ]] || return 0
  [[ -r /proc/sys/kernel/osrelease ]] || return 0
  grep -qi microsoft /proc/sys/kernel/osrelease || return 0
  export MISE_DISABLE_TOOLS="${MISE_DISABLE_TOOLS:+${MISE_DISABLE_TOOLS},}1password-cli"
}

install_mise() {
  local asset checksum download_url mise_tmp
  local installed_version=""

  if [[ "$MISE_LINUX_X64_VERSION" != "$MISE_MIN_VERSION" || "$MISE_MACOS_ARM64_VERSION" != "$MISE_MIN_VERSION" || "$MISE_MACOS_X64_VERSION" != "$MISE_MIN_VERSION" ]]; then
    die "mise platform pins must all equal ${MISE_MIN_VERSION}."
  fi

  if [[ -x "$MISE_BIN" ]]; then
    installed_version="$("$MISE_BIN" --version | awk '{print $1}')"
  fi

  if [[ "$installed_version" == "$MISE_MIN_VERSION" ]]; then
    log "mise ${installed_version} matches the pinned release."
    return
  fi

  case "$(uname -s):$(uname -m)" in
    Darwin:arm64)
      asset="mise-v${MISE_MIN_VERSION}-macos-arm64"
      checksum="$MISE_MACOS_ARM64_SHA256"
      ;;
    Darwin:x86_64)
      asset="mise-v${MISE_MIN_VERSION}-macos-x64"
      checksum="$MISE_MACOS_X64_SHA256"
      ;;
    Linux:x86_64)
      asset="mise-v${MISE_MIN_VERSION}-linux-x64"
      checksum="$MISE_LINUX_X64_SHA256"
      ;;
    *)
      die "No mise artifact is configured for $(uname -s)/$(uname -m)."
      ;;
  esac

  log "Installing mise ${MISE_MIN_VERSION} to ${MISE_BIN}."
  mkdir -p "${MISE_BIN%/*}"
  mise_tmp="$(mktemp "${MISE_BIN}.XXXXXX")"
  download_url="https://github.com/jdx/mise/releases/download/v${MISE_MIN_VERSION}/${asset}"

  if ! curl -fsSL "$download_url" -o "$mise_tmp"; then
    rm -f "$mise_tmp"
    die "Failed to download mise ${MISE_MIN_VERSION}."
  fi
  if command -v sha256sum >/dev/null 2>&1; then
    if ! printf '%s  %s\n' "$checksum" "$mise_tmp" | sha256sum -c -; then
      rm -f "$mise_tmp"
      die "mise ${MISE_MIN_VERSION} checksum verification failed."
    fi
  elif command -v shasum >/dev/null 2>&1; then
    if ! printf '%s  %s\n' "$checksum" "$mise_tmp" | shasum -a 256 -c -; then
      rm -f "$mise_tmp"
      die "mise ${MISE_MIN_VERSION} checksum verification failed."
    fi
  else
    rm -f "$mise_tmp"
    die "No SHA-256 checksum tool is available."
  fi

  chmod 0755 "$mise_tmp"
  mv -f "$mise_tmp" "$MISE_BIN"
}

checkout_dotfiles() {
  mkdir -p "${REPO_DIR%/*}"

  if [[ -d "$REPO_DIR/.git" ]]; then
    log "Using existing checkout at ${REPO_DIR}."
  elif [[ -e "$REPO_DIR" ]]; then
    die "${REPO_DIR} exists but is not a Git checkout."
  else
    log "Cloning dotfiles into ${REPO_DIR}."
    if [[ -n "$REPO_REF" ]]; then
      git clone --branch "$REPO_REF" --single-branch "$REPO_URL" "$REPO_DIR"
    else
      git clone "$REPO_URL" "$REPO_DIR"
    fi
  fi

  [[ -f "$REPO_DIR/mise.toml" ]] || die "${REPO_DIR}/mise.toml is missing."
}

main() {
  local bootstrap_args=(bootstrap --yes)

  if (($# > 0)); then
    [[ $# -eq 1 ]] || die "Usage: bash install.sh [--mise-only | --with-work-claude]"
    case "$1" in
      --mise-only)
        install_mise
        return
        ;;
      --with-work-claude)
        export DOTFILES_CLAUDE_WORK_ENABLED=true
        ;;
      *) die "Usage: bash install.sh [--mise-only | --with-work-claude]" ;;
    esac
  fi

  ensure_platform_prerequisites
  configure_wsl_mise
  install_mise
  checkout_dotfiles

  export PATH="${HOME}/.local/bin:${PATH}"
  export DOTFILES_ROOT="$REPO_DIR"
  log "Trusting the repository mise config."
  "$MISE_BIN" trust "$REPO_DIR/mise.toml"

  log "Converging the machine with mise bootstrap."
  if [[ -n "$BOOTSTRAP_SKIP" ]]; then
    bootstrap_args+=(--skip "$BOOTSTRAP_SKIP")
  fi
  MISE_CONFIG_DIR="$REPO_DIR/mise" \
    "$MISE_BIN" -C "$REPO_DIR" "${bootstrap_args[@]}"
}

main "$@"
