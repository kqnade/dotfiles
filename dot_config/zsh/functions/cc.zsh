function git-cc() {
  command mise exec -- node "${DOTFILES_ROOT:-$HOME/repos/github.com/kqnade/dotfiles}/scripts/pi/git-cc.mjs" "$@"
}

function git-ccc() {
  git-cc "$@"
}
