# macOS Homebrew Brewfile.
# Non-sudo Linux uses pixi (conda-forge) instead — see scripts/install-linux.sh.

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

# Secrets / SSH
cask "1password-cli"

# CLI tools
brew "gomi"
brew "ripgrep"
brew "fd"
brew "bat"
brew "eza"
brew "fzf"
brew "starship"

# Fonts
cask "font-udev-gothic"

# SKK dictionary server (delphinus/yaskkserv2 tap, HEAD build).
# Brew handles rust as a build-only dependency internally.
tap "delphinus/yaskkserv2"
brew "delphinus/yaskkserv2/yaskkserv2", args: ["HEAD"]
