alias please='sudo $(fc -ln -1)'
alias path='echo $PATH | tr ":" "\n"'
alias g='git'

# Native package manager shortcuts. macOS intentionally has no package
# manager alias because system packages come from the OS and Xcode CLT.
if [[ -r /etc/os-release ]]; then
  source /etc/os-release
  case "${ID:-}${ID_LIKE:+ $ID_LIKE}" in
    *arch*|*manjaro*|*endeavouros*)
      alias p='sudo pacman'
      alias p-clean='sudo pacman -Sc'
      ;;
    *fedora*)
      alias p='sudo dnf'
      alias p-clean='sudo dnf autoremove -y && sudo dnf clean all'
      ;;
  esac
fi

if command -v nvim >/dev/null 2>&1; then
  alias vi='nvim'
  alias v='nvim'
else
  alias vi='vim'
  alias v='vim'
fi
alias ca='chezmoi apply'
alias ce='chezmoi edit'
alias cl='claude'

if command -v bat >/dev/null 2>&1; then
  alias cat='bat --paging=never'
fi

if command -v gomi >/dev/null 2>&1; then
  alias rm='gomi'
fi

if command -v eza >/dev/null 2>&1; then
  alias ls='eza --icons --git'
  alias ll='eza -alF --icons --git'
  alias la='eza -a --icons --git'
  alias lt='eza -T --icons --git'
fi
