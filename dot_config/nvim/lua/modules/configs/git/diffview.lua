-- ╭──────────────────────────────────────────────────────────╮
-- │                       Diffview                            │
-- ╰──────────────────────────────────────────────────────────╯

local actions = require("diffview.actions")

require("diffview").setup({
  diff_binaries = false,
  enhanced_diff_hl = false,
  git_cmd = { "git" },
  hg_cmd = { "hg" },
  use_icons = true,
  show_help_hints = true,
  watch_index = true,
  icons = {
    folder_closed = "",
    folder_open = "",
  },
  signs = {
    fold_closed = "",
    fold_open = "",
    done = "✓",
  },
  view = {
    default = {
      layout = "diff2_horizontal",
      winbar_info = false,
    },
    merge_tool = {
      layout = "diff3_horizontal",
      disable_diagnostics = true,
      winbar_info = true,
    },
    file_history = {
      layout = "diff2_horizontal",
      winbar_info = false,
    },
  },
  file_panel = {
    listing_style = "tree",
    tree_options = {
      flatten_dirs = true,
      folder_statuses = "only_folded",
    },
    win_config = {
      position = "left",
      width = 35,
      win_opts = {},
    },
  },
  file_history_panel = {
    log_options = {
      git = {
        single_file = {
          diff_merges = "combined",
        },
        multi_file = {
          diff_merges = "first-parent",
        },
      },
    },
    win_config = {
      position = "bottom",
      height = 16,
      win_opts = {},
    },
  },
  commit_log_panel = {
    win_config = {},
  },
  default_args = {
    DiffviewOpen = {},
    DiffviewFileHistory = {},
  },
  hooks = {},
  keymaps = {
    disable_defaults = false,
    view = {
      -- Colemak navigation
      { "n", "<tab>", actions.select_next_entry, { desc = "Next entry" } },
      { "n", "<s-tab>", actions.select_prev_entry, { desc = "Previous entry" } },
      { "n", "gf", actions.goto_file_edit, { desc = "Open file in previous tabpage" } },
      { "n", "<C-w><C-f>", actions.goto_file_split, { desc = "Open file in new split" } },
      { "n", "<C-w>gf", actions.goto_file_tab, { desc = "Open file in new tabpage" } },
      { "n", "<leader>e", actions.focus_files, { desc = "Focus file panel" } },
      { "n", "<leader>b", actions.toggle_files, { desc = "Toggle file panel" } },
      { "n", "g<C-x>", actions.cycle_layout, { desc = "Cycle layouts" } },
      { "n", "[x", actions.prev_conflict, { desc = "Previous conflict" } },
      { "n", "]x", actions.next_conflict, { desc = "Next conflict" } },
      { "n", "<leader>co", actions.conflict_choose("ours"), { desc = "Choose OURS" } },
      { "n", "<leader>ct", actions.conflict_choose("theirs"), { desc = "Choose THEIRS" } },
      { "n", "<leader>cb", actions.conflict_choose("base"), { desc = "Choose BASE" } },
      { "n", "<leader>ca", actions.conflict_choose("all"), { desc = "Choose ALL" } },
      { "n", "dx", actions.conflict_choose("none"), { desc = "Delete conflict region" } },
      { "n", "<leader>cO", actions.conflict_choose_all("ours"), { desc = "Choose OURS for all" } },
      { "n", "<leader>cT", actions.conflict_choose_all("theirs"), { desc = "Choose THEIRS for all" } },
      { "n", "<leader>cB", actions.conflict_choose_all("base"), { desc = "Choose BASE for all" } },
      { "n", "<leader>cA", actions.conflict_choose_all("all"), { desc = "Choose ALL for all" } },
      { "n", "dX", actions.conflict_choose_all("none"), { desc = "Delete all conflict regions" } },
    },
    diff1 = {},
    diff2 = {},
    diff3 = {
      { { "n", "x" }, "2do", actions.diffget("ours"), { desc = "Get OURS" } },
      { { "n", "x" }, "3do", actions.diffget("theirs"), { desc = "Get THEIRS" } },
    },
    diff4 = {
      { { "n", "x" }, "1do", actions.diffget("base"), { desc = "Get BASE" } },
      { { "n", "x" }, "2do", actions.diffget("ours"), { desc = "Get OURS" } },
      { { "n", "x" }, "3do", actions.diffget("theirs"), { desc = "Get THEIRS" } },
    },
    file_panel = {
      { "n", "n", actions.next_entry, { desc = "Next entry" } }, -- Colemak
      { "n", "e", actions.prev_entry, { desc = "Previous entry" } }, -- Colemak
      { "n", "<cr>", actions.select_entry, { desc = "Select entry" } },
      { "n", "o", actions.select_entry, { desc = "Select entry" } },
      { "n", "l", actions.select_entry, { desc = "Select entry" } },
      { "n", "<2-LeftMouse>", actions.select_entry, { desc = "Select entry" } },
      { "n", "-", actions.toggle_stage_entry, { desc = "Toggle stage entry" } },
      { "n", "s", actions.toggle_stage_entry, { desc = "Toggle stage entry" } },
      { "n", "S", actions.stage_all, { desc = "Stage all entries" } },
      { "n", "U", actions.unstage_all, { desc = "Unstage all entries" } },
      { "n", "X", actions.restore_entry, { desc = "Restore entry" } },
      { "n", "L", actions.open_commit_log, { desc = "Open commit log" } },
      { "n", "zo", actions.open_fold, { desc = "Open fold" } },
      { "n", "h", actions.close_fold, { desc = "Close fold" } },
      { "n", "zc", actions.close_fold, { desc = "Close fold" } },
      { "n", "za", actions.toggle_fold, { desc = "Toggle fold" } },
      { "n", "zR", actions.open_all_folds, { desc = "Open all folds" } },
      { "n", "zM", actions.close_all_folds, { desc = "Close all folds" } },
      { "n", "<c-b>", actions.scroll_view(-0.25), { desc = "Scroll up" } },
      { "n", "<c-f>", actions.scroll_view(0.25), { desc = "Scroll down" } },
      { "n", "<tab>", actions.select_next_entry, { desc = "Next entry" } },
      { "n", "<s-tab>", actions.select_prev_entry, { desc = "Previous entry" } },
      { "n", "gf", actions.goto_file_edit, { desc = "Open file" } },
      { "n", "<C-w><C-f>", actions.goto_file_split, { desc = "Open file in split" } },
      { "n", "<C-w>gf", actions.goto_file_tab, { desc = "Open file in tab" } },
      { "n", "i", actions.listing_style, { desc = "Toggle listing style" } },
      { "n", "f", actions.toggle_flatten_dirs, { desc = "Toggle flatten dirs" } },
      { "n", "R", actions.refresh_files, { desc = "Refresh files" } },
      { "n", "<leader>e", actions.focus_files, { desc = "Focus file panel" } },
      { "n", "<leader>b", actions.toggle_files, { desc = "Toggle file panel" } },
      { "n", "g<C-x>", actions.cycle_layout, { desc = "Cycle layouts" } },
      { "n", "[x", actions.prev_conflict, { desc = "Previous conflict" } },
      { "n", "]x", actions.next_conflict, { desc = "Next conflict" } },
      { "n", "g?", actions.help("file_panel"), { desc = "Open help" } },
      { "n", "<leader>cO", actions.conflict_choose_all("ours"), { desc = "Choose OURS for all" } },
      { "n", "<leader>cT", actions.conflict_choose_all("theirs"), { desc = "Choose THEIRS for all" } },
      { "n", "<leader>cB", actions.conflict_choose_all("base"), { desc = "Choose BASE for all" } },
      { "n", "<leader>cA", actions.conflict_choose_all("all"), { desc = "Choose ALL for all" } },
      { "n", "dX", actions.conflict_choose_all("none"), { desc = "Delete all conflict regions" } },
    },
    file_history_panel = {
      { "n", "g!", actions.options, { desc = "Open option panel" } },
      { "n", "<C-A-d>", actions.open_in_diffview, { desc = "Open in diffview" } },
      { "n", "y", actions.copy_hash, { desc = "Copy commit hash" } },
      { "n", "L", actions.open_commit_log, { desc = "Open commit log" } },
      { "n", "zR", actions.open_all_folds, { desc = "Open all folds" } },
      { "n", "zM", actions.close_all_folds, { desc = "Close all folds" } },
      { "n", "n", actions.next_entry, { desc = "Next entry" } }, -- Colemak
      { "n", "e", actions.prev_entry, { desc = "Previous entry" } }, -- Colemak
      { "n", "<cr>", actions.select_entry, { desc = "Select entry" } },
      { "n", "o", actions.select_entry, { desc = "Select entry" } },
      { "n", "l", actions.select_entry, { desc = "Select entry" } },
      { "n", "<2-LeftMouse>", actions.select_entry, { desc = "Select entry" } },
      { "n", "<c-b>", actions.scroll_view(-0.25), { desc = "Scroll up" } },
      { "n", "<c-f>", actions.scroll_view(0.25), { desc = "Scroll down" } },
      { "n", "<tab>", actions.select_next_entry, { desc = "Next entry" } },
      { "n", "<s-tab>", actions.select_prev_entry, { desc = "Previous entry" } },
      { "n", "gf", actions.goto_file_edit, { desc = "Open file" } },
      { "n", "<C-w><C-f>", actions.goto_file_split, { desc = "Open file in split" } },
      { "n", "<C-w>gf", actions.goto_file_tab, { desc = "Open file in tab" } },
      { "n", "<leader>e", actions.focus_files, { desc = "Focus file panel" } },
      { "n", "<leader>b", actions.toggle_files, { desc = "Toggle file panel" } },
      { "n", "g<C-x>", actions.cycle_layout, { desc = "Cycle layouts" } },
      { "n", "g?", actions.help("file_history_panel"), { desc = "Open help" } },
    },
    option_panel = {
      { "n", "<tab>", actions.select_entry, { desc = "Select entry" } },
      { "n", "q", actions.close, { desc = "Close panel" } },
      { "n", "g?", actions.help("option_panel"), { desc = "Open help" } },
    },
    help_panel = {
      { "n", "q", actions.close, { desc = "Close help" } },
      { "n", "<esc>", actions.close, { desc = "Close help" } },
    },
  },
})
