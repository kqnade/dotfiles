function git-ccc() {
  local diff
  diff=$(git diff --staged)

  if [[ -z "$diff" ]]; then
    echo "No staged changes. Run 'git add' first."
    return 1
  fi

  echo "Generating commit message..."

  local msg
  msg=$(printf '%s' "$diff" | claude -p "Generate a conventional commit message for the git diff provided via stdin.
Format: <type>: <description>
Types: feat, fix, refactor, docs, test, chore, perf, ci
Rules:
- Output the commit message ONLY (no explanation, no markdown, no code block)
- Use imperative mood (e.g. 'add', 'fix', 'update')
- Keep it under 72 characters")

  if [[ -z "$msg" ]]; then
    echo "Failed to generate commit message."
    return 1
  fi

  echo "Message: $msg"
  git commit -m "$msg"
}
