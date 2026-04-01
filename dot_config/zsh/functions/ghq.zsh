ghq() {
  if [[ $1 == "remove" ]]; then
    local selected repo_path
    selected=$(command ghq list | fzf \
      --query="${2:-}" \
      --prompt="🗑️  Remove Repository > " \
      --height=70% \
      --reverse \
      --border \
      --preview="eza -la --icons --color=always --group-directories-first \$(ghq root)/{}" \
      --preview-window=right:50%:wrap
    )
    [[ -z "$selected" ]] && return 0

    repo_path="$(command ghq root)/$selected"
    echo "🗑️  Remove: $repo_path"
    read -q "REPLY?Are you sure? [y/N] " && echo
    if [[ $REPLY == "y" ]]; then
      rm -rf "$repo_path"
      echo "✅ Removed: $repo_path"
    else
      echo "Cancelled."
    fi
    return 0
  fi

  command ghq "$@"
  local exit_code=$?

  if [[ $exit_code -eq 0 && ($1 == "get" || $1 == "clone" || $1 == "create") ]]; then
    local repo_path
    repo_path=$(command ghq list --full-path --exact "${@[-1]}" 2>/dev/null)
    if [[ -n "$repo_path" ]]; then
      cd "$repo_path"
      echo "✅ Moved to: $repo_path"
    fi
  fi

  return $exit_code
}
