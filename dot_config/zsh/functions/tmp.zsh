typeset -g _DOTFILES_TMP_DIR=
typeset -g _DOTFILES_TMP_HOOKS_INSTALLED=

_dotfiles_tmp_cleanup() {
  [[ -n ${_DOTFILES_TMP_DIR:-} ]] || return 0
  local dir=$_DOTFILES_TMP_DIR
  _DOTFILES_TMP_DIR=
  [[ -d $dir ]] || return 0
  command rm -rf -- "$dir"
}

_dotfiles_tmp_chpwd() {
  [[ -n ${_DOTFILES_TMP_DIR:-} ]] || return 0
  [[ $PWD == $_DOTFILES_TMP_DIR || $PWD == $_DOTFILES_TMP_DIR/* ]] && return 0
  _dotfiles_tmp_cleanup
}

_dotfiles_tmp_install_hooks() {
  [[ -n ${_DOTFILES_TMP_HOOKS_INSTALLED:-} ]] && return 0
  autoload -Uz add-zsh-hook
  add-zsh-hook chpwd _dotfiles_tmp_chpwd
  add-zsh-hook zshexit _dotfiles_tmp_cleanup
  _DOTFILES_TMP_HOOKS_INSTALLED=1
}

tmp() {
  local dir
  _dotfiles_tmp_install_hooks
  _dotfiles_tmp_cleanup
  dir=$(mktemp -d "${TMPDIR:-/tmp}/tmp.XXXXXX") || return 1
  cd -- "$dir" || {
    command rm -rf -- "$dir"
    return 1
  }
  _DOTFILES_TMP_DIR=$dir
}
