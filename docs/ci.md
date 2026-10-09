# CI の実行範囲

`.github/workflows/ci.yml` はpull request、`trunk` へのpush、手動実行で起動します。
作業branchへのpushでは起動せず、PR更新時の二重実行を避けます。
マージ後の `trunk` では、統合済みの状態を検証します。
設定をrenderできるだけでは成功にせず、対象commandを一時的なrunner上で実行します。

## 変更内容によるジョブ選択

`changes` がGitの差分から実行対象を判定し、静的検証は毎回実行します。
文書、リポジトリの管理情報、`scripts/ci/` のテスト・検証コードだけの変更では、
重いbootstrap検証を省略します。対象パスの定義は `scripts/ci/ci-policy.py` にあります。
この判定コード自体、workflow、環境設定、未知のパスを変更した場合は全OSを検証します。
ホームへ配置するスキルなどのMarkdownファイルも、環境設定として扱います。

PRは共通祖先からheadまで、`trunk` へのpushはpush前後を比較します。
リネームは削除と追加として判定し、移動元の変更も検出します。
手動実行、新規branch、差分が空の場合は全OSを検証します。
差分の取得に失敗した場合はCIを失敗させます。
bootstrapの各ジョブは、変更判定と静的検証が成功してから起動します。

ブランチ保護の必須チェックには `ci-result` を指定します。
このジョブは先行ジョブの成否にかかわらず実行し、変更判定・静的検証の成功と、
選択したbootstrapジョブの成功を確認します。省略を許すのは判定で不要としたジョブだけです。
GitHub側の必須チェック設定は、workflowファイルの変更だけでは更新されません。

## 実行するもの

### 静的検証と mise の導入

静的検証とパッケージ導入のjobでは、`bash install.sh --mise-only` でmiseだけを導入します。
このモードはOSパッケージの導入、checkout、設定のtrust、bootstrapを行いません。
`curl` とSHA-256検証用の `sha256sum` または `shasum` が必要です。
全jobが `install.sh` に固定したバージョンとSHA-256でダウンロードを検証します。
最低バージョンを満たすmiseが導入済みなら、その実行ファイルを再利用します。

静的検証には、ダウンロード失敗・チェックサム不一致で既存のmiseを保持するテストと、
サービスの待受ポートに接続できない場合の回帰テストも含まれます。

### macOS arm64

GitHub-hosted runnerのlogin shellを、対象macOSと同じ標準`/bin/zsh`へ揃えた上で
次を実行します。

- productionと同じpathへcheckoutを公開
- `bash install.sh`
- `mise run apply`
- `mise run doctor`
- 2回目の `mise bootstrap --yes`
- 2回目の `mise run doctor`
- UDEV Gothic、SKK辞書、launchd service、`127.0.0.1:1178`

### Intel Mac

login shellを標準`/bin/zsh`へ揃え、`bash install.sh`、`mise run apply`、
`mise run doctor`をIntel runnerでも実行します。
さらにIntel向けの次の選択を実際にinstallし、それぞれの`--version`を実行します。

- `cargo:sheldon`
- `cargo:git-delta`
- `github:sharkdp/fd`のupstream x64 binary
- `github:atuinsh/atuin`のupstream x64 binary
- `github:pnpm/pnpm`のupstream x64 binary

pnpmはversionがpinと一致することまで検証します。Intel jobは毎回cold installし、
巨大なmise/Cargo cacheのrestore時間とstale cacheによる見逃しを避けます。

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
