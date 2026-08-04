#!/bin/bash

set -uo pipefail

deny() {
	echo "Claude is authorized only for livesense-inc and jobtalk repositories: $1." >&2
	exit 2
}

hook_input=$(cat)
repository_cwd=$PWD
if [[ -n "$hook_input" ]]; then
	repository_cwd=$(
		printf '%s' "$hook_input" |
			jq -er '.cwd | strings | select(length > 0)' 2>/dev/null || true
	)
	if [[ -z "$repository_cwd" ]]; then
		deny "hook input cwd is missing or invalid"
	fi
fi

case "$repository_cwd" in
/*) ;;
*) deny "hook input cwd is missing or invalid" ;;
esac

remote_url=""
if [[ -n "$repository_cwd" ]]; then
	remote_url=$(git -C "$repository_cwd" config --get remote.origin.url 2>/dev/null || true)
fi
remote_url=${remote_url%/}
remote_url=${remote_url%.git}

case "$remote_url" in
git@github.com:*) repository_path=${remote_url#git@github.com:} ;;
ssh://git@github.com/*) repository_path=${remote_url#ssh://git@github.com/} ;;
https://github.com/*) repository_path=${remote_url#https://github.com/} ;;
*) repository_path="" ;;
esac

case "$repository_path" in
livesense-inc/* | jobtalk/*)
	repository_name=${repository_path#*/}
	case "$repository_name" in
	"" | */*) ;;
	*) exit 0 ;;
	esac
	;;
"") deny "GitHub remote format is unsupported" ;;
*) deny "repository owner is not authorized" ;;
esac

deny "repository name is missing or invalid"
