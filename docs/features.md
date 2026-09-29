# 主な機能と設定

## Zsh / Bash

- 100,000 件の履歴、重複除外、session 間共有
- sheldon による補完・autosuggestion・syntax highlight
- starship prompt
- mise、atuin、zoxide の shell integration
- ghq repository を fzf で移動する `gg`
- `ca` (`chezmoi apply`) と `ce` (`chezmoi edit`)
- Fedora は dnf、Arch は pacman を使う `p`
- eza、bat、gomi による日常 command の置き換え

## Vim / Neovim

Vim と Neovim は Colemak 向けの基本操作を維持します。

| Colemak | QWERTY 相当 | 用途 |
|---------|-------------|------|
| `m/n/e/i` | `h/j/k/l` | 移動 |
| `s/t` | `i/a` | 挿入・追加 |
| `x/c/v` | `d/y/p` | 削除・copy・paste |

Neovim の plugin、LSP、formatter 設定は `dot_config/nvim/` にあります。global
tool から外した言語 runtime と LSP は、必要な project の `mise.toml` で導入します。

## SKK

skkeleton は `127.0.0.1:1178` の yaskkserv2 を参照します。source dictionaries
は chezmoi externals で `~/.skk/` に配置し、bootstrap task が
`dictionary.yaskkserv2` を生成します。

## Git / 1Password

- commit/tag は SSH key で署名
- pager と interactive diff は delta
- repository root は `~/repos`
- macOS/Linux desktop は native 1Password SSH agent
- WSL は Windows 側 `op.exe` / OpenSSH proxy

## AI CLI

Claude Code、Codex、OpenCode、Piの設定・hooks・拡張をchezmoiで維持します。
認証情報やセッションなどのruntime stateは各clientが管理します。ClaudeはGitHub remote ownerが`livesense-inc`または`jobtalk`のrepository
だけで利用でき、shell wrapperとauthorization hookが起動前、prompt送信前、tool実行前に
それ以外を拒否します。

Piの管理対象launcherは、逆に同じ仕事用ownerのoriginを持つrepositoryでの起動を拒否します。
telemetryを無効にしてもこの確認は残り、1Passwordへの問い合わせより先に実行します。

repositoryの共通指示は`AGENTS.md`に置き、Claudeは`CLAUDE.md`も併せて読み込みます。
開発・レビュー・引き継ぎの3つのSkillsと`sanitize-artifacts`を配備します。
Piは`~/.agents/skills/`を読み、Claudeは同じ正本へのリンクを使います。共通のuser instructionsは
`dot_agents/AGENTS.md`を正本とし、Piの`~/.pi/agent/AGENTS.md`からリンクして読み込みます。
独自のsubagent指示やworkflow routerは配置しません。
実行設定・認証・保護はclientごとに分離し、Claudeのautomatic memoryは無効です。
詳細は[AI client運用](ai-clients.md)と[開発workflow](ai-workflows.md)を参照してください。

LinuxではHerdrのターミナル設定、worktree操作、状態通知integrationも管理します。
Herdr integrationはLinuxのbootstrap taskでidempotentに反映します。macOSではOrcaを使い、
Herdrを導入しません。既存のインストールやユーザーデータも自動削除しません。
