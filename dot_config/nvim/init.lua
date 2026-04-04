-- ╭──────────────────────────────────────────────────────────╮
-- │                    Neovim Configuration                   │
-- │              Optimized for speed & Colemak                │
-- ╰──────────────────────────────────────────────────────────╯

-- Disable built-in plugins for faster startup
local disabled_built_ins = {
  "gzip",
  "tar",
  "tarPlugin",
  "zip",
  "zipPlugin",
  "rrhelper",
  "2html_plugin",
  "vimball",
  "vimballPlugin",
  "getscript",
  "getscriptPlugin",
  "netrw",
  "netrwPlugin",
  "netrwSettings",
  "netrwFileHandlers",
  "matchit",
  "matchparen",
  "logiPat",
  "logipat",
  "spellfile_plugin",
  "tutor_mode_plugin",
  "remote_plugins",
  "shada_plugin",
}

for _, plugin in ipairs(disabled_built_ins) do
  vim.g["loaded_" .. plugin] = 1
end

-- Set leader key before lazy.nvim
vim.g.mapleader = " "
vim.g.maplocalleader = " "

-- Load core modules
require("core")

-- Bootstrap and load plugins
require("modules.plugins")
