#!/usr/bin/env bash

set -euo pipefail

readonly MISE_MIN_VERSION="2026.7.12"
readonly MISE_LINUX_X64_SHA256="dad54e0b843908324282b8673f9c0ebc3a4da0c49ad2da309a49bfbc918ba180"
readonly MISE_MACOS_ARM64_SHA256="4268f41491bcb89e750951041d415a847495639a00e894075c62057633d06982"
readonly MISE_MACOS_X64_SHA256="bbe1d2378dd42ff562b4fe688bf235e64c326117428f02c6a634dead29bd0945"
readonly REPO_URL="${DOTFILES_REPO_URL:-https://github.com/kqnade/dotfiles.git}"
readonly REPO_REF="${DOTFILES_REPO_REF:-}"
readonly REPO_DIR="${DOTFILES_REPO_DIR:-${HOME}/repos/github.com/kqnade/dotfiles}"
readonly MISE_BIN="${DOTFILES_MISE_BIN:-${HOME}/.local/bin/mise}"
readonly BOOTSTRAP_SKIP="${DOTFILES_BOOTSTRAP_SKIP:-}"

log() {
  printf '\033[1;36m==>\033[0m %s\n' "$*"
}

die() {
  printf '\033[1;31merror:\033[0m %s\n' "$*" >&2
  exit 1
}

version_at_least() {
  local actual="$1"
  local minimum="$2"
  local actual_year actual_month actual_patch
  local minimum_year minimum_month minimum_patch

  IFS=. read -r actual_year actual_month actual_patch <<<"$actual"
  IFS=. read -r minimum_year minimum_month minimum_patch <<<"$minimum"

  ((actual_year > minimum_year)) && return 0
  ((actual_year < minimum_year)) && return 1
  ((actual_month > minimum_month)) && return 0
  ((actual_month < minimum_month)) && return 1
  ((actual_patch >= minimum_patch))
}

ensure_macos_prerequisites() {
  if ! xcode-select -p >/dev/null 2>&1; then
    log "Xcode Command Line Tools are required; opening the installer."
    xcode-select --install 2>/dev/null || true
    printf 'Complete the macOS installer, then press Enter to continue: '
    read -r _
    xcode-select -p >/dev/null 2>&1 ||
      die "Xcode Command Line Tools are not available yet. Re-run install.sh after installation."
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

ensure_linux_prerequisites() {
  local distro
  distro="$(linux_distro)"

  case "$distro" in
    fedora | arch) ;;
    *)
      die "Unsupported Linux distribution '$distro'. Use Fedora or Arch Linux, including under WSL."
      ;;
  esac

  if command -v curl >/dev/null 2>&1 && command -v git >/dev/null 2>&1; then
    return
  fi

  command -v sudo >/dev/null 2>&1 || die "sudo is required to install curl and Git."
  case "$distro" in
    fedora)
      sudo dnf install -y curl git ca-certificates
      ;;
    arch)
      sudo pacman -Syu --needed --noconfirm curl git ca-certificates
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

install_mise() {
  local asset checksum download_url mise_tmp
  local installed_version=""
  if [[ -x "$MISE_BIN" ]]; then
    installed_version="$("$MISE_BIN" --version | awk '{print $1}')"
  fi

  if [[ -n "$installed_version" ]] && version_at_least "$installed_version" "$MISE_MIN_VERSION"; then
    log "mise ${installed_version} already satisfies >= ${MISE_MIN_VERSION}."
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

  ensure_platform_prerequisites
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
  "$MISE_BIN" -C "$REPO_DIR" "${bootstrap_args[@]}"
}

main "$@"
