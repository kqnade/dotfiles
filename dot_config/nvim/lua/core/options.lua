-- ╭──────────────────────────────────────────────────────────╮
-- │                     Neovim Options                        │
-- │              Inherited from .vimrc + Modern               │
-- ╰──────────────────────────────────────────────────────────╯

local opt = vim.opt
local g = vim.g

-- ─── Mise Integration ───────────────────────────────────────
-- Add mise shims to PATH for LSP/Mason to find tools
local mise_shims = vim.fn.expand("~/.local/share/mise/shims")
if vim.fn.isdirectory(mise_shims) == 1 then
  vim.env.PATH = mise_shims .. ":" .. vim.env.PATH
end

-- ─── Performance ───────────────────────────────────────────
opt.updatetime = 200
opt.timeoutlen = 300
opt.redrawtime = 1500
opt.lazyredraw = false -- disabled for noice.nvim compatibility

-- ─── File Handling ─────────────────────────────────────────
opt.swapfile = false
opt.backup = false
opt.undofile = true
opt.undodir = vim.fn.stdpath("data") .. "/undo"
opt.fileencoding = "utf-8"

-- ─── UI ────────────────────────────────────────────────────
opt.number = true
opt.relativenumber = true
opt.cursorline = true
opt.cursorcolumn = true
opt.signcolumn = "yes"
opt.ruler = true
opt.cmdheight = 1
opt.laststatus = 3 -- global statusline
opt.showmode = false -- shown in lualine
opt.showcmd = true
opt.title = true
opt.termguicolors = true
opt.background = "dark"
opt.pumheight = 10
opt.pumblend = 10
opt.winblend = 10
opt.scrolloff = 8
opt.sidescrolloff = 8
opt.fillchars = {
  eob = " ",
  fold = " ",
  foldopen = "-",
  foldsep = " ",
  foldclose = "+",
  vert = "│",
}

-- ─── Search ────────────────────────────────────────────────
opt.hlsearch = true
opt.incsearch = true
opt.ignorecase = true
opt.smartcase = true
opt.inccommand = "split"

-- ─── Indentation ───────────────────────────────────────────
opt.expandtab = true
opt.tabstop = 2
opt.shiftwidth = 2
opt.softtabstop = 2
opt.smarttab = true
opt.autoindent = true
opt.smartindent = true

-- ─── Line Handling ─────────────────────────────────────────
opt.wrap = false
opt.linebreak = true
opt.whichwrap:append("<>[]hl")
opt.breakindent = true

-- ─── Window/Buffer ─────────────────────────────────────────
opt.splitbelow = true
opt.splitright = true
opt.hidden = true
opt.equalalways = false

-- ─── Completion ────────────────────────────────────────────
opt.completeopt = { "menu", "menuone", "noselect" }
opt.wildmenu = true
opt.wildmode = "longest:full,full"
opt.wildignore:append({ "*.o", "*~", "*.pyc", "*pycache*" })

-- ─── List Characters ───────────────────────────────────────
opt.list = true
opt.listchars = {
  tab = "» ",
  trail = "·",
  extends = "❯",
  precedes = "❮",
  nbsp = "␣",
}

-- ─── Matching ──────────────────────────────────────────────
opt.showmatch = true
opt.matchtime = 2

-- ─── Mouse & Clipboard ─────────────────────────────────────
opt.mouse = "a"
opt.clipboard = "unnamedplus"

-- ─── Folding (using Treesitter) ────────────────────────────
opt.foldmethod = "expr"
opt.foldexpr = "v:lua.vim.treesitter.foldexpr()"
opt.foldlevel = 99
opt.foldlevelstart = 99
opt.foldenable = true

-- ─── Misc ──────────────────────────────────────────────────
opt.shortmess:append("sI")
opt.iskeyword:append("-")
opt.formatoptions:remove({ "c", "r", "o" })
opt.sessionoptions = { "buffers", "curdir", "tabpages", "winsize", "help", "globals", "skiprtp", "folds" }

-- ─── Neovim Provider ───────────────────────────────────────
g.loaded_python3_provider = 0
g.loaded_perl_provider = 0
g.loaded_ruby_provider = 0
g.loaded_node_provider = 0
