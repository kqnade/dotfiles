unalias claude 2>/dev/null
claude() {
    local pat=""
    if [[ -z "$GITHUB_PAT" ]] && pass show token/github >/dev/null 2>&1; then
        pat=$(pass show token/github)
    fi
    GITHUB_PAT="${GITHUB_PAT:-$pat}" command claude "$@"
}
