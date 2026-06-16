# mise wrapper — inject GITHUB_TOKEN from 1Password via op run.
# WSL only: op.exe runs commands in a Windows context, so we route back into
# this WSL distro to ensure the Linux mise binary is used.
unalias mise 2>/dev/null
mise() {
    local env_file="${HOME}/.config/mise/.env"
    local mise_bin="${HOME}/.local/bin/mise"
    if [[ -f "$env_file" ]] && command -v op >/dev/null 2>&1 && [[ -x "$mise_bin" ]]; then
        if [[ -n "${WSL_DISTRO_NAME:-}" ]] && (command -v wsl >/dev/null 2>&1 || command -v wsl.exe >/dev/null 2>&1); then
            local wsl_cmd
            if command -v wsl >/dev/null 2>&1; then
                wsl_cmd=wsl
            else
                wsl_cmd=wsl.exe
            fi
            op run --env-file="$env_file" -- "$wsl_cmd" -d "$WSL_DISTRO_NAME" -- "$mise_bin" "$@"
        else
            op run --env-file="$env_file" -- "$mise_bin" "$@"
        fi
    else
        command mise "$@"
    fi
}
