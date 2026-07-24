#!/usr/bin/env bash

set -euo pipefail

readonly DOTFILES_ROOT="${HOME}/repos/github.com/kqnade/dotfiles"

cd "$DOTFILES_ROOT"
mise upgrade --bump --local --yes
mise lock --platform macos-arm64,macos-x64,linux-x64 --yes
taplo format mise.toml

printf 'Updated tool pins and mise.lock. Review both files before committing.\n'
