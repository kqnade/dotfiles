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

## AI CLI / Herdr

Claude Code、Codex、OpenCode の rules、hooks、skills と Herdr integration を
chezmoi で維持します。Herdr integration は bootstrap task で idempotent に反映します。
