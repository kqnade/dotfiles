# CI の実行範囲

[CI workflow](<../.github/workflows/ci.yml>)はpull request、`trunk`へのpush、手動実行、
毎週月曜03:17（Asia/Tokyo）に起動します。作業branchへのpushでは起動しません。
軽量検証は毎回実行し、実インストールは基盤変更のPRと週次・手動実行で検証します。

## 変更内容によるジョブ選択

`changes`がPRの共通祖先からheadまでの差分を判定します。
対象パスの定義は[ci-policy.py](<../scripts/ci/ci-policy.py>)にあります。

| 条件 | 実インストール |
|---|---|
| 文書・スキル・通常のユーザー設定・単体テストのPR | 省略 |
| installer・依存manifest/lock・配備設定・bootstrap・CI基盤のPR | 全OS |
| 未知のパス、空差分のPR | 全OS |
| `trunk`へのpush | 省略 |
| 週次・手動 | 全OS |

軽量検証にはテンプレート生成と振る舞いテストを含めます。Markdownという拡張子だけで
省略せず、既知の対象パスで判断します。リネームは削除と追加として扱います。
差分取得の失敗はCIを失敗させ、bootstrapは変更判定と軽量検証が成功してから起動します。
`trunk`への直接変更には即時の実インストール検証がなく、週次まで問題が見つからない場合があります。
週次・手動とPR/pushは別のconcurrency groupで動作します。

ブランチ保護の必須チェックには `ci-result` を指定します。
このジョブは先行ジョブの成否にかかわらず実行し、変更判定・静的検証の成功と、
選択したbootstrapジョブの成功を確認します。省略を許すのは判定で不要としたジョブだけです。
GitHub側の必須チェック設定は、workflowファイルの変更だけでは更新されません。

## PRの自動ラベル

`.github/workflows/pr-labels.yml` は変更ファイルに応じて、`ci`、`shell`、
`dependencies`、`documentation`、`agents`、`neovim` をPRに付与します。
分類ルールは `.github/labeler.yml` にあります。複数カテゴリに一致すれば複数付与し、
既存ラベルの自動削除は無効にしています。ラベルはCIジョブの実行条件には使いません。

このworkflowはラベル付与だけを行い、テストを再実行しません。
`pull_request_target` でbase側の設定を読み、PRのcheckoutやコード実行を行わない構成です。
PRへの付与に必要な `pull-requests: write` と、未作成ラベルの作成に必要な
`issues: write` は、このジョブだけに付与します。通常のテストCIは読み取り権限だけで動作します。

ラベル用workflowはbase側に導入されてから有効になります。
設定を追加するPR自体では、そのPR内の設定を使ったラベル付与は実行されません。

## 実行するもの

### 軽量検証と mise の導入

共通入口は[validate-repository.py](<../scripts/ci/validate-repository.py>)です。
直下の`validate-*.py`、`test-*.py`、`test-*.mjs`を収集し、PythonとNodeの標準ランナーで実行します。
テスト自身は外部サービスを必要とせず、ツール・モデル一覧や文書全体の写しは期待値にしません。

```sh
mise exec -- python3 -B scripts/ci/validate-repository.py
```

ネットワークでのlock解決とインストール済みDSHの検証はintegrationに分けます。
Fedoraではlock解決とpersonal、macOS arm64ではpersonal/work、Intelではpersonalを検証します。
指定したintegrationの前提が欠けている場合は失敗し、成功扱いで省略しません。

```sh
mise exec -- python3 -B scripts/ci/integration/test-mise-lock.py
mise exec -- node scripts/ci/integration/run-dsh.mjs
# workを導入済みのMac
mise exec -- node scripts/ci/integration/run-dsh.mjs --work
```

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
- 週次・手動では2回目の `mise bootstrap --yes` と `mise run doctor`
- work有効の設定でpersonal/workのTUI/Webを導入し、上流パッチ・SDK・workspaceガードを検証
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
Fedoraのパッケージ検証はフル構築ジョブに含め、Archだけをパッケージ専用ジョブで検証します。
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
