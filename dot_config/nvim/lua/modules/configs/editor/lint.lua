-- ╭──────────────────────────────────────────────────────────╮
-- │                       nvim-lint                           │
-- │                        Linter                             │
-- ╰──────────────────────────────────────────────────────────╯

local lint = require("lint")

lint.linters_by_ft = {
  -- JavaScript/TypeScript
  javascript = { "eslint_d" },
  typescript = { "eslint_d" },
  javascriptreact = { "eslint_d" },
  typescriptreact = { "eslint_d" },
  vue = { "eslint_d" },

  -- Python
  python = { "ruff", "mypy" },

  -- Go
  go = { "golangcilint" },

  -- Ruby
  ruby = { "rubocop" },

  -- Shell
  sh = { "shellcheck" },
  bash = { "shellcheck" },

  -- Lua
  lua = { "selene" },

  -- YAML
  yaml = { "yamllint" },

  -- Docker
  dockerfile = { "hadolint" },

  -- GitHub Actions
  ["yaml.github"] = { "actionlint" },
}

-- ─── Autocmd for Linting ────────────────────────────────────
local lint_augroup = vim.api.nvim_create_augroup("lint", { clear = true })

vim.api.nvim_create_autocmd({ "BufEnter", "BufWritePost", "InsertLeave" }, {
  group = lint_augroup,
  callback = function()
    -- Only lint if the buffer is modifiable
    if vim.opt_local.modifiable:get() then
      lint.try_lint()
    end
  end,
})

-- ─── Keymaps ────────────────────────────────────────────────
vim.keymap.set("n", "<leader>cl", function()
  lint.try_lint()
end, { desc = "Trigger linting" })
