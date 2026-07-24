# Linux セットアップ

対象は Fedora x64、Arch Linux x64、および同ディストリビューションを使う
WSL x64 です。別系統のディストリビューションは対象外です。

## 初回セットアップ

```bash
curl -fsSL https://raw.githubusercontent.com/kqnade/dotfiles/main/install.sh | bash
```

`install.sh` は `curl` と Git がなければ対象 OS の package manager で最小限だけ
導入し、mise を `~/.local/bin` に配置します。その後、リポジトリを
`~/repos/github.com/kqnade/dotfiles` に取得し、`mise bootstrap --yes` を実行します。

## system packages

root `mise.toml` の `[bootstrap.packages]` が次を管理します。

- zsh、Git、OpenSSH
- C/C++ build toolchain、OpenSSL headers、pkg-config
- fontconfig、CJK fonts
- bootstrap と UDEV Gothic 配置に必要な curl、CA certificates、unzip

Fedora は dnf、Arch は pacman だけを使います。

## SKK

yaskkserv2 と辞書生成 tool は全 OS 共通の Cargo Git backend で build します。
SKK-JISYO source は chezmoi externals、結合辞書は
`scripts/build-skk-dictionary.sh`、常駐化は mise の
`dev.mise.yaskkserv2.service` が担当します。

```bash
systemctl --user status dev.mise.yaskkserv2.service
```

WSL でも systemd user manager が必要です。`mise run doctor` が利用可否と service
状態を診断します。

## WSL の 1Password / SSH

WSL では `~/.local/bin/{op,ssh,ssh-add}` を配置し、Windows 側の `op.exe`、
`ssh.exe`、`ssh-add.exe` へ委譲します。commit 署名は
`op-ssh-sign-wsl.exe` を使います。

Windows 側の 1Password で SSH agent を有効にし、WSL から次を確認してください。

```bash
ssh-add -l
```

この proxy は WSL 専用です。ネイティブ Windows の dotfile/bootstrap 機能は
ありません。
