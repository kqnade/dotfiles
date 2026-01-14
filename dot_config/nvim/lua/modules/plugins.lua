-- ╭──────────────────────────────────────────────────────────╮
-- │                    Plugin Management                      │
-- │                      lazy.nvim                            │
-- ╰──────────────────────────────────────────────────────────╯

-- Bootstrap lazy.nvim
local lazypath = vim.fn.stdpath("data") .. "/lazy/lazy.nvim"
if not vim.loop.fs_stat(lazypath) then
  vim.fn.system({
    "git",
    "clone",
    "--filter=blob:none",
    "https://github.com/folke/lazy.nvim.git",
    "--branch=stable",
    lazypath,
  })
end
vim.opt.rtp:prepend(lazypath)

-- Plugin specifications
local plugins = {
  -- ═══════════════════════════════════════════════════════════
  -- ║                     DEPENDENCIES                         ║
  -- ═══════════════════════════════════════════════════════════
  { "nvim-lua/plenary.nvim", lazy = true },
  { "nvim-tree/nvim-web-devicons", lazy = true },
  { "MunifTanjim/nui.nvim", lazy = true },

  -- ═══════════════════════════════════════════════════════════
  -- ║                     COLORSCHEME                          ║
  -- ═══════════════════════════════════════════════════════════
  {
    "olimorris/onedarkpro.nvim",
    lazy = false,
    priority = 1000,
    config = function()
      require("modules.configs.ui.colorscheme")
    end,
  },

  -- ═══════════════════════════════════════════════════════════
  -- ║                     TREESITTER                           ║
  -- ═══════════════════════════════════════════════════════════
  {
    "nvim-treesitter/nvim-treesitter",
    branch = "main",
    build = ":TSUpdate",
    lazy = false, -- 常に読み込む（他プラグインの依存関係のため）
    dependencies = {
      "HiPhish/rainbow-delimiters.nvim",
    },
    config = function()
      require("modules.configs.treesitter")
    end,
  },

  -- ═══════════════════════════════════════════════════════════
  -- ║                     LUA DEVELOPMENT                      ║
  -- ═══════════════════════════════════════════════════════════
  {
    "folke/lazydev.nvim",
    ft = "lua",
    opts = {
      library = {
        { path = "${3rd}/luv/library", words = { "vim%.uv" } },
        { path = "lazy.nvim", words = { "LazySpec" } },
      },
    },
  },

  -- ═══════════════════════════════════════════════════════════
  -- ║                         LSP                              ║
  -- ═══════════════════════════════════════════════════════════
  {
    "neovim/nvim-lspconfig",
    event = { "BufReadPre", "BufNewFile" },
    dependencies = {
      "williamboman/mason.nvim",
      "williamboman/mason-lspconfig.nvim",
      "j-hui/fidget.nvim",
      "folke/lazydev.nvim",
      "b0o/schemastore.nvim", -- JSON/YAML schemas
    },
    config = function()
      require("modules.configs.lsp")
    end,
  },
  {
    "j-hui/fidget.nvim",
    opts = {
      notification = {
        window = { winblend = 0 },
      },
    },
  },
  {
    "kosayoda/nvim-lightbulb",
    event = "LspAttach",
    opts = {
      autocmd = { enabled = true },
      sign = { enabled = true, text = "" },
    },
  },

  -- ═══════════════════════════════════════════════════════════
  -- ║                      COMPLETION                          ║
  -- ═══════════════════════════════════════════════════════════
  {
    "hrsh7th/nvim-cmp",
    event = { "InsertEnter", "CmdlineEnter" },
    dependencies = {
      "hrsh7th/cmp-nvim-lsp",
      "hrsh7th/cmp-buffer",
      "hrsh7th/cmp-path",
      "hrsh7th/cmp-cmdline",
      "saadparwaiz1/cmp_luasnip",
      {
        "L3MON4D3/LuaSnip",
        build = "make install_jsregexp",
        dependencies = { "rafamadriz/friendly-snippets" },
      },
    },
    config = function()
      require("modules.configs.cmp")
    end,
  },
  -- lazydev completion source for nvim-cmp
  {
    "hrsh7th/cmp-nvim-lsp",
    opts = function(_, opts)
      opts.sources = opts.sources or {}
      table.insert(opts.sources, {
        name = "lazydev",
        group_index = 0,
      })
    end,
  },

  -- ═══════════════════════════════════════════════════════════
  -- ║                         DAP                              ║
  -- ═══════════════════════════════════════════════════════════
  {
    "mfussenegger/nvim-dap",
    keys = {
      { "<leader>db", desc = "Toggle breakpoint" },
      { "<leader>dc", desc = "Continue" },
      { "<leader>di", desc = "Step into" },
      { "<leader>do", desc = "Step over" },
      { "<leader>dO", desc = "Step out" },
      { "<leader>dr", desc = "Toggle REPL" },
      { "<leader>du", desc = "Toggle DAP UI" },
    },
    dependencies = {
      "rcarriga/nvim-dap-ui",
      "nvim-neotest/nvim-nio",
      "theHamsta/nvim-dap-virtual-text",
      -- Language specific
      "leoluz/nvim-dap-go",
      "mfussenegger/nvim-dap-python",
    },
    config = function()
      require("modules.configs.dap")
    end,
  },

  -- ═══════════════════════════════════════════════════════════
  -- ║                      TELESCOPE                           ║
  -- ═══════════════════════════════════════════════════════════
  {
    "nvim-telescope/telescope.nvim",
    cmd = "Telescope",
    keys = {
      { "<leader>ff", desc = "Find files" },
      { "<leader>fg", desc = "Live grep" },
      { "<leader>fb", desc = "Buffers" },
      { "<leader>fh", desc = "Help tags" },
      { "<leader>fr", desc = "Recent files" },
      { "<leader>fc", desc = "Commands" },
      { "<leader>fs", desc = "Symbols" },
      { "<leader>fd", desc = "Diagnostics" },
    },
    dependencies = {
      { "nvim-telescope/telescope-fzf-native.nvim", build = "make" },
      "nvim-telescope/telescope-file-browser.nvim",
    },
    config = function()
      require("modules.configs.telescope")
    end,
  },

  -- ═══════════════════════════════════════════════════════════
  -- ║                         GIT                              ║
  -- ═══════════════════════════════════════════════════════════
  {
    "lewis6991/gitsigns.nvim",
    event = { "BufReadPre", "BufNewFile" },
    config = function()
      require("modules.configs.git.gitsigns")
    end,
  },
  {
    "NeogitOrg/neogit",
    cmd = "Neogit",
    keys = {
      { "<leader>gg", "<cmd>Neogit<CR>", desc = "Neogit" },
    },
    dependencies = {
      "nvim-lua/plenary.nvim",
      "sindrets/diffview.nvim",
    },
    config = function()
      require("modules.configs.git.neogit")
    end,
  },
  {
    "sindrets/diffview.nvim",
    cmd = { "DiffviewOpen", "DiffviewFileHistory" },
    keys = {
      { "<leader>gd", "<cmd>DiffviewOpen<CR>", desc = "Diffview" },
      { "<leader>gh", "<cmd>DiffviewFileHistory %<CR>", desc = "File history" },
    },
    config = function()
      require("modules.configs.git.diffview")
    end,
  },

  -- ═══════════════════════════════════════════════════════════
  -- ║                       EDITOR                             ║
  -- ═══════════════════════════════════════════════════════════
  {
    "folke/which-key.nvim",
    event = "VeryLazy",
    config = function()
      require("modules.configs.editor.which-key")
    end,
  },
  {
    "stevearc/conform.nvim",
    event = "BufWritePre",
    cmd = "ConformInfo",
    keys = {
      { "<leader>cf", desc = "Format buffer" },
    },
    config = function()
      require("modules.configs.editor.conform")
    end,
  },
  {
    "mfussenegger/nvim-lint",
    event = { "BufReadPre", "BufNewFile" },
    config = function()
      require("modules.configs.editor.lint")
    end,
  },
  {
    "nvim-neotest/neotest",
    keys = {
      { "<leader>tt", desc = "Run nearest test" },
      { "<leader>tf", desc = "Run file tests" },
      { "<leader>ts", desc = "Test summary" },
    },
    dependencies = {
      "nvim-neotest/nvim-nio",
      "nvim-lua/plenary.nvim",
      "nvim-treesitter/nvim-treesitter",
      -- Test adapters
      "nvim-neotest/neotest-go",
      "nvim-neotest/neotest-python",
      "marilari88/neotest-vitest",
      "rouge8/neotest-rust",
    },
    config = function()
      require("modules.configs.editor.neotest")
    end,
  },

  -- ═══════════════════════════════════════════════════════════
  -- ║                          UI                              ║
  -- ═══════════════════════════════════════════════════════════
  {
    "nvim-lualine/lualine.nvim",
    event = "VeryLazy",
    config = function()
      require("modules.configs.ui.lualine")
    end,
  },
  {
    "akinsho/bufferline.nvim",
    event = "VeryLazy",
    config = function()
      require("modules.configs.ui.bufferline")
    end,
  },
  {
    "nvim-tree/nvim-tree.lua",
    cmd = { "NvimTreeToggle", "NvimTreeFocus" },
    keys = {
      { "<leader>e", "<cmd>NvimTreeToggle<CR>", desc = "File explorer" },
    },
    config = function()
      require("modules.configs.ui.nvim-tree")
    end,
  },
  {
    "goolord/alpha-nvim",
    event = "VimEnter",
    config = function()
      require("modules.configs.ui.alpha")
    end,
  },
  {
    "folke/noice.nvim",
    event = "VeryLazy",
    dependencies = {
      "MunifTanjim/nui.nvim",
      "rcarriga/nvim-notify",
    },
    config = function()
      require("modules.configs.ui.noice")
    end,
  },
  {
    "rcarriga/nvim-notify",
    lazy = true,
    opts = {
      timeout = 3000,
      max_height = function()
        return math.floor(vim.o.lines * 0.75)
      end,
      max_width = function()
        return math.floor(vim.o.columns * 0.75)
      end,
      render = "compact",
      stages = "fade",
    },
  },
  {
    "lukas-reineke/indent-blankline.nvim",
    event = { "BufReadPost", "BufNewFile" },
    main = "ibl",
    config = function()
      require("modules.configs.ui.indent-blankline")
    end,
  },
  {
    "folke/todo-comments.nvim",
    event = { "BufReadPost", "BufNewFile" },
    config = function()
      require("modules.configs.ui.todo-comments")
    end,
  },

  -- ═══════════════════════════════════════════════════════════
  -- ║                       EDITING                            ║
  -- ═══════════════════════════════════════════════════════════
  {
    "windwp/nvim-autopairs",
    event = "InsertEnter",
    opts = {
      check_ts = true,
      ts_config = {
        lua = { "string", "source" },
        javascript = { "string", "template_string" },
      },
    },
  },
  {
    "kylechui/nvim-surround",
    event = "VeryLazy",
    opts = {},
  },
  {
    "numToStr/Comment.nvim",
    keys = {
      { "gc", mode = { "n", "v" }, desc = "Comment toggle linewise" },
      { "gb", mode = { "n", "v" }, desc = "Comment toggle blockwise" },
    },
    opts = {},
  },
}

-- Setup lazy.nvim
require("lazy").setup(plugins, {
  defaults = {
    lazy = true,
  },
  install = {
    colorscheme = { "onedark", "habamax" },
  },
  checker = {
    enabled = true,
    notify = false,
  },
  change_detection = {
    notify = false,
  },
  performance = {
    cache = {
      enabled = true,
    },
    rtp = {
      disabled_plugins = {
        "gzip",
        "matchit",
        "matchparen",
        "netrwPlugin",
        "tarPlugin",
        "tohtml",
        "tutor",
        "zipPlugin",
      },
    },
  },
  ui = {
    border = "rounded",
    icons = {
      cmd = " ",
      config = "",
      event = "",
      ft = " ",
      init = " ",
      import = " ",
      keys = " ",
      lazy = "󰒲 ",
      loaded = "●",
      not_loaded = "○",
      plugin = " ",
      runtime = " ",
      source = " ",
      start = "",
      task = "✔ ",
      list = {
        "●",
        "➜",
        "★",
        "‒",
      },
    },
  },
})
