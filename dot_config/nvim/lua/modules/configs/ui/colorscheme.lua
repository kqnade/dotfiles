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
