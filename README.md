# dotfiles v2

mise をマシン構築の入口に統一した、macOS / Fedora / Arch Linux / WSL 向け
dotfiles です。chezmoi はテンプレート、private 属性、externals の配置だけを
担当します。

## 対象環境

- macOS arm64 / x64
- Fedora x64
- Arch Linux x64
- Fedora / Arch Linux on WSL x64

## セットアップ

取得済みの `install.sh` を実行すると、mise を `~/.local/bin` に導入し、
リポジトリを `~/repos/github.com/kqnade/dotfiles` に取得したあと、マシン全体を
収束させます。

```bash
bash install.sh
```

未取得の環境では次の一行でも開始できます。

```bash
curl -fsSL https://raw.githubusercontent.com/kqnade/dotfiles/main/install.sh | bash
```

macOS で Xcode Command Line Tools が未導入の場合だけ、OS のインストール確認を
完了してから処理が続きます。既存の外部パッケージマネージャや、その管理データは
自動削除しません。

## 公開インターフェース

```bash
mise bootstrap --yes  # packages, tools, dotfiles, defaults, services を収束
mise run apply         # chezmoi で dotfile を反映
mise run doctor        # tools, packages, dotfiles, fonts, services を診断
mise run update        # tool pin と 3 platform の lock を更新
```

root の [mise.toml](mise.toml) が bootstrap と global tool の唯一の定義です。
全 tool は明示 pin し、`mise.lock` は `macos-arm64`、`macos-x64`、
`linux-x64` を収録します。Intel Mac では sheldon、delta、fd、atuin を
Cargo backend で build し、pnpm は npm backend から導入します。

## 維持している設定

- Neovim 設定と Colemak keymap
- skkeleton と yaskkserv2 による SKK
- Zsh/Bash の履歴、補完、sheldon、starship、mise、atuin、zoxide、ghq 操作
- Claude Code / Codex / OpenCode / Herdr と各 CLI の設定
- WSL から Windows 側 1Password/OpenSSH を使う `op` / `ssh` / `ssh-add` proxy

## ドキュメント

- [Linux セットアップ](docs/setup-linux.md)
- [macOS セットアップ](docs/setup-macos.md)
- [設定一覧](docs/features.md)
- [CI の実行範囲](docs/ci.md)
- [残作業](TODO.md)

## CI

CI は preview ではなく、実際のinstall・build・applyを行います。macOS arm64では
`install.sh`、全公開command、2回目のbootstrapによる冪等性、serviceのportまで
確認します。Intel Macでも `install.sh`、apply、doctorを実行し、Cargo/npm
fallbackをすべてbuildして実行します。

Fedoraではsystem package、全tool、dotfile、font、SKK辞書とserver本体を実行し、
Archでもsystem packageを実導入します。GitHub-hosted Linux containerにはuser
systemdがないため、systemd unitとWSL proxyの実機検証だけは専用runnerの残課題です。
