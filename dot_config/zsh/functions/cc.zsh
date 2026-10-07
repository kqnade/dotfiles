function _git_cc_is_repository_1password_signer_path() {
  case "$1" in
  "/Applications/1Password.app/Contents/MacOS/op-ssh-sign" | "/mnt/c/Users/Yuzuki Kana/AppData/Local/Microsoft/WindowsApps/op-ssh-sign-wsl.exe" | "/opt/1Password/op-ssh-sign")
    return 0
    ;;
  esac
  return 1
}

function _git_cc_is_repository_1password_agent_path() {
  case "$1" in
  "$HOME/Library/Group Containers/2BUA8C4S2C.com.1password/t/agent.sock"|"$HOME/.1password/agent.sock")
    return 0
    ;;
  esac
  return 1
}

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
  if ! output=$(mktemp "${TMPDIR:-/tmp}/git-cc.XXXXXX"); then
    echo "Failed to create temporary output for commit message generation."
    return 1
  fi

  local generation_status msg=""
  if printf 'Generate a conventional commit message with a gitmoji prefix for the git diff below.
Use the recent commits as style reference to stay consistent.

Format: <emoji> <type>[(scope)]: <description>
Scopes use lowercase letters, digits, and separated dot, slash, underscore, or hyphen segments.

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
' "$log" "$diff" | PI_EXECUTION_SOURCE=git_cc "$HOME/.local/bin/pi-telemetry" \
    --provider openai-codex \
    --model gpt-6-luna \
    --thinking medium \
    --offline --print --no-session --no-tools \
    --no-extensions --extension "$HOME/.pi/agent/extensions/new-relic.ts" \
    --no-skills --no-prompt-templates --no-context-files >"$output"; then
    msg=$(<"$output")
  else
    generation_status=$?
    rm -f "$output"
    echo "Failed to generate commit message (pi-telemetry exited with status $generation_status)."
    return 1
  fi
  rm -f "$output"

  if [[ -z "$msg" ]]; then
    echo "Failed to generate commit message (pi-telemetry returned an empty message)."
    return 1
  fi

  if [[ "$msg" == *$'\n'* || "$msg" == *$'\r'* || ${#msg} -ge 72 ]]; then
    echo "Invalid commit message: use one line under 72 characters."
    return 1
  fi

  local -A gitmoji_for_type
  gitmoji_for_type=(
    feat '✨' fix '🐛' refactor '♻️' docs '📝' test '✅' chore '🔧'
    perf '⚡️' ci '👷' style '🎨' revert '⏪️' build '📦'
  )
  local header description scope commit_type expected_header valid_message=false
  header="${msg%%:*}"
  if [[ "$msg" != "$header: "* ]]; then
    echo "Invalid commit message: expected a matching gitmoji/type prefix and description."
    return 1
  fi
  description="${msg#"$header: "}"
  for commit_type in ${(k)gitmoji_for_type}; do
    expected_header="${gitmoji_for_type[$commit_type]} $commit_type"
    if [[ "$header" == "$expected_header" ]]; then
      valid_message=true
      break
    elif [[ "$header" == "$expected_header("*")" ]]; then
      scope="${header#"$expected_header"}"
      scope="${scope#\(}"
      scope="${scope%\)}"
      if [[ "$scope" =~ "^[a-z0-9]+([._/-][a-z0-9]+)*$" ]]; then
        valid_message=true
        break
      fi
    fi
  done
  if [[ "$valid_message" != true || -z "${description//[[:space:]]/}" ]]; then
    echo "Invalid commit message: expected a matching gitmoji/type prefix, optional scope, and description."
    return 1
  fi

  local signing_enabled signing_format signing_program signing_key signing_agent signer_configured=false
  signing_enabled=$(git config --bool --get commit.gpgsign 2>/dev/null)
  signing_format=$(git config --get gpg.format 2>/dev/null)
  signing_program=$(git config --get gpg.ssh.program 2>/dev/null)
  signing_key=$(git config --get user.signingkey 2>/dev/null)
  signing_agent=${SSH_AUTH_SOCK:-}
  if [[ "$signing_enabled" != true || "$signing_format" != ssh || -z "$signing_key" ]]; then
    echo "SSH commit signing is not fully configured."
    return 1
  fi
  if [[ -n "$signing_program" ]] && _git_cc_is_repository_1password_signer_path "$signing_program" && [[ -x "$signing_program" ]]; then
    signer_configured=true
  fi
  local agent_configured=false
  if _git_cc_is_repository_1password_agent_path "$signing_agent" && [[ -S "$signing_agent" ]]; then
    agent_configured=true
  fi
  if [[ "$signer_configured" != true && (-n "$signing_program" || "$agent_configured" != true) ]]; then
    echo "SSH signing must use a signer or agent at a repository-configured 1Password path."
    return 1
  fi

  echo "Message: $msg"
  if ! git commit -m "$msg"; then
    echo "Commit failed; check HEAD and the index before retrying."
    return 1
  fi

  local committed_head commit_object commit_headers
  if ! committed_head=$(git rev-parse --verify HEAD) || ! commit_object=$(git cat-file commit "$committed_head"); then
    echo "Commit was created but its SSH signature could not be inspected."
    return 1
  fi
  commit_headers="${commit_object%%$'\n\n'*}"
  if [[ "$commit_headers" != *$'\ngpgsig -----BEGIN SSH SIGNATURE-----\n'* ]]; then
    echo "Commit was created without an SSH signature."
    return 1
  fi
  if ! git verify-commit "$committed_head"; then
    echo "Commit was created but its SSH signature could not be verified."
    return 1
  fi
  return 0
}

function git-ccc() {
  git-cc "$@"
}
