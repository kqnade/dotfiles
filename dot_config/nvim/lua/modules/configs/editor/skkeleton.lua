-- ╭──────────────────────────────────────────────────────────╮
-- │                      SKK Input                            │
-- │                    skkeleton                              │
-- ╰──────────────────────────────────────────────────────────╯

vim.api.nvim_create_autocmd("User", {
  pattern = "skkeleton-initialize-pre",
  callback = function()
    local azik_table = dofile(vim.fn.stdpath("config") .. "/skk/my-azik.lua")
    vim.fn["skkeleton#register_kanatable"]("my-azik", azik_table, true)
    vim.fn["skkeleton#config"]({
      globalDictionaries = { "~/.skk/SKK-JISYO.L" },
      kanaTable = "my-azik",
      eggLikeNewline = true,
      keepState = false,
    })
  end,
})

-- Toggle SKK IME with <C-j>
vim.keymap.set({ "i", "c" }, "<C-j>", "<Plug>(skkeleton-toggle)", { desc = "Toggle SKK IME" })
