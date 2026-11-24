# dotfiles v2

macOS、Fedora、Arch Linux、またはそれらを使う WSL x64 向けの dotfiles です。
ネイティブ Windows は対象外です。

構築の入口と状態の収束には [mise](https://mise.jdx.dev/) を使い、
[chezmoi](https://www.chezmoi.io/) は dotfile のテンプレート、`private_*` 属性、
外部ファイル（externals）の配置を担当します。

## 対象環境と前提

- macOS arm64（Intel macOS は対象外）
- Fedora x64
- Arch Linux x64
- Fedora / Arch Linux on WSL x64

macOS は OS 標準の `curl` と Git、および Xcode Command Line Tools が必要です。
未導入なら `install.sh` が Command Line Tools のインストーラを開きます。
Linux は Fedora または Arch Linux と root 権限（通常は `sudo`）が必要で、`curl`、
Git、CA 証明書がなければ対象ディストリビューションの package manager で導入します。WSL で
サービスを動かすには systemd user manager も必要です。

## クイックスタート

既に clone 済みなら、リポジトリのルートで実行します。

```bash
bash install.sh
```

未取得のマシンでは、`trunk` の `install.sh` を次の URL から実行できます。

```bash
curl -fsSL https://raw.githubusercontent.com/kqnade/dotfiles/trunk/install.sh | bash
```

`install.sh` は対応プラットフォームを確認し、`mise.toml` の `min_version` と
同じ mise を `~/.local/bin/mise` に配置します。Renovate がその pin と
各プラットフォームの SHA-256、lock 更新に使う mise を、公開から 1 日以上経った最新の安定版へ揃えます。
導入済みの実行ファイルは、その版と一致するときだけ再利用します。その後リポジトリを
`~/repos/github.com/kqnade/dotfiles` に clone（既存 checkout は再利用）し、
設定を trust して `mise bootstrap --yes` を実行します。

bootstrap は OS パッケージ、mise の tools、ユーザー設定、macOS defaults、
launchd/systemd の管理サービスを収束させ、最後にリポジトリの bootstrap task を
実行します。この task は dotfile の適用、zsh 初期化キャッシュ、フォント、SKK 辞書、
Linux では有効な会社用 Claude の Herdr integration、全 OS で pre-commit hook を準備し、`yaskkserv2` が
`127.0.0.1:1178` で待ち受けるまで確認します。何度実行しても収束する設計です。

既存の外部パッケージマネージャや、その管理データは自動削除しません。

## 日常のコマンド

| コマンド | 目的と副作用 |
| --- | --- |
| `mise bootstrap --yes` | マシン全体を再収束します。パッケージ、tools、設定、サービスを適用し、bootstrap task も実行します。 |
| `mise run apply` | chezmoi で dotfile を `init`/`apply` し、zsh 初期化キャッシュを再生成します。利用可能な環境では管理サービスも適用し、会社用 Claude を有効にした場合はその導入も行います。 |
| `mise run doctor` | tools、OS パッケージ、chezmoi、フォント、SKK 辞書、サービス、`1178` 番ポート（WSL では proxy）を診断します。失敗時は非 0 で終了します。 |
| `mise run format` | mise の manifest と `mise.lock` をその場で整形します。 |

## 設定の持ち主と反映経路

- [`mise.toml`](mise.toml): mise の settings、固定バージョンの `[tools]`、公開 task。
- [`mise.work.toml`](mise.work.toml) と `mise.work.lock`: 会社用 Claude Code のバージョンと取得情報。
- [`mise/config.toml`](mise/config.toml): OS パッケージ、ユーザー設定、macOS defaults、
  managed service、bootstrap hook。
- [`dot_config/mise/config.toml.tmpl`](dot_config/mise/config.toml.tmpl): 上記 2 ファイルを
  連結し、有効な場合は会社用 manifest も加えて `~/.config/mise/config.toml` に配置。
  配備先では `lockfile = false` にし、`~/.config/mise/mise.lock` は管理しません。
- `dot_*`: zsh、Neovim、Git、AI CLI などのユーザー設定。秘密情報は `private_*`、
  大きな外部辞書は `.chezmoiexternal.toml.tmpl` で管理。

`mise.toml` の `[tools]` はすべてバージョンを固定します。[`mise.lock`](mise.lock) は
`macos-arm64` と `linux-x64` に加え、upstream が公開する `macos-x64` の取得情報も保持します。
その `macos-x64` の記録は Intel macOS の対応を意味しません。一方、
`[bootstrap.packages]` の OS パッケージは `latest` です。

## 管理している主な機能

- Zsh / Bash: 履歴、補完、sheldon、starship、atuin、zoxide、ghq など
- Vim / Neovim: プラグイン、LSP、formatter、Colemak 向け keymap
- SKK: skkeleton と yaskkserv2、外部辞書、`127.0.0.1:1178` のローカル server
- Git / 認証: SSH 署名、delta、macOS/Linux の 1Password SSH agent、WSL proxy
- AI / 開発: Cursor CLI、オプトインの会社用 Claude Code、Linux の Herdr

詳細は [設定一覧](docs/features.md)、[macOS セットアップ](docs/setup-macos.md)、
[Linux / WSL セットアップ](docs/setup-linux.md) を参照してください。

会社用 Claude Code も導入する場合は、インストール時に明示的に選択します。

```sh
bash install.sh --with-work-claude
```

初回インストールで未指定なら、Claude の導入・設定配備を行いません。選択はローカルに保存します。
[AI client 運用](docs/ai-clients.md)に利用範囲と再設定の手順をまとめています。

軽量テストは `mise exec -- python3 -B scripts/ci/validate-repository.py` で実行します。
CIは基盤変更のPRと週次・手動で実インストールを検証します。
CI の実行範囲は [docs/ci.md](docs/ci.md)、workflow の定義は
[`.github/workflows/ci.yml`](.github/workflows/ci.yml) にあります。未対応事項は
[TODO.md](TODO.md) で管理しています。
