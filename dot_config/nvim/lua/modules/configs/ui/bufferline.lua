-- ╭──────────────────────────────────────────────────────────╮
-- │                      Bufferline                           │
-- ╰──────────────────────────────────────────────────────────╯

require("bufferline").setup({
  options = {
    mode = "buffers",
    style_preset = require("bufferline").style_preset.default,
    themable = true,
    numbers = "none",
    close_command = "bdelete! %d",
    right_mouse_command = "bdelete! %d",
    left_mouse_command = "buffer %d",
    middle_mouse_command = nil,
    indicator = {
      icon = "▎",
      style = "icon",
    },
    buffer_close_icon = "󰅖",
    modified_icon = "●",
    close_icon = "",
    left_trunc_marker = "",
    right_trunc_marker = "",
    max_name_length = 18,
    max_prefix_length = 15,
    truncate_names = true,
    tab_size = 18,
    diagnostics = "nvim_lsp",
    diagnostics_update_in_insert = false,
    diagnostics_indicator = function(count, level, diagnostics_dict, context)
      local icon = level:match("error") and " " or " "
      return " " .. icon .. count
    end,
    custom_filter = function(buf_number, buf_numbers)
      -- Filter out certain buffer types
      local buftype = vim.bo[buf_number].buftype
      if buftype == "terminal" then
        return false
      end
      if buftype == "quickfix" then
        return false
      end
      -- Filter out certain filetypes
      local filetype = vim.bo[buf_number].filetype
      if filetype == "qf" then
        return false
      end
      return true
    end,
    offsets = {
      {
        filetype = "NvimTree",
        text = "File Explorer",
        text_align = "center",
        separator = true,
      },
      {
        filetype = "neo-tree",
        text = "File Explorer",
        text_align = "center",
        separator = true,
      },
      {
        filetype = "Outline",
        text = "Symbols",
        text_align = "center",
        separator = true,
      },
    },
    color_icons = true,
    get_element_icon = function(element)
      local icon, hl = require("nvim-web-devicons").get_icon_by_filetype(element.filetype, { default = false })
      return icon, hl
    end,
    show_buffer_icons = true,
    show_buffer_close_icons = true,
    show_close_icon = true,
    show_tab_indicators = true,
    show_duplicate_prefix = true,
    persist_buffer_sort = true,
    move_wraps_at_ends = false,
    separator_style = "thin",
    enforce_regular_tabs = false,
    always_show_bufferline = true,
    hover = {
      enabled = true,
      delay = 200,
      reveal = { "close" },
    },
    sort_by = "insert_at_end",
  },
  highlights = {
    fill = {
      bg = { attribute = "bg", highlight = "Normal" },
    },
    background = {
      bg = { attribute = "bg", highlight = "Normal" },
    },
    buffer_visible = {
      bg = { attribute = "bg", highlight = "Normal" },
    },
    buffer_selected = {
      bold = true,
      italic = false,
    },
    separator = {
      bg = { attribute = "bg", highlight = "Normal" },
    },
    separator_visible = {
      bg = { attribute = "bg", highlight = "Normal" },
    },
    separator_selected = {
      bg = { attribute = "bg", highlight = "Normal" },
    },
    offset_separator = {
      bg = { attribute = "bg", highlight = "Normal" },
    },
  },
})

-- ─── Keymaps ────────────────────────────────────────────────
local map = vim.keymap.set

-- Buffer navigation
map("n", "<Tab>", "<cmd>BufferLineCycleNext<CR>", { desc = "Next buffer" })
map("n", "<S-Tab>", "<cmd>BufferLineCyclePrev<CR>", { desc = "Previous buffer" })

-- Buffer reordering
map("n", "<leader>bn", "<cmd>BufferLineMoveNext<CR>", { desc = "Move buffer right" })
map("n", "<leader>bp", "<cmd>BufferLineMovePrev<CR>", { desc = "Move buffer left" })

-- Buffer picking
map("n", "<leader>bb", "<cmd>BufferLinePick<CR>", { desc = "Pick buffer" })
map("n", "<leader>bc", "<cmd>BufferLinePickClose<CR>", { desc = "Pick buffer to close" })

-- Close buffers
map("n", "<leader>bo", "<cmd>BufferLineCloseOthers<CR>", { desc = "Close other buffers" })
map("n", "<leader>bl", "<cmd>BufferLineCloseLeft<CR>", { desc = "Close buffers to the left" })
map("n", "<leader>br", "<cmd>BufferLineCloseRight<CR>", { desc = "Close buffers to the right" })

-- Go to buffer by position
map("n", "<leader>1", "<cmd>BufferLineGoToBuffer 1<CR>", { desc = "Go to buffer 1" })
map("n", "<leader>2", "<cmd>BufferLineGoToBuffer 2<CR>", { desc = "Go to buffer 2" })
map("n", "<leader>3", "<cmd>BufferLineGoToBuffer 3<CR>", { desc = "Go to buffer 3" })
map("n", "<leader>4", "<cmd>BufferLineGoToBuffer 4<CR>", { desc = "Go to buffer 4" })
map("n", "<leader>5", "<cmd>BufferLineGoToBuffer 5<CR>", { desc = "Go to buffer 5" })
map("n", "<leader>6", "<cmd>BufferLineGoToBuffer 6<CR>", { desc = "Go to buffer 6" })
map("n", "<leader>7", "<cmd>BufferLineGoToBuffer 7<CR>", { desc = "Go to buffer 7" })
map("n", "<leader>8", "<cmd>BufferLineGoToBuffer 8<CR>", { desc = "Go to buffer 8" })
map("n", "<leader>9", "<cmd>BufferLineGoToBuffer 9<CR>", { desc = "Go to buffer 9" })
