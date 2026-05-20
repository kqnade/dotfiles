# dotfiles

**chezmoi** で管理する、Fedora / Arch Linux / macOS / Windows 対応のミニマル dotfiles。Colemak 配列最適化。

## 設計思想

OS パッケージマネージャは「**シェル・git・ビルドツールチェイン・フォント・常駐サービス**」だけを持ち、開発ツール (chezmoi 自体, sheldon, starship, ghq, gh, glab, eza, fd, ripgrep, bat, fzf, delta, gomi, neovim, lazygit, 言語ランタイム…) はすべて [**mise**](https://mise.jdx.dev) に集約。これで OS 横断のパリティ問題が消える。

## プラットフォーム別インストール経路

| 環境 | OS パッケージ | 一発インストール |
|------|---------------|------------------|
| **Fedora** (primary) | `dnf` + `Dnffile` | `bash scripts/install-linux.sh` |
| Arch Linux | pacman + 自作 metapackage `base-env` | `bash scripts/install-linux.sh` |
| macOS | Homebrew + `Brewfile` | `brew bundle` |
| Windows (PowerShell 7) | scoop + `scoopfile.json` | `chezmoi apply` で自動 |

Linux はいずれも sudo 必須。`scripts/install-linux.sh` は `/etc/os-release` を読んで `arch` / `fedora` (含む `rhel`/`centos`/`rocky`/`almalinux`) に分岐し、続いて `chezmoi` と `mise` を `~/.local/bin` に投下する。

> **削除されたサポート対象**: Debian/Ubuntu (apt), sideapt (非sudo apt), pixi (conda-forge フォールバック)。

## 概要

* **chezmoi**: テンプレートと OS 分岐で 1 リポジトリから 4 OS に展開。
* **mise**: 開発ツールおよび言語ランタイムの統一バージョン管理。aqua/github/npm/pipx/cargo/go backend を扱える。
* **sheldon**: Zsh プラグインの高速管理 (Linux/macOS)。
* **starship**: 全 OS 共通のプロンプト。
* **Vim/Neovim**: Colemak 配列に最適化されたキーバインド (Neovim はオプトアウト)。
* **yaskkserv2**: macSKK / Neovim skkeleton から共用するローカル SKK 辞書サーバ。

## 新環境セットアップ (Fedora 例)

```bash
# 1. リポジトリ取得
git clone https://github.com/kqnade/dotfiles ~/ghq/github.com/kqnade/dotfiles
cd ~/ghq/github.com/kqnade/dotfiles

# 2. システムパッケージ + chezmoi + mise
bash scripts/install-linux.sh

# 3. chezmoi 適用 (Neovim を入れるか聞かれる)
export PATH="$HOME/.local/bin:$PATH"
chezmoi init --source . --apply

# 4. mise で残りの開発ツール
mise install

# 5. yaskkserv2 のビルド・サービス登録のため再適用
chezmoi apply
```

## ドキュメント

* [docs/setup-linux.md](docs/setup-linux.md) — Fedora / Arch
* [docs/setup-macos.md](docs/setup-macos.md) — macOS
* [docs/setup-windows.md](docs/setup-windows.md) — Windows (PowerShell 7 + scoop)
* [docs/features.md](docs/features.md) — Zsh / PowerShell / Vim / Neovim / Git の機能と設定
