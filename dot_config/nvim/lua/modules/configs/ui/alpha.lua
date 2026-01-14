-- ╭──────────────────────────────────────────────────────────╮
-- │                        Alpha                              │
-- │                      Dashboard                            │
-- ╰──────────────────────────────────────────────────────────╯

local alpha = require("alpha")
local dashboard = require("alpha.themes.dashboard")

-- Header
dashboard.section.header.val = {
  [[                                                    ]],
  [[ ███╗   ██╗███████╗ ██████╗ ██╗   ██╗██╗███╗   ███╗ ]],
  [[ ████╗  ██║██╔════╝██╔═══██╗██║   ██║██║████╗ ████║ ]],
  [[ ██╔██╗ ██║█████╗  ██║   ██║██║   ██║██║██╔████╔██║ ]],
  [[ ██║╚██╗██║██╔══╝  ██║   ██║╚██╗ ██╔╝██║██║╚██╔╝██║ ]],
  [[ ██║ ╚████║███████╗╚██████╔╝ ╚████╔╝ ██║██║ ╚═╝ ██║ ]],
  [[ ╚═╝  ╚═══╝╚══════╝ ╚═════╝   ╚═══╝  ╚═╝╚═╝     ╚═╝ ]],
  [[                                                    ]],
}

-- Menu
dashboard.section.buttons.val = {
  dashboard.button("f", "  Find file", "<cmd>Telescope find_files<CR>"),
  dashboard.button("e", "  New file", "<cmd>enew<CR>"),
  dashboard.button("r", "  Recent files", "<cmd>Telescope oldfiles<CR>"),
  dashboard.button("g", "󰈬  Find word", "<cmd>Telescope live_grep<CR>"),
  dashboard.button("c", "  Configuration", "<cmd>e $MYVIMRC<CR>"),
  dashboard.button("l", "󰒲  Lazy", "<cmd>Lazy<CR>"),
  dashboard.button("m", "  Mason", "<cmd>Mason<CR>"),
  dashboard.button("q", "  Quit", "<cmd>qa<CR>"),
}

-- Footer
local function footer()
  local stats = require("lazy").stats()
  local ms = (math.floor(stats.startuptime * 100 + 0.5) / 100)
  return "⚡ Neovim loaded " .. stats.loaded .. "/" .. stats.count .. " plugins in " .. ms .. "ms"
end

dashboard.section.footer.val = footer()

-- Layout
dashboard.section.header.opts.hl = "AlphaHeader"
dashboard.section.buttons.opts.hl = "AlphaButtons"
dashboard.section.footer.opts.hl = "AlphaFooter"

dashboard.config.layout = {
  { type = "padding", val = 2 },
  dashboard.section.header,
  { type = "padding", val = 2 },
  dashboard.section.buttons,
  { type = "padding", val = 1 },
  dashboard.section.footer,
}

dashboard.config.opts.noautocmd = true

alpha.setup(dashboard.config)

-- Autocommands
vim.api.nvim_create_autocmd("User", {
  once = true,
  pattern = "LazyVimStarted",
  callback = function()
    dashboard.section.footer.val = footer()
    pcall(vim.cmd.AlphaRedraw)
  end,
})

-- Don't show statusline on alpha
vim.api.nvim_create_autocmd("User", {
  pattern = "AlphaReady",
  callback = function()
    vim.opt_local.laststatus = 0
    vim.opt_local.showtabline = 0
    vim.opt_local.winbar = nil
  end,
})

vim.api.nvim_create_autocmd("BufUnload", {
  buffer = 0,
  callback = function()
    vim.opt.laststatus = 3
    vim.opt.showtabline = 2
  end,
})
