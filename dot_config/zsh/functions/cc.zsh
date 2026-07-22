function git-cc() {
  local diff
  diff=$(git diff --staged)

  if [[ -z "$diff" ]]; then
    echo "No staged changes. Run 'git add' first."
    return 1
  fi

  local log
  log=$(git log --oneline -50)

  echo "Generating commit message..."

  local output
  output=$(mktemp "${TMPDIR:-/tmp}/git-cc.XXXXXX") || return 1

  printf 'Generate a conventional commit message with a gitmoji prefix for the git diff below.
Use the recent commits as style reference to stay consistent.

Format: <emoji> <type>: <description>

Gitmoji mapping:
  feat     → ✨
  fix      → 🐛
  refactor → ♻️
  docs     → 📝
  test     → ✅
  chore    → 🔧
  perf     → ⚡️
  ci       → 👷
  style    → 🎨
  revert   → ⏪️
  build    → 📦

Rules:
- Output the commit message ONLY (no explanation, no markdown, no code block)
- Use imperative mood (for example: add, fix, update)
- Keep it under 72 characters

== Recent commits (for style reference) ==
%s

== Git diff ==
%s
' "$log" "$diff" | codex exec \
    --model gpt-5.6-luna \
    --ephemeral \
    --sandbox read-only \
    --color never \
    --output-last-message "$output" \
    - >/dev/null
  local exit_code=$?

  local msg=""
  if ((exit_code == 0)); then
    msg=$(<"$output")
  fi
  rm -f "$output"

  if [[ -z "$msg" ]]; then
    echo "Failed to generate commit message."
    return 1
  fi

  echo "Message: $msg"
  git commit -m "$msg"
}

# Backward compatibility for the old command name.
function git-ccc() {
  git-cc "$@"
}
