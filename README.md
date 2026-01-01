# dotfiles

**chezmoi** を使用して管理されている、Arch Linux 向けの宣言的な環境設定群です。

## 概要

このリポジトリは、Zsh、Vim、Git などのツールを、一貫性のあるモダンな環境として構築するための設定を管理しています。

主な特徴：

* **chezmoi**: 設定ファイルの管理と同期。
* **mise**: CLI ツールおよびランタイムのバージョン管理。
* **sheldon**: Zsh プラグインの高速な管理。
* **starship**: 高度にカスタマイズされたプロンプト。
* **Vim**: Colemak 配列に最適化されたカスタムキーバインド。

## 必須条件

* **OS**: Arch Linux
* **パッケージ**: `base-devel`, `git`

## セットアップ

このリポジトリは、ソースディレクトリが `~/ghq/github.com/kqnade/dotfiles` に配置されていることを想定しています。

### 1. 依存パッケージのインストール

独自のメタパッケージ `base-env` を使用して、必要なツールを一括でインストールします。

```bash
cd metapkgs/base
makepkg -si

```

これにより、`chezmoi`, `mise`, `sheldon`, `zsh`, `vim`, `ghq` などが導入されます。

### 2. 設定の適用

chezmoi を初期化し、設定をホームディレクトリに適用します。

```bash
chezmoi init --apply kqnade

```

### 3. ツールのインストール

mise を使用して、必要なバイナリ（`eza`, `fzf`, `ripgrep`, `bat` など）をインストールします。

```bash
mise install

```

## 主な機能と設定

### Zsh (`.zshrc`)

* `sheldon` によるプラグイン管理（autosuggestions, syntax-highlighting, enhancd 等）。
* `fzf-tab` による補完のプレビュー。
* **`gg` 関数**: `ghq` 管理下のリポジトリを `fzf` で検索・プレビューし、ディレクトリを高速移動。
* エイリアス: `ls` (`eza`), `cat` (`bat`), `vi` (`vim`), `p` (`paru`)。

### Vim (`.vimrc`)

* **Colemak キーバインド**: `m/n/e/i` を方向キー（h/j/k/l）として割り当て。
* `s/t` を挿入（Insert/Append）に割り当て。
* `x/c/v` を切り取り・コピー・貼り付けに最適化。

### Git (`.gitconfig`)

* ページャーとして `delta` を使用。
* 各種エイリアス（`ci`, `co`, `st`, `last`）。
* GPG によるコミット署名の有効化。
