# dotfiles

macOS arm64、Fedora、Arch Linux、およびそれらを使う WSL x64 向けの環境です。
Intel macOS とネイティブ Windows は対象外です。

[mise](https://mise.jdx.dev/) が構築と収束を担い、
[chezmoi](https://www.chezmoi.io/) が home への配置を担います。

## 前提

- macOS arm64: OS 標準の `curl` と Git、Xcode Command Line Tools
- Fedora / Arch Linux x64: root 権限（通常は `sudo`）、`curl`、Git、CA 証明書
- Fedora / Arch on WSL x64: 上記に加え systemd user manager

## インストール

clone 済みならリポジトリのルートで:

```bash
bash install.sh
```

未取得のマシンでは:

```bash
curl -fsSL https://raw.githubusercontent.com/kqnade/dotfiles/trunk/install.sh | bash
```

`install.sh` は mise を `~/.local/bin` に入れ、
`~/repos/github.com/kqnade/dotfiles` を clone または再利用し、
`mise bootstrap --yes` を実行します。

会社用 Claude Code も入れる場合:

```bash
bash install.sh --with-work-claude
```

## 日常のコマンド

| コマンド | 目的 |
| --- | --- |
| `mise bootstrap --yes` | パッケージ、tools、設定、サービスを再収束する |
| `mise run apply` | dotfile 適用、zsh キャッシュ再生成、管理サービスの適用 |
| `mise run doctor` | tools、パッケージ、dotfile、フォント、SKK、サービスを診断する |
| `mise run format` | mise manifest と `mise.lock` を整形する |

## 詳細

- [設定一覧](docs/features.md)
- [macOS セットアップ](docs/setup-macos.md)
- [Linux / WSL セットアップ](docs/setup-linux.md)
- [AI client 運用](docs/ai-clients.md)
- [CI](docs/ci.md)
- [リポジトリの変更方針](AGENTS.md)
