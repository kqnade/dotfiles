-- ╭──────────────────────────────────────────────────────────╮
-- │                       Neotest                             │
-- │                    Test Runner                            │
-- ╰──────────────────────────────────────────────────────────╯

require("neotest").setup({
  adapters = {
    require("neotest-go")({
      experimental = {
        test_table = true,
      },
      args = { "-count=1", "-timeout=60s" },
    }),
    require("neotest-python")({
      dap = { justMyCode = false },
      runner = "pytest",
      python = function()
        local venv = os.getenv("VIRTUAL_ENV")
        if venv then
          return venv .. "/bin/python"
        end
        return "python"
      end,
    }),
    require("neotest-vitest"),
    require("neotest-rust")({
      args = { "--no-capture" },
    }),
  },
  benchmark = {
    enabled = true,
  },
  consumers = {},
  default_strategy = "integrated",
  diagnostic = {
    enabled = true,
    severity = 1,
  },
  discovery = {
    concurrent = 0,
    enabled = true,
  },
  floating = {
    border = "rounded",
    max_height = 0.6,
    max_width = 0.6,
    options = {},
  },
  highlights = {
    adapter_name = "NeotestAdapterName",
    border = "NeotestBorder",
    dir = "NeotestDir",
    expand_marker = "NeotestExpandMarker",
    failed = "NeotestFailed",
    file = "NeotestFile",
    focused = "NeotestFocused",
    indent = "NeotestIndent",
    marked = "NeotestMarked",
    namespace = "NeotestNamespace",
    passed = "NeotestPassed",
    running = "NeotestRunning",
    select_win = "NeotestWinSelect",
    skipped = "NeotestSkipped",
    target = "NeotestTarget",
    test = "NeotestTest",
    unknown = "NeotestUnknown",
    watching = "NeotestWatching",
  },
  icons = {
    child_indent = "│",
    child_prefix = "├",
    collapsed = "─",
    expanded = "╮",
    failed = "",
    final_child_indent = " ",
    final_child_prefix = "╰",
    non_collapsible = "─",
    passed = "",
    running = "",
    running_animated = { "/", "|", "\\", "-", "/", "|", "\\", "-" },
    skipped = "",
    unknown = "",
    watching = "",
  },
  jump = {
    enabled = true,
  },
  log_level = 3,
  output = {
    enabled = true,
    open_on_run = "short",
  },
  output_panel = {
    enabled = true,
    open = "botright split | resize 15",
  },
  projects = {},
  quickfix = {
    enabled = true,
    open = false,
  },
  run = {
    enabled = true,
  },
  running = {
    concurrent = true,
  },
  state = {
    enabled = true,
  },
  status = {
    enabled = true,
    signs = true,
    virtual_text = false,
  },
  strategies = {
    integrated = {
      height = 40,
      width = 120,
    },
  },
  summary = {
    animated = true,
    enabled = true,
    expand_errors = true,
    follow = true,
    mappings = {
      attach = "a",
      clear_marked = "M",
      clear_target = "T",
      debug = "d",
      debug_marked = "D",
      expand = { "<CR>", "<2-LeftMouse>" },
      expand_all = "E",
      jumpto = "i", -- Colemak friendly
      mark = "m",
      next_failed = "N",
      output = "o",
      prev_failed = "P",
      run = "r",
      run_marked = "R",
      short = "O",
      stop = "u",
      target = "t",
      watch = "w",
    },
    open = "botright vsplit | vertical resize 50",
  },
  watch = {
    enabled = true,
    symbol_queries = {},
  },
})

-- ─── Keymaps ────────────────────────────────────────────────
local neotest = require("neotest")
local map = vim.keymap.set

map("n", "<leader>tt", function()
  neotest.run.run()
end, { desc = "Run nearest test" })

map("n", "<leader>tf", function()
  neotest.run.run(vim.fn.expand("%"))
end, { desc = "Run file tests" })

map("n", "<leader>ta", function()
  neotest.run.run(vim.fn.getcwd())
end, { desc = "Run all tests" })

map("n", "<leader>ts", function()
  neotest.summary.toggle()
end, { desc = "Toggle test summary" })

map("n", "<leader>to", function()
  neotest.output.open({ enter = true, auto_close = true })
end, { desc = "Show test output" })

map("n", "<leader>tO", function()
  neotest.output_panel.toggle()
end, { desc = "Toggle output panel" })

map("n", "<leader>tS", function()
  neotest.run.stop()
end, { desc = "Stop test" })

map("n", "<leader>td", function()
  neotest.run.run({ strategy = "dap" })
end, { desc = "Debug nearest test" })

map("n", "<leader>tl", function()
  neotest.run.run_last()
end, { desc = "Run last test" })

map("n", "<leader>tw", function()
  neotest.watch.toggle(vim.fn.expand("%"))
end, { desc = "Toggle watch mode" })

-- Navigation
map("n", "[t", function()
  neotest.jump.prev({ status = "failed" })
end, { desc = "Previous failed test" })

map("n", "]t", function()
  neotest.jump.next({ status = "failed" })
end, { desc = "Next failed test" })
