#!/bin/bash

set -uo pipefail

remote_url=$(git config --get remote.origin.url 2>/dev/null || true)
remote_url=${remote_url%/}
remote_url=${remote_url%.git}

case "$remote_url" in
  git@github.com:*) repository_path=${remote_url#git@github.com:} ;;
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
esac

echo "Claude is authorized only for livesense-inc and jobtalk repositories." >&2
exit 2
