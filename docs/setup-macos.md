# macOS セットアップ

リポジトリは ghq 規約に従って `~/ghq/github.com/kqnade/dotfiles` に配置することを想定しています。

## 1. Homebrew のインストール

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

## 2. chezmoi の初期化と設定の適用

```bash
brew install chezmoi
chezmoi init --apply kqnade
```

## 3. Homebrew パッケージの一括インストール

`chezmoi apply` 後に `~/Brewfile` が展開されるので、これを使って一括インストールします。

```bash
brew bundle
```

`Brewfile` は macOS / Linuxbrew 共通フォーマットで、`if OS.mac?` ガードにより `cask` (`font-udev-gothic`) と `pinentry-mac` は macOS 限定で取り込まれます。

## 4. ツールのインストール

```bash
mise install
```
