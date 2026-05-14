unalias claude 2>/dev/null
claude() {
    local pat=""
    if [[ -z "$GITHUB_PERSONAL_ACCESS_TOKEN" ]] && pass show token/github >/dev/null 2>&1; then
        pat=$(pass show token/github)
    fi
    GITHUB_PERSONAL_ACCESS_TOKEN="${GITHUB_PERSONAL_ACCESS_TOKEN:-$pat}" command claude "$@"
}
