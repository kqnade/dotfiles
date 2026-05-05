# Linux セットアップ

`scripts/install-linux.sh` が `/etc/os-release` と sudo 利用可否を自動判定し、以下の 3 経路に分岐します。

| 経路 | 条件 | パッケージ manifest |
|------|------|---------------------|
| Arch | `arch` / `manjaro` / `endeavouros` + sudo | `metapkgs/base/PKGBUILD` |
| Debian 系 | `ubuntu` / `debian` / `linuxmint` / `pop` + sudo | `Aptfile` + `mise` |
| Linuxbrew | sudo 不可（または `FORCE_NOSUDO=1`） | `Brewfile`（`OS.mac?` ガード済） |

リポジトリは ghq 規約に従って `~/ghq/github.com/kqnade/dotfiles` に配置することを想定しています。

`chezmoi apply` を実行すると、`run_onchange_setup-linux.sh.tmpl` が
自動で `scripts/install-linux.sh` を呼び出すため、初回・更新時とも
このコマンド 1 つで完結します（CI など TTY 不在の環境ではスキップ）。
さらに `run_onchange_after_install-fonts.sh.tmpl` が UDEVGothic NF
を `~/.local/share/fonts` に配置し、4 OS で同一フォントを共有します。

---

## Arch Linux

### 1. 依存パッケージのインストール

独自のメタパッケージ `base-env` を使用：

```bash
cd metapkgs/base
makepkg -si
```

これにより `chezmoi`, `mise`, `sheldon`, `zsh`, `vim`, `ghq` などが導入されます。
スクリプト経由でも同じ結果になります：

```bash
bash scripts/install-linux.sh
```

### 2. 設定の適用

```bash
chezmoi init --apply kqnade
```

### 3. ツールのインストール

```bash
mise install
```

---

## Ubuntu / Debian (sudo あり)

### 1. リポジトリの取得と依存ツールのインストール

```bash
sudo apt-get update && sudo apt-get install -y git curl
git clone https://github.com/kqnade/dotfiles.git ~/ghq/github.com/kqnade/dotfiles
cd ~/ghq/github.com/kqnade/dotfiles
bash scripts/install-linux.sh
```

`scripts/install-linux.sh` は以下を行います：

- `Aptfile` に列挙された apt パッケージ（`zsh`, `vim`, `git`, `gnupg`, `pass`, `ripgrep`, `fd-find`, `bat` 等）の一括インストール
- apt に無い／古いツール（`chezmoi`, `mise`, `starship`, `sheldon`, `ghq`, `gh`, `glab`, `eza`, `delta`）を `$HOME/.local/bin` および `mise` 経由で導入

### 2. 設定の適用とツール導入

```bash
chezmoi init --apply kqnade
mise install
```

> Ubuntu の `bat`/`fd` はバイナリ名がそれぞれ `batcat`/`fdfind` のため、
> `dot_config/zsh/aliases.zsh` でエイリアスを補正しています。

---

## 非 sudo な Linux 環境 (Linuxbrew)

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
