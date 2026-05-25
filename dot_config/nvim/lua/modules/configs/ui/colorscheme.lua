-- ╭──────────────────────────────────────────────────────────╮
-- │                      Colorscheme                         │
-- │                       Kanagawa                           │
-- ╰──────────────────────────────────────────────────────────╯

require("kanagawa").setup({
  transparent_background = false,
  undercurl = true,
  commentStyle = { italic = true },
  keywordStyle = { bold = true, italic = true },
  statementStyle = { bold = true },
  typeStyle = { bold = true },
  variablebuiltinStyle = { italic = true },
  specialReturn = true,
  specialException = true,
  colors = {
    palette = {},
    theme = {},
  },
  overrides = function(colors)
    return {}
  end,
  theme = "wave",
  background = {
    dark = "wave",
    light = "lotus",
  },
})

if vim.o.background == "light" then
  vim.cmd("colorscheme kanagawa-lotus")
else
  vim.cmd("colorscheme kanagawa-wave")
end
