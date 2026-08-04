# Claude global policy

- 状態: 実装中
- 対象: Claude repository認可境界とglobal ruleset

## Commit units

- [x] Claudeのdefault modelを最新Opusへ変更する
- [x] `livesense-inc` / `jobtalk`だけを許可するrepository認可hookを実装する
- [ ] coding、verification、operations、git、delivery rulesを配備する

## Repository authorization test list

- `github.com/livesense-inc/*`のSSH remoteを許可する。
- `github.com/jobtalk/*`のHTTPS remoteを許可する。
- 両方の許可ownerでGitHubのSSH / HTTPS remoteを同じように扱う。
- 許可owner名をrepository名に含むだけのremoteを拒否する。
- 許可owner以外、originなし、Git worktree外をfail-closedで拒否する。
- `UserPromptSubmit`ではprompt処理を、`PreToolUse`ではtool callをexit 2で拒否する。
- shell wrapperはClaude binaryの起動前に同じ認可判定を行う。
- Claude settingsが両eventへ同じ認可hookを配線する。

## Alternative verification

Markdown rulesは実行codeではないためTDD対象外とする。期待するfile集合、必須文言、
`.chezmoiremove`との非競合、template展開をrepository validatorで決定的に検証する。
