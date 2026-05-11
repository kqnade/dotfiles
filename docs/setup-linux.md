# Linux セットアップ

`scripts/install-linux.sh` が `/etc/os-release` と sudo 利用可否を自動判定し、以下の 4 経路に分岐します。

| 経路 | 条件 | パッケージ manifest |
|------|------|---------------------|
| Arch | `arch` / `manjaro` / `endeavouros` + sudo | `metapkgs/base/PKGBUILD` |
| Debian 系 (sudo) | `ubuntu` / `debian` / `linuxmint` / `pop` + sudo | `Aptfile` + `mise` |
| Debian 系 (非 sudo) | `ubuntu` / `debian` / `linuxmint` / `pop` で sudo 不可（または `FORCE_NOSUDO=1`） | [sideapt](https://github.com/kqnade/sideapt) + `Aptfile` を `~/.sideapt/usr` に展開 + 補助は `~/.local/bin` & `mise` |
| pixi (フォールバック) | 上記いずれにも該当しない非 sudo 環境 | `scripts/install-linux.sh` がインライン生成する `pixi-global.toml`（conda-forge） |

リポジトリは ghq 規約に従って `~/ghq/github.com/kqnade/dotfiles` に配置することを想定しています。

`chezmoi apply` を実行すると、`run_onchange_setup-linux.sh.tmpl` が
自動で `scripts/install-linux.sh` を呼び出すため、初回・更新時とも
このコマンド 1 つで完結します（CI など TTY 不在の環境ではスキップ）。
さらに `run_onchange_after_install-fonts.sh.tmpl` が UDEVGothic NF
を `~/.local/share/fonts` に配置し、4 OS で同一フォントを共有します。

`run_onchange_after_install-yaskkserv2.sh.tmpl` が `cargo` で
`yaskkserv2` をビルド → `~/.skk/dictionary.yaskkserv2` を生成 →
systemd user unit (`yaskkserv2.service`) を有効化し、`127.0.0.1:1178`
で SKK 辞書サーバを常駐させます（`--google-japanese-input=notfound` で
未収録語は Google 日本語入力で補完、結果は `~/.cache/yaskkserv2/google.cache`
にキャッシュ）。Neovim の skkeleton はこのサーバを参照します。systemd が
無い環境では手動起動コマンドが警告として表示されます。

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

## 非 sudo な Debian / Ubuntu 環境 (sideapt)

HPC クラスタや共有サーバなど sudo が取れない Debian/Ubuntu では、[sideapt](https://github.com/kqnade/sideapt)（`apt download` + `dpkg-deb -x` を `~/.sideapt/usr` に展開する非 root ラッパ）で同じ `Aptfile` を非 root 導入します。`chezmoi`/`mise`/`starship`/`sheldon` などの apt 外ツールは sudo 経路と全く同じ supplementary installer (`~/.local/bin` + mise) を使い回します。

```bash
git clone https://github.com/kqnade/dotfiles.git ~/ghq/github.com/kqnade/dotfiles
cd ~/ghq/github.com/kqnade/dotfiles
FORCE_NOSUDO=1 bash scripts/install-linux.sh
```

スクリプトは sudo 不可 + Debian/Ubuntu を検出すると以下を行います：

1. sideapt リポジトリを `~/ghq/github.com/kqnade/sideapt` に `git clone --depth=1`
2. `make install PREFIX=$HOME/.local` で `~/.local/bin/sideapt` をビルド
3. `sideapt init && sideapt update` で `~/.sideapt/apt` のプライベート apt インデックスを初期化
4. `Aptfile` を読み込み `sideapt install <pkgs...>` で `~/.sideapt/usr` 配下に非 root 展開
5. `install_supplementary_debian` を呼び出し、`chezmoi` / `mise` を `~/.local/bin` に導入してから `mise use -g` で `starship`, `sheldon`, `ghq`, `gh`, `glab`, `eza`, `delta` を一括導入

`dot_zshrc` / `dot_bashrc.tmpl` には `eval "$(sideapt env)"` が組み込まれているため、`chezmoi apply` 後に新しいシェルセッションでそのまま `~/.sideapt/usr/{bin,sbin}` と `~/.local/bin` が PATH に通ります。**初回はまだ `~/.bashrc` が配置されていないので、その場で activate してから chezmoi を呼ぶ必要があります**：

```bash
eval "$($HOME/.local/bin/sideapt env)"
export PATH="$HOME/.local/bin:$PATH"
chezmoi init --source . --apply

# mise は GitHub API を叩くので、匿名 rate limit (60req/h) を回避するために
# GITHUB_TOKEN を渡してから走らせる
export GITHUB_TOKEN=<your-token>   # or: gh auth token
mise install
```

> NOTE: sideapt は `preinst`/`postinst` などの maintainer scripts、setuid バイナリ、systemd unit を扱えません。`gnupg`/`pass`/`pinentry-curses` などの CLI 系は問題なく動きますが、サービス系を必要とするパッケージは別途用意してください。
>
> 同じ理由で `gcc`/`cargo`/`unzip` などはバイナリとして `~/.sideapt/usr/bin` に展開されるため、`chezmoi apply` の中で動く `run_onchange_after_install-fonts.sh.tmpl`（UDEVGothic のために `unzip` を使う）や `run_onchange_after_install-yaskkserv2.sh.tmpl`（`cargo` を使う）は冒頭で `sideapt env` を eval してから動きます。

---

## その他 distro の非 sudo フォールバック (pixi)

`/etc/os-release` の ID が Debian/Ubuntu 系でない非 sudo 環境では、[pixi](https://pixi.sh) を `$HOME/.pixi` に置いて conda-forge から必要ツールを揃えるフォールバック経路に入ります。ビルドキャッシュは `/tmp/${USER}-pixi-cache` に置かれ、永続物はすべて `$HOME/.pixi` 配下に収まります。

スクリプトはこの経路で以下を行います：

1. `curl -fsSL https://pixi.sh/install.sh | bash`（`PIXI_HOME=$HOME/.pixi`、`PIXI_NO_PATH_UPDATE=1`）
2. `$HOME/.pixi/manifests/pixi-global.toml` を生成（`chezmoi`, `mise`, `sheldon`, `starship`, `zsh`, `git`, `ghq`, `gh`, `glab`, `delta`, `eza`, `ripgrep`, `fd`, `bat`, `fzf`, `nvim`, `vim`, `gpg`, `pinentry`, `gomi`, `rust` などを `cli-tools` env に集約）
3. `pixi global sync` で `$HOME/.pixi/bin` 配下にバイナリを expose
4. password-store (`pass`) は conda-forge に無いため、`make install PREFIX=$HOME/.local` でソースビルド

> NOTE: conda-forge 版 Neovim のエディタ本体は `nvim` パッケージ（`neovim` は Python クライアントの `pynvim`）。`fzf-tmux` バイナリは conda-forge `fzf` に同梱されないため expose 対象外です。
