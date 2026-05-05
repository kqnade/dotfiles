-- ╭──────────────────────────────────────────────────────────╮
-- │                      SKK Input                            │
-- │                    skkeleton                              │
-- ╰──────────────────────────────────────────────────────────╯

vim.api.nvim_create_autocmd("User", {
  pattern = "skkeleton-initialize-pre",
  callback = function()
    local azik_table = dofile(vim.fn.stdpath("config") .. "/skk/my-azik.lua")
    vim.fn["skkeleton#register_kanatable"]("rom", azik_table, false)
    vim.fn["skkeleton#config"]({
      sources = { "skk_server" },
      skkServerHost = "127.0.0.1",
      skkServerPort = 1178,
      skkServerReqEnc = "euc-jp",
      skkServerResEnc = "euc-jp",
      eggLikeNewline = true,
      keepState = false,
    })
  end,
})

-- Toggle SKK IME with <C-j>
vim.keymap.set({ "i", "c" }, "<C-j>", "<Plug>(skkeleton-toggle)", { desc = "Toggle SKK IME" })
