# macOS セットアップ

Apple Silicon と Intel Mac を対象にします。OS 標準の zsh、Git、OpenSSH と
Xcode Command Line Tools を利用します。

## 初回セットアップ

```bash
curl -fsSL https://raw.githubusercontent.com/kqnade/dotfiles/main/install.sh | bash
```

Command Line Tools が未導入の場合は OS の確認画面が開きます。完了後、
`install.sh` が mise の導入、repository checkout、`mise bootstrap --yes` まで
続行します。

## Intel Mac

Intel Mac 用 artifact がない tool は、同じ `mise.toml` 内で Cargo backend に
切り替えます。

- sheldon
- delta
- fd
- atuin

pnpm は Intel 用 standalone artifact がないため npm backend を使います。
Rust、Node、Command Line Tools がそれぞれの dependency です。

## macOS defaults

Dock、Finder、keyboard、trackpad は mise の friendly sections、それ以外は
`[bootstrap.macos.defaults]` で宣言します。

次の imperative 処理だけを idempotent hook に残しています。

- Finder plist の icon arrange 設定
- screenshot directory の作成と設定
- `~/Library` の hidden flag 解除
- Dock、Finder、SystemUIServer の再起動

## SKK

yaskkserv2 は Cargo Git backend から build し、mise が
`~/Library/LaunchAgents/dev.mise.yaskkserv2.plist` を管理します。

```bash
launchctl print "gui/$(id -u)/dev.mise.yaskkserv2"
```

server は `127.0.0.1:1178` を listen します。macSKK から同じ endpoint を指定すれば、
Neovim の skkeleton と辞書 server を共有できます。
