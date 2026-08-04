unalias claude 2>/dev/null
claude() {
    local repository_guard="$HOME/.claude/hooks/authorize-repository.sh"
    if [[ ! -x "$repository_guard" ]]; then
        echo "Claude repository authorization hook is unavailable." >&2
        return 1
    fi
    "$repository_guard" </dev/null || return 1

    local pat=""
    local ref="${GITHUB_PAT_OP_REF:-op://Personal/GitHub/token}"
    if [[ -z "$GITHUB_PERSONAL_ACCESS_TOKEN" ]] && command -v op >/dev/null 2>&1; then
        pat=$(op read "$ref" 2>/dev/null) || pat=""
    fi
    GITHUB_PERSONAL_ACCESS_TOKEN="${GITHUB_PERSONAL_ACCESS_TOKEN:-$pat}" command claude "$@"
}
