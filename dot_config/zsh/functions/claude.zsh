unalias claude 2>/dev/null
claude() {
    local pat=""
    local ref="${GITHUB_PAT_OP_REF:-op://Personal/GitHub/token}"
    if [[ -z "$GITHUB_PERSONAL_ACCESS_TOKEN" ]] && command -v op >/dev/null 2>&1; then
        pat=$(op read "$ref" 2>/dev/null) || pat=""
    fi
    GITHUB_PERSONAL_ACCESS_TOKEN="${GITHUB_PERSONAL_ACCESS_TOKEN:-$pat}" command claude "$@"
}
