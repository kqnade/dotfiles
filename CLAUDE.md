# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Fedora (primary) / Arch Linux / macOS / Windows 向けの dotfiles リポジトリ。**chezmoi** で管理し、**Colemak キーボードレイアウト** に最適化されている。

### 設計の核

「OS パッケージマネージャは地盤、開発ツールは [mise](https://mise.jdx.dev)」。
OS 層は `zsh` / `git` / ビルドツール / フォント / 常駐サービスだけを持ち、それ以外の CLI 開発ツール (chezmoi 以外) と言語ランタイムは全て `dot_config/mise/config.toml.tmpl` に集約。これで brew / apt / dnf / pacman 間のパリティ問題が消える。

### Install path matrix

| 環境 | エントリポイント | 使う manifest |
|------|-----------------|--------------|
| Fedora (sudo, primary) | `bash scripts/install-linux.sh` | `Dnffile` |
| Arch (sudo) | `bash scripts/install-linux.sh` (内部で `makepkg -si`) | `metapkgs/base/PKGBUILD` |
| macOS | `brew bundle` | `Brewfile` |
| Windows | `chezmoi apply`（auto 経由で `run_onchange_install-scoop-packages.ps1`） | `scoopfile.json` |

**廃止された経路** (再追加しない限り戻さない): Debian/Ubuntu (apt), sideapt (非sudo apt), pixi (conda-forge)。

### Repository placement (sourceDir)

`.chezmoi.toml.tmpl` の `sourceDir` は OS で分岐：

| OS | sourceDir |
|----|-----------|
| Linux / macOS | `~/ghq/github.com/kqnade/dotfiles` (ghq 規約) |
| Windows | `Z:/github.com/kqnade/dotfiles` (`Z:\` を開発ドライブ = ghq root 相当として扱う) |

新環境での初期化は `chezmoi init --source . --apply` をリポジトリ内で実行する。

### chezmoi data prompts

`.chezmoi.toml.tmpl` は `chezmoi init` 時に以下を聞く:

| Key | 既定 | 影響 |
|-----|------|------|
| `features.neovim` | `true` | `false` にすると `dot_config/nvim/` と mise の `neovim` エントリが除外される |

> yaskkserv2 (SKK 辞書サーバ) と SKK 辞書取得は **常時オン**。macSKK でも使うため `features.neovim` には連動しない。

## Commands

```bash
chezmoi apply          # 設定適用 (alias: ca)
chezmoi edit <file>    # 設定編集 (alias: ce)
chezmoi diff           # 差分確認
mise install           # mise の global tools をインストール
```

## Architecture

### File Naming Convention (chezmoi)

- `dot_<file>` → `~/.<file>` (例: `dot_zshrc` → `~/.zshrc`)
- `dot_config/` → `~/.config/`
- `Documents/` → `~/Documents/` (Windows の PowerShell プロファイル等で使用)
- `run_onchange_*.tmpl` → 内容変更時に一度だけ実行される chezmoi スクリプト
- `private_*` → 0600/0700 強制（op CLI plugin 設定など、world-readable だと無視されるもの）

### Core Tools

| Tool | Purpose | Config |
|------|---------|--------|
| chezmoi | dotfiles 管理（mise 外、`~/.local/bin` に bootstrap 配置） | `.chezmoi.toml.tmpl` |
| mise | 開発ツール / ランタイムの統一バージョン管理（aqua/github/npm/pipx/cargo/go backend 対応） | `dot_config/mise/config.toml.tmpl` |
| sheldon | Zsh プラグイン (Linux/macOS) | `dot_config/sheldon/plugins.toml` |
| starship | プロンプト (全 OS) | `dot_config/starship.toml` |
| Brewfile | macOS の zsh/git/openssh/フォント/yaskkserv2 | `Brewfile` |
| Dnffile | Fedora の zsh/git/build tools/フォント | `Dnffile` |
| metapkgs | Arch の同等パッケージ群 | `metapkgs/base/PKGBUILD` |
| scoop | Windows パッケージ | `scoopfile.json` |
| MSYS2 | Windows での Linux ライク bash 環境 | scoop `msys2` + `dot_bashrc.tmpl` |
| yaskkserv2 | ローカル SKK 辞書サーバ (Linux/macOS — macSKK + skkeleton 共用) | `run_onchange_after_install-yaskkserv2.sh.tmpl` |
| 1Password CLI (`op`) | シークレット管理。**mise が `1password-cli` を扱える**ので個別 download は不要。`gh` は `op plugin run -- gh` alias 経由 (`dot_config/private_op/private_plugins.sh`) | `dot_config/private_op/` |

### 1Password SSH agent (WSL)

macOS / Linux desktop ではそれぞれ native socket (`~/Library/Group Containers/.../agent.sock` または `~/.1password/agent.sock`) を `SSH_AUTH_SOCK` に設定する。WSL は Linux 版 desktop app を持てないので、Windows 側の named pipe `\\.\pipe\openssh-ssh-agent` を **scoop `npiperelay`** + **dnf/pacman `socat`** で UNIX socket に bridge する（`dot_zshrc` / `dot_bashrc.tmpl` の `WSL_DISTRO_NAME` ブロック）。

### SKK Input (skkeleton + yaskkserv2)

Neovim の `skkeleton` および macOS の macSKK は `127.0.0.1:1178` の SKK サーバ越しに辞書参照する。
辞書サーバ `yaskkserv2` は `cargo` (mise の rust runtime) 経由で各マシンにビルドし、ユーザサービスとして常駐：

- macOS: launchd agent (`~/Library/LaunchAgents/com.user.yaskkserv2.plist`)
- Linux: systemd user unit (`~/.config/systemd/user/yaskkserv2.service`)

辞書ソース (`~/.skk/SKK-JISYO.{L,geo,propernoun,assoc,JIS3_4,law}`) は
`.chezmoiexternal.toml.tmpl` で skk-dev/dict から取得され、
`yaskkserv2_make_dictionary` でマージされた `~/.skk/dictionary.yaskkserv2`
（アーキ依存・バイナリ）が生成される。再ビルドはソースファイルが新しい
ときのみ。

### Zsh Structure (`dot_config/zsh/`)

```
zsh/
├── aliases.zsh          # エイリアス全般
└── functions/
    ├── ccc.zsh          # git-ccc: staged diff → claude -p で gitmoji 付きコミットメッセージ自動生成
    ├── ccd.zsh          # cd + clear
    ├── claude.zsh       # claude wrapper (1Password 経由で GITHUB_PERSONAL_ACCESS_TOKEN 注入)
    ├── gg.zsh           # ghq リポジトリ fzf 選択・移動
    ├── ghq.zsh          # ghq wrapper (get/clone/create 後に自動 cd、remove サブコマンド)
    └── mkcd.zsh         # mkdir + cd
```

`.zshrc` から `~/.config/zsh/**/*.zsh` を一括 source。新しい関数は `functions/` にファイルを追加するだけ。

### Bash Structure (`dot_bashrc.tmpl` + `dot_bash_profile`)

`dot_zshrc` の bash 版。Linux/macOS で bash を使う場面と、**Windows の MSYS2** で
`%USERPROFILE%` を `$HOME` に統一したときに同じ `.bashrc` が読まれることを想定。

`aliases.zsh` は bash 互換構文で書かれているため bashrc から直接 source して共有。
ただし `dot_config/zsh/functions/*.zsh` は zsh 固有のイディオム
(`read -q`, `${@[-1]}` など) を含むため bash では source しない。

#### MSYS2 HOME 統一の自動化

`run_onchange_setup-msys2.ps1.tmpl` が `chezmoi apply` 時に scoop 配下の
`%USERPROFILE%\scoop\apps\msys2\current\etc\nsswitch.conf` を編集し、
`db_home: windows` を設定。これにより MSYS2 の `$HOME` が
`%USERPROFILE%` に揃い、chezmoi が配置した `~/.bashrc` がそのまま読まれる。

### PowerShell Structure (Windows)

```
Documents/PowerShell/
└── Microsoft.PowerShell_profile.ps1.tmpl   # mise/starship 起動 + エイリアス + 関数
```

zsh 関数 (`gg`, `mkcd`, `ccd`, `ghq` ラッパ) と機能パリティを保つ PowerShell 版を同ファイル内に定義する。

### Neovim Structure (`dot_config/nvim/`)

`features.neovim = true` のときのみ展開される。

```
nvim/
├── init.lua                 # エントリーポイント
└── lua/
    ├── core/                # options, keymaps, autocmds
    └── modules/
        ├── plugins.lua      # lazy.nvim プラグイン定義
        └── configs/         # 個別プラグイン設定
```

## Colemak Keybinding Convention

このリポジトリ全体で Colemak レイアウトを採用：

| Colemak | QWERTY 相当 | 用途 |
|---------|-------------|------|
| `m/n/e/i` | `h/j/k/l` | 移動キー |
| `s/t` | `i/a` | 挿入/追加 |
| `x/c/v` | `d/y/p` | 削除/コピー/貼り付け |

Vim/Neovim の設定変更時は、このマッピングを維持すること。

## Key Customization Points

- **mise tool 追加**: `dot_config/mise/config.toml.tmpl` (OS パッケージマネージャに足すのは最終手段)
- **LSP サーバー追加**: `dot_config/nvim/lua/modules/configs/lsp/init.lua`
- **フォーマッター追加**: `dot_config/nvim/lua/modules/configs/editor/conform.lua`
- **Zsh エイリアス**: `dot_config/zsh/aliases.zsh`
- **Zsh 関数追加**: `dot_config/zsh/functions/<name>.zsh` を作成
- **Claude 設定**: `dot_claude/settings.json`
- **Claude ルール**: `dot_claude/rules/`
