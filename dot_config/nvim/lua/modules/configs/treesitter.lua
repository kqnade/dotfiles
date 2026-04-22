-- ╭──────────────────────────────────────────────────────────╮
-- │                      Treesitter                           │
-- ╰──────────────────────────────────────────────────────────╯

local ensure_installed = {
  -- Languages
  "go",
  "gomod",
  "gosum",
  "rust",
  "typescript",
  "tsx",
  "javascript",
  "python",
  "lua",
  "ruby",
  "c",
  "cpp",
  "java",
  -- Config/Data
  "json",
  "jsonc",
  "yaml",
  "toml",
  "xml",
  -- Web
  "html",
  "css",
  "scss",
  -- Misc
  "bash",
  "fish",
  "vim",
  "vimdoc",
  "regex",
  "markdown",
  "markdown_inline",
  "latex",
  "query",
  "diff",
  "gitcommit",
  "gitignore",
  "dockerfile",
}

-- Ensure parsers are installed (runs once on startup)
vim.api.nvim_create_autocmd("VimEnter", {
  callback = function()
    local installed = require("nvim-treesitter.config").get_installed()
    local installed_set = {}
    for _, lang in ipairs(installed) do
      installed_set[lang] = true
    end
    local missing = vim.tbl_filter(function(lang)
      return not installed_set[lang]
    end, ensure_installed)
    if #missing > 0 then
      require("nvim-treesitter.install").install(missing, { summary = true })
    end
  end,
  once = true,
})

-- Enable treesitter highlighting and indentation for supported buffers
vim.api.nvim_create_autocmd("FileType", {
  callback = function(args)
    local ok = pcall(vim.treesitter.start, args.buf)
    if ok then
      vim.bo[args.buf].indentexpr = "v:lua.require'nvim-treesitter'.indentexpr()"
    end
  end,
})

-- ─── Incremental Selection (built-in treesitter) ─────────────
local function get_visual_node()
  local node = vim.treesitter.get_node()
  if not node then return end
  local sr, sc, er, ec = node:range()
  vim.fn.setpos("'<", { 0, sr + 1, sc + 1, 0 })
  vim.fn.setpos("'>", { 0, er + 1, ec, 0 })
  vim.cmd("normal! gv")
end

vim.keymap.set("n", "<C-space>", get_visual_node, { desc = "Init treesitter selection" })

vim.keymap.set("x", "<C-space>", function()
  local node = vim.treesitter.get_node()
  if not node then return end
  local parent = node:parent()
  if not parent then return end
  local sr, sc, er, ec = parent:range()
  vim.fn.setpos("'<", { 0, sr + 1, sc + 1, 0 })
  vim.fn.setpos("'>", { 0, er + 1, ec, 0 })
  vim.cmd("normal! gv")
end, { desc = "Increment treesitter selection" })

vim.keymap.set("x", "<BS>", function()
  local node = vim.treesitter.get_node()
  if not node then return end
  -- Get the smallest child that contains cursor
  local cursor = vim.api.nvim_win_get_cursor(0)
  local row, col = cursor[1] - 1, cursor[2]
  local child = node:named_descendant_for_range(row, col, row, col)
  if child and child ~= node then
    local sr, sc, er, ec = child:range()
    vim.fn.setpos("'<", { 0, sr + 1, sc + 1, 0 })
    vim.fn.setpos("'>", { 0, er + 1, ec, 0 })
    vim.cmd("normal! gv")
  end
end, { desc = "Decrement treesitter selection" })

-- ─── Rainbow Delimiters ──────────────────────────────────────
vim.g.rainbow_delimiters = {
  strategy = {
    [""] = function(bufnr)
      local ok, parser = pcall(vim.treesitter.get_parser, bufnr)
      if not ok or not parser then return end
      return require("rainbow-delimiters.strategy.global")
    end,
  },
  query = {
    [""] = "rainbow-delimiters",
    lua = "rainbow-blocks",
  },
  highlight = {
    "RainbowDelimiterRed",
    "RainbowDelimiterYellow",
    "RainbowDelimiterBlue",
    "RainbowDelimiterOrange",
    "RainbowDelimiterGreen",
    "RainbowDelimiterViolet",
    "RainbowDelimiterCyan",
  },
}
