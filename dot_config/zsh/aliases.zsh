alias please='sudo $(fc -ln -1)'
alias path='echo $PATH | tr ":" "\n"'
alias g='git'
alias p='paru'
alias p-clean='paru -Sc && paru -c'
alias vi='vim'
alias v='vim'
alias cat='bat --paging=never'
alias ca='chezmoi apply'
alias ce='chezmoi edit'
alias cl='claude'
alias rm="gomi"

if [[ $(command -v eza) ]]; then
    alias ls='eza --icons --git'
    alias ll='eza -alF --icons --git'
    alias la='eza -a --icons --git'
    alias lt='eza -T --icons --git'
fi
