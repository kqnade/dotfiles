-- ╭──────────────────────────────────────────────────────────╮
-- │                    ToggleTerm                              │
-- │              Terminal management plugin                    │
-- ╰──────────────────────────────────────────────────────────╯

require("toggleterm").setup({
  -- Size of the terminal
  size = function(term)
    if term.direction == "horizontal" then
      return 15
    elseif term.direction == "vertical" then
      return vim.o.columns * 0.4
    end
  end,
  open_mapping = nil, -- Disable default mapping (we use custom keybindings)
  hide_numbers = true,
  shade_filetypes = {},
  shade_terminals = true,
  shading_factor = 2, -- Darkness of background
  start_in_insert = true,
  insert_mappings = true,
  persist_size = true,
  persist_mode = true,
  direction = "float",
  close_on_exit = true,
  shell = vim.o.shell,
  auto_scroll = true,
  float_opts = {
    border = "rounded",
    winblend = 0,
    highlights = {
      border = "Normal",
      background = "Normal",
    },
  },
})

-- Custom terminal commands
local Terminal = require("toggleterm.terminal").Terminal

local lazygit = Terminal:new({ cmd = "lazygit", hidden = true, direction = "float" })
function _LAZYGIT_TOGGLE()
  lazygit:toggle()
end

vim.keymap.set("n", "<leader>gg", "<cmd>lua _LAZYGIT_TOGGLE()<CR>", { noremap = true, silent = true, desc = "LazyGit" })

-- Terminal mode keybindings (matching core keymaps for consistency)
vim.keymap.set("t", "<Esc><Esc>", "<C-\\><C-n>", { noremap = true, silent = true, desc = "Exit terminal mode" })
vim.keymap.set("t", "<C-h>", "<cmd>wincmd h<CR>", { noremap = true, silent = true, desc = "Move to left window" })
vim.keymap.set("t", "<C-n>", "<cmd>wincmd j<CR>", { noremap = true, silent = true, desc = "Move to lower window" })
vim.keymap.set("t", "<C-e>", "<cmd>wincmd k<CR>", { noremap = true, silent = true, desc = "Move to upper window" })
vim.keymap.set("t", "<C-i>", "<cmd>wincmd l<CR>", { noremap = true, silent = true, desc = "Move to right window" })

