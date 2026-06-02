export OP_PLUGIN_ALIASES_SOURCED=1
if [[ "$(uname -r)" != *microsoft* && "$(uname -r)" != *WSL* ]]; then
  alias gh="op plugin run -- gh"
fi
