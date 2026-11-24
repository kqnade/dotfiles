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

Vim と Neovim は Colemak 向けの基本操作を維持します。`EDITOR` と `VISUAL` は `vim` です。
Fedora と Arch、およびそれらを使う WSL は、そのコマンドを bootstrap package で導入します。

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

Cursor CLIを標準で導入します。会社用Claude Codeは`bash install.sh --with-work-claude`で
選択した場合だけ導入し、設定・hooks・Skillsのリンクをchezmoiで配備します。
認証情報やセッションは各clientが管理します。Claudeのautomatic memoryは無効です。
`claude`は会社のrepository以外でも起動します。shell wrapperは仕事用のGitHub tokenを渡し、
設定directoryは`~/.claude`のままです。この起動条件はCursorには適用しません。

repositoryの共通指示は`AGENTS.md`に置き、Claudeは`CLAUDE.md`も併せて読み込みます。
共通 Skills は `responsibility-boundary`、`claim-review`、`handoff` の3つです。
正本は`~/.agents/skills/`に置き、Claudeは同じ正本へのリンクを使います。
共通のuser instructionsは`dot_agents/AGENTS.md`を正本とし、Claudeの`~/.claude/CLAUDE.md`から
リンクして読み込みます。Cursor には `~/.cursor/rules/` の薄い alwaysApply rule も配備します。
`$HOME` 外の checkout には届かないため、その project の `.cursor/rules/` に同じ file を置きます。
独自のsubagent指示やworkflow routerは配置しません。
実行設定・認証・保護はclientごとに分離し、Claudeのautomatic memoryは無効です。
詳細は[AI client運用](ai-clients.md)と[開発workflow](ai-workflows.md)を参照してください。

LinuxではHerdrのターミナル設定、worktree操作、状態通知integrationも管理します。
ClaudeのHerdr integrationは、会社用Claudeが有効なLinuxのbootstrap taskで反映します。
既存のインストールやユーザーデータも自動削除しません。
