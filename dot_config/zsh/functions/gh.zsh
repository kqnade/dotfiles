unalias gh 2>/dev/null
gh() {
    if [[ -t 0 && -z "$GH_TOKEN" ]]; then
        if pass github/token >/dev/null 2>&1; then
            export GH_TOKEN=$(pass github/token)
        fi
    fi
    command gh "$@"
}
