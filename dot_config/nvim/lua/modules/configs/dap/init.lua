-- ╭──────────────────────────────────────────────────────────╮
-- │                         DAP                               │
-- │          Debug Adapter Protocol Configuration             │
-- ╰──────────────────────────────────────────────────────────╯

local dap = require("dap")
local dapui = require("dapui")

-- ─── DAP UI Setup ───────────────────────────────────────────
dapui.setup({
  icons = { expanded = "▾", collapsed = "▸", current_frame = "▸" },
  mappings = {
    expand = { "<CR>", "<2-LeftMouse>" },
    open = "o",
    remove = "d",
    edit = "e",
    repl = "r",
    toggle = "t",
  },
  element_mappings = {},
  expand_lines = vim.fn.has("nvim-0.7") == 1,
  layouts = {
    {
      elements = {
        { id = "scopes", size = 0.25 },
        { id = "breakpoints", size = 0.25 },
        { id = "stacks", size = 0.25 },
        { id = "watches", size = 0.25 },
      },
      position = "left",
      size = 40,
    },
    {
      elements = {
        { id = "repl", size = 0.5 },
        { id = "console", size = 0.5 },
      },
      position = "bottom",
      size = 10,
    },
  },
  controls = {
    enabled = true,
    element = "repl",
    icons = {
      pause = "",
      play = "",
      step_into = "",
      step_over = "",
      step_out = "",
      step_back = "",
      run_last = "↻",
      terminate = "□",
    },
  },
  floating = {
    max_height = nil,
    max_width = nil,
    border = "rounded",
    mappings = {
      close = { "q", "<Esc>" },
    },
  },
  windows = { indent = 1 },
  render = {
    max_type_length = nil,
    max_value_lines = 100,
  },
})

-- ─── Virtual Text ───────────────────────────────────────────
require("nvim-dap-virtual-text").setup({
  enabled = true,
  enabled_commands = true,
  highlight_changed_variables = true,
  highlight_new_as_changed = false,
  show_stop_reason = true,
  commented = false,
  only_first_definition = true,
  all_references = false,
  filter_references_pattern = "<module",
  virt_text_pos = "eol",
  all_frames = false,
  virt_lines = false,
  virt_text_win_col = nil,
})

-- ─── DAP UI Auto Open/Close ─────────────────────────────────
dap.listeners.after.event_initialized["dapui_config"] = function()
  dapui.open()
end
dap.listeners.before.event_terminated["dapui_config"] = function()
  dapui.close()
end
dap.listeners.before.event_exited["dapui_config"] = function()
  dapui.close()
end

-- ─── Signs ──────────────────────────────────────────────────
vim.fn.sign_define("DapBreakpoint", { text = "", texthl = "DapBreakpoint", linehl = "", numhl = "" })
vim.fn.sign_define("DapBreakpointCondition", { text = "", texthl = "DapBreakpointCondition", linehl = "", numhl = "" })
vim.fn.sign_define("DapLogPoint", { text = "", texthl = "DapLogPoint", linehl = "", numhl = "" })
vim.fn.sign_define("DapStopped", { text = "", texthl = "DapStopped", linehl = "DapStoppedLine", numhl = "" })
vim.fn.sign_define("DapBreakpointRejected", { text = "", texthl = "DapBreakpointRejected", linehl = "", numhl = "" })

-- ═══════════════════════════════════════════════════════════
-- ║                    LANGUAGE ADAPTERS                     ║
-- ═══════════════════════════════════════════════════════════

-- ─── Go (Delve) ─────────────────────────────────────────────
require("dap-go").setup({
  dap_configurations = {
    {
      type = "go",
      name = "Attach remote",
      mode = "remote",
      request = "attach",
    },
  },
  delve = {
    path = "dlv",
    initialize_timeout_sec = 20,
    port = "${port}",
    args = {},
    build_flags = "",
  },
})

-- ─── Python (debugpy) ───────────────────────────────────────
require("dap-python").setup("python")

dap.configurations.python = {
  {
    type = "python",
    request = "launch",
    name = "Launch file",
    program = "${file}",
    pythonPath = function()
      local venv = os.getenv("VIRTUAL_ENV")
      if venv then
        return venv .. "/bin/python"
      end
      return "python"
    end,
  },
  {
    type = "python",
    request = "launch",
    name = "Launch file with arguments",
    program = "${file}",
    args = function()
      local args_string = vim.fn.input("Arguments: ")
      return vim.split(args_string, " +")
    end,
    pythonPath = function()
      local venv = os.getenv("VIRTUAL_ENV")
      if venv then
        return venv .. "/bin/python"
      end
      return "python"
    end,
  },
  {
    type = "python",
    request = "attach",
    name = "Attach remote",
    connect = function()
      local host = vim.fn.input("Host [127.0.0.1]: ")
      host = host ~= "" and host or "127.0.0.1"
      local port = tonumber(vim.fn.input("Port [5678]: ")) or 5678
      return { host = host, port = port }
    end,
  },
}

-- ─── Rust / C / C++ (codelldb) ──────────────────────────────
dap.adapters.codelldb = {
  type = "server",
  port = "${port}",
  executable = {
    command = vim.fn.stdpath("data") .. "/mason/bin/codelldb",
    args = { "--port", "${port}" },
  },
}

dap.configurations.rust = {
  {
    name = "Launch file",
    type = "codelldb",
    request = "launch",
    program = function()
      return vim.fn.input("Path to executable: ", vim.fn.getcwd() .. "/target/debug/", "file")
    end,
    cwd = "${workspaceFolder}",
    stopOnEntry = false,
  },
}

dap.configurations.c = {
  {
    name = "Launch file",
    type = "codelldb",
    request = "launch",
    program = function()
      return vim.fn.input("Path to executable: ", vim.fn.getcwd() .. "/", "file")
    end,
    cwd = "${workspaceFolder}",
    stopOnEntry = false,
  },
}

dap.configurations.cpp = dap.configurations.c

-- ─── TypeScript / JavaScript (js-debug-adapter) ─────────────
dap.adapters["pwa-node"] = {
  type = "server",
  host = "localhost",
  port = "${port}",
  executable = {
    command = "node",
    args = {
      vim.fn.stdpath("data") .. "/mason/packages/js-debug-adapter/js-debug/src/dapDebugServer.js",
      "${port}",
    },
  },
}

dap.configurations.javascript = {
  {
    type = "pwa-node",
    request = "launch",
    name = "Launch file",
    program = "${file}",
    cwd = "${workspaceFolder}",
  },
  {
    type = "pwa-node",
    request = "attach",
    name = "Attach",
    processId = require("dap.utils").pick_process,
    cwd = "${workspaceFolder}",
  },
}

dap.configurations.typescript = {
  {
    type = "pwa-node",
    request = "launch",
    name = "Launch file",
    program = "${file}",
    cwd = "${workspaceFolder}",
    runtimeExecutable = "ts-node",
    sourceMaps = true,
    protocol = "inspector",
    skipFiles = { "<node_internals>/**", "node_modules/**" },
    resolveSourceMapLocations = {
      "${workspaceFolder}/**",
      "!**/node_modules/**",
    },
  },
  {
    type = "pwa-node",
    request = "attach",
    name = "Attach",
    processId = require("dap.utils").pick_process,
    cwd = "${workspaceFolder}",
  },
}

-- ═══════════════════════════════════════════════════════════
-- ║                       KEYMAPS                            ║
-- ═══════════════════════════════════════════════════════════

local map = vim.keymap.set
local opts = { noremap = true, silent = true }

-- Breakpoints
map("n", "<leader>db", dap.toggle_breakpoint, vim.tbl_extend("force", opts, { desc = "Toggle breakpoint" }))
map("n", "<leader>dB", function()
  dap.set_breakpoint(vim.fn.input("Breakpoint condition: "))
end, vim.tbl_extend("force", opts, { desc = "Conditional breakpoint" }))
map("n", "<leader>dl", function()
  dap.set_breakpoint(nil, nil, vim.fn.input("Log point message: "))
end, vim.tbl_extend("force", opts, { desc = "Log point" }))

-- Execution
map("n", "<leader>dc", dap.continue, vim.tbl_extend("force", opts, { desc = "Continue" }))
map("n", "<leader>di", dap.step_into, vim.tbl_extend("force", opts, { desc = "Step into" }))
map("n", "<leader>do", dap.step_over, vim.tbl_extend("force", opts, { desc = "Step over" }))
map("n", "<leader>dO", dap.step_out, vim.tbl_extend("force", opts, { desc = "Step out" }))
map("n", "<leader>dC", dap.run_to_cursor, vim.tbl_extend("force", opts, { desc = "Run to cursor" }))

-- Session
map("n", "<leader>dr", dap.repl.toggle, vim.tbl_extend("force", opts, { desc = "Toggle REPL" }))
map("n", "<leader>dL", dap.run_last, vim.tbl_extend("force", opts, { desc = "Run last" }))
map("n", "<leader>dt", dap.terminate, vim.tbl_extend("force", opts, { desc = "Terminate" }))
map("n", "<leader>dx", dap.disconnect, vim.tbl_extend("force", opts, { desc = "Disconnect" }))

-- UI
map("n", "<leader>du", dapui.toggle, vim.tbl_extend("force", opts, { desc = "Toggle DAP UI" }))
map("n", "<leader>de", dapui.eval, vim.tbl_extend("force", opts, { desc = "Evaluate expression" }))
map("v", "<leader>de", dapui.eval, vim.tbl_extend("force", opts, { desc = "Evaluate selection" }))

-- Widgets
map("n", "<leader>dh", function()
  require("dap.ui.widgets").hover()
end, vim.tbl_extend("force", opts, { desc = "Hover variables" }))
map("n", "<leader>dp", function()
  require("dap.ui.widgets").preview()
end, vim.tbl_extend("force", opts, { desc = "Preview" }))
map("n", "<leader>df", function()
  local widgets = require("dap.ui.widgets")
  widgets.centered_float(widgets.frames)
end, vim.tbl_extend("force", opts, { desc = "Frames" }))
map("n", "<leader>ds", function()
  local widgets = require("dap.ui.widgets")
  widgets.centered_float(widgets.scopes)
end, vim.tbl_extend("force", opts, { desc = "Scopes" }))
