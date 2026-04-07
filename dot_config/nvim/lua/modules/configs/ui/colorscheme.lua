-- ╭──────────────────────────────────────────────────────────╮
-- │                      Colorscheme                          │
-- │                      Catppuccin                           │
-- ╰──────────────────────────────────────────────────────────╯

require("catppuccin").setup({
  flavour = "mocha",
  transparent_background = true,
  custom_highlights = function()
    return {
      NormalFloat = { bg = "NONE" },
      FloatBorder = { bg = "NONE" },
      StatusLine = { bg = "NONE" },
      StatusLineNC = { bg = "NONE" },
    }
  end,
  styles = {
    comments = { "italic" },
    conditionals = { "italic" },
    keywords = { "bold", "italic" },
  },
  integrations = {
    cmp = true,
    gitsigns = true,
    mason = true,
    neotest = true,
    notify = true,
    treesitter = true,
    telescope = { enabled = true },
    which_key = true,
    native_lsp = {
      enabled = true,
      underlines = {
        errors = { "undercurl" },
        hints = { "undercurl" },
        warnings = { "undercurl" },
        information = { "undercurl" },
      },
    },
  },
})

vim.cmd("colorscheme catppuccin")
