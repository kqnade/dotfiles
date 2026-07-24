# CI の実行範囲

`.github/workflows/ci.yml` は全branchへのpush、pull request、手動実行で起動します。
設定をrenderできるだけでは成功にせず、対象commandを一時的なrunner上で実行します。

## 実行するもの

### macOS arm64

GitHub-hosted runnerのlogin shellを、対象macOSと同じ標準`/bin/zsh`へ揃えた上で
次を実行します。

- productionと同じpathへcheckoutを公開
- `bash install.sh`
- `mise run apply`
- `mise run doctor`
- 2回目の `mise bootstrap --yes`
- 2回目の `mise run doctor`
- 一時checkoutでの `mise run update`
- UDEV Gothic、SKK辞書、launchd service、`127.0.0.1:1178`

`mise run update` は一時checkoutだけを変更し、変更対象が `mise.toml` と
`mise.lock` に限定されることも検査します。

### Intel Mac

login shellを標準`/bin/zsh`へ揃え、`bash install.sh`、`mise run apply`、
`mise run doctor`をIntel runnerでも実行します。
さらに次のfallbackを実際にsourceからbuildまたはnpmからinstallし、それぞれの
`--version`を実行します。

- `cargo:sheldon`
- `cargo:git-delta`
- `cargo:fd-find`
- `cargo:atuin`
- `npm:pnpm`

pnpmはversionがpinと一致することまで検証します。

### Fedora / Arch

FedoraとArchのsystem packageを実際に導入し、2回適用して冪等性を検査します。
さらにFedoraでは、Linux向け全tool、chezmoi externals、dotfile、UDEV Gothic、
SKK辞書を実際に配置します。yaskkserv2はforegroundで起動し、1178番portへの
接続まで確認します。

## GitHub-hosted runnerでは保証できないもの

Fedora jobはcontainerなので、systemd user managerとlogin shell変更を実行できません。
この2項目だけbootstrapから明示的に除外し、server binaryとdictionaryは別経路で
実動確認します。

WSLのWindows executable proxyも静的な保持検査までです。systemd user unitとWSL
proxyを実機で保証するには、Fedora/Arch VMまたはself-hosted WSL runnerを追加する
必要があります。
