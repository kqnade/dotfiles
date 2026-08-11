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

Claude Codeの設定と安全hook、Codex、OpenCode、Herdr integrationをchezmoiで維持します。
ClaudeはGitHub remote ownerが`livesense-inc`または`jobtalk`のrepositoryだけで利用でき、
shell wrapperが起動前に、hookがprompt送信前とtool実行前にそれ以外を拒否します。
Claudeのglobal rulesはcoding、verification、operations、Git、PRD / STD deliveryに限定します。
Codexはcanonicalなglobal Git ruleを読み、Claude専用namespace以外では`git cc`を使います。
Codexのmodel、reasoning、approval、subagent、hookの安定したdefaultだけをchezmoiで適用し、
project trust、notice、hook trust hash、session、cacheなどのruntime stateはCodexへ残します。
workflow skillのcanonical sourceは`~/.agents/skills/`です。Claudeはsymlink、CodexとOpenCodeは
native discoveryで同じ内容を利用します。source workflowの構造ではなく、得たい効果ごとに
`evidence-review`、`context-handoff`、`security-audit`、`prose-proofreading`、
`assumption-pruning`、`peer-consultation`を構成し、`using-workflow-skills`がtaskをownerへ
routeします。TDDのcanonical workflowはt-wadaのList → Red → Green → Refactorです。

このintegrationの目的は、skill数や文章量を小さくすることではありません。change reviewと
dependency update reviewは同じsnapshot・claim ledger・verification contractを使うため
`evidence-review`へ、handoffのexport/importは同じidentity・provenance・staleness contractを
使うため`context-handoff`へ統合しています。peerを呼ぶtransportも、独立した意見をcurrent
evidenceで再検証する`peer-consultation`が一貫して管理します。これによりtriggerの競合、client間の
判定差、片方のworkflowだけが古くなるdriftを減らせます。

tradeoffとして、各skillの内部に明示的なmode分岐が増え、以前の細かなskill名から目的を探す
discoverabilityは下がります。また、共通contractの変更は複数use caseへ影響し、state resolverが
continuityのcentral dependencyになります。mode別の手順、owner境界、atomic writeと
optimistic concurrencyの実動test、stateを書けない場合のchat fallbackでこれらを制御します。

Claudeのautomatic memoryは無効のままです。handoffとsecurity coverageは、defaultではcurrent
worktreeの`.dev`へ保存します。ADR、design doc、todoを含むため、linked worktree間で`.dev`の
contentは共有しません。`livesense-inc`または`jobtalk`namespaceのrepoだけは、resolverが
`/.dev/`をclone-localな`.git/info/exclude`へidempotentに追加します。他のrepoを自動ignoreしません。
repositoryへ`.dev`を置けない場合に限り、明示的な`AGENT_WORKFLOW_STATE_HOME`でexternal fallbackを
選べます。current worktreeのrepository-owned stateは通常のproject contextとして扱い、identity、
provenance、freshnessを確認します。別worktree、import、legacy workflow、またはprovenance不明のrecordは
candidate evidenceとしてより厳密にreconcileします。いずれもClaude automatic memoryではなく、矛盾時は
current code、Git、tests、runtime、primary sourcesを優先します。
Herdr integrationはbootstrap taskでidempotentに反映します。
