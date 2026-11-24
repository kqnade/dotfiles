# Linux セットアップ

対象は Fedora x64、Arch Linux x64、および同ディストリビューションを使う
WSL x64 です。別系統のディストリビューションは対象外です。

## 初回セットアップ

```bash
curl -fsSL https://raw.githubusercontent.com/kqnade/dotfiles/trunk/install.sh | bash
```

`install.sh` は `curl` と Git がなければ対象 OS の package manager で最小限だけ
導入し、mise を `~/.local/bin` に配置します。その後、リポジトリを
`~/repos/github.com/kqnade/dotfiles` に取得し、`mise bootstrap --yes` を実行します。

## system packages

[mise/config.toml](../mise/config.toml) の `[bootstrap.packages]` が次を管理します。

- zsh、Git、OpenSSH
- C/C++ build toolchain、pkg-config
- fontconfig、CJK fonts
- bootstrap と UDEV Gothic 配置に必要な curl、CA certificates、unzip

OpenSSL 3 headers は Fedora の release で package 名が変わる。44 では
`openssl-devel`、45 以降では `openssl3-devel` を
`scripts/install-openssl-dev.sh` が tools の build 前に導入する。Arch の
`openssl-3` は上の packages が導入する。

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

## WSL interop

`op`、`ssh`、`ssh-add` の proxy は、Windows 側の実行ファイルを WSL interop で
起動します。`WSLInterop` が無効、または未登録のとき、`ssh.exe` への委譲は
`cannot execute binary file: Exec format error` で失敗します。`mise run doctor`
は `ssh.exe -V` を 5 秒のタイムアウト付きで起動し、失敗すると `WSL interop` を
`[failed]` にします。

登録状態を確認します。

```bash
cat /proc/sys/fs/binfmt_misc/WSLInterop
```

先頭が `enabled` で、`interpreter /init` と `magic 4d5a` が含まれていれば、
Windows 実行ファイルを起動する登録は有効です。ファイルが無い、または先頭が
`disabled` のときは起動できません。

`/etc/wsl.conf` で interop を有効にします。

```ini
[interop]
enabled=true
appendWindowsPath=true
```

`enabled` は Windows プロセスの起動、`appendWindowsPath` は Windows の PATH を
WSL に追加する設定です。既定値はどちらも `true` です。

この設定は、Windows の PowerShell から WSL を完全に停止したあとに有効になります。

```powershell
wsl --shutdown
```

`wsl --shutdown` は起動中のすべてのディストリビューションを停止します。特定の
ディストリビューションだけを止める場合は `wsl --terminate <Distro>` を使います。
停止後にディストリビューションを開き直し、上の `WSLInterop` の確認と
`mise run doctor` を実行します。
