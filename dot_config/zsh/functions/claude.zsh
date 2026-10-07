unalias claude 2>/dev/null
claude() {
    local repository_guard="$HOME/.claude/hooks/authorize-repository.sh"
    if [[ ! -x "$repository_guard" ]]; then
        echo "Claude repository authorization hook is unavailable." >&2
        return 1
    fi
    "$repository_guard" </dev/null || return 1

    if [[ ! -r "$HOME/.config/dotfiles/client-runtime.sh" ]]; then
        echo "Client runtime configuration is missing; apply the managed dotfiles first." >&2
        return 1
    fi
    source "$HOME/.config/dotfiles/client-runtime.sh" || return 1

    local ref="${GITHUB_PAT_OP_REF-$DOTFILES_OP_GITHUB_REF}"
    local pat="${GITHUB_PERSONAL_ACCESS_TOKEN:-}"
    if [[ -z "$pat" ]]; then
        [[ "$ref" == op://* ]] || {
            echo "GitHub 1Password reference is missing or invalid." >&2
            return 1
        }
        pat=$(op read "$ref") || return 1
        [[ -n "$pat" ]] || {
            echo "GitHub token is empty." >&2
            return 1
        }
    fi
    GITHUB_PERSONAL_ACCESS_TOKEN="$pat" command claude "$@"
}
