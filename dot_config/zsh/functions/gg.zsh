gg() {
  local selected repo_path

  local mode_file
  mode_file=$(mktemp)
  echo git > "$mode_file"
  selected=$(ghq list | fzf \
    --query="$1" \
    --prompt="📁 Repository > " \
    --height=70% \
    --reverse \
    --border \
    --preview="
      repo=\$(ghq root)/{}
      mode=\$(cat $mode_file 2>/dev/null || echo git)
      echo '📂 Path: '\$repo
      echo ''
      if [ \"\$mode\" = 'ls' ]; then
        eza -la --icons --color=always --group-directories-first \$repo
      elif [ -d \"\$repo/.git\" ]; then
        branch=\$(git -C \$repo branch --show-current 2>/dev/null)
        echo \"🌿 Branch: \$branch\"
        echo ''
        git -C \$repo -c color.status=always status -sb 2>/dev/null
        echo ''
        echo '📝 Recent commits:'
        git -C \$repo log --oneline -8 --color=always \
          --format='%C(yellow)%h%C(reset) %C(cyan)%ar%C(reset) %s %C(dim green)(%an)%C(reset)' 2>/dev/null
        echo ''
        echo '📊 Diff (staged):'
        git -C \$repo diff --cached --color=always 2>/dev/null | delta --paging=never --width=\${FZF_PREVIEW_COLUMNS:-80} 2>/dev/null | head -50
      else
        eza -la --icons --color=always --group-directories-first \$repo
      fi
    " \
    --preview-window=right:60%:wrap \
    --preview-label=" [Tab: git/ls] " \
    --bind="tab:execute-silent([ \$(cat $mode_file) = git ] && echo ls > $mode_file || echo git > $mode_file)+refresh-preview"
  )
  rm -f "$mode_file"

  if [ -n "$selected" ]; then
    repo_path="$(ghq root)/$selected"
    cd "$repo_path"
    echo "✅ Moved to: $repo_path"

    if [ -d ".git" ]; then
      echo "🌿 Branch: $(git branch --show-current)"
      git status -sb
    fi
  fi
}
