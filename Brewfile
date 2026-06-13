# macOS Homebrew Brewfile — chezmoi template.
# Scope: only macOS-specific things that mise [system.packages] can't handle:
# casks, the yaskkserv2 tap, and Intel Mac fallbacks. Everything else
# (zsh, vim, git, openssh, sheldon, starship, ghq, gh, eza, fd, ripgrep,
# bat, fzf, delta, gomi, neovim, lazygit, 1password-cli, language runtimes)
# lives in dot_config/mise/config.toml ([tools] or [system.packages]).
# chezmoi and mise themselves are bootstrapped from get.chezmoi.io and
# mise.run into ~/.local/bin.

# Latex Env
cask 'mactex-no-gui'

# Primary monospace font (also installed on Linux via run_onchange_after_install-fonts.sh)
cask 'font-udev-gothic'

# SKK dictionary server — used by macSKK (always) and by Neovim's skkeleton
# (when features.neovim is on). delphinus/yaskkserv2 tap, HEAD build; brew
# handles the rust build dep internally.
tap 'delphinus/yaskkserv2'
brew 'delphinus/yaskkserv2/yaskkserv2', args: ['HEAD']

# Intel Mac (darwin/amd64) fallbacks — mise の aqua レジストリが Intel Mac
# バイナリを公開していないツール群。また、mise system packages の brew
# backend は arm64 macOS のみ対応なので、x86_64 Mac では zsh/vim/openssh
# も Homebrew で補う。Apple Silicon では mise (aqua / system packages) が
# 解決するためここでは入れない。`delta` の brew formula 名は `git-delta`。
if Hardware::CPU.intel?
  brew 'zsh'
  brew 'vim'
  brew 'openssh'
  brew 'atuin'
  brew 'btop'
  brew 'git-delta'
  brew 'sheldon'
  brew 'fd'
end
