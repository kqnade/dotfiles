alias please='sudo $(fc -ln -1)'
alias path='echo $PATH | tr ":" "\n"'
alias g='git'

# ---------------------------------------------------------------------------
# Package manager shortcut (`p`)
#   macOS / non-sudo Linux (Linuxbrew) → brew
#   Arch family                         → paru
#   Debian/Ubuntu family                → apt (sudo)
# ---------------------------------------------------------------------------
if [[ "$(uname -s)" == "Darwin" ]] || command -v brew >/dev/null 2>&1; then
  alias p='brew'
  alias p-clean='brew cleanup'
elif [[ -r /etc/os-release ]]; then
  source /etc/os-release
  case "${ID:-}${ID_LIKE:+ $ID_LIKE}" in
    *arch*|*manjaro*|*endeavouros*)
      alias p='paru'
      alias p-clean='paru -Sc && paru -c'
      ;;
    *ubuntu*|*debian*)
      alias p='sudo apt'
      alias p-clean='sudo apt autoremove -y && sudo apt clean'
      ;;
  esac
fi

alias vi='vim'
alias v='vim'
alias ca='chezmoi apply'
alias ce='chezmoi edit'
alias cl='claude'

# ---------------------------------------------------------------------------
# Modern CLI shims
# Ubuntu/Debian ship `bat` as `batcat` and `fd` as `fdfind` to avoid name
# clashes. Alias them to the canonical names where the canonical isn't
# already on PATH (e.g. via Linuxbrew).
# ---------------------------------------------------------------------------
if command -v bat >/dev/null 2>&1; then
  alias cat='bat --paging=never'
elif command -v batcat >/dev/null 2>&1; then
  alias bat='batcat'
  alias cat='batcat --paging=never'
fi

if ! command -v fd >/dev/null 2>&1 && command -v fdfind >/dev/null 2>&1; then
  alias fd='fdfind'
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
