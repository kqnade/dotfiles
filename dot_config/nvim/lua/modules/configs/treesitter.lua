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
  "query",
  "diff",
  "gitcommit",
  "gitignore",
  "dockerfile",
}

require("nvim-treesitter.configs").setup({
  ensure_installed = ensure_installed,
  auto_install = true,
  highlight = { enable = true },
  indent = { enable = true },
})

-- Enable treesitter-based features for supported buffers
vim.api.nvim_create_autocmd("FileType", {
  callback = function(args)
    local ok = pcall(vim.treesitter.start, args.buf)
    if ok then
      vim.bo[args.buf].indentexpr = "v:lua.require'nvim-treesitter'.indentexpr()"
    end
  end,
})

-- ─── Incremental Selection ───────────────────────────────────
vim.keymap.set("n", "<C-space>", function()
  local ok, inc_sel = pcall(require, "nvim-treesitter.incremental_selection")
  if ok then inc_sel.init_selection() end
end, { desc = "Init treesitter selection" })

vim.keymap.set("x", "<C-space>", function()
  local ok, inc_sel = pcall(require, "nvim-treesitter.incremental_selection")
  if ok then inc_sel.node_incremental() end
end, { desc = "Increment treesitter selection" })

vim.keymap.set("x", "<BS>", function()
  local ok, inc_sel = pcall(require, "nvim-treesitter.incremental_selection")
  if ok then inc_sel.node_decremental() end
end, { desc = "Decrement treesitter selection" })

-- ─── Rainbow Delimiters ──────────────────────────────────────
local rainbow_ok, rainbow_delimiters = pcall(require, "rainbow-delimiters")
if rainbow_ok then
  vim.g.rainbow_delimiters = {
    strategy = {
      [""] = rainbow_delimiters.strategy["global"],
      vim = rainbow_delimiters.strategy["local"],
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
end
