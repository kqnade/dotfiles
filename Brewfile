# macOS Homebrew Brewfile — chezmoi template.
# Scope: shell + system tools that mise can't (or shouldn't) handle. Everything
# else (sheldon, starship, ghq, gh, glab, eza, fd, ripgrep, bat, fzf, delta,
# gomi, neovim, lazygit, 1password-cli, language runtimes) lives in
# dot_config/mise/config.toml. chezmoi and mise themselves are bootstrapped
# from get.chezmoi.io and mise.run into ~/.local/bin.

# Newer shell + system editor than what macOS ships with
brew "zsh"
brew "vim"

# Newer git than Apple Xcode CLI provides
brew "git"
brew "openssh"

# Primary monospace font (also installed on Linux via run_onchange_after_install-fonts.sh)
cask "font-udev-gothic"

# SKK dictionary server — used by macSKK (always) and by Neovim's skkeleton
# (when features.neovim is on). delphinus/yaskkserv2 tap, HEAD build; brew
# handles the rust build dep internally.
tap "delphinus/yaskkserv2"
brew "delphinus/yaskkserv2/yaskkserv2", args: ["HEAD"]

# Intel Mac (darwin/amd64) fallbacks — mise の aqua レジストリが Intel Mac
# バイナリを公開していないツール群。Apple Silicon では mise (aqua) が解決
# するためここでは入れない。`delta` の brew formula 名は `git-delta`。
if Hardware::CPU.intel?
  brew "atuin"
  brew "btop"
  brew "git-delta"
  brew "sheldon"
  brew "fd"
end
