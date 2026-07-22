# Agent Mail's installer owns this secret file. Export only the bearer token
# needed by HTTP MCP clients; do not evaluate arbitrary contents as shell code.
_agent_mail_env="$HOME/.config/mcp-agent-mail/config.env"
if [[ -r "$_agent_mail_env" ]]; then
  while IFS='=' read -r _agent_mail_key _agent_mail_value; do
    if [[ "$_agent_mail_key" == "HTTP_BEARER_TOKEN" ]]; then
      export HTTP_BEARER_TOKEN="$_agent_mail_value"
      break
    fi
  done < "$_agent_mail_env"
fi
unset _agent_mail_env _agent_mail_key _agent_mail_value

# Keep every linked worktree on the base repository's Agent Mail project. Git's
# common directory is <base>/.git for both the main checkout and its worktrees.
# Refresh on cd so long-lived Herdr shells cannot retain another repo's key.
autoload -Uz add-zsh-hook
_agent_mail_sync_project() {
  local common_dir
  if common_dir=$(git rev-parse --path-format=absolute --git-common-dir 2>/dev/null); then
    export AGENT_MAIL_PROJECT="${common_dir:h}"
  else
    unset AGENT_MAIL_PROJECT
  fi
}
add-zsh-hook chpwd _agent_mail_sync_project
_agent_mail_sync_project
