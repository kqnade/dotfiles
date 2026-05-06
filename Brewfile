# Portable Brewfile — works on:
#   - macOS Homebrew
#   - Linuxbrew (non-sudo Linux fallback; see scripts/install-linux.sh)
# macOS-only entries are gated under OS.mac?.

# Core environment
brew "chezmoi"
brew "mise"
brew "sheldon"

# Shell
brew "zsh"

# Version control
brew "git"
brew "git-delta"
brew "git-lfs"
brew "gh"
brew "glab"
brew "ghq"

# Editors
brew "vim"
brew "neovim"

# GPG / SSH
brew "gnupg"
brew "pass"

# CLI tools
brew "gomi"
brew "ripgrep"
brew "fd"
brew "bat"
brew "eza"
brew "fzf"
brew "starship"

if OS.mac?
  # macOS-only: pinentry GUI for GPG and font casks
  brew "pinentry-mac"
  cask "font-udev-gothic"

  # SKK dictionary server (delphinus/yaskkserv2 tap, HEAD build).
  # Brew handles rust as a build-only dependency internally.
  tap "delphinus/yaskkserv2"
  brew "delphinus/yaskkserv2/yaskkserv2", args: ["HEAD"]
else
  # Linuxbrew (non-sudo Linux): yaskkserv2 is built from source via
  # `cargo install` in run_onchange_after_install-yaskkserv2.sh,
  # so we need rust on PATH.
  brew "rust"
end
