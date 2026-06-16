# mise wrapper — inject GITHUB_TOKEN from 1Password via op run
unalias mise 2>/dev/null
mise() {
    local env_file="${HOME}/.config/mise/.env"
    if [[ -f "$env_file" ]] && command -v op >/dev/null 2>&1; then
        op run --env-file="$env_file" -- mise "$@"
    else
        command mise "$@"
    fi
}
