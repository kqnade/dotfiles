-- ╭──────────────────────────────────────────────────────────╮
-- │                       nvim-lint                           │
-- │                        Linter                             │
-- ╰──────────────────────────────────────────────────────────╯

local lint = require("lint")

lint.linters_by_ft = {
  -- JavaScript/TypeScript (diagnostics provided by `eslint` LSP)

  -- Python
  python = { "ruff", "mypy" },

  -- Go
  go = { "golangcilint" },

  -- Ruby (diagnostics also provided by ruby_lsp + solargraph)
  ruby = { "rubocop" },

  -- Lua
  lua = { "luacheck" },

  -- C / C++
  c = { "cpplint" },
  cpp = { "cpplint" },

  -- Kotlin
  kotlin = { "ktlint" },

  -- Clojure / Lisp
  clojure = { "clj-kondo" },
  clojurescript = { "clj-kondo" },
  edn = { "clj-kondo" },

  -- Shell
  sh = { "shellcheck" },
  bash = { "shellcheck" },

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
