-- ╭──────────────────────────────────────────────────────────╮
-- │                      SKK Input                            │
-- │                    skkeleton                              │
-- ╰──────────────────────────────────────────────────────────╯

vim.api.nvim_create_autocmd("User", {
  pattern = "skkeleton-initialize-pre",
  callback = function()
    vim.fn["skkeleton#config"]({
      globalDictionaries = { "~/.skk/SKK-JISYO.L" },
      eggLikeNewline = true,
      keepState = false,
    })
  end,
})

-- Toggle SKK IME with <C-j>
vim.keymap.set({ "i", "c" }, "<C-j>", "<Plug>(skkeleton-toggle)", { desc = "Toggle SKK IME" })
