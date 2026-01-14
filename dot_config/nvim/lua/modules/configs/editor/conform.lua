-- ╭──────────────────────────────────────────────────────────╮
-- │                       Conform                             │
-- │                     Formatter                             │
-- ╰──────────────────────────────────────────────────────────╯

require("conform").setup({
  formatters_by_ft = {
    -- Lua
    lua = { "stylua" },

    -- Go
    go = { "gofumpt", "goimports" },

    -- Rust (handled by rust-analyzer)
    rust = { "rustfmt" },

    -- JavaScript/TypeScript
    javascript = { "prettierd", "prettier", stop_after_first = true },
    typescript = { "prettierd", "prettier", stop_after_first = true },
    javascriptreact = { "prettierd", "prettier", stop_after_first = true },
    typescriptreact = { "prettierd", "prettier", stop_after_first = true },
    vue = { "prettierd", "prettier", stop_after_first = true },

    -- Python
    python = { "ruff_format", "black", stop_after_first = true },

    -- Ruby
    ruby = { "rubocop" },

    -- C/C++
    c = { "clang-format" },
    cpp = { "clang-format" },

    -- Java
    java = { "google-java-format" },

    -- Web
    html = { "prettierd", "prettier", stop_after_first = true },
    css = { "prettierd", "prettier", stop_after_first = true },
    scss = { "prettierd", "prettier", stop_after_first = true },
    json = { "prettierd", "prettier", stop_after_first = true },
    jsonc = { "prettierd", "prettier", stop_after_first = true },
    yaml = { "prettierd", "prettier", stop_after_first = true },

    -- Markdown
    markdown = { "prettierd", "prettier", stop_after_first = true },

    -- Shell
    sh = { "shfmt" },
    bash = { "shfmt" },
    zsh = { "shfmt" },

    -- SQL
    sql = { "sql_formatter" },

    -- Misc
    toml = { "taplo" },

    -- Fallback for all filetypes
    ["_"] = { "trim_whitespace" },
  },

  format_on_save = function(bufnr)
    -- Disable format on save for certain filetypes
    local ignore_filetypes = { "sql", "java" }
    if vim.tbl_contains(ignore_filetypes, vim.bo[bufnr].filetype) then
      return
    end

    -- Disable with a global or buffer-local variable
    if vim.g.disable_autoformat or vim.b[bufnr].disable_autoformat then
      return
    end

    return {
      timeout_ms = 3000,
      lsp_format = "fallback",
    }
  end,

  format_after_save = {
    lsp_format = "fallback",
  },

  notify_on_error = true,
  notify_no_formatters = true,
})

-- ─── Keymaps ────────────────────────────────────────────────
vim.keymap.set({ "n", "v" }, "<leader>cf", function()
  require("conform").format({
    lsp_format = "fallback",
    async = false,
    timeout_ms = 3000,
  })
end, { desc = "Format buffer" })

-- ─── Commands ───────────────────────────────────────────────
vim.api.nvim_create_user_command("FormatDisable", function(args)
  if args.bang then
    -- FormatDisable! will disable formatting globally
    vim.g.disable_autoformat = true
  else
    vim.b.disable_autoformat = true
  end
end, {
  desc = "Disable autoformat-on-save",
  bang = true,
})

vim.api.nvim_create_user_command("FormatEnable", function()
  vim.b.disable_autoformat = false
  vim.g.disable_autoformat = false
end, {
  desc = "Re-enable autoformat-on-save",
})

vim.api.nvim_create_user_command("FormatToggle", function()
  if vim.b.disable_autoformat or vim.g.disable_autoformat then
    vim.b.disable_autoformat = false
    vim.g.disable_autoformat = false
    vim.notify("Autoformat enabled", vim.log.levels.INFO)
  else
    vim.b.disable_autoformat = true
    vim.notify("Autoformat disabled for buffer", vim.log.levels.INFO)
  end
end, {
  desc = "Toggle autoformat-on-save",
})
