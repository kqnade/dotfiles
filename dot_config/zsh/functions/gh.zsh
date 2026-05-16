unalias gh 2>/dev/null
gh() {
    if [[ -t 0 && -z "$GH_TOKEN" ]] && command -v op >/dev/null 2>&1; then
        local ref="${GITHUB_PAT_OP_REF:-op://Personal/GitHub/token}"
        local token
        if token=$(op read "$ref" 2>/dev/null) && [[ -n "$token" ]]; then
            export GH_TOKEN="$token"
        fi
    fi
    command gh "$@"
}
