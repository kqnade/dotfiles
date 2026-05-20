# Linux セットアップ

`scripts/install-linux.sh` が `/etc/os-release` を読んで以下の 2 経路に分岐します。**いずれも sudo 必須**。

| 経路 | 条件 | パッケージ manifest |
|------|------|---------------------|
| **Fedora** (primary) | `fedora` / `rhel` / `centos` / `rocky` / `almalinux` | `Dnffile` |
| Arch | `arch` / `manjaro` / `endeavouros` | `metapkgs/base/PKGBUILD` |

> **削除されたサポート対象**: Debian/Ubuntu (apt), sideapt (非sudo apt), pixi (conda-forge)。
>
> 開発ツールは全て [mise](https://mise.jdx.dev) に寄せたため、OS 層で必要なのは「shell + git + ビルドツール + フォント + 常駐サービス」のみ。差分が薄くなったので Debian/Ubuntu 経路を sideapt/pixi も含めて削除しました。

リポジトリは ghq 規約に従って `~/repos/github.com/kqnade/dotfiles` に配置することを想定しています。

`chezmoi apply` を実行すると `run_onchange_setup-linux.sh.tmpl` が
自動で `scripts/install-linux.sh` を呼び出すため、初回・更新時とも
このコマンド 1 つで完結します（CI など TTY 不在の環境ではスキップ）。
さらに `run_onchange_after_install-fonts.sh.tmpl` が UDEVGothic NF
を `~/.local/share/fonts` に配置し、4 OS で同一フォントを共有します。

`run_onchange_after_install-yaskkserv2.sh.tmpl` が mise の rust runtime
で `yaskkserv2` をビルド → `~/.skk/dictionary.yaskkserv2` を生成 →
systemd user unit (`yaskkserv2.service`) を有効化し、`127.0.0.1:1178`
で SKK 辞書サーバを常駐させます（`--google-japanese-input=notfound` で
未収録語は Google 日本語入力で補完、結果は `~/.cache/yaskkserv2/google.cache`
にキャッシュ）。Neovim の skkeleton と macOS の macSKK がこのサーバを参照します。

---

## Fedora (primary)

### 1. リポジトリ取得 + システム依存

```bash
sudo dnf install -y git curl
git clone https://github.com/kqnade/dotfiles.git ~/repos/github.com/kqnade/dotfiles
cd ~/repos/github.com/kqnade/dotfiles
bash scripts/install-linux.sh
```

`scripts/install-linux.sh` は以下を行います：

- `Dnffile` の dnf パッケージ（`zsh`, `vim-enhanced`, `git`, `git-lfs`, `openssh-clients`, `gcc`, `make`, `unzip`, `fontconfig`, `google-noto-*-cjk-fonts` など）を一括 install
- `chezmoi` を `get.chezmoi.io` 経由で `~/.local/bin` に配置
- `mise` を `mise.run` 経由で `~/.local/bin` に配置

### 2. chezmoi 適用

```bash
export PATH="$HOME/.local/bin:$PATH"
chezmoi init --source . --apply
```

初回は `features.neovim` (default: true) を聞かれます。false にすると Neovim 設定と mise の `neovim` エントリが除外されます（yaskkserv2 自体は macSKK でも使うため常時導入）。

### 3. 開発ツールのインストール（mise）

```bash
# 任意: GitHub API rate limit を回避
export GITHUB_TOKEN="$(gh auth token 2>/dev/null | tr -d '[:space:]')"
mise install
```

これで `sheldon` / `starship` / `ghq` / `gh` / `eza` / `fd` / `ripgrep` / `bat` / `fzf` / `1password-cli` / `gomi` / `coscli` / `zoxide` / `neovim`（オプトイン時）/ `rust`（yaskkserv2 ビルド用）などが揃います。

### 4. yaskkserv2 のビルド・サービス登録

mise で rust が入った後に再度 apply すれば完了:

```bash
chezmoi apply
```

### WSL 補足: 1Password SSH agent ブリッジ

WSL では Linux 版 1Password desktop が使えないため、Windows 側の named pipe `\\.\pipe\openssh-ssh-agent` を `npiperelay` + `socat` で UNIX socket (`~/.ssh/agent.sock`) に bridge する。

- Windows 側: `scoopfile.json` の `npiperelay`（`chezmoi apply` で自動 install）
- WSL 側: Dnffile の `socat`（`bash scripts/install-linux.sh` で自動 install）
- 起動: `dot_zshrc` / `dot_bashrc.tmpl` が `WSL_DISTRO_NAME` を検出して `socat ... | npiperelay.exe` を `setsid nohup` で 1 回だけ常駐させ、`SSH_AUTH_SOCK` をその UNIX socket に向ける。

`/mnt/c/Users/<name>/scoop/shims` が WSL の PATH に含まれていれば `npiperelay.exe` がそのまま見える。Windows 側で 1Password desktop の **Settings → Developer → Use SSH agent** を有効にしておくこと。

---

## Arch Linux

```bash
sudo pacman -Syu --needed --noconfirm git base-devel
git clone https://github.com/kqnade/dotfiles.git ~/repos/github.com/kqnade/dotfiles
cd ~/repos/github.com/kqnade/dotfiles
bash scripts/install-linux.sh
```

`scripts/install-linux.sh` は `metapkgs/base/PKGBUILD` を `makepkg -si --needed --noconfirm` でビルドし、`zsh` / `vim` / `git` / `base-devel` / `noto-fonts-cjk` / `ttf-udev-gothic-nf` などを導入します。続けて Fedora と同じく `chezmoi` と `mise` を `~/.local/bin` に投下します。

```bash
export PATH="$HOME/.local/bin:$PATH"
chezmoi init --source . --apply
mise install
chezmoi apply
```

> NOTE: 1Password CLI は mise の `1password-cli` で導入されるため、AUR の `1password-cli` を別途入れる必要はありません。
