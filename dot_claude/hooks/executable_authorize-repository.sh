#!/bin/bash

set -uo pipefail

deny() {
	echo "Claude repository authorization rejected the hook input: $1." >&2
	exit 2
}

hook_input=$(cat)
if printf '%s' "$hook_input" | jq -e '
	type == "object" and
	(.cursor_version | type == "string" and length > 0) and
	(.hook_event_name == "preToolUse" or .hook_event_name == "beforeSubmitPrompt")
' >/dev/null 2>&1; then
	exit 0
fi

if [[ -z "$hook_input" ]]; then
	exit 0
fi

repository_cwd=$(
	printf '%s' "$hook_input" |
		jq -er '.cwd | strings | select(length > 0)' 2>/dev/null || true
)
if [[ -z "$repository_cwd" ]]; then
	deny "hook input cwd is missing or invalid"
fi

case "$repository_cwd" in
/*) exit 0 ;;
*) deny "hook input cwd is missing or invalid" ;;
esac
