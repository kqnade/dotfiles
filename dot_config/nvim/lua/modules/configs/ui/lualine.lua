-- ╭──────────────────────────────────────────────────────────╮
-- │                       Lualine                             │
-- ╰──────────────────────────────────────────────────────────╯

local function diff_source()
  local gitsigns = vim.b.gitsigns_status_dict
  if gitsigns then
    return {
      added = gitsigns.added,
      modified = gitsigns.changed,
      removed = gitsigns.removed,
    }
  end
end

local function lsp_clients()
  local clients = vim.lsp.get_clients({ bufnr = 0 })
  if #clients == 0 then
    return ""
  end

  local names = {}
  for _, client in ipairs(clients) do
    table.insert(names, client.name)
  end
  return " " .. table.concat(names, ", ")
end


require("lualine").setup({
  options = {
    icons_enabled = true,
    theme = "catppuccin",
    component_separators = { left = "", right = "" },
    section_separators = { left = "", right = "" },
    disabled_filetypes = {
      statusline = { "alpha", "dashboard" },
      winbar = {},
    },
    ignore_focus = {},
    always_divide_middle = true,
    globalstatus = true,
    refresh = {
      statusline = 1000,
      tabline = 1000,
      winbar = 1000,
    },
  },
  sections = {
    lualine_a = {
      {
        "mode",
        fmt = function(str)
          local map = {
            ["NORMAL"]   = "NOR",
            ["INSERT"]   = "INS",
            ["VISUAL"]   = "VIS",
            ["V-LINE"]   = "V-L",
            ["V-BLOCK"]  = "V-B",
            ["SELECT"]   = "SEL",
            ["S-LINE"]   = "S-L",
            ["S-BLOCK"]  = "S-B",
            ["REPLACE"]  = "REP",
            ["COMMAND"]  = "CMD",
            ["TERMINAL"] = "TER",
            ["EX"]       = "EX ",
          }
          local mode_str = map[str] or str:sub(1, 3)
          if vim.fn.exists("*skkeleton#is_enabled") == 1 and vim.fn["skkeleton#is_enabled"]() == 1 then
            local skk = vim.fn["skkeleton#mode"]()
            local skk_str = ({ hira = "かな", kata = "カナ", ascii = "ASC" })[skk] or "SKK"
            return mode_str .. " / " .. skk_str
          end
          return mode_str
        end,
      },
    },
    lualine_b = {
      { "branch", icon = "" },
      {
        "diff",
        source = diff_source,
        symbols = { added = " ", modified = " ", removed = " " },
      },
    },
    lualine_c = {
      {
        "filename",
        file_status = true,
        newfile_status = true,
        path = 1,
        symbols = {
          modified = " ●",
          readonly = " ",
          unnamed = "[No Name]",
          newfile = "[New]",
        },
      },
    },
    lualine_x = {
      {
        "diagnostics",
        sources = { "nvim_diagnostic" },
        symbols = { error = " ", warn = " ", info = " ", hint = "󰌵 " },
      },
      { lsp_clients },
    },
    lualine_y = {
      { "filetype", icon_only = true },
      { "encoding" },
      {
        "fileformat",
        symbols = {
          unix = "",
          dos = "",
          mac = "",
        },
      },
    },
    lualine_z = {
      { "progress" },
      { "location" },
    },
  },
  inactive_sections = {
    lualine_a = {},
    lualine_b = {},
    lualine_c = { "filename" },
    lualine_x = { "location" },
    lualine_y = {},
    lualine_z = {},
  },
  tabline = {},
  winbar = {},
  inactive_winbar = {},
  extensions = {
    "lazy",
    "mason",
    "neo-tree",
    "nvim-tree",
    "nvim-dap-ui",
    "quickfix",
    "toggleterm",
    "trouble",
  },
})
