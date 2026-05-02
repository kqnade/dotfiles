# dotfiles

**chezmoi** を使用して管理されている、Arch Linux / Ubuntu (Debian) / macOS / Windows 向けの宣言的な環境設定群です。

| 環境 | パッケージ管理 | 一発インストール |
|------|----------------|------------------|
| Arch Linux (sudo) | pacman + 自作 metapackage `base-env` | `cd metapkgs/base && makepkg -si` |
| Ubuntu / Debian (sudo) | `apt` + `Aptfile`、補助ツールは mise | `bash scripts/install-linux.sh` |
| 非 sudo Linux (任意 distro) | **Linuxbrew** (`$HOME/.linuxbrew`) + `Brewfile` | `bash scripts/install-linux.sh` |
| macOS | Homebrew + `Brewfile` | `brew bundle` |
| Windows (PowerShell 7) | scoop + `scoopfile.json` | chezmoi apply で自動 |

`scripts/install-linux.sh` は `/etc/os-release` と sudo 利用可否を自動判定して上記 3 経路に分岐します。`FORCE_NOSUDO=1` で強制的に Linuxbrew 経路を選べます。

## 概要

Zsh、Vim、Git などのツールを一貫性のあるモダンな環境として構築するための設定を管理しています。

主な特徴：

* **chezmoi**: 設定ファイルの管理と同期。
* **mise**: CLI ツールおよびランタイムのバージョン管理。
* **sheldon**: Zsh プラグインの高速な管理。
* **starship**: 高度にカスタマイズされたプロンプト。
* **Vim**: Colemak 配列に最適化されたカスタムキーバインド。

## セットアップ

このリポジトリは、ソースディレクトリが `~/ghq/github.com/kqnade/dotfiles` に配置されていることを想定しています。

### Arch Linux

#### 1. 依存パッケージのインストール

独自のメタパッケージ `base-env` を使用して、必要なツールを一括でインストールします。

```bash
cd metapkgs/base
makepkg -si
```

これにより、`chezmoi`, `mise`, `sheldon`, `zsh`, `vim`, `ghq` などが導入されます。
スクリプト経由でも同じ結果になります：

```bash
bash scripts/install-linux.sh
```

#### 2. 設定の適用

```bash
chezmoi init --apply kqnade
```

#### 3. ツールのインストール

```bash
mise install
```

---

### Ubuntu / Debian (sudo あり)

#### 1. リポジトリの取得と依存ツールのインストール

```bash
sudo apt-get update && sudo apt-get install -y git curl
git clone https://github.com/kqnade/dotfiles.git ~/ghq/github.com/kqnade/dotfiles
cd ~/ghq/github.com/kqnade/dotfiles
bash scripts/install-linux.sh
```

`scripts/install-linux.sh` は以下を行います：

- `Aptfile` に列挙された apt パッケージ（`zsh`, `vim`, `git`, `gnupg`, `pass`, `ripgrep`, `fd-find`, `bat` 等）の一括インストール
- apt に無い／古いツール（`chezmoi`, `mise`, `starship`, `sheldon`, `ghq`, `gh`, `glab`, `eza`, `delta`）を `$HOME/.local/bin` および `mise` 経由で導入

#### 2. 設定の適用とツール導入

```bash
chezmoi init --apply kqnade
mise install
```

> Ubuntu の `bat`/`fd` はバイナリ名がそれぞれ `batcat`/`fdfind` のため、
> `dot_config/zsh/aliases.zsh` でエイリアスを補正しています。

---

### 非 sudo な Linux 環境 (Linuxbrew)

共有サーバや権限のない環境では Linuxbrew を `$HOME/.linuxbrew` にインストールし、`Brewfile` で必要なツールを揃えます。

```bash
git clone https://github.com/kqnade/dotfiles.git ~/ghq/github.com/kqnade/dotfiles
cd ~/ghq/github.com/kqnade/dotfiles
FORCE_NOSUDO=1 bash scripts/install-linux.sh
```

スクリプトは sudo 不可を検出すると以下を行います：

1. `git clone https://github.com/Homebrew/brew $HOME/.linuxbrew/Homebrew`
2. `$HOME/.linuxbrew/bin/brew shellenv` を eval
3. `brew bundle --file=./Brewfile` を実行

`dot_zshrc` には `$HOME/.linuxbrew/bin/brew shellenv` の自動読み込みが入っているため、`chezmoi apply` 後に新しい zsh セッションでそのまま brew パスが通ります。

```bash
chezmoi init --apply kqnade
mise install
```

---

### macOS

#### 1. Homebrew のインストール

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

#### 2. chezmoi の初期化と設定の適用

```bash
brew install chezmoi
chezmoi init --apply kqnade
```

#### 3. Homebrew パッケージの一括インストール

chezmoi apply 後に `~/Brewfile` が展開されるので、それを使って一括インストールします。

```bash
brew bundle
```

#### 4. ツールのインストール

```bash
mise install
```

---

### Windows (PowerShell 7 + scoop)

WSL を使う場合は Arch Linux / macOS の手順がそのまま流用できます。
ここではネイティブ Windows（PowerShell 7 + scoop）を前提とします。

#### 1. scoop と chezmoi のインストール

```powershell
Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned
Invoke-RestMethod -Uri https://get.scoop.sh | Invoke-Expression
scoop install git chezmoi
```

#### 2. 設定の適用

```powershell
chezmoi init --apply kqnade
```

`run_onchange_install-scoop-packages.ps1` が自動実行され、`scoopfile.json` の
buckets / apps が一括インストールされます（次回以降は manifest 変更時のみ再実行）。

#### 3. ツールのインストール

```powershell
mise install
```

#### 4. PowerShell プロファイルの読み込み確認

```powershell
. $PROFILE
```

> Windows では `dot_zshrc`, `dot_config/zsh/`, `dot_config/sheldon/`,
> `dot_config/ghostty/`, `dot_config/kitty/`, `private_dot_gnupg/` は
> `.chezmoiignore` で除外され、PowerShell プロファイル
> (`Documents/PowerShell/Microsoft.PowerShell_profile.ps1`) が代わりに展開されます。

---

## 主な機能と設定

### Zsh (`.zshrc`)

* `sheldon` によるプラグイン管理（autosuggestions, syntax-highlighting, enhancd 等）。
* `fzf-tab` による補完のプレビュー。
* **`gg` 関数**: `ghq` 管理下のリポジトリを `fzf` で検索・プレビューし、ディレクトリを高速移動。
* エイリアス: `ls` (`eza`), `cat` (`bat`), `vi` (`vim`), `p` (`brew` / `paru`)。

### Vim (`.vimrc`)

* **Colemak キーバインド**: `m/n/e/i` を方向キー（h/j/k/l）として割り当て。
* `s/t` を挿入（Insert/Append）に割り当て。
* `x/c/v` を切り取り・コピー・貼り付けに最適化。

### Git (`.gitconfig`)

* ページャーとして `delta` を使用。
* 各種エイリアス（`ci`, `co`, `st`, `last`）。
* GPG によるコミット署名の有効化。
