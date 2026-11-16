#!/usr/bin/env bash

set -euo pipefail

[[ "$(uname -s)" == Linux ]] || exit 0
command -v herdr >/dev/null 2>&1 || exit 0

# shellcheck source=/dev/null
source "$HOME/.config/dotfiles/client-runtime.sh"
[[ "$DOTFILES_CLAUDE_WORK_ENABLED" == true ]] || exit 0
command -v claude >/dev/null 2>&1 || exit 0
herdr integration install claude >/dev/null
