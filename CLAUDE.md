# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Arch Linux / Ubuntu (Debian) / macOS / Windows 向けの dotfiles リポジトリ。**chezmoi**で管理され、**Colemakキーボードレイアウト**に最適化されている。OS / ディストリビューション / sudo 利用可否ごとの差分は `.chezmoiignore` のテンプレート分岐 (`.chezmoi.os` / `.chezmoi.osRelease.id` / `.chezmoi.osRelease.idLike`) と `scripts/install-linux.sh` のランタイム判定で制御する。

### Install path matrix

| 環境 | エントリポイント | 使う manifest |
|------|-----------------|--------------|
| Arch (sudo) | `metapkgs/base/PKGBUILD` または `scripts/install-linux.sh` | metapkgs |
| Ubuntu/Debian (sudo) | `scripts/install-linux.sh` | `Aptfile` + mise |
| 非 sudo な Linux | `FORCE_NOSUDO=1 bash scripts/install-linux.sh` | Linuxbrew + `Brewfile` |
| macOS | `brew bundle` | `Brewfile` |
| Windows | `chezmoi apply`（auto 経由で `run_onchange_install-scoop-packages.ps1`） | `scoopfile.json` |

### Repository placement (sourceDir)

`.chezmoi.toml.tmpl` の `sourceDir` は OS で分岐：

| OS | sourceDir |
|----|-----------|
| Linux / macOS | `~/ghq/github.com/kqnade/dotfiles` (ghq 規約) |
| Windows | `Z:/github.com/kqnade/dotfiles` (`Z:\` を開発ドライブ = ghq root 相当として扱う) |

新環境での初期化は `chezmoi init --source .` をリポジトリ内で実行する。

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
- `Documents/` → `~/Documents/` (Windows の PowerShell プロファイル等で使用)
- `run_onchange_*.tmpl` → 内容変更時に一度だけ実行される chezmoi スクリプト

### Core Tools

| Tool | Purpose | Config |
|------|---------|--------|
| chezmoi | dotfiles管理 | `.chezmoi.toml.tmpl` |
| mise | ツール/ランタイム管理 | `dot_config/mise/config.toml` |
| sheldon | Zshプラグイン管理 (Linux/macOS) | `dot_config/sheldon/plugins.toml` |
| starship | プロンプト (全OS) | `dot_config/starship.toml` |
| scoop | パッケージ管理 (Windows) | `scoopfile.json` |
| Brewfile | パッケージ管理 (macOS / 非sudo Linux=Linuxbrew) | `Brewfile` |
| Aptfile | パッケージ管理 (Ubuntu/Debian sudo) | `Aptfile` |
| metapkgs | パッケージ管理 (Arch sudo) | `metapkgs/base/PKGBUILD` |
| MSYS2 | Windows での Linux ライク bash 環境 | scoop `msys2` + `dot_bashrc.tmpl` |

### Zsh Structure (`dot_config/zsh/`)

```
zsh/
├── aliases.zsh          # エイリアス全般
└── functions/
    ├── ccd.zsh          # cd + clear
    ├── gh.zsh           # gh wrapper (pass経由でGH_TOKEN注入)
    ├── gg.zsh           # ghqリポジトリfzf選択・移動
    ├── ghq.zsh          # ghq wrapper (get/clone/create後に自動cd、removeサブコマンド)
    └── mkcd.zsh         # mkdir + cd
```

`.zshrc` から `~/.config/zsh/**/*.zsh` を一括 source。新しい関数は `functions/` にファイルを追加するだけ。

### Bash Structure (`dot_bashrc.tmpl` + `dot_bash_profile`)

`dot_zshrc` の bash 版。Linux/macOS で bash を使う場面と、**Windows の MSYS2** で
`%USERPROFILE%` を `$HOME` に統一したときに同じ `.bashrc` が読まれることを想定。

`aliases.zsh` は bash 互換構文で書かれているため bashrc から直接 source して共有。
ただし `dot_config/zsh/functions/*.zsh` は zsh 固有のイディオム
(`read -q`, `${@[-1]}` など) を含むため bash では source しない。

`dot_bash_profile` はログインシェル起動時に `.bashrc` を読み込むためのフォワーダー。

#### MSYS2 HOME 統一の自動化

`run_onchange_setup-msys2.ps1.tmpl` が `chezmoi apply` 時に scoop 配下の
`%USERPROFILE%\scoop\apps\msys2\current\msys64\etc\nsswitch.conf` を編集し、
`db_home: windows` を設定。これにより MSYS2 の `$HOME` が
`%USERPROFILE%` に揃い、chezmoi が配置した `~/.bashrc` がそのまま読まれる。
**管理者権限不要**（scoop 管理下のためユーザー所有）。

### PowerShell Structure (Windows)

```
Documents/PowerShell/
└── Microsoft.PowerShell_profile.ps1.tmpl   # mise/starship 起動 + エイリアス + 関数
```

zsh 関数 (`gg`, `mkcd`, `ccd`, `ghq` ラッパ) と機能パリティを保つ PowerShell 版を同ファイル内に定義する。

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
- **Zshエイリアス**: `dot_config/zsh/aliases.zsh`
- **Zsh関数追加**: `dot_config/zsh/functions/<name>.zsh` を作成
- **Claude設定**: `dot_claude/settings.json`
- **Claudeルール**: `dot_claude/rules/`
- **依存パッケージ**: `metapkgs/base/PKGBUILD`
