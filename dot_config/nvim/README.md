# Neovim Configuration

Modern Neovim IDE configuration optimized for speed and Colemak keyboard layout.

## Features

- **Fast Startup**: Lazy loading with lazy.nvim
- **Colemak Support**: Full keyboard remapping for Colemak users
- **LSP**: Auto-install language servers via mason.nvim
- **Completion**: nvim-cmp with snippets (LuaSnip)
- **Debugging**: DAP support for Go, Rust, Python, TypeScript/JavaScript
- **Git Integration**: gitsigns, neogit, diffview
- **Modern UI**: OneDark theme, bufferline, lualine, noice

## Requirements

- Neovim >= 0.10.0
- Git
- [ripgrep](https://github.com/BurntSushi/ripgrep) (for Telescope live grep)
- [fd](https://github.com/sharkdp/fd) (optional, for faster file finding)
- A [Nerd Font](https://www.nerdfonts.com/) (for icons)
- Node.js (for some LSP servers)

## Installation

```bash
# Backup existing config
mv ~/.config/nvim ~/.config/nvim.bak

# Clone/link this config
ln -s /path/to/this/config ~/.config/nvim

# Start Neovim (plugins will auto-install)
nvim
```

## Structure

```
nvim/
├── init.lua                    # Entry point
├── lua/
│   ├── core/                   # Core settings
│   │   ├── options.lua         # Neovim options
│   │   ├── keymaps.lua         # Colemak keymaps
│   │   └── autocmds.lua        # Autocommands
│   └── modules/
│       ├── plugins.lua         # Plugin definitions (lazy.nvim)
│       └── configs/            # Plugin configurations
│           ├── treesitter.lua
│           ├── telescope.lua
│           ├── cmp.lua
│           ├── lsp/
│           ├── dap/
│           ├── git/
│           ├── editor/
│           └── ui/
```

## Keybindings

### Colemak Movement

| Key | Action | QWERTY Equivalent |
|-----|--------|-------------------|
| `m` | Left | `h` |
| `n` | Down | `j` |
| `e` | Up | `k` |
| `i` | Right | `l` |

### Word Movement

| Key | Action |
|-----|--------|
| `l` / `L` | Word backward (b/B) |
| `u` / `U` | Word end (e/E) |
| `y` / `Y` | Word forward (w/W) |

### Insert/Visual

| Key | Action |
|-----|--------|
| `s` / `S` | Insert (i/I) |
| `t` / `T` | Append (a/A) |
| `a` / `A` | Visual mode (v/V) |

### Edit Operations

| Key | Action |
|-----|--------|
| `x` / `X` | Delete/Cut (d/dd) |
| `c` / `C` | Copy/Yank (y/yy) |
| `v` / `V` | Paste (p/P) |
| `w` / `W` | Change (c/C) |
| `z` / `Z` | Undo/Redo (u/Ctrl-R) |

### Leader Key Mappings

Leader key: `<Space>`

#### File Operations

| Key | Action |
|-----|--------|
| `<leader>w` | Save file |
| `<leader>q` | Quit |
| `<leader>e` | File explorer (nvim-tree) |
| `<leader>n` | New file |

#### Find (Telescope)

| Key | Action |
|-----|--------|
| `<leader>ff` | Find files |
| `<leader>fg` | Live grep |
| `<leader>fb` | Buffers |
| `<leader>fh` | Help tags |
| `<leader>fr` | Recent files |
| `<leader>fs` | Document symbols |
| `<leader>fd` | Diagnostics |

#### Git

| Key | Action |
|-----|--------|
| `<leader>gg` | Neogit |
| `<leader>gd` | Diffview |
| `<leader>gh` | File history |
| `<leader>gs` | Stage hunk |
| `<leader>gr` | Reset hunk |
| `<leader>gb` | Blame line |

#### Code

| Key | Action |
|-----|--------|
| `<leader>ca` | Code action |
| `<leader>cr` | Rename symbol |
| `<leader>cf` | Format buffer |
| `<leader>cd` | Line diagnostics |
| `<leader>ch` | Toggle inlay hints |

#### Debug (DAP)

| Key | Action |
|-----|--------|
| `<leader>db` | Toggle breakpoint |
| `<leader>dc` | Continue |
| `<leader>di` | Step into |
| `<leader>do` | Step over |
| `<leader>dO` | Step out |
| `<leader>du` | Toggle DAP UI |
| `<leader>dr` | Toggle REPL |

#### Test (Neotest)

| Key | Action |
|-----|--------|
| `<leader>tt` | Run nearest test |
| `<leader>tf` | Run file tests |
| `<leader>ts` | Toggle test summary |
| `<leader>to` | Show test output |
| `<leader>td` | Debug nearest test |

#### Buffer

| Key | Action |
|-----|--------|
| `<Tab>` | Next buffer |
| `<S-Tab>` | Previous buffer |
| `<leader>bd` | Delete buffer |
| `<leader>1-9` | Go to buffer N |

### LSP Navigation

| Key | Action |
|-----|--------|
| `gd` | Go to definition |
| `gD` | Go to declaration |
| `gi` | Go to implementation |
| `gr` | Go to references |
| `gt` | Go to type definition |
| `K` | Hover documentation |
| `<C-k>` | Signature help |

## Plugins

### Core
- [lazy.nvim](https://github.com/folke/lazy.nvim) - Plugin manager
- [nvim-treesitter](https://github.com/nvim-treesitter/nvim-treesitter) - Syntax highlighting
- [nvim-lspconfig](https://github.com/neovim/nvim-lspconfig) - LSP configuration
- [mason.nvim](https://github.com/williamboman/mason.nvim) - LSP/DAP installer
- [lazydev.nvim](https://github.com/folke/lazydev.nvim) - Lua development

### Completion
- [nvim-cmp](https://github.com/hrsh7th/nvim-cmp) - Completion engine
- [LuaSnip](https://github.com/L3MON4D3/LuaSnip) - Snippet engine
- [friendly-snippets](https://github.com/rafamadriz/friendly-snippets) - Snippet collection

### Debug
- [nvim-dap](https://github.com/mfussenegger/nvim-dap) - Debug Adapter Protocol
- [nvim-dap-ui](https://github.com/rcarriga/nvim-dap-ui) - DAP UI
- [nvim-dap-go](https://github.com/leoluz/nvim-dap-go) - Go debugging
- [nvim-dap-python](https://github.com/mfussenegger/nvim-dap-python) - Python debugging

### Git
- [gitsigns.nvim](https://github.com/lewis6991/gitsigns.nvim) - Git signs
- [neogit](https://github.com/NeogitOrg/neogit) - Magit-like Git UI
- [diffview.nvim](https://github.com/sindrets/diffview.nvim) - Diff viewer

### Editor
- [telescope.nvim](https://github.com/nvim-telescope/telescope.nvim) - Fuzzy finder
- [which-key.nvim](https://github.com/folke/which-key.nvim) - Key binding help
- [conform.nvim](https://github.com/stevearc/conform.nvim) - Formatter
- [nvim-lint](https://github.com/mfussenegger/nvim-lint) - Linter
- [neotest](https://github.com/nvim-neotest/neotest) - Test runner

### UI
- [onedarkpro.nvim](https://github.com/olimorris/onedarkpro.nvim) - OneDark theme
- [lualine.nvim](https://github.com/nvim-lualine/lualine.nvim) - Statusline
- [bufferline.nvim](https://github.com/akinsho/bufferline.nvim) - Buffer tabs
- [nvim-tree.lua](https://github.com/nvim-tree/nvim-tree.lua) - File explorer
- [alpha-nvim](https://github.com/goolord/alpha-nvim) - Dashboard
- [noice.nvim](https://github.com/folke/noice.nvim) - UI enhancement
- [indent-blankline.nvim](https://github.com/lukas-reineke/indent-blankline.nvim) - Indent guides
- [todo-comments.nvim](https://github.com/folke/todo-comments.nvim) - TODO highlights

## Language Support

LSP servers are auto-installed via mason-lspconfig when you open a file:

| Language | LSP Server | Formatter | Linter |
|----------|------------|-----------|--------|
| Lua | lua_ls | stylua | selene |
| Go | gopls | gofumpt | golangci-lint |
| Rust | rust-analyzer | rustfmt | - |
| TypeScript/JS | ts_ls | prettierd | eslint_d |
| Python | pyright | ruff | ruff, mypy |
| C/C++ | clangd | clang-format | - |
| Ruby | solargraph | rubocop | rubocop |
| JSON | jsonls | prettierd | - |
| YAML | yamlls | prettierd | yamllint |
| HTML/CSS | html, cssls | prettierd | - |

## Commands

| Command | Description |
|---------|-------------|
| `:Lazy` | Open lazy.nvim UI |
| `:Mason` | Open mason.nvim UI |
| `:LspInfo` | LSP information |
| `:ConformInfo` | Formatter information |
| `:FormatToggle` | Toggle format on save |
| `:Neogit` | Open Neogit |
| `:DiffviewOpen` | Open diffview |
| `:TodoTelescope` | Search TODO comments |

## Customization

### Adding a new LSP server

Edit `lua/modules/configs/lsp/init.lua`:

```lua
local servers = {
  -- Add your server here
  your_server = {
    settings = {
      -- server-specific settings
    },
  },
}
```

### Adding a new formatter

Edit `lua/modules/configs/editor/conform.lua`:

```lua
formatters_by_ft = {
  your_filetype = { "your_formatter" },
}
```

### Changing the colorscheme

Edit `lua/modules/configs/ui/colorscheme.lua` or add a new colorscheme to `plugins.lua`.

## Troubleshooting

### Slow startup
Run `:Lazy profile` to identify slow plugins.

### LSP not working
1. Check `:LspInfo` for status
2. Run `:Mason` to install missing servers
3. Check `:checkhealth lsp`

### Icons not displaying
Install a [Nerd Font](https://www.nerdfonts.com/) and configure your terminal to use it.

## License

MIT
