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
brew "tmux"

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

# SKK input — yaskkserv2 build deps (cargo) and runtime
brew "rust"

if OS.mac?
  # macOS-only: pinentry GUI for GPG and font casks
  brew "pinentry-mac"
  cask "font-udev-gothic"
end
