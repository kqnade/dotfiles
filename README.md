# dotfiles

**chezmoi** で管理する、Arch Linux / Ubuntu (Debian) / macOS / Windows 対応の宣言的な環境設定群。Colemak キーボードレイアウト最適化済み。

## プラットフォーム別インストール経路

| 環境 | パッケージ管理 | 一発インストール | ドキュメント |
|------|----------------|------------------|--------------|
| Arch Linux (sudo) | pacman + 自作 metapackage `base-env` | `cd metapkgs/base && makepkg -si` | [docs/setup-linux.md](docs/setup-linux.md) |
| Ubuntu / Debian (sudo) | `apt` + `Aptfile`、補助は mise | `bash scripts/install-linux.sh` | [docs/setup-linux.md](docs/setup-linux.md) |
| 非 sudo Linux (任意 distro) | **Linuxbrew** + `Brewfile` | `FORCE_NOSUDO=1 bash scripts/install-linux.sh` | [docs/setup-linux.md](docs/setup-linux.md) |
| macOS | Homebrew + `Brewfile` | `brew bundle` | [docs/setup-macos.md](docs/setup-macos.md) |
| Windows (PowerShell 7) | scoop + `scoopfile.json` | `chezmoi apply` で自動 | [docs/setup-windows.md](docs/setup-windows.md) |

`scripts/install-linux.sh` は `/etc/os-release` と sudo 利用可否を自動判定して上記 3 経路に分岐します。`FORCE_NOSUDO=1` で強制的に Linuxbrew 経路を選択可能。

## 概要

Zsh / PowerShell, Vim / Neovim, Git などのツールを一貫したモダン環境として構築するための設定。

主な特徴：

* **chezmoi**: テンプレートと OS 分岐で 1 リポジトリから 4 OS に展開。
* **mise**: CLI ツールおよびランタイムのバージョン管理。
* **sheldon**: Zsh プラグインの高速管理（Linux/macOS）。
* **starship**: 全 OS 共通のプロンプト。
* **Vim/Neovim**: Colemak 配列に最適化されたキーバインド。

詳細は [docs/features.md](docs/features.md) を参照。

## ドキュメント

* [docs/setup-linux.md](docs/setup-linux.md) — Arch / Ubuntu / 非 sudo (Linuxbrew)
* [docs/setup-macos.md](docs/setup-macos.md) — macOS
* [docs/setup-windows.md](docs/setup-windows.md) — Windows (PowerShell 7 + scoop)
* [docs/features.md](docs/features.md) — Zsh / PowerShell / Vim / Neovim / Git の機能と設定
