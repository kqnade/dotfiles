# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Arch Linux向けのdotfilesリポジトリ。**chezmoi**で管理され、**Colemakキーボードレイアウト**に最適化されている。

## Commands

```bash
# 設定ファイルの適用
chezmoi apply          # または alias: ca

# 設定ファイルの編集
chezmoi edit <file>    # または alias: ce

# 差分確認
chezmoi diff

# ツールのインストール
mise install
```

## Architecture

### File Naming Convention (chezmoi)

- `dot_<file>` → `~/.<file>` (例: `dot_zshrc` → `~/.zshrc`)
- `dot_config/` → `~/.config/`

### Core Tools

| Tool | Purpose | Config |
|------|---------|--------|
| chezmoi | dotfiles管理 | `.chezmoi.toml.tmpl` |
| mise | ツール/ランタイム管理 | `dot_config/mise/config.toml` |
| sheldon | Zshプラグイン管理 | `dot_config/sheldon/plugins.toml` |
| starship | プロンプト | `dot_config/starship.toml` |

### Neovim Structure (`dot_config/nvim/`)

```
nvim/
├── init.lua                 # エントリーポイント
└── lua/
    ├── core/                # options, keymaps, autocmds
    └── modules/
        ├── plugins.lua      # lazy.nvimプラグイン定義
        └── configs/         # 個別プラグイン設定
            ├── lsp/         # LSP設定
            ├── dap/         # デバッガー設定
            ├── git/         # Git連携
            ├── editor/      # エディタ機能
            └── ui/          # UI/テーマ
```

## Colemak Keybinding Convention

このリポジトリ全体でColemakレイアウトを採用：

| Colemak | QWERTY相当 | 用途 |
|---------|------------|------|
| `m/n/e/i` | `h/j/k/l` | 移動キー |
| `s/t` | `i/a` | 挿入/追加 |
| `x/c/v` | `d/y/p` | 削除/コピー/貼り付け |

Vim/Neovimの設定変更時は、このマッピングを維持すること。

## Key Customization Points

- **LSPサーバー追加**: `dot_config/nvim/lua/modules/configs/lsp/init.lua`
- **フォーマッター追加**: `dot_config/nvim/lua/modules/configs/editor/conform.lua`
- **Zshエイリアス**: `dot_zshrc`
- **依存パッケージ**: `metapkgs/base/PKGBUILD`
