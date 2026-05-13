unalias gh 2>/dev/null
gh() {
    if [[ -t 0 && -z "$GH_TOKEN" ]]; then
        if pass show token/github >/dev/null 2>&1; then
            export GH_TOKEN=$(pass show token/github)
        fi
    fi
    command gh "$@"
}
