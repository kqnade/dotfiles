Record schema: implementation-context/v1
Task key: workflow-todo-management-skill
Repository identity method: remote.origin.url
Repository identity: https://github.com/kqnade/dotfiles
Resolved workflow state root: /Users/kanato.momose/repos/github.com/kqnade/dotfiles/.dev
Repository root at write: /Users/kanato.momose/repos/github.com/kqnade/dotfiles
Source worktree: /Users/kanato.momose/repos/github.com/kqnade/dotfiles
Source ref: refs/heads/trunk
Source commit: cee023643c4410d007524caab3be2bf2cfef75c6
Dirty worktree: yes; this context update and two unrelated untracked TODOs
Created: 2026-08-14T18:43:48+0900
Updated: 2026-08-14T19:20:18+0900
Producing client: Codex

# Workflow TODO management implementation context

## Objective and user direction

- User: `.dev`の修理を次の優先作業にするか確認し、その後「じゃあ開始して」と実装開始を
  指示した。
- User: 2回のreviewで合計4件のblocking defectを報告し、2回目のreview後にcontextは追記では
  なく最新状態へ更新し、履歴はGitに任せるよう指示した。
- Decision: `.dev/todo/`のlifecycleを先に安定させ、その上にskill-driven persistenceを
  構築できる順序にした。

## Decisions

- Decision: `todo-management`をactive TODO lifecycleの唯一のcanonical ownerにした。
- Decision: active TODOはcurrent Git worktreeの`.dev/todo/`だけに置き、明示的な
  `AGENT_WORKFLOW_STATE_HOME`にもredirectしない。
- Decision: task key、必須section、durable record promotion、commit checklistをschemaとし、
  active TODO自体にはdurable record用identity blockを要求しない。
- Decision: create/update/deleteは既存のrecord lock、atomic replace、expected hash CASを
  再利用し、deleteはeligibleなactive TODOだけに限定した。
- Decision: 完了gateは未完了または空のchecklist、missing/out-of-scope durable link、
  `None`とlinkの混在、stale hash、symlink、nonregular targetを拒否する。
- Decision: checklistではindentと空labelを許容し、Markdown unordered bulletの`-`、`*`、`+`を
  task markerとして認識する。

## Implemented work

- Commit `547649f`でDesignDocへowner、schema、authorization、concurrency、完了条件を記録し、
  active TODOをtracking対象に追加した。
- Commit `007ce93`でskill routing、Claude materialization、current-worktree path resolver、
  TODO名allowlist、CAS create/update、回帰testを追加した。
- Commit `1d719ee`で`todo-complete`、TODO限定CAS delete、durable record/checklist gate、
  linked-worktreeと削除範囲の回帰test、shared state contract、`.dev/todo/README.md`を整合した。
- Commits `0df415a`、`dfdd90c`、`9338e85`でCASなしwrite、空label・nested unchecked task、
  空白だけの`None`理由をそれぞれ拒否し、`dcf6f63`でREADMEのfilename contractを明確化した。
- Commit `cee0236`で`* [ ]`と`+ [ ]`を未完了taskとして検出する回帰testと修正を追加した。

## TDD evidence

- Red: canonical skill setへ`todo-management`を期待値として追加し、未実装skill欠如でexit 1を
  確認した。Green: skill、router、symlink、path helper、writer allowlist追加後にvalidator
  exit 0。
- Red: completion helperを期待値へ追加し、helper欠如でexit 1を確認した。Green: 未完了
  checklistを`unchecked checklist items`で拒否し、既存fileを保持。
- Red: missing durable recordの期待理由を追加し、汎用未実装errorでexit 1を確認した。
  Green: link存在・owned area検証を実装し、fileを保持。
- Red: eligible TODOの削除を期待し、未実装完了gateでexit 1を確認した。Green: shared writerへ
  TODO限定`--delete`を追加し、current hash一致時だけ削除。
- Added Green regression coverage: stale hash、linked-worktree分離、external backend拒否、
  invalid task key、owned area外link拒否、実在context link受理、context record削除拒否。
- Review snapshot `546aa607..1d719ee0`では、CASなしwrite、空label・nested unchecked task、
  空白だけの`None`理由を隔離fixtureで再現し、それぞれ期待理由でRedを確認してGreenにした。
  reviewed diff SHA-256は
  `2e430997da8214facf6b190efbd54a6c0b545a00f423ef41521fbec989b63bd6`。
- Review snapshot `1d719ee..dcf6f63`では、`* [ ] Unfinished verification.`を持つfixtureで
  helperがTODOを削除し、validatorが
  `TODO completion must preserve a star-bullet unchecked item`でRedになった。`* [ ]`と
  `+ [ ]`の両fixtureが内容を保持して完了を拒否するGreenを確認した。reviewed diff SHA-256は
  `a8b7d103cdb2bf50b9365ee02414febc27a1790f091e2390132c0530413173cd`。

## Failed attempts and constraints

- Observed: repository指定の`luna_parallelizer`は、このsessionでは`gpt-5.6-luna`がspawn
  modelとして提供されず起動できなかった。read-only探索は3つのbounded agentへ分割した。
- Observed: `mise exec -- python3 scripts/ci/validate-repository.py`はlocal macOS Python 3.9.6を
  選び、`tomllib`欠如で起動前に失敗した。installed Python 3.11のabsolute pathで同じvalidatorを
  実行した。
- Observed: sandbox内の`git add`は`.git/index.lock`を作れず失敗した。対象path限定で承認を
  得た後にstageし、`git cc`でGreen incrementをcommitした。
- Observed: final helperの一時materializationは、最初にrepository cwdとlogical `/tmp` pathを
  使ってdestination境界に拒否され、次に`.agents/`親directory不足で拒否された。いずれも
  repository fileを変更せず、validatorと同じresolved `/private/tmp` destinationとlayoutで
  再実行して成功した。

## Verification

- Observed: `/Users/kanato.momose/.local/bin/python3.11 scripts/ci/validate-repository.py` exit 0。
- Observed: `shellcheck`を`todo-path`、`todo-complete`、`workflow-state-write`へ実行しexit 0。
- Observed: `git diff --check`は各commit前にexit 0。
- Observed: hash `973410c95578cf3b6a8c39465b693e297320901c`を指定したdeployed
  `todo-complete`がexit 0でactive TODOを削除した。
- Observed: active TODO削除後にrepository validator、ShellCheck、`git diff --check`を再実行し、
  すべてexit 0。
- Observed: commit `cee0236`とこのcontext更新を含むworktreeでrepository validator、3 helperの
  ShellCheck、`git diff --check`を再実行し、すべてexit 0。

## Remaining work

- 既知の4 blocking defectは修正済み。最終判定は再レビュー待ち。
- Linuxとlive CIは未確認。
- `skill-driven-workflow-persistence.md`と`codex-luna-coordinator-model-availability.md`は別の
  untracked active itemであり、この変更では編集、stage、commitしない。
