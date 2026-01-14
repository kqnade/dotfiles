-- ╭──────────────────────────────────────────────────────────╮
-- │                      Which-Key                            │
-- ╰──────────────────────────────────────────────────────────╯

local wk = require("which-key")

wk.setup({
  preset = "modern",
  delay = 300,
  icons = {
    breadcrumb = "»",
    separator = "➜",
    group = "+",
    ellipsis = "…",
    mappings = true,
    rules = {},
    colors = true,
    keys = {
      Up = " ",
      Down = " ",
      Left = " ",
      Right = " ",
      C = "󰘴 ",
      M = "󰘵 ",
      D = "󰘳 ",
      S = "󰘶 ",
      CR = "󰌑 ",
      Esc = "󱊷 ",
      ScrollWheelDown = "󱕐 ",
      ScrollWheelUp = "󱕑 ",
      NL = "󰌑 ",
      BS = "󰁮",
      Space = "󱁐 ",
      Tab = "󰌒 ",
      F1 = "󱊫",
      F2 = "󱊬",
      F3 = "󱊭",
      F4 = "󱊮",
      F5 = "󱊯",
      F6 = "󱊰",
      F7 = "󱊱",
      F8 = "󱊲",
      F9 = "󱊳",
      F10 = "󱊴",
      F11 = "󱊵",
      F12 = "󱊶",
    },
  },
  win = {
    no_overlap = true,
    border = "rounded",
    padding = { 1, 2 },
    title = true,
    title_pos = "center",
    zindex = 1000,
  },
  layout = {
    width = { min = 20 },
    spacing = 3,
  },
  keys = {
    scroll_down = "<c-d>",
    scroll_up = "<c-u>",
  },
  sort = { "local", "order", "group", "alphanum", "mod" },
  expand = 0,
  replace = {
    key = {
      function(key)
        return require("which-key.view").format(key)
      end,
    },
    desc = {
      { "<Plug>%(?(.-)%)?", "%1" },
      { "^%+", "" },
      { "<[cC]md>", "" },
      { "<[cC][rR]>", "" },
      { "<[sS]ilent>", "" },
      { "^lua%s+", "" },
      { "^call%s+", "" },
      { "^:%s*", "" },
    },
  },
  show_help = true,
  show_keys = true,
  disable = {
    ft = {},
    bt = {},
  },
  debug = false,
})

-- ─── Key Group Registration ─────────────────────────────────
wk.add({
  -- Top level groups
  { "<leader>b", group = "Buffer" },
  { "<leader>c", group = "Code" },
  { "<leader>d", group = "Debug" },
  { "<leader>f", group = "Find" },
  { "<leader>g", group = "Git" },
  { "<leader>l", group = "Lazy" },
  { "<leader>s", group = "Split/Search" },
  { "<leader>t", group = "Test" },
  { "<leader>w", group = "Window/Workspace" },
  { "<leader>x", group = "Swap" },

  -- Git subgroups
  { "<leader>gf", group = "Find (Git)" },

  -- Find subgroups
  { "<leader>fg", group = "Git" },
})
