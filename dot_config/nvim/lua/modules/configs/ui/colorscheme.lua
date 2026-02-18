-- ╭──────────────────────────────────────────────────────────╮
-- │                      Colorscheme                          │
-- │                       OneDark                             │
-- ╰──────────────────────────────────────────────────────────╯

require("onedarkpro").setup({
  colors = {}, -- Override default colors
  highlights = {}, -- Override default highlights
  styles = {
    types = "NONE",
    methods = "NONE",
    numbers = "NONE",
    strings = "NONE",
    comments = "italic",
    keywords = "bold,italic",
    constants = "NONE",
    functions = "NONE",
    operators = "NONE",
    variables = "NONE",
    parameters = "NONE",
    conditionals = "italic",
    virtual_text = "NONE",
  },
  filetypes = {
    all = true,
  },
  plugins = {
    all = true,
  },
  options = {
    cursorline = true,
    transparency = false,
    terminal_colors = true,
    lualine_transparency = false,
    highlight_inactive_windows = false,
  },
})

-- Apply the colorscheme
vim.cmd("colorscheme onedark")

-- Inherit background from Kitty (no bg override, keeps terminal's color)
vim.api.nvim_set_hl(0, "Normal", { bg = "NONE" })
vim.api.nvim_set_hl(0, "NormalNC", { bg = "NONE" })
