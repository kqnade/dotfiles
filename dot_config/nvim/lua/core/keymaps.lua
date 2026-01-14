-- ╭──────────────────────────────────────────────────────────╮
-- │                   Colemak Keymaps                         │
-- │            Inherited from .vimrc + IDE Extensions         │
-- ╰──────────────────────────────────────────────────────────╯

local map = vim.keymap.set
local opts = { noremap = true, silent = true }

-- ═══════════════════════════════════════════════════════════
-- ║                    COLEMAK REMAPS                        ║
-- ═══════════════════════════════════════════════════════════

-- ─── Cursor Movement (m/n/e/i → h/j/k/l) ───────────────────
map({ "n", "x", "o" }, "m", "h", opts)
map({ "n", "x", "o" }, "n", "j", opts)
map({ "n", "x", "o" }, "e", "k", opts)
map({ "n", "x", "o" }, "i", "l", opts)

-- ─── Word Jump (l/u/y → b/e/w) ─────────────────────────────
map({ "n", "x", "o" }, "l", "b", opts)
map({ "n", "x", "o" }, "L", "B", opts)
map({ "n", "x", "o" }, "u", "e", opts)
map({ "n", "x", "o" }, "U", "E", opts)
map({ "n", "x", "o" }, "y", "w", opts)
map({ "n", "x", "o" }, "Y", "W", opts)

-- ─── Insert/Append (s/t → i/a) ─────────────────────────────
map("n", "s", "i", opts)
map("n", "S", "I", opts)
map("n", "t", "a", opts)
map("n", "T", "A", opts)

-- ─── Undo/Redo (z/Z → u/Ctrl-R) ────────────────────────────
map("n", "z", "u", opts)
map("x", "z", ":<C-U>undo<CR>", opts)
map("n", "gz", "U", opts)
map("x", "gz", ":<C-U>undo<CR>", opts)
map("n", "Z", "<C-R>", opts)
map("x", "Z", ":<C-U>redo<CR>", opts)

-- ─── Visual Mode (a/A → v/V) ───────────────────────────────
map({ "n", "x" }, "a", "v", opts)
map({ "n", "x" }, "A", "V", opts)
map("n", "ga", "gv", opts)

-- Visual line mode: make insert/add work like visual block mode
map("x", "s", function()
  return vim.fn.mode() == "V" and "<C-V>0o$I" or "I"
end, { expr = true, silent = true })
map("x", "S", function()
  return vim.fn.mode() == "V" and "<C-V>0o$I" or "I"
end, { expr = true, silent = true })
map("x", "t", function()
  return vim.fn.mode() == "V" and "<C-V>0o$A" or "A"
end, { expr = true, silent = true })
map("x", "T", function()
  return vim.fn.mode() == "V" and "<C-V>0o$A" or "A"
end, { expr = true, silent = true })

-- ─── Cut/Copy/Paste (x/c/v → d/y/p) ────────────────────────
map("n", "x", "x", opts)
map("x", "x", "d", opts)
map({ "n", "x" }, "c", "y", opts)
map({ "n", "x" }, "v", "p", opts)
map("n", "X", "dd", opts)
map("x", "X", "d", opts)
map("n", "C", "yy", opts)
map("x", "C", "y", opts)
map({ "n", "x" }, "V", "P", opts)
map({ "n", "x" }, "gv", "gp", opts)
map({ "n", "x" }, "gV", "gP", opts)

-- ─── Change (w/W → c/C) ────────────────────────────────────
map({ "n", "x" }, "w", "c", opts)
map({ "n", "x" }, "W", "C", opts)
map("n", "ww", "cc", opts)

-- ═══════════════════════════════════════════════════════════
-- ║                   GENERAL KEYMAPS                        ║
-- ═══════════════════════════════════════════════════════════

-- ─── ESC to Clear Search Highlight ─────────────────────────
map("n", "<Esc>", "<cmd>nohlsearch<CR>", opts)

-- ─── Command Line ───────────────────────────────────────────
map("n", ";", ":", { noremap = true })

-- ─── Window Split ──────────────────────────────────────────
map("n", "sv", "<cmd>vsplit<CR>", { desc = "Split vertical" })
map("n", "ss", "<cmd>split<CR>", { desc = "Split horizontal" })

-- ─── Tab Management ────────────────────────────────────────
map("n", "st", "<cmd>tabnew<CR>", { desc = "New tab" })
map("n", "sn", "gt", { desc = "Next tab" })
map("n", "sp", "gT", { desc = "Previous tab" })
map("n", "sq", "<cmd>q<CR>", { desc = "Close window" })

-- ─── Window Navigation (Colemak: C-h/n/e/i) ────────────────
-- Note: <C-m> conflicts with <CR>, using <C-h> instead
map("n", "<C-h>", "<C-w>h", { desc = "Move to left window" })
map("n", "<C-n>", "<C-w>j", { desc = "Move to lower window" })
map("n", "<C-e>", "<C-w>k", { desc = "Move to upper window" })
map("n", "<C-i>", "<C-w>l", { desc = "Move to right window" })

-- ─── Window Resize (Alt + m/n/e/i) ──────────────────────────
map("n", "<M-m>", "<cmd>vertical resize -5<CR>", { desc = "Decrease width" })
map("n", "<M-i>", "<cmd>vertical resize +5<CR>", { desc = "Increase width" })
map("n", "<M-n>", "<cmd>resize -5<CR>", { desc = "Decrease height" })
map("n", "<M-e>", "<cmd>resize +5<CR>", { desc = "Increase height" })

-- ─── Terminal Mode ─────────────────────────────────────────
map("t", "<Esc><Esc>", "<C-\\><C-n>", { desc = "Exit terminal mode" })
map("t", "<C-h>", "<cmd>wincmd h<CR>", { desc = "Move to left window" })
map("t", "<C-n>", "<cmd>wincmd j<CR>", { desc = "Move to lower window" })
map("t", "<C-e>", "<cmd>wincmd k<CR>", { desc = "Move to upper window" })
map("t", "<C-i>", "<cmd>wincmd l<CR>", { desc = "Move to right window" })

-- ─── Buffer Navigation ─────────────────────────────────────
map("n", "<S-h>", "<cmd>bprevious<CR>", { desc = "Previous buffer" })
map("n", "<S-l>", "<cmd>bnext<CR>", { desc = "Next buffer" })
map("n", "<leader>bd", "<cmd>bdelete<CR>", { desc = "Delete buffer" })

-- ─── Better Indenting ──────────────────────────────────────
map("v", "<", "<gv", opts)
map("v", ">", ">gv", opts)

-- ─── Move Lines ────────────────────────────────────────────
map("n", "<A-n>", "<cmd>m .+1<CR>==", { desc = "Move line down" })
map("n", "<A-e>", "<cmd>m .-2<CR>==", { desc = "Move line up" })
map("v", "<A-n>", ":m '>+1<CR>gv=gv", { desc = "Move selection down" })
map("v", "<A-e>", ":m '<-2<CR>gv=gv", { desc = "Move selection up" })
map("i", "<A-n>", "<Esc><cmd>m .+1<CR>==gi", { desc = "Move line down" })
map("i", "<A-e>", "<Esc><cmd>m .-2<CR>==gi", { desc = "Move line up" })

-- ─── Quickfix ──────────────────────────────────────────────
map("n", "[q", "<cmd>cprevious<CR>", { desc = "Previous quickfix" })
map("n", "]q", "<cmd>cnext<CR>", { desc = "Next quickfix" })

-- ─── Diagnostic Navigation ─────────────────────────────────
map("n", "[d", vim.diagnostic.goto_prev, { desc = "Previous diagnostic" })
map("n", "]d", vim.diagnostic.goto_next, { desc = "Next diagnostic" })
map("n", "<leader>cd", vim.diagnostic.open_float, { desc = "Line diagnostics" })

-- ═══════════════════════════════════════════════════════════
-- ║                  LEADER KEYMAPS                          ║
-- ║             (Plugin keymaps defined elsewhere)           ║
-- ═══════════════════════════════════════════════════════════

-- ─── File Operations ───────────────────────────────────────
map("n", "<leader>w", "<cmd>w<CR>", { desc = "Save file" })
map("n", "<leader>W", "<cmd>wa<CR>", { desc = "Save all files" })
map("n", "<leader>q", "<cmd>q<CR>", { desc = "Quit" })
map("n", "<leader>Q", "<cmd>qa<CR>", { desc = "Quit all" })

-- ─── Search & Replace ──────────────────────────────────────
map("n", "<leader>sr", ":%s/", { desc = "Search & replace" })
map("v", "<leader>sr", ":s/", { desc = "Search & replace selection" })

-- ─── Misc ──────────────────────────────────────────────────
map("n", "<leader>l", "<cmd>Lazy<CR>", { desc = "Lazy plugin manager" })
map("n", "<leader>n", "<cmd>enew<CR>", { desc = "New file" })
