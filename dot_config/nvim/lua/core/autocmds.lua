-- ╭──────────────────────────────────────────────────────────╮
-- │                     Autocommands                          │
-- ╰──────────────────────────────────────────────────────────╯

local autocmd = vim.api.nvim_create_autocmd
local augroup = vim.api.nvim_create_augroup

-- ─── General Settings ──────────────────────────────────────
local general = augroup("General", { clear = true })

-- Restore cursor position
autocmd("BufReadPost", {
  group = general,
  callback = function()
    local mark = vim.api.nvim_buf_get_mark(0, '"')
    local lcount = vim.api.nvim_buf_line_count(0)
    if mark[1] > 0 and mark[1] <= lcount then
      pcall(vim.api.nvim_win_set_cursor, 0, mark)
    end
  end,
  desc = "Restore cursor position",
})

-- Remove trailing whitespace on save
autocmd("BufWritePre", {
  group = general,
  pattern = "*",
  callback = function()
    local save_cursor = vim.fn.getpos(".")
    vim.cmd([[%s/\s\+$//e]])
    vim.fn.setpos(".", save_cursor)
  end,
  desc = "Remove trailing whitespace",
})

-- Highlight on yank
autocmd("TextYankPost", {
  group = general,
  callback = function()
    vim.highlight.on_yank({ higroup = "IncSearch", timeout = 200 })
  end,
  desc = "Highlight yanked text",
})

-- Auto resize splits when window resized
autocmd("VimResized", {
  group = general,
  callback = function()
    vim.cmd("tabdo wincmd =")
  end,
  desc = "Auto resize splits",
})

-- ─── FileType Settings ─────────────────────────────────────
local filetype = augroup("FileType", { clear = true })

-- Close these filetypes with 'q'
autocmd("FileType", {
  group = filetype,
  pattern = {
    "help",
    "man",
    "lspinfo",
    "checkhealth",
    "qf",
    "query",
    "notify",
    "spectre_panel",
    "startuptime",
    "tsplayground",
    "neotest-output",
    "neotest-summary",
    "neotest-output-panel",
  },
  callback = function(event)
    vim.bo[event.buf].buflisted = false
    vim.keymap.set("n", "q", "<cmd>close<CR>", { buffer = event.buf, silent = true })
  end,
  desc = "Close with q",
})

-- Set proper indentation for specific filetypes
autocmd("FileType", {
  group = filetype,
  pattern = { "go", "python", "rust" },
  callback = function()
    vim.opt_local.tabstop = 4
    vim.opt_local.shiftwidth = 4
  end,
  desc = "Set 4-space indent",
})

-- Disable auto-comment on new lines
autocmd("FileType", {
  group = filetype,
  pattern = "*",
  callback = function()
    vim.opt_local.formatoptions:remove({ "c", "r", "o" })
  end,
  desc = "Disable auto-comment",
})

-- ─── LSP ───────────────────────────────────────────────────
local lsp_group = augroup("LSP", { clear = true })

-- Show diagnostics on cursor hold
autocmd("CursorHold", {
  group = lsp_group,
  callback = function()
    local opts = {
      focusable = false,
      close_events = { "BufLeave", "CursorMoved", "InsertEnter", "FocusLost" },
      border = "rounded",
      source = "always",
      prefix = " ",
      scope = "cursor",
    }
    vim.diagnostic.open_float(nil, opts)
  end,
  desc = "Show diagnostics on hover",
})

-- ─── Terminal ──────────────────────────────────────────────
local terminal = augroup("Terminal", { clear = true })

-- Auto enter insert mode in terminal
autocmd("TermOpen", {
  group = terminal,
  pattern = "*",
  callback = function()
    vim.opt_local.number = false
    vim.opt_local.relativenumber = false
    vim.cmd("startinsert")
  end,
  desc = "Terminal settings",
})

-- ─── Large Files ───────────────────────────────────────────
local large_file = augroup("LargeFile", { clear = true })

-- Disable features for large files
autocmd("BufReadPre", {
  group = large_file,
  callback = function(args)
    local ok, stats = pcall(vim.loop.fs_stat, vim.api.nvim_buf_get_name(args.buf))
    if ok and stats and stats.size > 1024 * 1024 then -- 1MB
      vim.b[args.buf].large_file = true
      vim.opt_local.foldmethod = "manual"
      vim.opt_local.spell = false
      vim.cmd("syntax off")
    end
  end,
  desc = "Optimize for large files",
})
